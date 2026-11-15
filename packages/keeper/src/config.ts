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
  rpcBackoffInitialMs: number;
  rpcBackoffMaxMs: number;
  rpcBackoffJitterRatio: number;
  rpcMaxRetries: number;
}

type EnvMap = Readonly<Record<string, string | undefined>>;

function required(env: EnvMap, name: string): string {
  const v = env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function bool(env: EnvMap, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  throw new Error(`Invalid ${name}: ${raw} (expected true/false)`);
}

function int(env: EnvMap, name: string, fallback: number, min = 0): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

function ratio(env: EnvMap, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`Invalid ${name}: ${raw} (expected number between 0 and 1)`);
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

export function loadConfig(env: EnvMap = process.env): KeeperConfig {
  const startRaw = env.START_LEDGER?.trim();
  const pollIntervalMs = int(env, "POLL_INTERVAL_MS", 30_000, 1);
  const rpcBackoffInitialMs = int(env, "RPC_BACKOFF_INITIAL_MS", 1_000, 1);
  const rpcBackoffMaxMs = int(env, "RPC_BACKOFF_MAX_MS", 60_000, 1);
  if (rpcBackoffMaxMs < rpcBackoffInitialMs) {
    throw new Error(
      `Invalid RPC_BACKOFF_MAX_MS: ${String(rpcBackoffMaxMs)} (must be >= RPC_BACKOFF_INITIAL_MS=${String(rpcBackoffInitialMs)})`,
    );
  }

  return {
    rpcUrl: required(env, "RPC_URL"),
    networkPassphrase: env.NETWORK_PASSPHRASE?.trim() || NETWORKS.TESTNET,
    contractId: required(env, "CONTRACT_ID"),
    keeperSecretKey: required(env, "KEEPER_SECRET_KEY"),
    pollIntervalMs,
    dryRun: bool(env, "DRY_RUN", true),
    stateFile: env.STATE_FILE?.trim() || "./.keeper-state.json",
    startLedger: startRaw ? int(env, "START_LEDGER", 0) : null,
    bootstrapIds: parseIds(env.SUBSCRIPTION_IDS),
    maxIdScan: int(env, "MAX_ID_SCAN", 50),
    fee: int(env, "FEE", 100_000),
    rpcBackoffInitialMs,
    rpcBackoffMaxMs,
    rpcBackoffJitterRatio: ratio(env, "RPC_BACKOFF_JITTER_RATIO", 0.2),
    rpcMaxRetries: int(env, "RPC_MAX_RETRIES", 4, 0),
  };
}
