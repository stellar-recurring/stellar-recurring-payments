#!/usr/bin/env bash
# Create wave labels + 35 GitHub issues for stellar-recurring/stellar-recurring-payments
set -euo pipefail
REPO="stellar-recurring/stellar-recurring-payments"
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found" >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  echo "Or export a valid GH_TOKEN with repo scope." >&2
  exit 1
fi

echo "Creating labels (ignore errors if they already exist)..."
gh label create "good first issue" --repo "$REPO" --color "7057ff" --description "Good for newcomers" 2>/dev/null || true
gh label create "contract" --repo "$REPO" --color "0E8A16" --description "Soroban contract work" 2>/dev/null || true
gh label create "sdk" --repo "$REPO" --color "1D76DB" --description "TypeScript SDK" 2>/dev/null || true
gh label create "keeper" --repo "$REPO" --color "D93F0B" --description "Keeper / indexer" 2>/dev/null || true
gh label create "docs" --repo "$REPO" --color "0075CA" --description "Documentation" 2>/dev/null || true
gh label create "wave" --repo "$REPO" --color "FBCA04" --description "Wave bounty / contribution wave" 2>/dev/null || true
gh label create "enhancement" --repo "$REPO" --color "A2EEEF" --description "New feature or improvement" 2>/dev/null || true
gh label create "bug" --repo "$REPO" --color "D73A4A" --description "Something is broken" 2>/dev/null || true

CREATED=0
echo "Creating issues..."

echo "[1/35] feat(contract): list_subscriptions_by_merchant index"
gh issue create --repo "$REPO" --title 'feat(contract): list_subscriptions_by_merchant index' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_1'
## Context

Merchants need an efficient way to discover all subscription IDs they own without scanning the entire ID space. Today `get_subscription` is keyed only by id.

## Task

Add persistent storage indexing subscription ids by merchant address, and expose a read-only `list_subscriptions_by_merchant(merchant, start, limit)` (or equivalent pagination) contract method.

## Acceptance Criteria

- [ ] Creating a subscription appends its id to the merchant's index
- [ ] Cancelling (or archiving) does not leave stale active-only views undefined — document whether cancelled ids remain listed
- [ ] Pagination is bounded (max limit enforced) and returns deterministic order (e.g. ascending id)
- [ ] Unit tests cover empty merchant, multiple creates, and pagination edges
- [ ] Storage keys documented in `types.rs` / `storage.rs` comments

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/storage.rs`
- `contracts/subscription_vault/src/types.rs`
- `contracts/subscription_vault/src/test.rs`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_1
)"
CREATED=$((CREATED + 1))

echo "[2/35] feat(contract): list_subscriptions_by_subscriber index"
gh issue create --repo "$REPO" --title 'feat(contract): list_subscriptions_by_subscriber index' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_2'
## Context

Subscribers (and wallets) need to list their active authorizations. Symmetric to the merchant index.

## Task

Add a subscriber-keyed index and `list_subscriptions_by_subscriber(subscriber, start, limit)` with the same pagination rules as the merchant list API.

## Acceptance Criteria

- [ ] Create updates the subscriber index
- [ ] Pagination bounds and ordering match merchant list behavior
- [ ] Tests for empty, multi-sub, and limit enforcement
- [ ] Docs/README note for both list APIs together

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/storage.rs`
- `contracts/subscription_vault/src/test.rs`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_2
)"
CREATED=$((CREATED + 1))

echo "[3/35] feat(contract): get_next_bill_at view helper"
gh issue create --repo "$REPO" --title 'feat(contract): get_next_bill_at view helper' --label enhancement --label contract --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_3'
## Context

Keepers and UIs currently infer the next bill time from `last_billed_at + interval` (or create time). A dedicated view reduces client bugs.

## Task

Add a read-only helper (e.g. `get_next_bill_at(id) -> u64`) that returns the ledger timestamp when the subscription becomes billable again, or a documented sentinel for cancelled/missing.

## Acceptance Criteria

