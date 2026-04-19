# Client Login Methods Implementation Plan

> **Feature**: Configurable login methods (password, magic link) per client with organization-level default
> **Status**: Planning Complete
> **Created**: 2026-04-19

## Overview

Currently, every login page in Porta shows **both** a password form and a magic-link button unconditionally. This can be confusing for end users and makes Porta inflexible for operators who want to enforce a specific authentication experience per application or client.

This feature introduces a two-level inheritance model for login methods:

1. **Organization-level default** — a new `default_login_methods` column on `organizations` defines which methods are allowed org-wide (defaults to `{password, magic_link}` for backward compatibility).
2. **Client-level override** — a nullable `login_methods` column on `clients` lets individual clients override the org default. `NULL` means "inherit from org".

The effective login methods are resolved at render time and drive both the template (which sections to render) and the backend (which POST endpoints accept submissions). Defense-in-depth: the server enforces the method even if the UI is bypassed.

The design is future-proof — the DB column is `TEXT[]` without a value CHECK, so adding `sso` or `passkey` later is a pure TypeScript change with no migration required.

## Document Index

| #  | Document                                                    | Description                                     |
| -- | ----------------------------------------------------------- | ----------------------------------------------- |
| 00 | [Index](00-index.md)                                        | This document — overview and navigation         |
| 01 | [Requirements](01-requirements.md)                          | Feature requirements and scope                  |
| 02 | [Current State](02-current-state.md)                        | Analysis of current implementation              |
| 03 | [Database Schema](03-database-schema.md)                    | Migration, column shape, inheritance semantics  |
| 04 | [Types, Repository & Service](04-types-and-services.md)     | Organizations + clients module changes          |
| 05 | [OIDC & Interaction Routes](05-oidc-and-interactions.md)    | OIDC metadata, login flow, template rendering   |
| 06 | [Admin API, CLI & Template](06-api-cli-template.md)         | HTTP routes, CLI commands, login.hbs changes    |
| 07 | [Testing Strategy](07-testing-strategy.md)                  | Unit + integration + E2E test plan              |
| 08 | [Playground Integration](08-playground-integration.md)      | Seed + SPA + BFF demo changes                   |
| 99 | [Execution Plan](99-execution-plan.md)                      | Phases, sessions, and task checklist            |

## Quick Reference

### Usage Examples

**Org default — show both (current behavior):**
```bash
porta org update acme --login-methods password,magic_link
```

**Client inherits from org (NULL):**
```bash
porta client create --org-id ... --app-id ... --name "Customer Portal"
# → loginMethods = NULL → resolves to org default
```

**Client override — magic link only:**
```bash
porta client update <id> --login-methods magic_link
```

**Reset to org default:**
```bash
porta client update <id> --login-methods inherit
# → sets login_methods = NULL
```

### Key Decisions

| Decision                                     | Outcome                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| Where to store login methods                 | Org-level default + nullable client-level override        |
| NULL semantics on client                     | `NULL` = inherit from org                                 |
| TypeScript type                              | `'password' \| 'magic_link'` (extensible union)           |
| DB column type                               | `TEXT[]` — no CHECK on values (future-proof for SSO/passkey) |
| API placement of `defaultLoginMethods`       | Top-level org field alongside `twoFactorPolicy`           |
| Backend enforcement                          | POST `/login` checks `password` in methods, POST `/magic-link` checks `magic_link` — return 403 if disabled |
| Template rendering                           | Conditional sections, "or" divider only when both present |

## Related Files

### New Files
- `migrations/014_login_methods.sql`
- `plans/client-login-methods/*.md` (these planning documents)

