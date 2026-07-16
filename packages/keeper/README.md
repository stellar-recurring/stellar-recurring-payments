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
