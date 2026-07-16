/**
 * Fixed Soroban event topic prefixes emitted by SubscriptionVault.
 * Use with RPC `getEvents` topic filters (Symbol ScVals).
 *
 * Topics layout:
 * - created:   ["sub", "created", subscription_id, subscriber, merchant]
 * - paid:      ["sub", "paid", subscription_id, subscriber, merchant]
 * - cancelled: ["sub", "cancelled", subscription_id, subscriber, merchant]
 */
export const EVENT_TOPICS = {
  PREFIX: "sub",
  CREATED: "created",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export type VaultEventKind =
  | typeof EVENT_TOPICS.CREATED
  | typeof EVENT_TOPICS.PAID
  | typeof EVENT_TOPICS.CANCELLED;

/** Decoded `sub/created` event data map fields. */
export interface SubscriptionCreatedData {
  token: string;
  amount: bigint;
  intervalSecs: bigint;
}

/** Decoded `sub/paid` event data map fields. */
export interface PaymentProcessedData {
  token: string;
  amount: bigint;
  billedAt: bigint;
}

/** Topic filter fragments for RPC `getEvents` (wildcard-friendly). */
export function vaultEventTopicFilter(
  kind: VaultEventKind,
): [string, string, "*", "*", "*"] {
  return [EVENT_TOPICS.PREFIX, kind, "*", "*", "*"];
}
