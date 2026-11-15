import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Account, Keypair, nativeToScVal, Networks, StrKey } from "@stellar/stellar-sdk";

import {
  ExponentialBackoff,
  FatalKeeperError,
  isFatalRpcError,
  withRpcBackoff,
} from "../dist/backoff.js";
import { loadConfig } from "../dist/config.js";
import { PaymentExecutor, networkNowSecs } from "../dist/executor.js";
import { syncEvents } from "../dist/indexer.js";
import { emptyState } from "../dist/state.js";

function sampleEnv(overrides = {}) {
  const keeper = Keypair.random();
  const contractId = StrKey.encodeContract(Buffer.alloc(32, 0x11));
  return {
    RPC_URL: "https://soroban-testnet.stellar.org",
    NETWORK_PASSPHRASE: Networks.TESTNET,
    CONTRACT_ID: contractId,
    KEEPER_SECRET_KEY: keeper.secret(),
    ...overrides,
  };
}

describe("ExponentialBackoff", () => {
  it("doubles retry delay up to configured max cap when jitter is zero", () => {
    const backoff = new ExponentialBackoff(
      { initialDelayMs: 500, maxDelayMs: 3_000, jitterRatio: 0 },
      () => 0,
    );

    const sequence = [
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
    ];

    assert.deepEqual(sequence, [500, 1_000, 2_000, 3_000, 3_000]);
    assert.equal(backoff.attempts, 5);
  });

  it("applies bounded sub-cap jitter and resets cleanly after recovery", () => {
    const backoff = new ExponentialBackoff(
      { initialDelayMs: 1_000, maxDelayMs: 10_000, jitterRatio: 0.2 },
      () => 0.5,
    );

    // 1000 * (1 - 0.2 * 0.5) = 900; 2000 * 0.9 = 1800
    assert.equal(backoff.nextDelayMs(), 900);
    assert.equal(backoff.nextDelayMs(), 1_800);
    assert.equal(backoff.attempts, 2);

    backoff.reset();
    assert.equal(backoff.attempts, 0);
    assert.equal(backoff.nextDelayMs(), 900);
  });

  it("rejects out-of-bounds backoff parameters", () => {
    assert.throws(
      () => new ExponentialBackoff({ initialDelayMs: 0, maxDelayMs: 1_000, jitterRatio: 0 }),
      RangeError,
    );
    assert.throws(
      () => new ExponentialBackoff({ initialDelayMs: 2_000, maxDelayMs: 1_000, jitterRatio: 0 }),
      RangeError,
    );
    assert.throws(
      () => new ExponentialBackoff({ initialDelayMs: 1_000, maxDelayMs: 5_000, jitterRatio: 1.5 }),
      RangeError,
    );
  });
});

describe("withRpcBackoff & error classification", () => {
  it("retries transient 503/429/fetch errors with fake clock and resets shared backoff on success", async () => {
    const sleeps = [];
    const sharedBackoff = new ExponentialBackoff(
      { initialDelayMs: 250, maxDelayMs: 1_000, jitterRatio: 0 },
      () => 0,
    );

    let calls = 0;
    const result = await withRpcBackoff(
      "test.rpcCall",
      async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("Service Unavailable");
          Object.assign(err, { status: 503 });
          throw err;
        }
        if (calls === 2) {
          throw new TypeError("fetch failed");
        }
        return "ok-ledger-500";
      },
      {
        initialDelayMs: 250,
        maxDelayMs: 1_000,
        jitterRatio: 0,
        maxRetries: 4,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        backoff: sharedBackoff,
      },
    );

    assert.equal(result, "ok-ledger-500");
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [250, 500]);
    assert.equal(sharedBackoff.attempts, 0);
  });

  it("does not retry fatal/auth/config errors and sleeps zero times", async () => {
    const sleeps = [];
    let calls = 0;

    const authErr = new Error("Unauthorized RPC API token");
    Object.assign(authErr, { status: 401 });
    assert.equal(isFatalRpcError(authErr), true);

    await assert.rejects(
      () =>
        withRpcBackoff(
          "test.fatalRpc",
          async () => {
            calls += 1;
            throw authErr;
          },
          {
            initialDelayMs: 1_000,
            maxDelayMs: 8_000,
            jitterRatio: 0.2,
            maxRetries: 5,
            sleep: async (ms) => {
              sleeps.push(ms);
            },
          },
        ),
      /Unauthorized RPC API token/,
    );

    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  });

  it("stops after maxRetries on prolonged transient outage", async () => {
    const sleeps = [];
    let calls = 0;

    await assert.rejects(
      () =>
        withRpcBackoff(
          "test.exhausted",
          async () => {
            calls += 1;
            const rateLimitErr = new Error("Too Many Requests");
            Object.assign(rateLimitErr, { status: 429 });
            throw rateLimitErr;
          },
          {
            initialDelayMs: 100,
            maxDelayMs: 250,
            jitterRatio: 0,
            maxRetries: 3,
            sleep: async (ms) => {
              sleeps.push(ms);
            },
            random: () => 0,
          },
        ),
      /Too Many Requests/,
    );

    assert.equal(calls, 4);
    assert.deepEqual(sleeps, [100, 200, 250]);
  });
});

