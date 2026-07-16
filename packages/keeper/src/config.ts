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
  return raw === "1" || raw === "true" || raw === "yes";
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return Math.floor(n);
}

function parseIds(raw: string | undefined): bigint[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return BigInt(s);
      } catch {
        throw new Error(`Invalid SUBSCRIPTION_IDS entry: ${s}`);
      }
    });
}

export function loadConfig(): KeeperConfig {
  const startRaw = process.env.START_LEDGER?.trim();
  return {
    rpcUrl: required("RPC_URL"),
    networkPassphrase:
      process.env.NETWORK_PASSPHRASE?.trim() || NETWORKS.TESTNET,
    contractId: required("CONTRACT_ID"),
    keeperSecretKey: required("KEEPER_SECRET_KEY"),
    pollIntervalMs: int("POLL_INTERVAL_MS", 30_000),
    dryRun: bool("DRY_RUN", true),
    stateFile: process.env.STATE_FILE?.trim() || "./.keeper-state.json",
    startLedger: startRaw ? int("START_LEDGER", 0) : null,
    bootstrapIds: parseIds(process.env.SUBSCRIPTION_IDS),
    maxIdScan: int("MAX_ID_SCAN", 50),
    fee: int("FEE", 100_000),
  };
}
