# Production Hardening Implementation Plan

> **Feature**: Small-surface-area hardening — production-safe config, readiness probe, proxy trust, error-hygiene checks, optional metrics seam, CI workflow
> **Status**: Planning Complete
> **Created**: 2026-04-19

## Overview

Porta v5 is feature-complete for multi-tenant OIDC but its operational wrapper is incomplete: the three RDs that gate production readiness (RD-11 Deployment, RD-13 Admin-Auth-v2, RD-17 Docs) are still drafts. This plan does **not** attempt to finish any of those RDs. Instead, it lands the cheap, high-leverage safety items that can ship today without a production Dockerfile and without rewriting admin auth:

1. A zod `superRefine` on the config schema that refuses to boot when `NODE_ENV=production` and any of the well-known dev placeholders (cookie key, 2FA encryption key, DB password, `http://` issuer, SMTP=localhost, `LOG_LEVEL=debug`) are still in place.
2. An opt-in `TRUST_PROXY=true` env that flips `app.proxy = true` (correct `ctx.ip`, `secure` cookies, rate-limit keys behind a load balancer).
3. A separate `GET /ready` readiness probe (DB+Redis ping with a short timeout) alongside the existing `/health` liveness endpoint.
4. Graceful-shutdown hardening: `await server.close()` wrapped in a promise, with the existing 10s safety timer preserved.
5. Error-handler and OIDC cookie-flag audit (+ targeted tests) so neither leaks stack traces in production and cookies are `secure + httpOnly + sameSite=lax` when HTTPS is detected.
6. A minimal `prom-client` seam at `GET /metrics`, gated by `METRICS_ENABLED=true` env. Process metrics + a single request counter — just the hook RD-11 observability will extend.
7. A GitHub Actions workflow at `.github/workflows/ci.yml` that runs `yarn verify` on every PR to `main` with Postgres + Redis services.

None of this blocks on RD-11 or RD-13. Each phase ships independently and is safe to stop after.

## Document Index

| # | Document | Description |
|---|---|---|
| 00 | [Index](00-index.md) | This document |
| 01 | [Requirements](01-requirements.md) | Scope, must/should/won't-have lists |
| 02 | [Current State](02-current-state.md) | What the codebase currently does + identified gaps |
| 03 | [Config Fail-Fast (Phase A)](03-config-fail-fast.md) | zod `superRefine` spec |
| 04 | [Runtime Hardening (Phase B)](04-runtime-hardening.md) | `app.proxy`, `/ready`, shutdown, error/cookie audit |
| 05 | [Metrics Seam (Phase C)](05-metrics-seam.md) | `prom-client` stub at `/metrics` |
| 06 | [CI Workflow (Phase D)](06-ci-workflow.md) | `.github/workflows/ci.yml` |
| 07 | [Testing Strategy](07-testing-strategy.md) | Unit + integration test plan |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, tasks, checklist |

## Quick Reference

### Key Decisions

| Decision | Outcome |
|---|---|
| Touch RD-11 production Dockerfile? | No — explicitly deferred |
| Touch RD-13 admin-auth-v2? | No — explicitly deferred |
| Add `prom-client` dependency? | Yes, gated by `METRICS_ENABLED=true` |
| Add GitHub Actions CI? | Yes (Phase D). Can be skipped if project uses different CI. |
| Default for `TRUST_PROXY` | `false` (safe for bare-metal dev) |
| Default for `METRICS_ENABLED` | `false` |
| Production `ISSUER_BASE_URL` must be HTTPS? | Yes — schema refuses `http://` when `NODE_ENV=production` |

## Related Files

New / modified:
- `src/config/schema.ts` — add `superRefine` + new optional fields `trustProxy`, `metricsEnabled`
- `src/config/index.ts` — surface new fields
- `src/server.ts` — honour `trustProxy`, mount `/ready`, mount `/metrics` (conditional), `await server.close()`
- `src/middleware/ready.ts` — **new**, readiness probe
- `src/middleware/metrics.ts` — **new**, `prom-client` seam
- `src/middleware/error-handler.ts` — audit + add test for no-stack-leak
- `src/oidc/configuration.ts` — audit cookie flags
- `tests/unit/config/schema.production.test.ts` — **new**, per refinement case
- `tests/integration/ready.test.ts` — **new**
- `tests/integration/metrics.test.ts` — **new**
- `tests/unit/middleware/error-handler.test.ts` — augment
- `.env.example` — document `TRUST_PROXY`, `METRICS_ENABLED`
- `.github/workflows/ci.yml` — **new**
- `package.json` — `prom-client` dependency
