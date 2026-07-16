import {
  EVENT_TOPICS,
  vaultEventTopicFilter,
  type VaultEventKind,
} from "@recurring-subscriptions/sdk";
import { nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

import type { KeeperConfig } from "./config.js";
import { log } from "./logger.js";
import {
  addActiveId,
  removeActiveId,
  type KeeperState,
} from "./state.js";

function symbolTopic(name: string): string {
  return nativeToScVal(name, { type: "symbol" }).toXDR("base64");
}

function topicFilter(kind: VaultEventKind): string[][] {
  const [prefix, action] = vaultEventTopicFilter(kind);
  return [[symbolTopic(prefix), symbolTopic(action)]];
}

function parseSubscriptionId(topics: xdr.ScVal[]): bigint | null {
  // Fixed: sub, kind | Dynamic: id, subscriber, merchant
  if (topics.length < 3) return null;
  try {
    const id = scValToNative(topics[2]!);
    return BigInt(id);
  } catch {
    return null;
  }
}

function topicKind(topics: xdr.ScVal[]): VaultEventKind | null {
  if (topics.length < 2) return null;
  try {
    const prefix = String(scValToNative(topics[0]!));
    const kind = String(scValToNative(topics[1]!));
    if (prefix !== EVENT_TOPICS.PREFIX) return null;
    if (
      kind === EVENT_TOPICS.CREATED ||
      kind === EVENT_TOPICS.CANCELLED ||
      kind === EVENT_TOPICS.PAID
    ) {
      return kind;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Pull vault lifecycle events since `state.cursorLedger` and update active IDs.
 * Advances the cursor past the highest ledger seen.
 */
export async function syncEvents(
  server: rpc.Server,
  config: KeeperConfig,
  state: KeeperState,
): Promise<void> {
  const latest = await server.getLatestLedger();
  let startLedger = state.cursorLedger;

  if (startLedger <= 0) {
    startLedger =
      config.startLedger ??
      Math.max(1, latest.sequence - 10_000);
    log.info("initialized event cursor", { startLedger });
  }

  // RPC rejects startLedger > latest; clamp.
  if (startLedger > latest.sequence) {
    log.debug("cursor ahead of network; skipping sync", {
      startLedger,
      latest: latest.sequence,
    });
    return;
  }

  let cursor: string | undefined;
  let highest = startLedger - 1;
  let page = 0;

  for (;;) {
    page += 1;
    const res = await server.getEvents({
      startLedger: cursor ? undefined : startLedger,
      cursor,
      filters: [
        {
          type: "contract",
          contractIds: [config.contractId],
          topics: topicFilter(EVENT_TOPICS.CREATED),
        },
        {
          type: "contract",
          contractIds: [config.contractId],
          topics: topicFilter(EVENT_TOPICS.CANCELLED),
        },
        {
          type: "contract",
          contractIds: [config.contractId],
          topics: topicFilter(EVENT_TOPICS.PAID),
        },
      ],
      limit: 100,
    });

    for (const ev of res.events) {
      highest = Math.max(highest, ev.ledger);
      // Request already filters by contractIds; Contract object may wrap the ID.
      const eventContract =
        typeof ev.contractId === "string"
          ? ev.contractId
          : ev.contractId?.contractId?.();
      if (eventContract && eventContract !== config.contractId) continue;

      const topics = ev.topic;
      const kind = topicKind(topics);
      const id = parseSubscriptionId(topics);
      if (!kind || id === null) continue;

      if (kind === EVENT_TOPICS.CREATED) {
        addActiveId(state, id);
        log.debug("indexed created", { id: id.toString(), ledger: ev.ledger });
      } else if (kind === EVENT_TOPICS.CANCELLED) {
        removeActiveId(state, id);
        log.debug("indexed cancelled", { id: id.toString(), ledger: ev.ledger });
      }
      // paid → no membership change; still advances cursor
    }

    if (!res.cursor || res.events.length === 0) break;
    cursor = res.cursor;
    if (page > 200) {
      log.warn("event sync page limit hit; will continue next poll");
      break;
    }
  }

  // Advance to latest even if no events, so we don't re-scan forever.
  state.cursorLedger = Math.max(highest + 1, latest.sequence);
  log.info("event sync complete", {
    active: state.activeIds.length,
    cursorLedger: state.cursorLedger,
    pages: page,
  });
}
