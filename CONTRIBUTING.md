# Contributing

Thanks for helping improve **stellar-recurring-payments** — a non-custodial Soroban subscription vault with a typed TypeScript SDK and permissionless keeper.

Built for [Drips Wave](https://www.drips.network/wave/). Please read this guide before opening a PR.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Report concerns via a GitHub issue tagged `conduct`, or privately (security advisory / maintainers via org).

## Quick start (fork flow)

1. Fork the repository on GitHub.
2. Clone your fork and add upstream:

   ```bash
   git clone https://github.com/<you>/stellar-recurring-payments.git
   cd stellar-recurring-payments
   git remote add upstream https://github.com/stellar-recurring/stellar-recurring-payments.git
   ```

3. Create a focused branch:

   ```bash
   git checkout -b feat/short-description
   # or fix/..., docs/..., chore/...
   ```

4. Make changes, then verify locally (see below).
5. Push and open a PR against `main`.

## Conventional commits

Prefer [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use when |
|--------|----------|
| `feat:` | New user-facing capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Tests only |
| `chore:` | Tooling, CI, licenses, deps |
| `refactor:` | Internal change without behavior change |

Keep the subject short; put details in the body. One logical change per commit when practical.

## Local verification

### Contract

```bash
rustup target add wasm32v1-none
cargo test -p subscription-vault
```

Optional WASM build:

```bash
cargo build --release --target wasm32v1-none -p subscription-vault
# or: stellar contract build
```

### SDK

```bash
cd packages/sdk
npm ci
npm run build
npm run typecheck
npm test
```

### Keeper (depends on a built SDK)

```bash
cd packages/sdk && npm ci && npm run build
cd ../keeper && npm ci && npm run typecheck
```

CI runs the same checks on every PR.

## Pull request checklist

Before requesting review:

- [ ] Change is scoped to one concern (contract **or** SDK **or** keeper **or** docs)
- [ ] Conventional commit message(s)
- [ ] `cargo test -p subscription-vault` passes when contract code changed
- [ ] `packages/sdk` builds when SDK/keeper changed
- [ ] No secrets, `.env`, keypairs, or funded accounts committed
- [ ] New errors / TTL / auth invariants documented near the code
- [ ] Prefer explicit `Error` variants over panics in Rust
- [ ] PR description includes **what**, **why**, and a short **test plan**

## Wave-specific guidance

- **Scoped PRs** — Prefer small, reviewable diffs that close one issue or acceptance criterion. Large mixed PRs slow Wave review.
- **No secrets** — Never commit `.env`, private keys, or RPC credentials. Use `.env.example` patterns only.
- **Link the issue** — Reference the Wave/GitHub issue in the PR body.
- **Tests first for bugs** — Add a failing-case test when fixing contract behavior.
- **First-class packages** — Treat `packages/sdk` and `packages/keeper` as products, not afterthoughts; keep APIs typed and documented.

## Issue labels

Maintainers use these labels to route work:

| Label | Meaning |
|-------|---------|
| `good-first-issue` | Smaller onboarding tasks |
| `contract` | Soroban vault (`contracts/subscription_vault`) |
| `sdk` | TypeScript client (`packages/sdk`) |
| `keeper` | Billing bot (`packages/keeper`) |
| `docs` | README, architecture, templates |

Filter by label on the Issues tab to find a good fit. If an issue is unclear, ask in a comment before coding.

## Architecture & safety

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for components, data flow, CEI billing, TTL extension, auth, and event topic design.

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are dual-licensed under MIT OR Apache-2.0 (see [LICENSE](LICENSE)). By submitting a PR you agree to license your contribution under the same terms.
