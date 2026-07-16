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

import type { KeeperConfig } from "./config.js";
import { log } from "./logger.js";

export interface BillAttempt {
  id: bigint;
  status: "skipped" | "dry_run" | "submitted" | "success" | "failed";
  detail?: string;
  hash?: string;
}

function mapSubscription(raw: unknown): Subscription {
  const o = raw as Record<string, unknown>;
  return {
    subscriber: String(o.subscriber),
    merchant: String(o.merchant),
    token: String(o.token),
    amount: BigInt(o.amount as string | number | bigint),
    intervalSecs: BigInt(o.interval_secs as string | number | bigint),
    lastBilled: BigInt(o.last_billed as string | number | bigint),
    isActive: Boolean(o.is_active),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PaymentExecutor {
  private readonly client: SubscriptionClient;
  private readonly keypair: Keypair;

  constructor(
    private readonly server: rpc.Server,
    private readonly config: KeeperConfig,
  ) {
    this.keypair = Keypair.fromSecret(config.keeperSecretKey);
    this.client = new SubscriptionClient({
      contractId: config.contractId,
      networkPassphrase: config.networkPassphrase,
      source: this.keypair.publicKey(),
      fee: config.fee,
    });
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  /** Simulate `get_subscription`; returns null if missing / error. */
  async fetchSubscription(id: bigint): Promise<Subscription | null> {
    const account = await this.server.getAccount(this.keypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: String(this.config.fee),
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.client.buildGetSubscriptionOp(id))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
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
    const account = await this.server.getAccount(this.keypair.publicKey());
    let tx = new TransactionBuilder(account, {
      fee: String(this.config.fee),
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.client.buildProcessPaymentOp(id))
      .setTimeout(180)
      .build();

    // Attach footprint / resource fees from simulation.
    tx = await this.server.prepareTransaction(tx);
    tx.sign(this.keypair);

    const sent = await this.server.sendTransaction(tx);
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
      const res = await this.server.getTransaction(hash);
      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return "SUCCESS";
      }
      if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
        return "FAILED";
      }
      await sleep(1_000);
    }
    return "TIMEOUT";
  }
}

/** Wall-clock unix seconds used for due checks (aligned with ledger time on mainnet). */
export async function networkNowSecs(server: rpc.Server): Promise<number> {
  try {
    await server.getLatestLedger();
  } catch {
    // fall through to wall clock
  }
  return Math.floor(Date.now() / 1000);
}
