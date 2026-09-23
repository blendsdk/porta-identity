# DEF-13 Administrative Denial Digest Plan

> **Feature**: Expose a privacy-safe target digest on administrative permission-denial security events
> **Status**: Complete
> **Completed**: 2026-09-21
> **Created**: 2026-09-21
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

DEF-13 records that administrative permission denials did not carry the privacy-safe target
identifier required by the administrative-data assurance cases (ST-57 through ST-61). A denial
already emitted one correlated `security.decision.v1` event with the actor reference, the requested
permissions, and the outcome, but it omitted the target digest.

This plan closes the product half of DEF-13: on a permission denial, the middleware records a
protected target reference derived from the acted-on resource (or, for collection routes, the
actor's organization). The target value never leaves request-local memory in raw form; only the
domain-separated HMAC digest reaches the event.

## Scope boundaries

This plan changes only the permission middleware, one unit specification, the exact test-file
inventory contract, and this feature's CodeOps artifacts. It does not change the assurance harness,
the live P1 adapter, CI, publishing, or deployment policy. The administrative-data live adapter that
observes these fields remains a separate, larger piece of DEF-13 and stays recorded in the backlog.

## Field mapping

| Assurance field            | Event field                           |
| -------------------------- | ------------------------------------- |
| `synthetic-correlation-id` | `requestId`                           |
| `actor-id`                 | `actorRef` (protected)                |
| `action`                   | `detail.permissions` and `reasonCode` |
| `target-id-digest`         | `resourceRef` (protected, added here) |
| `result`                   | `outcome`                             |

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview and navigation                  |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Related Files

- `packages/server/src/middleware/require-permission.ts`
- `packages/server/src/security/decision-context.ts`
- `packages/server/src/security/decision-event.ts`
- `packages/server/tests/unit/security/admin-permission-denial-target.spec.test.ts`
- `repo-tests/monorepo/server-package.spec.test.mjs`
- `codeops/features/test-assurance/00-remaining-work.md`
