import {
  isSubscriptionDue,
  SubscriptionClient,
  type Subscription,
} from "@recurring-subscriptions/sdk";
import {
  Keypair,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
  ExponentialBackoff,
  FatalKeeperError,
  isFatalRpcError,
  withRpcBackoff,
  type RpcRetryOptions,
  type RpcRuntimeOptions,
} from "./backoff.js";
import type { KeeperConfig } from "./config.js";
import { log } from "./logger.js";

export interface BillAttempt {
  id: bigint;
  status: "skipped" | "dry_run" | "submitted" | "success" | "failed";
  detail?: string;
  hash?: string;
}

function requireField(value: unknown, field: string): unknown {
  if (value === undefined || value === null || value === "") {
    throw new TypeError(`subscription.${field} missing`);
  }
  return value;
}

function mapSubscription(raw: unknown): Subscription {
  if (raw === null || typeof raw !== "object") {
    throw new TypeError("subscription decode is not an object");
  }
  const o = raw as Record<string, unknown>;
  const subscriber = String(requireField(o.subscriber, "subscriber"));
  const merchant = String(requireField(o.merchant, "merchant"));
  const token = String(requireField(o.token, "token"));
  if (!subscriber.trim() || !merchant.trim() || !token.trim()) {
    throw new TypeError("subscription addresses must not be blank");
  }
  const isActive = o.is_active ?? o.isActive;
  if (typeof isActive !== "boolean") {
    throw new TypeError("subscription.is_active missing");
  }
  return {
    subscriber,
    merchant,
    token,
    amount: BigInt(requireField(o.amount, "amount") as string | number | bigint),
    intervalSecs: BigInt(
      requireField(o.interval_secs ?? o.intervalSecs, "interval_secs") as
        | string
        | number
        | bigint,
    ),
    lastBilled: BigInt(
      requireField(o.last_billed ?? o.lastBilled, "last_billed") as string | number | bigint,
    ),
    isActive,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PaymentExecutor {
  private readonly client: SubscriptionClient;
  private readonly keypair: Keypair;
  private readonly backoff: ExponentialBackoff;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly randomFn: (() => number) | undefined;

  constructor(
    private readonly server: rpc.Server,
    private readonly config: KeeperConfig,
    runtime: RpcRuntimeOptions = {},
  ) {
    try {
      this.keypair = Keypair.fromSecret(config.keeperSecretKey);
      this.client = new SubscriptionClient({
        contractId: config.contractId,
        networkPassphrase: config.networkPassphrase,
        source: this.keypair.publicKey(),
        fee: config.fee,
      });
    } catch (err) {
      throw new FatalKeeperError(
        `Invalid keeper credentials or contract config: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    this.sleepFn = runtime.sleep ?? defaultSleep;
    this.randomFn = runtime.random;
    this.backoff = new ExponentialBackoff(
      {
        initialDelayMs: config.rpcBackoffInitialMs,
        maxDelayMs: config.rpcBackoffMaxMs,
        jitterRatio: config.rpcBackoffJitterRatio,
      },
      runtime.random,
    );
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  private retryOptions(): RpcRetryOptions {
    return {
      initialDelayMs: this.config.rpcBackoffInitialMs,
      maxDelayMs: this.config.rpcBackoffMaxMs,
      jitterRatio: this.config.rpcBackoffJitterRatio,
      maxRetries: this.config.rpcMaxRetries,
      sleep: this.sleepFn,
      random: this.randomFn,
      backoff: this.backoff,
    };
  }

  /** Simulate `get_subscription`; returns null if missing / contract error, throws on fatal/exhausted RPC failures. */
  async fetchSubscription(id: bigint): Promise<Subscription | null> {
    const account = await withRpcBackoff(
      "executor.getAccount",
      () => this.server.getAccount(this.keypair.publicKey()),
      this.retryOptions(),
    );
    const tx = new TransactionBuilder(account, {
      fee: String(this.config.fee),
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.client.buildGetSubscriptionOp(id))
      .setTimeout(30)
      .build();

    const sim = await withRpcBackoff(
      "executor.simulateTransaction",
      () => this.server.simulateTransaction(tx),
      this.retryOptions(),
    );
    if (rpc.Api.isSimulationError(sim) || !rpc.Api.isSimulationSuccess(sim)) {
      log.debug("get_subscription failed", {
        id: id.toString(),
        error: "error" in sim ? sim.error : "not success",
      });
      return null;
    }

    const retval = sim.result?.retval;
    if (!retval) return null;

    try {
      return mapSubscription(scValToNative(retval));
    } catch (err) {
      log.warn("failed to decode subscription", {
        id: id.toString(),
        err: String(err),
      });
      return null;
    }
  }

  /**
   * If due, submit `process_payment` (or dry-run). Returns attempt metadata.
   */
  async billIfDue(id: bigint, nowSecs: number): Promise<BillAttempt> {
    const sub = await this.fetchSubscription(id);
    if (!sub) {
      return { id, status: "skipped", detail: "not_found_or_error" };
    }
    if (!sub.isActive) {
      return { id, status: "skipped", detail: "inactive" };
    }
    if (!isSubscriptionDue(sub, nowSecs)) {
      return {
        id,
        status: "skipped",
        detail: `not_due last=${sub.lastBilled} interval=${sub.intervalSecs}`,
      };
    }

    log.info("subscription due", {
      id: id.toString(),
      amount: sub.amount.toString(),
      merchant: sub.merchant,
      dryRun: this.config.dryRun,
    });

    if (this.config.dryRun) {
      return { id, status: "dry_run", detail: "would_process_payment" };
    }

    return this.submitProcessPayment(id);
  }

  private async submitProcessPayment(id: bigint): Promise<BillAttempt> {
    const account = await withRpcBackoff(
      "executor.getAccount",
      () => this.server.getAccount(this.keypair.publicKey()),
      this.retryOptions(),
    );
    let tx = new TransactionBuilder(account, {
      fee: String(this.config.fee),
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.client.buildProcessPaymentOp(id))
      .setTimeout(180)
      .build();

    // Attach footprint / resource fees from simulation.
    tx = await withRpcBackoff(
      "executor.prepareTransaction",
      () => this.server.prepareTransaction(tx),
      this.retryOptions(),
    );
    tx.sign(this.keypair);

    const sent = await withRpcBackoff(
      "executor.sendTransaction",
      () => this.server.sendTransaction(tx),
      this.retryOptions(),
    );
    if (sent.status === "ERROR") {
      return {
        id,
        status: "failed",
        detail: `send_error ${sent.errorResult?.toXDR("base64") ?? sent.status}`,
        hash: sent.hash,
      };
    }

    log.info("submitted process_payment", {
      id: id.toString(),
      hash: sent.hash,
    });

    const final = await this.pollStatus(sent.hash);
    return {
      id,
      hash: sent.hash,
      status: final === "SUCCESS" ? "success" : "failed",
      detail: final,
    };
  }

  private async pollStatus(hash: string): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const res = await withRpcBackoff(
        "executor.getTransaction",
        () => this.server.getTransaction(hash),
        this.retryOptions(),
      );
      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return "SUCCESS";
      }
      if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
        return "FAILED";
      }
      await this.sleepFn(1_000);
    }
    return "TIMEOUT";
  }
}

/** Wall-clock unix seconds used for due checks (aligned with ledger time on mainnet). */
export async function networkNowSecs(
  server: rpc.Server,
  config?: Pick<
    KeeperConfig,
    | "rpcBackoffInitialMs"
    | "rpcBackoffMaxMs"
    | "rpcBackoffJitterRatio"
    | "rpcMaxRetries"
  >,
  runtime: RpcRuntimeOptions = {},
): Promise<number> {
  try {
    if (config) {
      await withRpcBackoff(
        "executor.getLatestLedger",
        () => server.getLatestLedger(),
        {
          initialDelayMs: config.rpcBackoffInitialMs,
          maxDelayMs: config.rpcBackoffMaxMs,
          jitterRatio: config.rpcBackoffJitterRatio,
          maxRetries: config.rpcMaxRetries,
          sleep: runtime.sleep,
          random: runtime.random,
        },
      );
    } else {
      await server.getLatestLedger();
    }
  } catch (err) {
    if (isFatalRpcError(err)) {
      throw err;
    }
    // fall through to wall clock on transient RPC timeout
  }
  return Math.floor(Date.now() / 1000);
}
