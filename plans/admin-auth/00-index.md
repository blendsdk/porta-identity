# Admin API Authentication Implementation Plan

> **Feature**: Secure the Admin API with OIDC self-authentication and migrate the CLI from direct-DB to authenticated HTTP client
> **Status**: Planning Complete
> **Created**: 2026-04-20
> **Source**: [RD-13](../../requirements/RD-13-admin-auth-cli-v2.md)

## Overview

Porta v5's admin API (`/api/admin/*`) is currently unsecured — the `requireSuperAdmin()` middleware is broken (always 403 because `ctx.state.organization` is never set on admin routes) and there is no user authentication at all. The CLI bypasses the API entirely by calling service functions directly against PostgreSQL and Redis.

This plan implements RD-13: securing the admin API with Bearer token validation (JWT self-validation using Porta's own ES256 signing keys), adding RBAC-based admin authorization, implementing CLI OIDC authentication (Auth Code + PKCE with localhost callback), and migrating all CLI commands from direct-DB service calls to authenticated HTTP requests.

The chicken-and-egg problem (need auth to create clients, need clients for auth) is solved by `porta init` — a direct-DB bootstrap command that creates the admin organization, application, CLI client, and first admin user in a single step.

## Document Index

| # | Document | Description |
|---|---|---|
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02 | [Current State](02-current-state.md) | Analysis of current implementation and gaps |
| 03 | [Bootstrap Init](03-bootstrap-init.md) | `porta init` command specification |
| 04 | [Admin Auth Middleware](04-admin-auth-middleware.md) | JWT validation + RBAC middleware |
| 05 | [CLI Authentication](05-cli-authentication.md) | login/logout/whoami + token storage |
| 06 | [CLI HTTP Migration](06-cli-http-migration.md) | HTTP client + command rewrites |
| 07 | [Testing Strategy](07-testing-strategy.md) | Test cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### Bootstrap Sequence (Development)

```bash
yarn docker:up                           # Postgres + Redis + MailHog
porta migrate up                         # Run migrations (direct-DB)
porta init                               # Create admin org/app/client/user (direct-DB)
yarn tsx scripts/playground-seed.ts      # Seed playground data (direct-DB, unchanged)
yarn dev                                 # Start server
porta login                              # Authenticate CLI via browser (OIDC + PKCE)
porta org list                           # Admin API via HTTP + Bearer token
```

### Bootstrap Sequence (Production)

```bash
porta migrate up                         # Direct-DB
porta init                               # Direct-DB, one-time
# [start server via Docker / blue-green]
porta login --server https://porta.example.com
porta org create --name "Acme Corp"      # HTTP + Bearer token
```

### Key Decisions

| Decision | Outcome |
|----------|---------|
| Token validation method | JWT self-validation (ES256 keys in memory) — no introspection HTTP call |
| Admin identity model | RBAC role (`porta-admin`) in super-admin org |
| CLI auth method | Auth Code + PKCE (localhost callback, browser-based) |
| CLI client type | Public (CLI can't hold secrets, PKCE provides security) |
| Token storage | File (`~/.porta/credentials.json`, 0600 perms) |
| Direct-DB commands | `porta init` + `porta migrate` only |
| Playground seed | Keep as direct-DB (dev tool) |
| CLI command interface | Preserve yargs builders + flags + output format |
| Route handlers | Keep existing — only replace auth middleware |
| New database tables | None — existing schema supports everything |

## Related Files

### New Files

- `src/cli/commands/init.ts` — Bootstrap command
- `src/cli/commands/login.ts` — OIDC login flow
- `src/cli/commands/logout.ts` — Clear stored tokens
- `src/cli/commands/whoami.ts` — Show current identity
- `src/cli/http-client.ts` — Authenticated HTTP client
- `src/cli/token-store.ts` — Token storage and refresh
- `src/middleware/admin-auth.ts` — Bearer token validation + RBAC

### Modified Files

- `src/middleware/super-admin.ts` — **Delete** (replaced by admin-auth.ts)
- `src/server.ts` — Swap middleware on admin routes
- `src/cli/bootstrap.ts` — Split into direct-DB and HTTP modes
- `src/cli/index.ts` — Register new commands (init, login, logout, whoami)
- `src/cli/commands/*.ts` — All 18 command files: replace service imports with HTTP calls
- `src/routes/*.ts` — Replace `requireSuperAdmin()` with new auth middleware
- `tests/integration/routes/*.ts` — Add Bearer token to admin API calls
- `tests/unit/cli/**` — Rewrite: mock HTTP calls instead of service imports

### Unchanged Files

- `src/organizations/`, `src/applications/`, `src/clients/`, `src/users/` — Service layer untouched
- `src/oidc/` — OIDC provider untouched
- `src/auth/` — Auth workflows untouched
- `scripts/playground-seed.ts` — Kept as direct-DB
- `playground/`, `playground-bff/` — No changes needed
- `tests/e2e/`, `tests/ui/`, `tests/pentest/` — No changes needed
- `migrations/` — No new tables
