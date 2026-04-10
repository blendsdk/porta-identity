# 2FA UI Tests Implementation Plan

> **Feature**: Real two-factor authentication browser-level testing
> **Status**: Planning Complete
> **Created**: 2026-04-11

## Overview

Unblock 12 skipped (`test.fixme`) Playwright UI tests for two-factor authentication by seeding 2FA-enabled users during the test global setup and testing real 2FA flows end-to-end: email OTP via MailHog capture, TOTP via the `otpauth` library with known secrets, and recovery codes via known plaintext values.

The tests are currently skipped because they tried to enable 2FA via direct SQL from the Playwright worker process, but the server (running in a separate process context) doesn't see those changes due to in-memory caching. The fix: seed 2FA state during `global-setup.ts` (which runs in the same process as the server) using the real 2FA service modules, so the server sees the data from startup.

## Document Index

| #   | Document                                   | Description                             |
| --- | ------------------------------------------ | --------------------------------------- |
| 00  | [Index](00-index.md)                       | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md)         | Feature requirements and scope          |
| 02  | [Current State](02-current-state.md)       | Analysis of current skipped tests       |
| 03  | [Seed & Fixtures](03-seed-fixtures.md)     | Global setup seeding + fixture changes  |
| 04  | [Test Implementation](04-test-fixes.md)    | Unblocking the 12 fixme tests           |
| 07  | [Testing Strategy](07-testing-strategy.md) | Test verification approach              |
| 99  | [Execution Plan](99-execution-plan.md)     | Phases, sessions, and task checklist    |

## Key Decisions

| Decision                     | Outcome                                                  |
| ---------------------------- | -------------------------------------------------------- |
| How to enable 2FA for tests  | Seed via real service modules in global-setup.ts          |
| Email OTP verification       | Capture from MailHog, extract code from email body        |
| TOTP code generation         | Use `otpauth` library with known secret seeded at setup  |
| Recovery code testing        | Use plaintext codes captured during seed                  |
| Test API endpoint needed?    | No — seeding in global-setup avoids cross-process issues  |

## Related Files

- `tests/ui/setup/global-setup.ts` — seed 2FA users here
- `tests/ui/fixtures/test-fixtures.ts` — extend TestData
- `tests/ui/flows/two-factor.spec.ts` — 4 fixme tests to unblock
- `tests/ui/flows/two-factor-edge-cases.spec.ts` — 8 fixme tests to unblock
- `src/two-factor/` — service modules used for seeding