- [ ] Returns correct next bill for never-billed and previously billed subs
- [ ] Clear error or sentinel for missing / cancelled (documented)
- [ ] Unit tests for interval edge cases
- [ ] Exported in contract interface / SDK bindings note if applicable

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/types.rs`
- `contracts/subscription_vault/src/test.rs`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `enhancement`, `contract`, `wave`, `good first issue`
EOF_ISSUE_3
)"
CREATED=$((CREATED + 1))

echo "[4/35] feat(contract): grace period before cancel-on-missed-payment"
gh issue create --repo "$REPO" --title 'feat(contract): grace period before cancel-on-missed-payment' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_4'
## Context

Hard cancel-on-miss can be harsh for temporary funding issues. Merchants often want a grace window after a missed interval.

## Task

Introduce an optional grace period (seconds or ledgers — pick one and document) after a failed/missed payment before automatic cancellation, if such cancel-on-miss logic exists or is being added.

## Acceptance Criteria

- [ ] Grace period is configurable at create (or merchant policy) with sane max bounds
- [ ] During grace, subscription remains active but billing still retries
- [ ] After grace expires without successful payment, cancel (or emit status) as specified
- [ ] Tests for within-grace retry success and post-grace cancel
- [ ] Events document grace-related transitions

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/types.rs`
- `contracts/subscription_vault/src/events.rs`
- `contracts/subscription_vault/src/test.rs`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_4
)"
CREATED=$((CREATED + 1))

echo "[5/35] feat(contract): cap max amount per interval (merchant policy)"
gh issue create --repo "$REPO" --title 'feat(contract): cap max amount per interval (merchant policy)' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_5'
## Context

Subscribers need protection against unexpectedly large per-interval charges. Merchants may also want a policy ceiling.

## Task

Add a max-amount-per-interval (or absolute max amount) check enforced at `create` and/or amount updates, optionally as merchant-wide policy storage.

## Acceptance Criteria

- [ ] Create rejects amount above configured max
- [ ] Document whether max is per-subscription param, merchant policy, or both
- [ ] Tests for boundary (equal max allowed, max+1 rejected)
- [ ] Error code added and mapped for SDK consumers

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/types.rs`
- `contracts/subscription_vault/src/test.rs`
- `packages/sdk/src/errors.ts`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_5
)"
CREATED=$((CREATED + 1))

echo "[6/35] feat(contract): pause/resume subscription without cancel"
gh issue create --repo "$REPO" --title 'feat(contract): pause/resume subscription without cancel' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_6'
## Context

Cancel is irreversible for billing continuity. Pause/resume lets parties stop charges temporarily while preserving subscription id and terms.

## Task

Add `pause` / `resume` (auth rules: subscriber and/or merchant — document) that set a status flag; `process_payment` must no-op or error while paused.

## Acceptance Criteria

- [ ] Paused subscriptions cannot be billed
- [ ] Resume restores billability with documented next_bill_at semantics (freeze vs shift)
- [ ] Unauthorized pause/resume rejected
- [ ] Events: Paused / Resumed
- [ ] Unit tests cover pause→bill fail→resume→bill ok

## Suggested files

- `contracts/subscription_vault/src/lib.rs`
- `contracts/subscription_vault/src/types.rs`
- `contracts/subscription_vault/src/events.rs`
- `contracts/subscription_vault/src/test.rs`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_6
)"
CREATED=$((CREATED + 1))

echo "[7/35] test: multi-token smoke test for SAC USDC fixture"
gh issue create --repo "$REPO" --title 'test: multi-token smoke test for SAC USDC fixture' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_7'
## Context

Most tests likely use a single token fixture. Wave contributors need confidence SAC USDC-style tokens work for approve + transfer_from billing.

## Task

Add an integration/smoke test that uses a SAC (or mock) USDC-like token: approve allowance, create subscription, process payment, assert balances.

## Acceptance Criteria

- [ ] Test compiles and runs in `cargo test` for subscription_vault
- [ ] Covers approve → create → process_payment happy path with USDC-like decimals
- [ ] Failure path when allowance insufficient is asserted
- [ ] README or test module comment explains how to point at testnet USDC later

## Suggested files

- `contracts/subscription_vault/src/test.rs`
- `contracts/subscription_vault/Cargo.toml`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_7
)"
CREATED=$((CREATED + 1))

echo "[8/35] feat(sdk): event topic XDR base64 helpers (scvSymbol encoding)"
gh issue create --repo "$REPO" --title 'feat(sdk): event topic XDR base64 helpers (scvSymbol encoding)' --label enhancement --label sdk --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_8'
## Context

RPC `getEvents` filters need topic values as XDR base64 (e.g. `scvSymbol`). Hand-rolling this is error-prone for keepers and apps.

## Task

Add helpers in the SDK to encode symbol/string/address/u64 topics to the base64 XDR form expected by Soroban RPC event filters.

## Acceptance Criteria

- [ ] Helper(s) for at least `scvSymbol` and documented usage for contract address topics
- [ ] Unit tests with known XDR base64 fixtures
- [ ] Exported from package entrypoint
- [ ] Short README snippet under Events

## Suggested files

- `packages/sdk/src/events.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/README.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `enhancement`, `sdk`, `wave`, `good first issue`
EOF_ISSUE_8
)"
CREATED=$((CREATED + 1))

