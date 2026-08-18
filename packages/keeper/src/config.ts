import "dotenv/config";

import { NETWORKS } from "@recurring-subscriptions/sdk";

export interface KeeperConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  keeperSecretKey: string;
  pollIntervalMs: number;
  dryRun: boolean;
  stateFile: string;
  startLedger: number | null;
  bootstrapIds: bigint[];
  maxIdScan: number;
  fee: number;
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  throw new Error(`Invalid ${name}: ${raw} (expected true/false)`);
}

function int(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

function parseIds(raw: string | undefined): bigint[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        const id = BigInt(s);
        if (id <= 0n) throw new Error("non-positive");
        return id;
      } catch {
        throw new Error(`Invalid SUBSCRIPTION_IDS entry: ${s}`);
      }
    });
}

export function loadConfig(): KeeperConfig {
  const startRaw = process.env.START_LEDGER?.trim();
  const pollIntervalMs = int("POLL_INTERVAL_MS", 30_000, 1);
  return {
    rpcUrl: required("RPC_URL"),
    networkPassphrase:
      process.env.NETWORK_PASSPHRASE?.trim() || NETWORKS.TESTNET,
    contractId: required("CONTRACT_ID"),
    keeperSecretKey: required("KEEPER_SECRET_KEY"),
    pollIntervalMs,
    dryRun: bool("DRY_RUN", true),
    stateFile: process.env.STATE_FILE?.trim() || "./.keeper-state.json",
    startLedger: startRaw ? int("START_LEDGER", 0) : null,
    bootstrapIds: parseIds(process.env.SUBSCRIPTION_IDS),
    maxIdScan: int("MAX_ID_SCAN", 50),
    fee: int("FEE", 100_000),
  };
}
