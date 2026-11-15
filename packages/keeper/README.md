# Subscription Keeper Bot

Permissionless relayer for `SubscriptionVault`. Indexes `sub/created` & `sub/cancelled` events, checks due bills via simulated `get_subscription`, and submits `process_payment`.

## Quick start

```bash
# from monorepo
cd ../sdk && npm install && npm run build
cd ../keeper && npm install
cp .env.example .env   # set CONTRACT_ID + KEEPER_SECRET_KEY (fund with XLM)

npm run build
DRY_RUN=true npm start -- --once   # one pass, no submits
DRY_RUN=false npm start            # continuous billing loop
npm test                           # build + run keeper unit tests
npm start -- --help                # usage
npm start -- --version             # package version
```

## Dev (tsx, no build)

```bash
npm run dev -- --once
```

## Behavior

1. Sync vault events from `cursorLedger` → update active ID set
2. Merge `SUBSCRIPTION_IDS` bootstrap + optional `1..MAX_ID_SCAN` discovery
3. For each active ID: if due → `prepareTransaction` → sign → `sendTransaction` → poll
4. Persist `.keeper-state.json`

`DRY_RUN=true` (default) logs due bills without submitting.

`LOG_LEVEL` accepts `debug`, `info`, `warn`, or `error`. Anything else is treated as `info`.

## RPC Retry & Exponential Backoff

Transient Soroban RPC errors (timeouts, network disconnects, HTTP `429` rate limits, and `5xx` upstream errors) in both the event indexer and payment executor automatically retry using capped exponential backoff with bounded jitter:

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_BACKOFF_INITIAL_MS` | `1000` | Initial retry delay in milliseconds (`>= 1`). Doubles on each consecutive transient failure (`1000`, `2000`, `4000`, ...). |
| `RPC_BACKOFF_MAX_MS` | `60000` | Maximum retry delay cap in milliseconds (`>= RPC_BACKOFF_INITIAL_MS`). |
| `RPC_BACKOFF_JITTER_RATIO` | `0.2` | Fractional jitter in `[0, 1]` applied below each capped step (`delay = round(capped * (1 - ratio * random()))`) to prevent thundering-herd retries. |
| `RPC_MAX_RETRIES` | `4` | Maximum transient retries per individual RPC request before deferring to the outer poll-loop backoff. |

### Recovery & Fatal Error Semantics

- **Reset on success**: Any successful RPC call resets the active backoff counter back to `0` so subsequent transient blips start from `RPC_BACKOFF_INITIAL_MS`.
- **Non-retryable fatal errors**: Configuration, credential, and permanent client errors (such as missing/invalid `KEEPER_SECRET_KEY` or `CONTRACT_ID`, unfunded keeper account `Account not found`, or HTTP `401`/`403` auth errors) are logged at `error` level and abort immediately instead of spinning in retry loops.
