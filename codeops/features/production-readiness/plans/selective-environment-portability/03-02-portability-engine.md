# Portability Engine: Selective Environment Portability

> **Document**: 03-02-portability-engine.md
> **Parent**: [Index](00-index.md)

## Overview

The engine reads a stable portable graph, builds a mutation-free ordered plan, and either returns
that plan or applies it atomically. It is server-only and directly uses the existing PostgreSQL,
validation, audit, cache, authority-cleanup, and client-secret boundaries. (AR-1, AR-2)

## Architecture

### Current Architecture

The report exporter already uses an explicit-column repeatable-read transaction. The unused importer
has useful transaction and validation concepts but mixes schema, planning, mutation, and result
assembly in one oversized file and implements the wrong graph.

### Proposed Changes

The direct module is split into:

| File                        | Responsibility                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `portability/export.ts`     | Resolve scope and selection; query and serialize the graph                                               |
| `portability/plan.ts`       | Normalize records, reject duplicates/control-plane data, resolve natural keys, and build ordered actions |
| `portability/apply.ts`      | Run the transaction, invoke ordered writes, assemble committed result                                    |
| `portability/repository.ts` | Explicit parameterized reads/writes using the request transaction                                        |
| `portability/cleanup.ts`    | Collect changed cache/authority identifiers and register existing post-commit cleanup                    |

This is a feature-local responsibility split, not a plug-in engine, abstraction framework, or new
repository convention for other domains. Legacy `lib/data-import.ts` and
`lib/data-import-plan.ts` are removed after callers and tests move. (AR-2)

## Implementation Details

### Export

```ts
export async function exportPortabilityManifest(
  request: ExportManifestRequest,
  actor: PortabilityActor,
): Promise<{ readonly manifest: PortabilityManifest; readonly filename: string }>;
```

The function obtains one client, opens `BEGIN ISOLATION LEVEL REPEATABLE READ`, validates exact
scope and control-plane exclusion, reads every selected collection with explicit columns and
parameterized queries, creates the manifest, enforces the serialized 64 MiB limit, writes the one
content-free audit row, and commits. Any failure rolls back and returns no body. Ordering follows
RD-02's dependency and normalized-natural-key rules. (AR-1, AR-5)

### Mutation-Free Plan

```ts
export async function buildPortabilityPlan(
  manifest: PortabilityManifest,
  mode: 'dry-run' | 'keep-existing' | 'update-existing',
): Promise<PortabilityPlan>;
```

The planner runs inside the same request-owned transaction used by preview or apply. It validates
the entire graph before any product mutation. Each planned entry contains its entity type,
normalized public natural key, action, resolved destination identifiers needed by writers, and
validated mutable values. Internal identifiers never enter the public result. Errors are collected
up to 100 public entries while aggregate rejected counts remain complete. (AR-1)

Results count manifest records rather than relationship edges. For one aggregate
`role_permission_mappings` record, the action is `skipped` when every listed edge exists, `created`
when none existed and at least one is added, and `updated` when existing and newly added edges are
mixed. Empty permission lists reject the plan as `invalid_record`. (AR-1)

Preview runs the mutation-free planner in `runDatabaseTransaction()` and performs no product or
audit mutation and no secret generation. The read-only transaction may commit normally; no rollback
sentinel, preview token, or retained server state is added. (AR-1, AR-2)

### Atomic Apply

```ts
export async function applyPortabilityManifest(
  manifest: PortabilityManifest,
  mode: 'keep-existing' | 'update-existing',
  actor: PortabilityActor,
): Promise<PortabilityResult>;
```

Apply starts `runDatabaseTransaction()`, rebuilds the complete plan, rejects it before writes when
any error exists, then executes writes in RD-02 dependency order. The portability repository uses
`getPool()`/the request-owned client and parameterized SQL. It never starts a nested transaction and
does not call ordinary mutation services that would emit per-record audits. One `admin.import` audit
row is inserted through the same transaction. (AR-1, AR-2)

Keep-existing skips matched records after compatibility validation. Update-existing changes only
the RD's mutable field set. Both modes create missing records and add/update only listed
relationships. Neither deletes destination-only records or relationships. (AR-1)

### Confidential Client Creation

For each newly created confidential client, apply preserves the manifest Client ID and calls the
existing cryptographic generation/hash primitives once. It inserts one secret labeled `Imported`
with the exact UTC six-calendar-month rule. Plaintext is held only in the transaction-local result,
discarded on rollback, and returned only after commit. Existing and public clients get no secret.
(AR-1)

### Cache and Authority Cleanup

Writers collect only identifiers for created or changed organizations, applications, users,
clients, roles, permissions, and claims. After successful commit, `cleanup.ts` calls existing cache
invalidators through `afterDatabaseCommit()`. When an update deactivates a user or reduces effective
authority, it reuses existing targeted session/token/grant cleanup for those users only. Failures
are handled by the existing post-commit best-effort boundary; no retry, worker, broad logout, or
Redis operation occurs inside the PostgreSQL transaction. (AR-1)

### Audit

Export and apply each insert one audit row using the ownership rules and allowlisted metadata in
RD-02 **Content-free audit**. Preview does not write an audit row because it changes no product
state and the RD requires audit atomicity with committed operations. No manifest value or one-time
secret is passed to the logger. (AR-1)

## Integration Points

- Ordinary domain validators normalize every imported field.
- `lib/database.ts` owns transaction context and post-commit effects.
- `lib/audit-log.ts` owns transaction-bound audit insertion.
- Existing caches and deletion/authority cleanup provide targeted invalidation.
- Existing client crypto/secret modules provide generation and hashing.

## Error Handling

| Error Case                                      | Handling Strategy                                                  | AR Ref |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------ |
| Duplicate normalized natural key                | Reject full plan with `duplicate_natural_key`                      | AR-1   |
| Missing, ambiguous, or cross-parent dependency  | Reject full plan with its fixed safe code                          | AR-1   |
| Immutable-field mismatch or Client ID collision | Reject full plan with 409; disclose no destination detail          | AR-1   |
| Control-plane record                            | Reject full plan before mutation                                   | AR-1   |
| Any write, audit, or secret persistence failure | Roll back every mutation and return no credential                  | AR-1   |
| Post-commit cache cleanup failure               | Use existing best-effort logging without changing committed result | AR-1   |

## Testing Requirements

- Engine specification tests cover ST-11–ST-37.
- Integration tests use a fully populated source and initialized destination to prove round trip,
  new UUIDs, control-plane preservation, and credential exclusion.
- A forced final-write failure proves rollback of records, mappings, audit, and secret rows.
- Security tests scan results, logs, and audit metadata for prohibited content.