### Modified Files (Source)
- `src/organizations/types.ts` — add `defaultLoginMethods` + validation
- `src/organizations/repository.ts` — include in INSERT/UPDATE/SELECT
- `src/organizations/service.ts` — validate non-empty, propagate to input/update
- `src/organizations/cache.ts` — (verify serialization handles arrays)
- `src/routes/organizations.ts` — Zod schema accepts `defaultLoginMethods`
- `src/clients/types.ts` — add `LoginMethod`, `loginMethods` (nullable)
- `src/clients/repository.ts` — include in INSERT/UPDATE/SELECT
- `src/clients/service.ts` — validate, expose in `findForOidc()`
- `src/clients/cache.ts` — (verify null serialization)
- `src/clients/resolve-login-methods.ts` — **NEW** resolution helper
- `src/routes/clients.ts` — Zod schema accepts `loginMethods`
- `src/routes/interactions.ts` — resolve + pass to template + enforce on POST + read `login_hint`
- `src/routes/password-reset.ts` — enforce `password` on forgot/reset-password routes
- `src/oidc/configuration.ts` — register `urn:porta:login_methods` extra metadata
- `src/auth/template-engine.ts` — extend `TemplateContext` with method flags + `emailHint`
- `src/cli/commands/org.ts` — add `--login-methods` flag
- `src/cli/commands/client.ts` — add `--login-methods` flag (supports `inherit`)
- `src/cli/parsers.ts` — **NEW** `parseLoginMethodsFlag()` helper
- `templates/default/pages/login.hbs` — conditional rendering + `emailHint` prefill + forgot-link gated on `showPassword`
- `locales/default/en/errors.json` — add `login_method_disabled` + `no_login_methods_configured`

### Modified Files (Tests)
- `tests/unit/organizations/types.test.ts`
- `tests/unit/organizations/repository.test.ts`
- `tests/unit/organizations/service.test.ts`
- `tests/unit/clients/types.test.ts`
- `tests/unit/clients/repository.test.ts`
- `tests/unit/clients/service.test.ts`
- `tests/unit/clients/resolve-login-methods.test.ts` — **NEW**
- `tests/unit/routes/organizations.test.ts`
- `tests/unit/routes/clients.test.ts`
- `tests/unit/routes/interactions.test.ts`
- `tests/unit/routes/password-reset.test.ts` — forgot/reset enforcement cases
- `tests/unit/cli/commands/org.test.ts`
- `tests/unit/cli/commands/client.test.ts`
- `tests/unit/cli/parsers.test.ts` — **NEW**
- `tests/fixtures/organizations.ts` — add `defaultLoginMethods` builder
- `tests/fixtures/clients.ts` — add `loginMethods` builder
- `tests/integration/migrations.test.ts` (add case for migration 014)
- `tests/e2e/login-methods.spec.ts` — **NEW** end-to-end flows
- `tests/pentest/login-methods.test.ts` — **NEW** security cases (CSRF, info-leak, mass-assignment, forgot-password enforcement, `login_hint` XSS)
- `tests/ui/flows/login-methods.spec.ts` — **NEW** Playwright UI specs (6 scenarios)
- `tests/ui/flows/password-login.spec.ts` — regression asserts
- `tests/ui/flows/magic-link.spec.ts` — regression asserts

### Modified Files (Docs & Requirements)
- `requirements/RD-07-auth-workflows-login-ui.md` — append "Addendum: Configurable Login Methods" section

### Modified Files (Playground — see doc 08)
- `scripts/playground-seed.ts` — seed 1 new org + 5 new clients across SPA/BFF
- `scripts/run-playground.sh` — update banner with login-method URLs
- `scripts/playground-bff-smoke.sh` — add 3 curl assertions
- `playground/index.html` — add "Login Method Demo" dropdown
- `playground/js/config.js` — expose login-method client profiles
- `playground/js/auth.js` — `loginWithProfile()` helper
- `playground/js/app.js` — wire dropdown + confirmation card
- `playground/README.md` — document scenarios
- `playground-bff/src/config.ts` — accept `BFF_CLIENT_PROFILE`
- `playground-bff/src/routes/debug.ts` — **NEW** `/debug/client-login-methods` (dev-only)
- `playground-bff/src/server.ts` — register debug route + dashboard data
- `playground-bff/views/dashboard.hbs` — Login Methods Configuration panel
- `playground-bff/README.md` — document profiles + debug endpoint
