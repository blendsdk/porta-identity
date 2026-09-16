# Current State: PostgreSQL-Backed Global Configuration

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta already has a `system_config` JSONB table, a 60-second process-local cache, startup OIDC TTL
loading, runtime policy readers, protected config routes, SDK and yargs config surfaces, request-owned
transactions, post-commit effects, durable audit helpers, granular permissions, and full-page
JSVision workspaces. The feature corrects and connects these existing seams rather than replacing
them. (AR-3, AR-6, AR-14)

### Relevant Files

| File | Purpose | Changes Needed |
|---|---|---|
| `packages/server/src/lib/system-config.ts` | Generic cached database readers and OIDC TTL loading | Use catalog-owned types/defaults, strict native types, safe warnings, and testable expiry |
| `packages/server/src/routes/config.ts` | Direct list/get/string update routes | Enforce catalog projection, authoritative reads, native validation, batch transaction, audit, and fixed errors |
| `packages/server/src/middleware/admin-mutation-audit.ts` | Generic Admin mutation transaction/audit | Add config to the existing self-managed exclusions |
| `packages/server/migrations/011_seed.sql`, `017_audit_retention.sql` | Historical public rows | Leave applied migrations unchanged; supersede them with migration 030 |
| `packages/server/src/auth/*`, `src/users/service.ts`, `src/routes/audit.ts`, `src/routes/users.ts` | Runtime policy consumers | Remove caller-owned defaults and use catalog keys; make invitations configurable |
| `packages/server/src/auth/i18n.ts` | Locale loading and global fallback | Export tested supported locales/namespaces and use catalog fallback |
| `packages/sdk/src/types/config.ts`, `src/domains/config.ts` | String-only public config contract | Add closed keys, typed metadata/value, batch update, and restart result |
| `packages/cli/src/commands/config.ts` | `list/get/set` using string values | Convert input from fetched metadata and display validation/application details |
| `packages/cli/src/admin/state.ts`, `session-service.ts` | Live Admin capability/session projection | Add exact config read/update capabilities and config operations |
| `packages/cli/src/admin/presentation.ts`, `application.ts` | Menus, commands, and workspace lifecycle | Add one globally scoped System Configuration workspace |
| `docs/api/config.md`, `docs/cli/infrastructure.md` | Existing open-ended config documentation | Document the exact public contract |
| `docs/guide/environment.md`, `docs/guide/deployment.md` | Operator configuration/deployment guidance | Add the two required authority tables and propagation boundaries |

### Code Analysis

- `system-config.ts:56-85` currently collapses missing rows and database failures, logs raw errors,
  and caches misses; `system-config.ts:95-156` coerces strings/numbers/booleans. RD-03 instead needs
  exact native types, catalog defaults, and bounded reasons. (AR-2, AR-9, AR-12)
- `routes/config.ts:59-161` selects all rows, exposes database metadata, accepts only strings, and has
  no batch route or cache invalidation. It must project only catalog metadata and stored values.
  (AR-2, AR-6, AR-9)
- `admin-mutation-audit.ts:6-29` already has a small list of self-managed prefixes. Adding config to
  that list is the approved direct ownership boundary. (AR-6)
- `database.ts:52-107` already supplies nested-safe transactions and post-commit effects; no new
  transaction abstraction is needed. (AR-6, AR-14)
- `users.ts:490-493` hard-codes seven-day invitations, while recovery and rate-limit consumers already
  call the generic readers. These call sites become catalog-backed without state scans. (AR-8)
- `session-service.ts:310-360` derives fixed booleans from live permissions. The new UI adds only
  `canReadConfig` and `canUpdateConfig` through this existing boundary. (AR-11, AR-14)
- `presentation.ts:234-300` and the controller/service/workspace families provide the accepted menu
  and full-page workspace pattern. (AR-11, AR-14)

## Gaps Identified

### Gap 1: Database values and runtime contracts diverge

**Current behavior:** Historical durations are JSON strings, public names are inconsistent, callers
own defaults, and generic readers coerce types.

**Required behavior:** RD-03's exact native JSONB catalog and catalog-owned typed defaults.

**Fix required:** Add the immutable catalog, forward migration, strict cached reader, and direct
consumer updates. (AR-2, AR-4, AR-5, AR-8)

### Gap 2: Admin API is open-ended and non-atomic

**Current behavior:** All rows can be listed/read and one string value can be updated without the
specialized audit/cache boundary.

**Required behavior:** Allowlisted authoritative reads plus validated single/batch transactional
updates with one content-free audit event. (AR-6, AR-9, AR-10, AR-12)

### Gap 3: Clients lack the typed catalog workflow

**Current behavior:** SDK and CLI expose arbitrary string keys/values, and the embedded Admin UI has
no configuration workspace.

**Required behavior:** Typed SDK operations, metadata-driven CLI conversion, and the accepted
full-page four-tab workspace. (AR-4, AR-11, AR-13, AR-14)

### Gap 4: Public and maintainer documentation is stale

**Current behavior:** Documentation lists obsolete dotted keys and does not separate database-backed
policy from external bootstrap/secrets.

**Required behavior:** Exact catalog/external tables and clear 60-second/restart boundaries.

**Fix required:** Update public API, CLI, environment, deployment, schema, and maintainer
configuration references. (AR-3, AR-15)

## Dependencies

### Internal Dependencies

- Existing PostgreSQL pool, transaction context, audit log, and post-commit callback.
- Existing Admin authentication, permissions, request IDs, rate limits, and safe error middleware.
- Existing SDK transport, yargs command tree, and JSVision Layout DSL/workspace patterns.
- RD-01 security corrections and RD-02 portability behavior, both complete.

### External Dependencies

- PostgreSQL and Redis remain existing Porta dependencies.
- No new production or development dependency. (AR-14)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Secret/internal-row disclosure | Low | High | Catalog-key SQL allowlist and uniform non-catalog 404 |
| Invalid policy weakens authentication | Low | High | Exact Zod/native validation and safe minima |
| Partial batch or unaudited mutation | Low | High | Validate first; one existing transaction with one durable audit row |
| Stale local policy after save | Low | Medium | Existing post-commit callback clears the local cache |
| Cross-process expectations misunderstood | Medium | Medium | Test deterministic cache behavior and document the 60-second bound |
| Server/SDK/SQL drift | Medium | High | Immutable exact-contract specifications without a new generator |
| Dense terminal form | Medium | Medium | Four tabs, bounded widths, DSL gaps, inline help, compact fallback tests |
