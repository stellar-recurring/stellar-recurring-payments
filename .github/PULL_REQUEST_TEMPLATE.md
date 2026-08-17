## What

<!-- Summarize the change in 1–3 sentences. -->

## Why

<!-- Motivation / linked issue. -->

Fixes #

## Test plan

- [ ] `cargo test -p subscription-vault` (if contract touched)
- [ ] `cd packages/sdk && npm ci && npm test` (if SDK/keeper touched)
- [ ] `cd packages/keeper && npm ci && npm run typecheck` (if keeper touched)
- [ ] Manual / other checks:

## Checklist

- [ ] Scoped to one concern (contract / sdk / keeper / docs)
- [ ] No secrets or `.env` files
- [ ] Conventional commit message(s)
- [ ] Docs / comments updated for new invariants (TTL, auth, CEI)