echo "[9/35] feat(keeper): seed event cursor from getLatestLedger"
gh issue create --repo "$REPO" --title 'feat(keeper): seed event cursor from getLatestLedger' --label enhancement --label keeper --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_9'
## Context

On first boot with empty state, the keeper should not start at ledger 0 (retention / performance issues). Seeding from `getLatestLedger` is the usual pattern.

## Task

When persisted cursor/state is missing, initialize `startLedger` (or equivalent) from RPC `getLatestLedger` (minus a small optional lookback if desired).

## Acceptance Criteria

- [ ] Empty state → cursor seeded from latest ledger
- [ ] Existing state is not overwritten on restart
- [ ] Logged clearly at info level
- [ ] Unit or lightweight test with mocked RPC

## Suggested files

- `packages/keeper/src/indexer.ts`
- `packages/keeper/src/state.ts`
- `packages/keeper/src/index.ts`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `enhancement`, `keeper`, `wave`, `good first issue`
EOF_ISSUE_9
)"
CREATED=$((CREATED + 1))

echo "[10/35] feat(keeper): retention-window safe startLedger for getEvents"
gh issue create --repo "$REPO" --title 'feat(keeper): retention-window safe startLedger for getEvents' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_10'
## Context

Soroban RPC retains events only for a limited ledger window. Asking for a too-old `startLedger` yields errors and stalls the indexer.

## Task

Clamp or advance `startLedger` to remain inside the RPC retention window; handle the specific error by resetting cursor safely.

## Acceptance Criteria

- [ ] Detect retention/out-of-range errors from getEvents
- [ ] Advance cursor to a safe ledger without skipping indefinitely in a tight loop
- [ ] Document behavior in keeper README
- [ ] Test or simulated path for the error recovery branch

## Suggested files

- `packages/keeper/src/indexer.ts`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_10
)"
CREATED=$((CREATED + 1))

echo "[11/35] feat(keeper): stale/regressing latestLedger guard"
gh issue create --repo "$REPO" --title 'feat(keeper): stale/regressing latestLedger guard' --label bug --label keeper --label wave --body "$(cat <<'EOF_ISSUE_11'
## Context

If RPC returns a `latestLedger` that goes backwards or stalls forever, the keeper can mis-handle cursors or busy-loop.

## Task

Track last observed `latestLedger`; ignore regressing values and optionally warn on prolonged staleness.

## Acceptance Criteria

- [ ] Regressing latestLedger does not move cursor backwards
- [ ] Stale threshold emits warning log (configurable)
- [ ] Metrics/log fields include last good ledger
- [ ] Test covers regressing ledger sequence

## Suggested files

- `packages/keeper/src/indexer.ts`
- `packages/keeper/src/logger.ts`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `bug`, `keeper`, `wave`
EOF_ISSUE_11
)"
CREATED=$((CREATED + 1))

echo "[12/35] feat(keeper): typed RpcError / ConfigError on submit path"
gh issue create --repo "$REPO" --title 'feat(keeper): typed RpcError / ConfigError on submit path' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_12'
## Context

Generic thrown errors make retries and operator alerts noisy. Submit/simulate failures should use typed errors already sketched in the codebase.

## Task

