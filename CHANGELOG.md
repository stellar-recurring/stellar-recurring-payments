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

### Fixed

- SDK README used `EVENT_TOPICS.created` instead of `EVENT_TOPICS.CREATED`.
- Keeper `LOG_LEVEL` values outside `debug|info|warn|error` no longer disable logging.

### Changed

- CI runs `packages/sdk` unit tests, not only the TypeScript build.

[Unreleased]: https://github.com/stellar-recurring/stellar-recurring-payments/compare/main...HEAD
