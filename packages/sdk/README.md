# `@recurring-subscriptions/sdk`

Typed TypeScript helpers for the Soroban **SubscriptionVault**: approve/create/bill/cancel ops, due-date helpers, and short-symbol event topic filters for RPC.

## Install

From the monorepo (recommended while unpublished):

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
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Build, then run `node --test` (errors + due helpers) |

## License

MIT OR Apache-2.0 — see the repository root.
