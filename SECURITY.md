# Security Policy

## Supported versions

This project is under active development. Security fixes are applied to the latest `main` branch.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by:

1. Opening a **private GitHub security advisory** on this repository (preferred), or
2. Contacting maintainers via the organization (private channel / maintainers via org)

Include:

- A clear description of the issue and impact
- Steps to reproduce (PoC if possible)
- Affected components (contract, SDK, keeper, docs tooling)
- Suggested remediation if you have one

We will acknowledge receipt as soon as practical, assess severity, and coordinate a fix and disclosure timeline. Please give us a reasonable window before any public disclosure.

## Scope (examples)

In scope:

- Unauthorized billing / double-billing / reentrancy in `SubscriptionVault`
- Auth bypass on create/cancel
- Incorrect allowance or transfer assumptions that can steal funds
- Keeper or SDK bugs that cause unsafe transaction construction when used as documented

Out of scope (unless they lead to fund loss):

- Issues requiring already-compromised keys
- Testnet-only misconfiguration without a protocol flaw
- Third-party RPC or wallet software bugs

## Safe harbor

We welcome good-faith research. Avoid destructive testing against mainnet deployments and third-party funds you do not control.
