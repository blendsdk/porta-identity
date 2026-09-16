# PostgreSQL-Backed Global Configuration Implementation Plan

> **Feature**: Closed, typed operational policy stored in PostgreSQL and managed through Porta's existing administrative surfaces
> **Status**: Planning Complete
> **Created**: 2026-09-16
> **Implements**: production-readiness/RD-03
> **CodeOps Artifact Schema**: 1

## Overview

This plan makes the approved 18-key operational-policy catalog authoritative across the server,
Admin API, SDK, conventional CLI, and embedded Admin UI. PostgreSQL stores only native scalar
values; one immutable server catalog owns metadata, validation, defaults, and application mode.
Runtime readers use safe typed defaults while authoritative Admin reads fail closed when the
store is unavailable or corrupt. Updates validate submitted/readback values and fail on unavailable
storage or missing targets; valid values may replace corrupt targeted content. (AR-2, AR-4, AR-9;
approved PF-002)

The implementation reuses the current table, process-local cache, request transaction, audit,
SDK transport, yargs commands, and JSVision workspace patterns. It deliberately adds no shared
package, generator, general configuration framework, distributed invalidation, background work,
compatibility layer, or concurrent-editor behavior. (AR-3–AR-6, AR-14)

## Minimum-Sufficient Baseline

**Original goal:** Move the approved global operational policy from mismatched seed/runtime
constants into one editable PostgreSQL-backed catalog without moving bootstrap settings or secrets
into the database. (AR-1, AR-2)

**Smallest viable design:** Add one server catalog module, directly strengthen the existing runtime
reader and config routes, extend the existing SDK/CLI surfaces, and add one established-pattern
Admin UI service/state/workspace/controller family. (AR-4, AR-14)

**Excluded machinery:** No arbitrary keys, schema framework, new package, code generator, watcher,
poller, pub/sub, Redis invalidation, history, rollback, worker, automatic restart, compatibility
reader, ETag, retry, or multi-administrator coordination. (AR-1–AR-5, AR-14)

**Approved complexity:** None. Every added module is direct feature code following existing package
patterns. (AR-14)

## Document Index

| # | Document | Description |
|---|---|---|
| AR | [Ambiguity Register](00-ambiguity-register.md) | Confirmed planning decisions |
| 00 | [Index](00-index.md) | Overview and navigation |
| 01 | [Requirements](01-requirements.md) | RD-03 delta and scope |
| 02 | [Current State](02-current-state.md) | Existing implementation analysis |
| 03-01 | [Catalog, Storage, and Runtime](03-01-catalog-storage-runtime.md) | Catalog, migration, cache, and consumers |
| 03-02 | [Admin API](03-02-admin-api.md) | Routes, validation, authorization, audit, and errors |
| 03-03 | [SDK and CLI](03-03-sdk-cli.md) | Public types and conventional commands |
| 03-04 | [Admin UI](03-04-admin-ui.md) | Full-page configuration workspace |
| 07 | [Testing Strategy](07-testing-strategy.md) | Immutable cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Ordered task checklist |

## Quick Reference

### Usage Examples

```console
porta config list
porta config get access_token_ttl
porta config set access_token_ttl 7200
```

```http
PUT /api/admin/config
Content-Type: application/json

{"values":{"magic_link_ttl":1200,"access_token_ttl":7200}}
```

### Key Decisions

| Decision | Outcome |
|---|---|
| Catalog authority | One server-owned immutable 18-key catalog (AR-2, AR-4) |
| Persistence migration | Exact native JSONB defaults; obsolete public rows deleted (AR-5) |
| Runtime propagation | Local clear after commit; other processes converge within 60 seconds (AR-3) |
| Admin mutation | One transaction, one specialized audit event, post-commit cache clear (AR-6) |
| Client contract | API metadata drives clients; SDK owns small public types (AR-4) |
| Admin UI | Top-level four-tab full-page workspace with one Save/Cancel footer (AR-11) |
| Verification | Focused selectors plus all approved project gates (AR-15) |

## Related Files

- `packages/server/src/lib/system-config-catalog.ts`
- `packages/server/src/lib/system-config.ts`
- `packages/server/src/routes/config.ts`
- `packages/server/src/middleware/admin-mutation-audit.ts`
- `packages/server/migrations/030_global_configuration_catalog.sql`
- `packages/sdk/src/types/config.ts`, `packages/sdk/src/domains/config.ts`
- `packages/cli/src/commands/config.ts`
- `packages/cli/src/admin/system-config-*.ts`
- `docs/api/config.md`, `docs/cli/infrastructure.md`, `docs/guide/environment.md`, `docs/guide/deployment.md`
