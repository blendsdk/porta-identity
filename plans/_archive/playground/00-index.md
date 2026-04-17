# Playground Application & Infrastructure Implementation Plan

> **Feature**: Interactive OIDC playground for testing all Porta auth flows
> **Status**: Planning Complete
> **Created**: 2026-04-11

## Overview

This plan implements two closely coupled requirements:

- **RD-14 (Playground Application)** — A vanilla HTML/JavaScript SPA that connects to
  a local Porta instance via standard OIDC protocols. It provides a scenario selector
  for 8 auth flow variants (password login, magic link, email OTP, TOTP, recovery codes,
  consent, password reset, invitation), a token dashboard, UserInfo panel, and status
  indicators.

- **RD-15 (Playground Infrastructure)** — An enhanced seed script that creates 5
  organizations with different 2FA policies, 8+ test users, RBAC roles/permissions,
  custom claims, and OIDC clients. Includes one-command startup (`yarn playground`)
  and teardown scripts.

Together, these deliver a "git clone → yarn playground → explore all auth flows"
developer experience in under 5 minutes.

## Document Index

| #   | Document                                         | Description                                   |
| --- | ------------------------------------------------ | --------------------------------------------- |
| 00  | [Index](00-index.md)                             | This document — overview and navigation       |
| 01  | [Requirements](01-requirements.md)               | Feature requirements and scope (refs RD-14/15)|
| 02  | [Current State](02-current-state.md)             | Analysis of existing seed script and infra    |
| 03  | [Seed Script](03-seed-script.md)                 | Enhanced seed script technical spec           |
| 04  | [Startup Infrastructure](04-startup-infra.md)    | Startup/teardown scripts, package.json        |
| 05  | [Playground App](05-playground-app.md)           | Vanilla HTML/JS SPA technical spec            |
| 07  | [Testing Strategy](07-testing-strategy.md)       | Manual and automated verification             |
| 99  | [Execution Plan](99-execution-plan.md)           | Phases, sessions, and task checklist          |

## Quick Reference

### One-Command Startup

```bash
yarn playground     # Docker → migrations → seed → Porta → playground
yarn playground:stop  # Stop Porta + playground
yarn playground:reset # Drop DB → re-migrate → re-seed
```

### Port Assignment

| Service          | Port | URL                            |
| ---------------- | ---- | ------------------------------ |
| Porta server     | 3000 | http://localhost:3000           |
| Playground app   | 4000 | http://localhost:4000           |
| MailHog Web UI   | 8025 | http://localhost:8025           |
| PostgreSQL       | 5432 | —                              |
| Redis            | 6379 | —                              |
| MailHog SMTP     | 1025 | —                              |

### Test Scenarios

| # | Scenario                     | Org Slug                  | Test User                    |
|---|------------------------------|---------------------------|------------------------------|
| 1 | Normal Login (no 2FA)        | `playground-no2fa`        | `user@no2fa.local`           |
| 2 | Login with Email OTP         | `playground-email2fa`     | `user@email2fa.local`        |
| 3 | Login with TOTP              | `playground-totp2fa`      | `user@totp2fa.local`         |
| 4 | Login + Recovery Code        | `playground-totp2fa`      | `user@totp2fa.local`         |
| 5 | Magic Link Login             | `playground-no2fa`        | `user@no2fa.local`           |
| 6 | Third-Party Consent          | `playground-thirdparty`   | `user@thirdparty.local`      |
| 7 | Password Reset               | `playground-no2fa`        | `user@no2fa.local`           |
| 8 | Invitation Flow              | —                         | (created via playground)     |

### Key Decisions

| Decision             | Outcome                                              |
| -------------------- | ---------------------------------------------------- |
| SPA framework        | Vanilla JS — zero build step                         |
| OIDC library         | oidc-client-ts (vendored, no CDN)                    |
| Static server        | sirv-cli (SPA fallback, lightweight)                 |
| Playground port      | 4000                                                 |
| Seed approach        | Rewrite existing script; service calls (not raw SQL) |
| Config output        | ES module (`config.generated.js`)                    |

## Related Files

### New Files

```
playground/
├── package.json
├── index.html
├── callback.html
├── css/style.css
├── js/app.js
├── js/auth.js
├── js/config.js
├── js/tokens.js
├── js/userinfo.js
├── js/ui.js
├── vendor/oidc-client-ts.min.js
├── config.generated.js          (gitignored, created by seed)
└── README.md
scripts/
├── playground-seed.ts           (rewritten, enhanced)
└── run-playground.sh            (startup orchestration)
```

### Modified Files

```
package.json                     (add playground, playground:stop, playground:reset scripts)
.gitignore                       (add playground/config.generated.js)
```
