#!/usr/bin/env node
/**
 * Subscription Vault keeper bot.
 *
 * Loop:
 * 1. Sync `sub/created` + `sub/cancelled` events → active ID set
 * 2. Merge bootstrap IDs / optional 1..MAX_ID_SCAN discovery
 * 3. For each ID: simulate get_subscription → if due → process_payment
 *
 * Configure via env (see `.env.example`). Default DRY_RUN=true.
 *
 * Flags:
 *   --once       Run a single billing pass and exit
 *   --help, -h   Print usage
 *   --version, -v Print package version
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rpc } from "@stellar/stellar-sdk";

import { ExponentialBackoff, isFatalRpcError } from "./backoff.js";
import { loadConfig } from "./config.js";
import { networkNowSecs, PaymentExecutor } from "./executor.js";
import { syncEvents } from "./indexer.js";
import { log } from "./logger.js";
import {
  addActiveId,
  emptyState,
  loadState,
  saveState,
  type KeeperState,
} from "./state.js";

const USAGE = `Usage:
  subscription-keeper [--once]
  subscription-keeper --help
  subscription-keeper --version

Env (see .env.example):
  RPC_URL, CONTRACT_ID, KEEPER_SECRET_KEY are required.
  DRY_RUN defaults to true.`;

const KNOWN_FLAGS = new Set(["--once", "--help", "-h", "--version", "-v"]);

function packageVersion(): string {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return (JSON.parse(readFileSync(packagePath, "utf8")) as { version: string }).version;
}

function handleCliFlags(argv: readonly string[]): boolean {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return true;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${packageVersion()}\n`);
    return true;
  }
  for (const arg of argv) {
    if (!KNOWN_FLAGS.has(arg)) {
      throw new Error(`Unknown flag: ${arg}\n${USAGE}`);
    }
  }
  return false;
}

async function discoverMissingIds(
  executor: PaymentExecutor,
  state: KeeperState,
  maxIdScan: number,
): Promise<void> {
  if (state.activeIds.length > 0 || maxIdScan <= 0) return;

  log.info("active index empty; scanning subscription IDs", { maxIdScan });
  for (let i = 1; i <= maxIdScan; i++) {
    const id = BigInt(i);
    const sub = await executor.fetchSubscription(id);
    if (sub?.isActive) {
      addActiveId(state, id);
      log.info("discovered active subscription", { id: String(i) });
    }
  }
}

async function runOnce(
  server: rpc.Server,
  executor: PaymentExecutor,
  state: KeeperState,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  await syncEvents(server, config, state);

  for (const raw of config.bootstrapIds) {
    addActiveId(state, raw);
  }

  await discoverMissingIds(executor, state, config.maxIdScan);

  const now = await networkNowSecs(server, config);
  const ids = state.activeIds.map((s) => BigInt(s));

  log.info("billing pass", {
    candidates: ids.length,
    now,
    dryRun: config.dryRun,
  });

  const results = [];
  for (const id of ids) {
    try {
      const attempt = await executor.billIfDue(id, now);
      results.push(attempt);
      if (attempt.detail === "inactive" || attempt.detail === "not_found_or_error") {
        state.activeIds = state.activeIds.filter((x) => x !== id.toString());
      }
    } catch (err) {
      if (isFatalRpcError(err)) {
        throw err;
      }
      log.error("bill attempt threw", { id: id.toString(), err: String(err) });
      results.push({
        id,
        status: "failed" as const,
        detail: String(err),
      });
    }
  }

  const summary = {
    success: results.filter((r) => r.status === "success").length,
    dryRun: results.filter((r) => r.status === "dry_run").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
  log.info("billing pass complete", summary);

  await saveState(config.stateFile, state);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (handleCliFlags(argv)) return;

  const config = loadConfig();
  const server = new rpc.Server(config.rpcUrl, { allowHttp: true });
  const executor = new PaymentExecutor(server, config);
  const pollBackoff = new ExponentialBackoff({
    initialDelayMs: config.rpcBackoffInitialMs,
    maxDelayMs: Math.max(config.pollIntervalMs, config.rpcBackoffMaxMs),
    jitterRatio: config.rpcBackoffJitterRatio,
  });

  log.info("keeper starting", {
    contractId: config.contractId,
    keeper: executor.publicKey,
    rpcUrl: config.rpcUrl,
    dryRun: config.dryRun,
    pollIntervalMs: config.pollIntervalMs,
    rpcBackoffInitialMs: config.rpcBackoffInitialMs,
    rpcBackoffMaxMs: config.rpcBackoffMaxMs,
    rpcBackoffJitterRatio: config.rpcBackoffJitterRatio,
    rpcMaxRetries: config.rpcMaxRetries,
  });

  let state =
    (await loadState(config.stateFile)) ??
    emptyState(config.startLedger ?? 0);

  const once = argv.includes("--once");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let waitMs = config.pollIntervalMs;
    try {
      await runOnce(server, executor, state, config);
      pollBackoff.reset();
    } catch (err) {
      if (isFatalRpcError(err) || once) {
        log.error("unrecoverable keeper failure; stopping", { err: String(err) });
        throw err;
      }
      const backoffDelayMs = pollBackoff.nextDelayMs();
      waitMs = Math.max(config.pollIntervalMs, backoffDelayMs);
      log.warn("poll iteration failed; backing off before next cycle", {
        consecutiveOutages: pollBackoff.attempts,
        waitMs,
        err: String(err),
      });
    }

    if (once) {
      log.info("(--once) exiting");
      break;
    }

    await new Promise((r) => setTimeout(r, waitMs));
    // Reload state from disk in case an operator edited activeIds.
    state = (await loadState(config.stateFile)) ?? state;
  }
}

const isDirectEntry =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectEntry) {
  main().catch((err) => {
    log.error("fatal", { err: String(err) });
    process.exit(1);
  });
}
