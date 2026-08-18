# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Keeper `--help` / `--version` flags that do not require env.
- SDK unit tests for `isSubscriptionDue` / `secondsUntilDue`.
- `SubscriptionClient` rejects blank `contractId`, `networkPassphrase`, and `source`.
- Dependabot for npm, Cargo, and GitHub Actions.
- Bug and feature GitHub issue templates.
- SDK interval constants `MIN_INTERVAL_SECS` / `MAX_INTERVAL_SECS`.

### Fixed

- SDK README used `EVENT_TOPICS.created` instead of `EVENT_TOPICS.CREATED`.
- Keeper `LOG_LEVEL` values outside `debug|info|warn|error` no longer disable logging.
- Client config is trimmed; non-integer or negative fees are rejected.
- Due helpers reject NaN / fractional timestamps.
- Create / approve / bill builders match on-chain amount, interval, and ID rules.
- `vaultEventTopicFilter` rejects unknown event kinds at runtime.
- Unknown `DRY_RUN` values no longer disable dry-run; poll interval cannot be zero.
- Keeper state files with a NaN cursor start fresh; ID sort no longer overflows.
- Unknown keeper CLI flags fail instead of starting the loop.
- Simulated subscription records missing required fields are skipped, not billed.

### Changed

- CI runs `packages/sdk` unit tests, not only the TypeScript build.

[Unreleased]: https://github.com/stellar-recurring/stellar-recurring-payments/compare/main...HEAD
