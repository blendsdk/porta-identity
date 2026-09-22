# DEF-14 Forwarding-Context Plan

> **Feature**: Resolve the trusted client IP behind the approved proxy and complete the ST-53 forwarding-context observers
> **Status**: Ready
> **Created**: 2026-09-21
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

DEF-14 records that the three ST-53 forwarding-context cases
(`st53-untrusted-forwarded-host`, `st53-untrusted-forwarded-proto`,
`st53-untrusted-forwarded-client-ip`) cannot be closed because three independent state
observations and one prohibited effect are `unobserved`. Those gaps were believed to be a harness
limitation. Investigation shows that two of the three observations are already true in the product,
but the third is a real weakness:

- Porta sets `app.proxy = true` by default (`packages/server/src/server.ts:109`,
  `packages/server/src/config/schema.ts:31`). Koa then resolves `ctx.ip` to the **leftmost**
  `X-Forwarded-For` entry (`node_modules/koa/lib/request.js:443-466`, `maxIpsCount` unset).
- The approved proxy forwards `X-Forwarded-For $proxy_add_x_forwarded_for`
  (`test-harness/nginx.conf:17`, `docker/nginx-dev.conf:31`, `docker/admin-playground/nginx.conf:20`),
  which appends the peer after any client-supplied value.
- Every rate-limit key uses `ctx.ip` (`packages/server/src/middleware/token-rate-limiter.ts:93`,
  `packages/server/src/middleware/admin-rate-limiter.ts:83`,
  `packages/server/src/routes/interactions.ts:729`).

A client can therefore send `X-Forwarded-For: <random>` and give every request its own rate-limit
budget. The public origin and the OIDC cookie scheme are already fixed
(`packages/server/src/config/schema.ts:13`, `packages/server/src/oidc/configuration.ts:606-619`),
so those two observations are safely true; only the client-IP identity is genuinely broken.

This plan fixes the client-IP trust model, adds security coverage, completes the ST-53 observers,
and removes the now-obsolete forwarding observer known gap.

## Decisions

| # | Decision | Choice |
| - | -------- | ------ |
| D1 | Trust configuration shape | Numeric hop count `TRUST_PROXY_HOPS`, applied through Koa `app.maxIpsCount` |
| D2 | Default when unset | `1` (secure by default for the documented single-proxy model) |
| D3 | Consumers affected | All `ctx.ip` consumers, because the fix is applied at the Koa app level |
| D4 | Untrusted input handling | Ignore it correctly and keep the accepted `200` control; no `400` rejection |
| D5 | Rate-limit identity observer | Token endpoint `X-RateLimit-Remaining` delta across two spoofed values |
| D6 | Cookie-policy observer | CSRF `_csrf` cookie policy on `GET /:orgSlug/auth/forgot-password` |
| D7 | Public-origin observer | Tenant OIDC discovery `issuer` read before and after the probe |
| D8 | Aggregate continuation | Remove the forwarding known-incomplete registration and known gap once ST-53 passes |

## Scope boundaries

In scope:

- The server trust-proxy hop configuration, its parsing, and its application to `ctx.ip`.
- Security regression coverage for spoofed client-IP rate-limit identity.
- The ST-53 forwarding-context observers in the production-exposure live adapter.
- Removal of the forwarding observer aggregate continuation and known gap.
- Operator documentation for the new setting and the CodeOps status records.

Out of scope:

- Rejecting untrusted forwarding input with `400` (decision D4).
- A trusted-proxy CIDR allowlist or automatic hop discovery.
- Changing `oidc-provider`'s own `provider.proxy` behavior for URL rewriting.
- Any change to single-entry `X-Forwarded-For` traffic, which resolves identically under the fix.

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview, decisions, and scope           |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Related Files

- `packages/server/src/config/schema.ts`
- `packages/server/src/config/index.ts`
- `packages/server/src/server.ts`
- `packages/server/tests/unit/config.test.ts`
- `packages/server/tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts`
- `repo-tests/monorepo/server-package.spec.test.mjs`
- `test-harness/assurance/production-exposure/live-adapter.ts`
- `test-harness/assurance/aggregate/registry.ts`
- `test-harness/assurance/aggregate/incomplete-admission.ts`
- `test-harness/assurance/tests/assurance-all-aggregate-requirements.ts`
- `test-harness/assurance/tests/assurance-all-aggregate.spec.test.ts`
- `test-harness/assurance/tests/assurance-all-aggregate.impl.test.ts`
- `docs/guide/environment.md`, `docs/guide/deployment.md`, `.env.example`
- `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md`
