import { log } from "./logger.js";

export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export interface RpcRetryOptions extends BackoffConfig {
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  backoff?: ExponentialBackoff;
}

export interface RpcRuntimeOptions {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Explicit error class for unrecoverable configuration or authorization failures
 * that must abort immediately rather than spinning in retry loops.
 */
export class FatalKeeperError extends Error {
  readonly fatal = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FatalKeeperError";
  }
}

const FATAL_MESSAGE_PATTERNS: readonly RegExp[] = [
  /missing required env var/i,
  /invalid ed25519 secret seed/i,
  /invalid contract id/i,
  /crc16 checksum/i,
  /account not found/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid api key/i,
  /invalid json-rpc/i,
  /method not found/i,
  /invalid params/i,
];

function extractHttpStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== "object") return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  const response = record.response;
  if (response !== null && typeof response === "object") {
    const respStatus = (response as Record<string, unknown>).status;
    if (typeof respStatus === "number") return respStatus;
  }
  return undefined;
}

/**
 * Distinguishes permanent configuration/auth/validation failures from transient
 * network, timeout, rate-limit (429), and 5xx Soroban RPC errors.
 */
export function isFatalRpcError(err: unknown): boolean {
  if (err instanceof FatalKeeperError) return true;
  if (
    err instanceof TypeError ||
    err instanceof RangeError ||
    err instanceof SyntaxError
  ) {
    // Node `fetch` surfaces network transport failures as `TypeError("fetch failed")`;
    // treat `fetch failed` as transient, while genuine programming/config TypeErrors are fatal.
    if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
      return false;
    }
    return true;
  }

  if (err !== null && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (record.fatal === true || record.code === "CONFIG_ERROR") {
      return true;
    }
  }

  const status = extractHttpStatus(err);
  if (status !== undefined) {
    // 408 Request Timeout and 429 Too Many Requests are transient; other 4xx are fatal client/auth errors.
    if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
      return true;
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return FATAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Stateful capped exponential backoff calculator with bounded sub-cap jitter.
 *
 * Delay formula for 0-based failure index `n`:
 *   capped = min(maxDelayMs, initialDelayMs * 2^n)
 *   delay  = round(capped * (1 - jitterRatio * random()))
 *
 * When `jitterRatio === 0` (or `random() === 0`), delays double deterministically
 * (`initialDelayMs`, `2 * initialDelayMs`, `4 * initialDelayMs`, ...) up to `maxDelayMs`.
 * Calling `reset()` after any successful RPC response restores `attempts` to `0`.
 */
export class ExponentialBackoff {
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;
  private failureCount = 0;

  constructor(config: BackoffConfig, random: () => number = Math.random) {
    if (!Number.isInteger(config.initialDelayMs) || config.initialDelayMs < 1) {
      throw new RangeError(
        `initialDelayMs must be a positive integer (got ${String(config.initialDelayMs)})`,
      );
    }
    if (
      !Number.isInteger(config.maxDelayMs) ||
      config.maxDelayMs < config.initialDelayMs
    ) {
      throw new RangeError(
        `maxDelayMs (${String(config.maxDelayMs)}) must be an integer >= initialDelayMs (${String(config.initialDelayMs)})`,
      );
    }
    if (
      !Number.isFinite(config.jitterRatio) ||
      config.jitterRatio < 0 ||
      config.jitterRatio > 1
    ) {
      throw new RangeError(
        `jitterRatio must be between 0 and 1 inclusive (got ${String(config.jitterRatio)})`,
      );
    }
    this.initialDelayMs = config.initialDelayMs;
    this.maxDelayMs = config.maxDelayMs;
    this.jitterRatio = config.jitterRatio;
    this.random = random;
  }

  get attempts(): number {
    return this.failureCount;
  }

  nextDelayMs(): number {
    const raw = this.initialDelayMs * 2 ** this.failureCount;
    const capped = Math.min(this.maxDelayMs, raw);
    this.failureCount += 1;

    const sample = Math.min(1, Math.max(0, this.random()));
    const factor = 1 - this.jitterRatio * sample;
    return Math.max(1, Math.min(this.maxDelayMs, Math.round(capped * factor)));
  }

  reset(): void {
    this.failureCount = 0;
  }
}

/**
 * Executes an async Soroban RPC operation with capped exponential backoff + jitter.
 * Resets the backoff state upon success and aborts immediately on fatal errors.
 */
export async function withRpcBackoff<T>(
  operation: string,
  fn: () => Promise<T>,
  options: RpcRetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const backoff =
    options.backoff ??
    new ExponentialBackoff(
      {
        initialDelayMs: options.initialDelayMs,
        maxDelayMs: options.maxDelayMs,
        jitterRatio: options.jitterRatio,
      },
      random,
    );

  let retriesUsed = 0;

  for (;;) {
    try {
      const result = await fn();
      if (backoff.attempts > 0) {
        log.debug("RPC recovered; resetting backoff", {
          operation,
          priorAttempts: backoff.attempts,
        });
      }
      backoff.reset();
      return result;
    } catch (err) {
      if (isFatalRpcError(err)) {
        log.error("fatal RPC error; aborting retries", {
          operation,
          err: String(err),
        });
        throw err;
      }

      if (retriesUsed >= options.maxRetries) {
        log.warn("RPC transient retries exhausted", {
          operation,
          retriesUsed,
          err: String(err),
        });
        throw err;
      }

      retriesUsed += 1;
      const delayMs = backoff.nextDelayMs();
      log.warn("transient RPC failure; backing off before retry", {
        operation,
        attempt: retriesUsed,
        maxRetries: options.maxRetries,
        delayMs,
        err: String(err),
      });
      await sleep(delayMs);
    }
  }
}
