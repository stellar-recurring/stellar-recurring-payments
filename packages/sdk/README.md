# `@recurring-subscriptions/sdk`

Typed TypeScript helpers for the Soroban **SubscriptionVault**: approve/create/bill/cancel ops, due-date helpers, and short-symbol event topic filters for RPC.

## Install

From npm (once published):

```bash
npm install @recurring-subscriptions/sdk
```

From the monorepo:

```bash
cd packages/sdk
npm ci
npm run build
```

As a workspace dependency (keeper):

```json
"@recurring-subscriptions/sdk": "file:../sdk"
```

Requires **Node >= 20**.

## Usage

```ts
import {
  SubscriptionClient,
  NETWORKS,
  EVENT_TOPICS,
  vaultEventTopicFilter,
} from "@recurring-subscriptions/sdk";

const client = new SubscriptionClient({
  contractId: "C...",
  networkPassphrase: NETWORKS.TESTNET,
  source: "G...",
});

const create = client.buildCreateSubscriptionOp({
  subscriber: "G...",
  merchant: "G...",
  token: "C...USDC",
  amount: 100_000n,
  intervalSecs: 2_592_000n,
});

// Filter RPC getEvents for vault topics (e.g. sub / created)
const filter = vaultEventTopicFilter(EVENT_TOPICS.CREATED);
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript sources to `dist/` |
| `npm run clean` | Remove compiled `dist/` output |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Build, then run `node --test` unit tests |
| `npm run prepublishOnly` | Enforce `typecheck` + `test` before `npm publish` |

## Publishing (`@recurring-subscriptions/sdk`)

Releases are published manually via [`.github/workflows/publish-sdk.yml`](../../.github/workflows/publish-sdk.yml) (`Actions` → **Publish SDK** → **Run workflow**). The workflow triggers **exclusively on `workflow_dispatch`** so pushes and pull requests never publish accidentally.

### Prerequisites

1. Create a granular npm automation token scoped to `@recurring-subscriptions/sdk` (with **Bypass 2FA** enabled for CI) and store it as the repository secret **`NPM_TOKEN`**.
2. Keep `id-token: write` enabled on the workflow job so `npm publish --provenance` emits signed SLSA / OIDC provenance attestations linking the tarball to the GitHub commit and workflow run.
3. Bump `"version"` in `packages/sdk/package.json` and merge to `main` before dispatching a live release.

### Workflow inputs

| Input | Default | Description |
|-------|---------|-------------|
| `dry_run` | `false` | When `true`, runs `npm publish --dry-run` after build/test without uploading to npm or requiring `NPM_TOKEN` |
| `dist_tag` | `latest` | Target npm distribution tag (`latest`, `next`, or `beta`) |
| `expected_version` | `""` | Optional safety guard; aborts if `packages/sdk/package.json` `"version"` does not match |

Every dispatch runs `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, and `npm pack --dry-run` prior to invoking `npm publish`.

## License

MIT OR Apache-2.0 — see the repository root.