Ensure the executor submit path maps RPC/config failures to `RpcError` / `ConfigError` (or SDK equivalents) with actionable messages; avoid bare `Error` for expected failure modes.

## Acceptance Criteria

- [ ] Simulate and send failures use typed errors
- [ ] Config missing keys throw ConfigError at startup
- [ ] Caller can `instanceof` / code-switch for retry vs fatal
- [ ] Brief comment or README on error taxonomy

## Suggested files

- `packages/keeper/src/executor.ts`
- `packages/keeper/src/config.ts`
- `packages/sdk/src/errors.ts`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_12
)"
CREATED=$((CREATED + 1))

echo "[13/35] feat(keeper): Prometheus /metrics endpoint"
gh issue create --repo "$REPO" --title 'feat(keeper): Prometheus /metrics endpoint' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_13'
## Context

Operators need scrapeable metrics: bills attempted/succeeded, RPC errors, cursor ledger, loop latency.

## Task

Expose a Prometheus text exposition HTTP `/metrics` endpoint (feature-flag or always-on behind config) with core keeper counters/gauges.

## Acceptance Criteria

- [ ] GET /metrics returns Prometheus format
- [ ] At least: payments_success, payments_failed, rpc_errors, latest_cursor_ledger
- [ ] Port/bind configurable
- [ ] README documents scrape config

## Suggested files

- `packages/keeper/src/index.ts`
- `packages/keeper/package.json`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_13
)"
CREATED=$((CREATED + 1))

echo "[14/35] feat(keeper): dry-run HTML status page"
gh issue create --repo "$REPO" --title 'feat(keeper): dry-run HTML status page' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_14'
## Context

During dry-run / wave demos, a simple HTML status page helps reviewers see cursor, last events, and would-be bills without Prometheus.

## Task

Add a minimal HTML status page (e.g. `/` or `/status`) showing config summary (redact secrets), cursor, last loop time, recent actions; honor dry-run mode.

## Acceptance Criteria

- [ ] Page renders without external assets (inline CSS ok)
- [ ] Secrets never appear in HTML
- [ ] Dry-run clearly labeled
- [ ] Does not block the billing loop (separate server or non-blocking)
- [ ] README documents enabling the page

## Suggested files

- `packages/keeper/src/index.ts`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_14
)"
CREATED=$((CREATED + 1))

echo "[15/35] feat(sdk): parseSubscription from simulateTransaction result"
gh issue create --repo "$REPO" --title 'feat(sdk): parseSubscription from simulateTransaction result' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_15'
## Context

Clients call `get_subscription` via simulate; parsing the XDR/ScVal result into a typed object should be a first-class SDK helper.

## Task

Implement `parseSubscription` (or extend client) to decode simulateTransaction / get_subscription retval into a typed Subscription struct.

## Acceptance Criteria

- [ ] Parses all public fields (ids, parties, token, amount, interval, timestamps, status)
- [ ] Throws typed error on malformed retval
- [ ] Unit test with fixture XDR or mocked simulate result
- [ ] Exported and documented in README

## Suggested files

- `packages/sdk/src/client.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/README.md`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_15
)"
CREATED=$((CREATED + 1))

echo "[16/35] feat(sdk): watchPayments async iterator"
gh issue create --repo "$REPO" --title 'feat(sdk): watchPayments async iterator' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_16'
## Context

Apps want to subscribe to Payment / billing events without reimplementing getEvents polling.

## Task

Add `watchPayments` (async iterator or async generator) that polls/filters contract payment events and yields typed payloads.

## Acceptance Criteria

- [ ] Async iterable API with abort/stop support
- [ ] Uses topic helpers / correct filters
- [ ] Backpressure-friendly (no unbounded queue without docs)
- [ ] Example in README
- [ ] Basic test with mocked RPC pages

## Suggested files

- `packages/sdk/src/events.ts`
- `packages/sdk/src/client.ts`
- `packages/sdk/README.md`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_16
)"
CREATED=$((CREATED + 1))

echo "[17/35] feat(sdk): buildCancelOp + docs example"
gh issue create --repo "$REPO" --title 'feat(sdk): buildCancelOp + docs example' --label enhancement --label sdk --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_17'
## Context

