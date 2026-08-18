import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { log } from "./logger.js";

/** Durable keeper cursor + known subscription IDs. */
export interface KeeperState {
  /** Next ledger to request from `getEvents` (inclusive). */
  cursorLedger: number;
  /** Subscription IDs believed active (created − cancelled). */
  activeIds: string[];
  updatedAt: string;
}

export function emptyState(cursorLedger = 0): KeeperState {
  return {
    cursorLedger,
    activeIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadState(path: string): Promise<KeeperState | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as KeeperState;
    if (!Array.isArray(parsed.activeIds)) {
      throw new Error("activeIds missing");
    }
    if (
      typeof parsed.cursorLedger !== "number" ||
      !Number.isInteger(parsed.cursorLedger) ||
      parsed.cursorLedger < 0
    ) {
      throw new Error("cursorLedger invalid");
    }
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    log.warn("failed to load state file; starting fresh", {
      path,
      err: String(err),
    });
    return null;
  }
}

export async function saveState(path: string, state: KeeperState): Promise<void> {
  const next: KeeperState = {
    ...state,
    // Stable sort for readable diffs
    activeIds: [...new Set(state.activeIds)].sort((a, b) => {
      const delta = BigInt(a) - BigInt(b);
      return delta < 0n ? -1 : delta > 0n ? 1 : 0;
    }),
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function addActiveId(state: KeeperState, id: bigint): void {
  const key = id.toString();
  if (!state.activeIds.includes(key)) state.activeIds.push(key);
}

export function removeActiveId(state: KeeperState, id: bigint): void {
  const key = id.toString();
  state.activeIds = state.activeIds.filter((x) => x !== key);
}
