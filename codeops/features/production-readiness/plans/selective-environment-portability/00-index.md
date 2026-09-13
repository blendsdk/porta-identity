# Selective Environment Portability Implementation Plan

> **Feature**: Selective export and atomic import of Porta configuration and identity data
> **Status**: Executing
> **Created**: 2026-09-13
> **Implements**: production-readiness/RD-02
> **CodeOps Artifact Schema**: 1

## Overview

This plan replaces Porta's unused provisioning import contract with the approved strict v1.0
portability manifest. Administrators can export one organization or the non-control-plane
environment, select application-related categories, preview an import, and atomically apply it in
keep-existing or update-existing mode. Server, SDK, conventional CLI, and terminal Admin UI use
one public contract and one server-owned import engine. (AR-1)

The implementation preserves the existing report-style CSV/JSON downloads while replacing the
unused CLI `provision` path. It deliberately excludes credentials, backup orchestration, large-data
machinery, compatibility layers, automatic retries, background work, and global configuration.
(AR-1)

## Minimum-Sufficient Baseline

**Original goal:** Move selected Porta organizations, global applications and authorization data,
users and assignments, and optional OIDC clients between initialized Porta installations using one
reviewable JSON artifact. (AR-1)

**Smallest viable design:** Add one direct `portability/` server feature module around existing
Koa, Zod, PostgreSQL transaction, audit, cache-cleanup, SDK transport, yargs, JSVision file-dialog,
full-page workspace, and Layout DSL patterns. Correct the unused public contract directly. (AR-2)

**Excluded machinery:** No format compatibility layer, generalized import framework, repository-wide
refactor, worker, queue, stream/chunk protocol, retry engine, optimistic concurrency, placeholder
language, manifest encryption, or new dependency. (AR-1, AR-2)

**Approved complexity:** None. The feature-local module split is the smallest direct structure that
keeps schema, export, planning, and mutation responsibilities reviewable. (AR-2)

## Document Index

| #     | Document                                          | Description                                 |
| ----- | ------------------------------------------------- | ------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)    | Zero-Ambiguity Gate decisions               |
| 00    | [Index](00-index.md)                              | Overview and navigation                     |
| 01    | [Requirements](01-requirements.md)                | RD-02 delta and scope                       |
| 02    | [Current State](02-current-state.md)              | Existing implementation analysis            |
| 03-01 | [Server Contract](03-01-server-contract.md)       | Manifest, routes, authorization, and limits |
| 03-02 | [Portability Engine](03-02-portability-engine.md) | Export, planning, apply, audit, and cleanup |
| 03-03 | [SDK and CLI](03-03-sdk-cli.md)                   | Typed client and conventional commands      |
| 03-04 | [Admin UI](03-04-admin-ui.md)                     | Maximized Import / Export workspace         |
| 07    | [Testing Strategy](07-testing-strategy.md)        | Immutable cases and verification            |
| 99    | [Execution Plan](99-execution-plan.md)            | Ordered implementation checklist            |

## Quick Reference

### Usage Examples

```console
porta export manifest --organization acme --category applications_authorization \
  --category users_assignments --all-applications --output porta-acme.json
porta import manifest porta-acme.json --mode keep-existing
```

### Key Decisions

| Decision           | Outcome                                                             |
| ------------------ | ------------------------------------------------------------------- |
| Contract authority | Approved RD-02 with authorized plan-preflight corrections (AR-1)    |
| Server structure   | Direct feature-local modules; no framework or dependency (AR-2)     |
| Admin UI           | One maximized tabbed workspace from a top-level menu entry (AR-3)   |
| CLI selection      | Separate mutually exclusive and repeatable yargs flags (AR-4)       |
| Suggested filename | `porta-manifest-<UTC timestamp>.json` (AR-5)                        |
| Verification       | Focused iteration, applicable assurance, final `yarn verify` (AR-6) |

## Related Files

- `packages/server/src/portability/`
- `packages/server/src/routes/exports.ts`
- `packages/server/src/routes/imports.ts`
- `packages/server/src/server.ts`
- `packages/sdk/src/domains/exports.ts`
- `packages/sdk/src/domains/imports.ts`
- `packages/sdk/src/types/`
- `packages/cli/src/commands/export.ts`
- `packages/cli/src/commands/import.ts`
- `packages/cli/src/admin/portability-*.ts`
- `docs/api/exports.md`, `docs/api/imports.md`, `docs/cli/provisioning.md`
