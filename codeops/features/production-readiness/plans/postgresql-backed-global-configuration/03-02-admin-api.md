# Admin API: PostgreSQL-Backed Global Configuration

> **Document**: 03-02-admin-api.md
> **Parent**: [Index](00-index.md)

## Overview

The existing config router becomes a closed administrative projection over the server catalog. It
never serializes raw database metadata, internal rows, secrets, environment settings, or runtime
fallbacks. Reads are authoritative; updates validate fully and commit with one specialized audit
event. (AR-2, AR-6, AR-9, AR-10, AR-12)

## Architecture

### Current Architecture

The router directly selects every row, masks rows marked sensitive, accepts one non-empty string,
and relies on the generic Admin mutation wrapper.

### Proposed Changes

Keep `routes/config.ts` as the route owner. Reuse the server catalog for input schemas and response
projection, the current database transaction helper for updates, the current audit writer, and the
current post-commit callback. Add `/api/admin/config` to the generic wrapper's self-managed prefix.
No repository/service framework is introduced. (AR-6, AR-14)

## Implementation Details

### Public Representation

```ts
export interface ConfigEntry {
  readonly key: SystemConfigKey;
  readonly group: SystemConfigGroup;
  readonly label: string;
  readonly description: string;
  readonly value: SystemConfigValue;
  readonly defaultValue: SystemConfigValue;
  readonly valueType: SystemConfigValueType;
  readonly unit: SystemConfigUnit;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly allowedValues?: readonly SupportedLocale[];
  readonly applicationMode: SystemConfigApplicationMode;
  readonly updatedAt: string;
}
```

Metadata always comes from the catalog; only `value` and `updatedAt` come from a validated row.
List SQL filters by the exact catalog-key array and the mapper returns catalog order. A missing or
invalid canonical row makes the entire authoritative read request unavailable. (AR-2, AR-4, AR-9)

### Endpoint Contracts

| Method/path | Permission | Request | Success |
|---|---|---|---|
| `GET /api/admin/config` | `admin:config:read` | None | `{ data: ConfigEntry[] }` in catalog order |
| `GET /api/admin/config/:key` | `admin:config:read` | Catalog key | `{ data: ConfigEntry }` |
| `PUT /api/admin/config/:key` | `admin:config:update` | Exact `{ value: scalar }` | `{ data: ConfigEntry, restartRequired }` |
| `PUT /api/admin/config` | `admin:config:update` | Exact non-empty `{ values: { key: scalar } }` | `{ data: ConfigEntry[], restartRequired }` |

Unknown, obsolete, internal, environment-owned, and secret names are rejected against the catalog
before querying whether a row exists. Batch validation resolves every key and value before opening
the transaction. JSON objects inherently provide one value per key. (AR-2, AR-12)

### Validation

The route body schemas are strict. Values remain `unknown` until catalog validation resolves their
exact native type and bounds. Numeric strings, fractions, non-finite numbers, booleans, objects,
arrays, null, unsupported locales, empty batches, and extra fields fail without mutation. URL keys
are treated as untrusted strings and never interpolated into SQL. (AR-2)

### Mutation Transaction

For single and batch updates:

1. Validate the complete key/value set.
2. Enter `runDatabaseTransaction()`.
3. Update each catalog row through parameterized SQL and require one returned row per key.
4. Resolve the authenticated actor through the transaction client.
5. Write one `admin.config.updated` audit row with metadata containing only sorted `keys` and
   `restartRequired`.
6. Register `clearSystemConfigCache()` with `afterDatabaseCommit()`.
7. Commit and return freshly projected authoritative rows in catalog order.

Any update count mismatch, readback validation failure, actor/audit failure, or database exception
rolls back every value and produces the fixed store-unavailable response. Failed transactions do
not clear the cache. (AR-6, AR-9, AR-10)

Updates validate submitted values and the returned new rows, not old stored values. A valid update
may replace corrupt targeted content directly. Missing targeted rows still fail with 503; no upsert,
repair subsystem or preliminary integrity query is added. (Approved PF-002; amended RD-03 AC-14)

### Restart Result

`restartRequired` is true when at least one successfully updated definition has application mode
`restart-required`; otherwise false. The response makes no claim that the running provider changed.
(AR-3, AR-10)

## Error Handling

| HTTP | Body | When | AR Ref |
|---|---|---|---|
| 400 | `{ error: 'Configuration value is invalid', code: 'config_value_invalid' }` | Invalid body shape or value for a catalog key | AR-12 |
| 404 | `{ error: 'Configuration entry not found', code: 'config_entry_not_found' }` | Any non-catalog single key or any batch containing one | AR-2, AR-12 |
| 503 | `{ error: 'Configuration store is unavailable', code: 'config_store_unavailable', requestId }` | Database failure, missing targeted row, invalid stored row on reads, invalid update readback, or atomic mutation failure | AR-9, AR-12; PF-002 |

The three bodies disclose no database existence, raw error, stored content, or secret category. A
non-catalog key takes precedence over value validation in the same request so all such names receive
the same 404. (AR-2, AR-12)

## Testing Requirements

- Unit specifications for exact request/response, boundary validation, catalog ordering, and safe
  errors.
- Integration specifications for permissions, atomic rollback, one audit row, native JSONB,
  post-commit cache clearing, and restart results.
- Penetration coverage for internal/secret/environment key non-enumeration and forged values.
