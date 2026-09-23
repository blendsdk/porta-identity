# DEF Quick Cleanup Plan

> **Feature**: Close the low-risk residual defects left by the assurance program and refresh evidence for the already-fixed defects
> **Status**: Complete
> **Completed**: 2026-09-21
> **Created**: 2026-09-21
> **Implements**: test-assurance/RD-04, test-assurance/RD-05, test-assurance/RD-06
> **CodeOps Artifact Schema**: 1

## Overview

The test-assurance roadmap still marks several defects as blocked even though the product code was
later fixed. A focused re-check (2026-09-21) split the remaining work into small product residuals,
one product-design gap, and larger assurance campaigns. This plan owns only the small, low-risk
residuals and the evidence refresh for the already-fixed defects:

- **DEF-15 residual** — suppress the version-bearing `Server` header on the development and
  admin-playground reverse proxies and in the deployment documentation examples. The recorded
  production ingress was already fixed.
- **DEF-16 residual** — bound the liveness dependency checks and add a regression test for the
  database pool error/reconnect behavior that a previous fix introduced.
- **DEF-18 residual** — align the SDK cursor pagination contract with the server's `nextCursor`
  response field so the `listAll` cursor loop can advance.
- **Evidence refresh** — re-run the detecting tests for DEF-4 (atomic authorization-code
  consumption), DEF-9 (TOTP replay) and DEF-19 (public session identifiers), then record their
  verified state in the roadmap.

## Scope boundaries

This plan changes only the affected server middleware, SDK pagination, development/playground proxy
configuration, deployment documentation examples, repository structure contracts, and this
feature's CodeOps artifacts. It does not change CI workflows, publishing, deployment release policy,
the assurance harness behavior, or any security assertion.

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview and navigation                  |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Quick Reference

| Decision                | Outcome                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Proxy token suppression | `server_tokens off;` in every tracked nginx config and every documentation example |
| Liveness bound          | `/health` checks race against the same 2 s timeout already used by `/ready`        |
| Cursor contract         | SDK reads `nextCursor` (with `cursor` retained as a compatibility alias)           |
| Evidence refresh        | Fixed defects are marked verified only with a named passing run                    |

## Related Files

- `packages/server/src/middleware/health.ts`
- `packages/server/src/middleware/ready.ts`
- `packages/server/src/lib/database.ts`
- `packages/sdk/src/pagination/index.ts`
- `packages/sdk/src/types/common.ts`
- `docker/nginx-dev.conf`
- `docker/admin-playground/nginx.conf`
- `docs/guide/deployment.md`
- `techdocs/guides/deployment.md`
- `repo-tests/monorepo/`
- `codeops/features/test-assurance/00-roadmap.md`
- `codeops/features/test-assurance/00-remaining-work.md`
