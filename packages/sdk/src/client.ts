import {
  Address,
  Contract,
  nativeToScVal,
  Operation,
  TransactionBuilder,
  xdr,
  type Account,
  type Networks,
} from "@stellar/stellar-sdk";

import { ConfigError } from "./errors.js";

/** Mirrors on-chain `MIN_INTERVAL_SECS` (1 hour). */
export const MIN_INTERVAL_SECS = 3_600n;
/** Mirrors on-chain `MAX_INTERVAL_SECS` (~1 year). */
export const MAX_INTERVAL_SECS = 31_536_000n;

/** On-chain subscription record (mirrors Rust `Subscription`). */
export interface Subscription {
  subscriber: string;
  merchant: string;
  token: string;
  amount: bigint;
  intervalSecs: bigint;
  lastBilled: bigint;
  isActive: boolean;
}

function unixSeconds(nowSecs: number | bigint): bigint {
  if (typeof nowSecs === "bigint") return nowSecs;
  if (!Number.isInteger(nowSecs)) {
    throw new RangeError("nowSecs must be a finite integer timestamp");
  }
  return BigInt(nowSecs);
}

/**
 * Whether a subscription is billable at `now` (unix seconds).
 * Mirrors on-chain rules: inactive → false; `lastBilled == 0` → due now;
 * otherwise due when `now >= lastBilled + intervalSecs`.
 */
export function isSubscriptionDue(sub: Subscription, nowSecs: number | bigint): boolean {
  if (!sub.isActive) return false;
  const now = unixSeconds(nowSecs);
  if (sub.lastBilled === 0n) return true;
  return now >= sub.lastBilled + sub.intervalSecs;
}

/** Seconds until the next bill is allowed (0 if already due / inactive). */
export function secondsUntilDue(sub: Subscription, nowSecs: number | bigint): bigint {
  if (!sub.isActive || sub.lastBilled === 0n) return 0n;
  const now = unixSeconds(nowSecs);
  const next = sub.lastBilled + sub.intervalSecs;
  return next > now ? next - now : 0n;
}

export interface SubscriptionClientConfig {
  /** Deployed SubscriptionVault contract ID (C...). */
  contractId: string;
  /** Horizon / RPC-compatible network passphrase. */
  networkPassphrase: string;
  /** Source account sequence is required to build a tx; pass the account object or sequence. */
  source: string;
  /** Optional fee in stroops (defaults to 100). */
  fee?: number;
}

/**
 * Thin helper around `@stellar/stellar-sdk` for assembling **unsigned**
 * Soroban invocations. Sign + submit with your wallet / keeper bot.
 */
export class SubscriptionClient {
  readonly contractId: string;
  readonly contract: Contract;
  readonly networkPassphrase: string;
  readonly source: string;
  readonly fee: number;

  constructor(config: SubscriptionClientConfig) {
    const contractId = config.contractId.trim();
    const networkPassphrase = config.networkPassphrase.trim();
    const source = config.source.trim();
    if (!contractId) {
      throw new ConfigError("contractId is required");
    }
    if (!networkPassphrase) {
      throw new ConfigError("networkPassphrase is required");
    }
    if (!source) {
      throw new ConfigError("source is required");
    }
    const fee = config.fee ?? 100;
    if (!Number.isInteger(fee) || fee < 0) {
      throw new ConfigError("fee must be a non-negative integer (stroops)");
    }
    this.contractId = contractId;
    this.contract = new Contract(contractId);
    this.networkPassphrase = networkPassphrase;
    this.source = source;
    this.fee = fee;
  }

  private requireSubscriptionId(id: bigint, label = "subscriptionId"): bigint {
    if (id < 0n) {
      throw new RangeError(`${label} must be a non-negative u64`);
    }
    return id;
  }

  /** Assemble an SAC `approve` so the vault can `transfer_from` later. */
  buildApproveOp(params: {
    tokenContractId: string;
    subscriber: string;
    amount: bigint;
    /** Ledger sequence after which the allowance expires. */
    expirationLedger: number;
  }): xdr.Operation {
    if (params.amount <= 0n) {
      throw new RangeError("approve amount must be positive");
    }
    if (!Number.isInteger(params.expirationLedger) || params.expirationLedger < 0) {
      throw new RangeError("expirationLedger must be a non-negative integer");
    }
    const token = new Contract(params.tokenContractId);
    return token.call(
      "approve",
      Address.fromString(params.subscriber).toScVal(),
      Address.fromString(this.contractId).toScVal(),
      nativeToScVal(params.amount, { type: "i128" }),
      nativeToScVal(params.expirationLedger, { type: "u32" }),
    );
  }

  /** Assemble `create_subscription` (requires subscriber auth). */
  buildCreateSubscriptionOp(params: {
    subscriber: string;
    merchant: string;
    token: string;
    amount: bigint;
    intervalSecs: bigint;
  }): xdr.Operation {
    if (params.amount <= 0n) {
      throw new RangeError("amount must be positive");
    }
    if (params.intervalSecs < MIN_INTERVAL_SECS || params.intervalSecs > MAX_INTERVAL_SECS) {
      throw new RangeError("intervalSecs is outside the on-chain allowed range");
    }
    if (params.subscriber === params.merchant) {
      throw new RangeError("subscriber and merchant must be distinct");
    }
    return this.contract.call(
      "create_subscription",
      Address.fromString(params.subscriber).toScVal(),
      Address.fromString(params.merchant).toScVal(),
      Address.fromString(params.token).toScVal(),
      nativeToScVal(params.amount, { type: "i128" }),
      nativeToScVal(params.intervalSecs, { type: "u64" }),
    );
  }

  /** Assemble permissionless `process_payment` for keepers / merchants. */
  buildProcessPaymentOp(subscriptionId: bigint): xdr.Operation {
    return this.contract.call(
      "process_payment",
      nativeToScVal(this.requireSubscriptionId(subscriptionId), { type: "u64" }),
    );
  }

  /** Assemble read-only `get_subscription` (simulate; do not submit). */
  buildGetSubscriptionOp(subscriptionId: bigint): xdr.Operation {
    return this.contract.call(
      "get_subscription",
      nativeToScVal(this.requireSubscriptionId(subscriptionId), { type: "u64" }),
    );
  }

  /** Assemble `cancel_subscription` (requires subscriber auth). */
  buildCancelSubscriptionOp(params: {
    subscriber: string;
    subscriptionId: bigint;
  }): xdr.Operation {
    return this.contract.call(
      "cancel_subscription",
      Address.fromString(params.subscriber).toScVal(),
      nativeToScVal(this.requireSubscriptionId(params.subscriptionId), { type: "u64" }),
    );
  }

  /**
   * Wrap one or more ops in an unsigned Transaction XDR.
   * Caller must provide a valid account sequence via `TransactionBuilder`.
   */
  async buildTransaction(ops: xdr.Operation[], account: Account) {
    const builder = new TransactionBuilder(account, {
      fee: String(this.fee),
      networkPassphrase: this.networkPassphrase,
    });
    for (const op of ops) {
      builder.addOperation(op);
    }
    return builder.setTimeout(180).build();
  }
}

/** Common network passphrases. */
export const NETWORKS = {
  TESTNET: "Test SDF Network ; September 2015",
  PUBLIC: "Public Global Stellar Network ; September 2015",
  FUTURENET: "Test SDF Future Network ; October 2022",
} as const satisfies Record<string, string>;

export type { Networks };
export { Operation, TransactionBuilder, Address, Contract, nativeToScVal };
