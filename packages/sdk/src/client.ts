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

/**
 * Whether a subscription is billable at `now` (unix seconds).
 * Mirrors on-chain rules: inactive → false; `lastBilled == 0` → due now;
 * otherwise due when `now >= lastBilled + intervalSecs`.
 */
export function isSubscriptionDue(sub: Subscription, nowSecs: number | bigint): boolean {
  if (!sub.isActive) return false;
  const now = BigInt(nowSecs);
  if (sub.lastBilled === 0n) return true;
  return now >= sub.lastBilled + sub.intervalSecs;
}

/** Seconds until the next bill is allowed (0 if already due / inactive). */
export function secondsUntilDue(sub: Subscription, nowSecs: number | bigint): bigint {
  if (!sub.isActive || sub.lastBilled === 0n) return 0n;
  const now = BigInt(nowSecs);
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
    this.contractId = config.contractId;
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = config.networkPassphrase;
    this.source = config.source;
    this.fee = config.fee ?? 100;
  }

  /** Assemble an SAC `approve` so the vault can `transfer_from` later. */
  buildApproveOp(params: {
    tokenContractId: string;
    subscriber: string;
    amount: bigint;
    /** Ledger sequence after which the allowance expires. */
    expirationLedger: number;
  }): xdr.Operation {
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
      nativeToScVal(subscriptionId, { type: "u64" }),
    );
  }

  /** Assemble read-only `get_subscription` (simulate; do not submit). */
  buildGetSubscriptionOp(subscriptionId: bigint): xdr.Operation {
    return this.contract.call(
      "get_subscription",
      nativeToScVal(subscriptionId, { type: "u64" }),
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
      nativeToScVal(params.subscriptionId, { type: "u64" }),
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