describe("loadConfig backoff env knobs", () => {
  it("loads defaults and custom RPC backoff settings", () => {
    const defaults = loadConfig(sampleEnv());
    assert.equal(defaults.rpcBackoffInitialMs, 1_000);
    assert.equal(defaults.rpcBackoffMaxMs, 60_000);
    assert.equal(defaults.rpcBackoffJitterRatio, 0.2);
    assert.equal(defaults.rpcMaxRetries, 4);

    const custom = loadConfig(
      sampleEnv({
        RPC_BACKOFF_INITIAL_MS: "2000",
        RPC_BACKOFF_MAX_MS: "30000",
        RPC_BACKOFF_JITTER_RATIO: "0.35",
        RPC_MAX_RETRIES: "6",
      }),
    );
    assert.equal(custom.rpcBackoffInitialMs, 2_000);
    assert.equal(custom.rpcBackoffMaxMs, 30_000);
    assert.equal(custom.rpcBackoffJitterRatio, 0.35);
    assert.equal(custom.rpcMaxRetries, 6);
  });

  it("rejects invalid backoff bounds or ratios", () => {
    assert.throws(
      () =>
        loadConfig(
          sampleEnv({
            RPC_BACKOFF_INITIAL_MS: "5000",
            RPC_BACKOFF_MAX_MS: "1000",
          }),
        ),
      /Invalid RPC_BACKOFF_MAX_MS/,
    );
    assert.throws(
      () =>
        loadConfig(
          sampleEnv({
            RPC_BACKOFF_JITTER_RATIO: "1.5",
          }),
        ),
      /Invalid RPC_BACKOFF_JITTER_RATIO/,
    );
  });
});

describe("indexer & executor RPC backoff integration", () => {
  it("syncEvents recovers from transient getLatestLedger and getEvents failures and resets backoff", async () => {
    const config = loadConfig(
      sampleEnv({
        RPC_BACKOFF_INITIAL_MS: "300",
        RPC_BACKOFF_MAX_MS: "2400",
        RPC_BACKOFF_JITTER_RATIO: "0",
        RPC_MAX_RETRIES: "3",
      }),
    );
    const state = emptyState(100);
    const sleeps = [];

    let ledgerCalls = 0;
    let eventCalls = 0;

    const fakeServer = {
      async getLatestLedger() {
        ledgerCalls += 1;
        if (ledgerCalls < 3) {
          const err = new Error("Gateway Timeout");
          Object.assign(err, { status: 504 });
          throw err;
        }
        return { sequence: 120 };
      },
      async getEvents() {
        eventCalls += 1;
        if (eventCalls === 1) {
          throw new Error("ECONNRESET socket hang up");
        }
        return {
          events: [
            {
              ledger: 115,
              contractId: config.contractId,
              topic: [
                nativeToScVal("sub", { type: "symbol" }),
                nativeToScVal("created", { type: "symbol" }),
                nativeToScVal(7n, { type: "u64" }),
              ],
            },
          ],
          cursor: "",
        };
      },
    };

    await syncEvents(fakeServer, config, state, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });

    // getLatestLedger failed twice (300ms, 600ms), then succeeded (resetting backoff to 0);
    // getEvents then failed once, so its first delay started fresh at 300ms!
    assert.deepEqual(sleeps, [300, 600, 300]);
    assert.deepEqual(state.activeIds, ["7"]);
    assert.equal(state.cursorLedger, 120);
  });

  it("PaymentExecutor backs off on transient simulation failures and aborts immediately on fatal config", async () => {
    assert.throws(
      () => {
        const badCfg = loadConfig(sampleEnv({ KEEPER_SECRET_KEY: "not-a-valid-secret-seed" }));
        new PaymentExecutor({}, badCfg);
      },
      FatalKeeperError,
    );

    const config = loadConfig(
      sampleEnv({
        DRY_RUN: "true",
        RPC_BACKOFF_INITIAL_MS: "200",
        RPC_BACKOFF_MAX_MS: "1000",
        RPC_BACKOFF_JITTER_RATIO: "0",
        RPC_MAX_RETRIES: "3",
      }),
    );
    const keeperPub = Keypair.fromSecret(config.keeperSecretKey).publicKey();
    const subscriberPub = Keypair.random().publicKey();
    const merchantPub = Keypair.random().publicKey();
    const tokenId = StrKey.encodeContract(Buffer.alloc(32, 0x22));

    const sleeps = [];
    let simAttempts = 0;

    const fakeServer = {
      async getAccount() {
        return new Account(keeperPub, "100");
      },
      async simulateTransaction() {
        simAttempts += 1;
        if (simAttempts === 1) {
          const err = new Error("RPC upstream overloaded");
          Object.assign(err, { status: 502 });
          throw err;
        }
        return {
          id: "sim-1",
          latestLedger: 200,
          events: [],
          transactionData: "",
          minResourceFee: "100",
          cost: { cpuInsns: "1", memBytes: "1" },
          restorePreamble: { minResourceFee: "0", transactionData: "" },
          result: {
            auth: [],
            retval: nativeToScVal({
              subscriber: subscriberPub,
              merchant: merchantPub,
              token: tokenId,
              amount: 50_000n,
              interval_secs: 3_600n,
              last_billed: 0n,
              is_active: true,
            }),
          },
        };
      },
      async getLatestLedger() {
        return { sequence: 200 };
      },
    };

    const executor = new PaymentExecutor(fakeServer, config, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });

    const now = await networkNowSecs(fakeServer, config, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    const attempt = await executor.billIfDue(1n, now);

    assert.equal(attempt.status, "dry_run");
    assert.deepEqual(sleeps, [200]);
  });
});