SDK likely has create/process helpers; cancel should be equally ergonomic with a copy-paste docs example.

## Task

Add `buildCancelOp` (or client method) that builds the cancel operation/transaction fragment, plus a short README example.

## Acceptance Criteria

- [ ] Helper builds valid cancel call for subscription id
- [ ] Auth requirements documented (subscriber)
- [ ] README example compiles conceptually (imports match exports)
- [ ] Unit smoke test if pattern exists for other builders

## Suggested files

- `packages/sdk/src/client.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/README.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `enhancement`, `sdk`, `docs`, `wave`, `good first issue`
EOF_ISSUE_17
)"
CREATED=$((CREATED + 1))

echo "[18/35] test(sdk): unit tests for isSubscriptionDue edge cases"
gh issue create --repo "$REPO" --title 'test(sdk): unit tests for isSubscriptionDue edge cases' --label enhancement --label sdk --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_18'
## Context

`isSubscriptionDue` is easy to get wrong around interval boundaries, pause, and equal timestamps.

## Task

Add unit tests covering due/not-due edges: exactly at next bill, one second before, cancelled, zero interval guard if applicable.

## Acceptance Criteria

- [ ] Tests for boundary equality
- [ ] Cancelled / inactive never due
- [ ] Missing last_billed uses created_at semantics as documented
- [ ] CI-ready test script in package.json if not present

## Suggested files

- `packages/sdk/src/client.ts`
- `packages/sdk/package.json`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `enhancement`, `sdk`, `wave`, `good first issue`
EOF_ISSUE_18
)"
CREATED=$((CREATED + 1))

echo "[19/35] test: integration create → process → cancel on local/testnet mock"
gh issue create --repo "$REPO" --title 'test: integration create → process → cancel on local/testnet mock' --label enhancement --label wave --label contract --label sdk --body "$(cat <<'EOF_ISSUE_19'
## Context

End-to-end path across contract + RPC mock (or local) gives confidence beyond isolated unit tests.

## Task

Add an integration test (Rust and/or TS) that create → process_payment → cancel and asserts events/state transitions.

## Acceptance Criteria

- [ ] Runs in CI or documented manual job
- [ ] Asserts cannot bill after cancel
- [ ] Cleanup / no leaked temp state
- [ ] Documented how to point at Futurenet/testnet optionally

## Suggested files

- `contracts/subscription_vault/src/test.rs`
- `packages/sdk/`
- `.github/workflows/ci.yml`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `wave`, `contract`, `sdk`
EOF_ISSUE_19
)"
CREATED=$((CREATED + 1))

echo "[20/35] feat(frontend): minimal Next.js approve+create demo page"
gh issue create --repo "$REPO" --title 'feat(frontend): minimal Next.js approve+create demo page' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_20'
## Context

Wave reviewers and merchants need a clickable demo: wallet connect (or freighter), SAC approve, create subscription.

## Task

Scaffold a minimal Next.js page under e.g. `examples/web-demo` that performs approve + create using the SDK against configurable contract ids.

## Acceptance Criteria

- [ ] Page loads on desktop and mobile viewport
- [ ] Env-based RPC + contract + token config
- [ ] Shows tx hash / subscription id on success
- [ ] README with run instructions
- [ ] No secrets committed

## Suggested files

- `examples/web-demo/`
- `packages/sdk/`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_20
)"
CREATED=$((CREATED + 1))

echo "[21/35] feat(frontend): merchant dashboard table of active subs"
gh issue create --repo "$REPO" --title 'feat(frontend): merchant dashboard table of active subs' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_21'
## Context

Merchants need a simple table of active subscriptions (id, subscriber, amount, next bill).

## Task

Build a merchant dashboard view (extend demo or separate page) listing active subs via list API or indexed events.

## Acceptance Criteria

- [ ] Table shows key fields and status
- [ ] Handles empty state
- [ ] Depends on list_subscriptions_by_merchant or event index — document prerequisite
- [ ] Refresh control or polling noted

## Suggested files

- `examples/web-demo/`
- `packages/sdk/src/client.ts`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_21
)"
CREATED=$((CREATED + 1))

echo "[22/35] docs: sequence diagram for billing race (two keepers)"
gh issue create --repo "$REPO" --title 'docs: sequence diagram for billing race (two keepers)' --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_22'
## Context

Two keepers racing `process_payment` is a common confusion; docs should show who wins and what the loser sees.

## Task

Add a Mermaid (or ASCII) sequence diagram to ARCHITECTURE or README showing dual-keeper race, on-chain mutual exclusion, and loser error path.

## Acceptance Criteria

- [ ] Diagram in docs/ARCHITECTURE.md (or linked doc)
- [ ] Captions explain idempotent interval / double-bill protection
- [ ] Cross-link from keeper README

## Suggested files

- `docs/ARCHITECTURE.md`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `wave`, `good first issue`
EOF_ISSUE_22
)"
CREATED=$((CREATED + 1))

echo "[23/35] docs: comparison table vs Vowena / streaming protocols"
gh issue create --repo "$REPO" --title 'docs: comparison table vs Vowena / streaming protocols' --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_23'
## Context

Builders comparing recurring pull-payments vs streaming need a crisp comparison.

## Task

Add a markdown comparison table vs Vowena and similar streaming protocols: trust model, pull vs push, allowance, keeper role, token types.

## Acceptance Criteria

- [ ] Table in docs/ or README
- [ ] Neutral, factual tone with citations/links where possible
- [ ] States this protocol's niche clearly

## Suggested files

- `docs/ARCHITECTURE.md`
- `README.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `wave`, `good first issue`
EOF_ISSUE_23
)"
CREATED=$((CREATED + 1))

echo "[24/35] docs(SECURITY): document allowance over-approval risks"
gh issue create --repo "$REPO" --title 'docs(SECURITY): document allowance over-approval risks' --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_24'
## Context

SAC `approve` with large allowances is a footgun; SECURITY.md should spell out over-approval risks and recommended patterns (exact amount × periods, renewals).

## Task

Expand SECURITY.md (and optionally README) with allowance over-approval risks, attacker scenarios, and mitigations.

## Acceptance Criteria

- [ ] SECURITY.md section on allowances
- [ ] Recommend least-privilege approve amounts
- [ ] Mention revoke / cancel interplay
- [ ] Link from README security blurb if present

## Suggested files

- `SECURITY.md`
- `README.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `wave`, `good first issue`
EOF_ISSUE_24
)"
CREATED=$((CREATED + 1))

echo "[25/35] ci: cache cargo registry; fail on clippy -D warnings"
gh issue create --repo "$REPO" --title 'ci: cache cargo registry; fail on clippy -D warnings' --label enhancement --label wave --body "$(cat <<'EOF_ISSUE_25'
## Context

CI should be fast and strict: cache cargo registry/git and treat clippy warnings as errors.

## Task

Update `.github/workflows/ci.yml` to cache cargo registry/target appropriately and run clippy with `-D warnings`.

## Acceptance Criteria

- [ ] Cache keys restore on Cargo.lock changes
- [ ] clippy -D warnings in CI
- [ ] Documented in CONTRIBUTING if needed
- [ ] Workflow stays green on main

## Suggested files

- `.github/workflows/ci.yml`
- `CONTRIBUTING.md`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `wave`
EOF_ISSUE_25
)"
CREATED=$((CREATED + 1))

echo "[26/35] ci: SDK vitest or node:test in workflow"
gh issue create --repo "$REPO" --title 'ci: SDK vitest or node:test in workflow' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_26'
## Context

SDK unit tests should run in GitHub Actions, not only locally.

## Task

Wire `vitest` or node built-in test runner into CI for `packages/sdk`.

## Acceptance Criteria

- [ ] npm test (or equivalent) in CI job
- [ ] Fails the workflow on test failure
- [ ] package.json scripts documented
- [ ] At least one sample test runs

## Suggested files

- `.github/workflows/ci.yml`
- `packages/sdk/package.json`

## Wave metadata

- Complexity: **medium**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_26
)"
CREATED=$((CREATED + 1))

echo "[27/35] chore: publish workflow for npm @recurring-subscriptions/sdk"
gh issue create --repo "$REPO" --title 'chore: publish workflow for npm @recurring-subscriptions/sdk' --label enhancement --label sdk --label wave --body "$(cat <<'EOF_ISSUE_27'
## Context

Manual publish reduces accidents; need `workflow_dispatch` to publish the SDK package to npm.

## Task

Add GitHub Actions workflow for manual dispatch publishing `@recurring-subscriptions/sdk` (name as in package.json) with npm token secret.

## Acceptance Criteria

- [ ] workflow_dispatch only (no publish on every push)
- [ ] Builds/tests before publish
- [ ] Uses NPM_TOKEN or OIDC as documented
- [ ] README publish section

## Suggested files

- `.github/workflows/`
- `packages/sdk/package.json`
- `packages/sdk/README.md`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `sdk`, `wave`
EOF_ISSUE_27
)"
CREATED=$((CREATED + 1))

echo "[28/35] chore: LICENSE badges and crates.io metadata in contract Cargo.toml"
gh issue create --repo "$REPO" --title 'chore: LICENSE badges and crates.io metadata in contract Cargo.toml' --label docs --label contract --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_28'
## Context

Contract crate should advertise license and repo metadata for crates.io / README badges.

## Task

Add license badges to README and fill `[package]` metadata (license, repository, homepage, description, keywords) in contract Cargo.toml.

## Acceptance Criteria

- [ ] README badges render for license/CI if applicable
- [ ] Cargo.toml metadata valid
- [ ] Matches root LICENSE (MIT/Apache-2.0 dual if that is the project choice)

## Suggested files

- `README.md`
- `contracts/subscription_vault/Cargo.toml`
- `Cargo.toml`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `contract`, `wave`, `good first issue`
EOF_ISSUE_28
)"
CREATED=$((CREATED + 1))

echo "[29/35] test(contract): fuzz/property test interval bounds"
gh issue create --repo "$REPO" --title 'test(contract): fuzz/property test interval bounds' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_29'
## Context

Interval validation bugs hide at edges; property/fuzz tests strengthen confidence.

## Task

Add proptest, quickcheck, or bolero (or Soroban-appropriate) property tests for interval and amount bounds.

## Acceptance Criteria

- [ ] Property: invalid intervals always rejected
- [ ] Property: valid intervals accept and bill only after elapse
- [ ] Runs in CI or `cargo test` with feature flag documented
- [ ] No flaky RNG without seeds

## Suggested files

- `contracts/subscription_vault/src/test.rs`
- `contracts/subscription_vault/Cargo.toml`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_29
)"
CREATED=$((CREATED + 1))

echo "[30/35] docs(sdk): error code mapping table in README"
gh issue create --repo "$REPO" --title 'docs(sdk): error code mapping table in README' --label docs --label sdk --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_30'
## Context

Contract error enums need a human table mapping codes → meaning → client action.

## Task

Add an error code mapping table to the SDK README (and keep in sync with contract errors).

## Acceptance Criteria

- [ ] Table lists all current contract error codes
- [ ] Notes suggested client handling
- [ ] Link to errors.ts helpers

## Suggested files

- `packages/sdk/README.md`
- `packages/sdk/src/errors.ts`
- `contracts/subscription_vault/src/types.rs`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `sdk`, `wave`, `good first issue`
EOF_ISSUE_30
)"
CREATED=$((CREATED + 1))

echo "[31/35] feat(keeper): exponential backoff on RPC failure"
gh issue create --repo "$REPO" --title 'feat(keeper): exponential backoff on RPC failure' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_31'
## Context

Tight retry loops on RPC outages burn rate limits and logs. Backoff with jitter is required for production keepers.

## Task

Implement exponential backoff (with cap + jitter) on transient RPC failures in indexer/executor loops.

## Acceptance Criteria

- [ ] Backoff doubles up to a configured max
- [ ] Successful RPC resets backoff
- [ ] Fatal/config errors do not spin forever without logging
- [ ] README documents env knobs
- [ ] Test or simulated timing with fake clock if feasible

## Suggested files

- `packages/keeper/src/indexer.ts`
- `packages/keeper/src/executor.ts`
- `packages/keeper/src/config.ts`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_31
)"
CREATED=$((CREATED + 1))

echo "[32/35] feat(keeper): multi-RPC failover list"
gh issue create --repo "$REPO" --title 'feat(keeper): multi-RPC failover list' --label enhancement --label keeper --label wave --body "$(cat <<'EOF_ISSUE_32'
## Context

Single RPC endpoint is a SPOF. Operators want an ordered list of RPC URLs with failover.

## Task

Support `RPC_URLS` (comma-separated) or equivalent; on persistent failure, fail over to the next endpoint and continue the cursor.

## Acceptance Criteria

- [ ] Config accepts multiple URLs
- [ ] Failover on timeout/5xx/connection errors
- [ ] Logs which endpoint is active
- [ ] Cursor/state remains consistent across failover
- [ ] README examples

## Suggested files

- `packages/keeper/src/config.ts`
- `packages/keeper/src/indexer.ts`
- `packages/keeper/README.md`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `keeper`, `wave`
EOF_ISSUE_32
)"
CREATED=$((CREATED + 1))

echo "[33/35] feat(contract): emit PaymentFailed event variant"
gh issue create --repo "$REPO" --title 'feat(contract): emit PaymentFailed event variant' --label enhancement --label contract --label wave --body "$(cat <<'EOF_ISSUE_33'
## Context

Successful payments emit events; failures (allowance, balance, paused) should be observable for keepers and analytics without only relying on tx failure.

## Task

Add a `PaymentFailed` (or similar) event with id, reason code, and relevant parties when process_payment fails in a catchable/recorded way — or document if only tx-revert is used and emit from a try pattern if the contract design allows.

## Acceptance Criteria

- [ ] Event topics/data documented in events.rs
- [ ] Reason distinguishes common failure modes where applicable
- [ ] Tests assert emission or document why revert-only is chosen
- [ ] SDK event parser updated if events module exists

## Suggested files

- `contracts/subscription_vault/src/events.rs`
- `contracts/subscription_vault/src/lib.rs`
- `packages/sdk/src/events.ts`

## Wave metadata

- Complexity: **high**
- Suggested labels: `enhancement`, `contract`, `wave`
EOF_ISSUE_33
)"
CREATED=$((CREATED + 1))

echo "[34/35] docs: example script end-to-end testnet billing walkthrough"
gh issue create --repo "$REPO" --title 'docs: example script end-to-end testnet billing walkthrough' --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_34'
## Context

New contributors need a scripted walkthrough: deploy/use existing ids, approve, create, wait/process, cancel on testnet.

## Task

Add `examples/` or `scripts/` walkthrough (shell or TS) with comments for testnet billing e2e.

## Acceptance Criteria

- [ ] Script documents required env vars
- [ ] Steps: approve, create, process, cancel
- [ ] Fails with clear messages if env missing
- [ ] Linked from README

## Suggested files

- `examples/`
- `scripts/`
- `README.md`
- `packages/sdk/`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `wave`, `good first issue`
EOF_ISSUE_34
)"
CREATED=$((CREATED + 1))

echo "[35/35] docs(CONTRIBUTING): Wave issue complexity guide (trivial/medium/high points)"
gh issue create --repo "$REPO" --title 'docs(CONTRIBUTING): Wave issue complexity guide (trivial/medium/high points)' --label docs --label wave --label 'good first issue' --body "$(cat <<'EOF_ISSUE_35'
## Context

Wave scoring needs a shared definition of trivial / medium / high complexity and suggested points.

## Task

Extend CONTRIBUTING.md with a Wave issue complexity guide: criteria for trivial/medium/high and example point ranges; reference label `wave` and `good first issue`.

## Acceptance Criteria

- [ ] Section in CONTRIBUTING.md
- [ ] Defines trivial, medium, high with examples from this repo
- [ ] Explains how to label PRs/issues
- [ ] Links to WAVE_ISSUES.md

## Suggested files

- `CONTRIBUTING.md`
- `docs/WAVE_ISSUES.md`

## Wave metadata

- Complexity: **trivial**
- Suggested labels: `docs`, `wave`, `good first issue`
EOF_ISSUE_35
)"
CREATED=$((CREATED + 1))

echo "Created $CREATED issues on $REPO"
gh issue list --repo "$REPO" --limit 40
