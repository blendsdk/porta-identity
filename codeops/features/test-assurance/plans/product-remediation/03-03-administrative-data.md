# Administrative Data: Assurance Product Remediation

> **Document**: 03-03-administrative-data.md
> **Parent**: [Index](00-index.md)

## Bulk status operations

AR-3 preserves the published ordered partial-result API.

- Zod validates action, reason, maximum 100 UUIDs, uniqueness, and required tenant scope before any
  mutation. Duplicate IDs reject the whole request.
- Every user item uses `id AND organization_id`; missing and foreign items share
  `not_found_or_not_authorized`.
- Each item owns one transaction covering `SELECT ... FOR UPDATE`, transition validation, update,
  and durable audit. Organization operations use the corresponding global control-plane scope.
- Results preserve input order and the existing `{ total, succeeded, failed, results }` envelope.
- Domain failures use closed codes. Raw database messages are never returned.
- Infrastructure failure stops further processing and returns committed outcomes plus explicit
  `not_attempted` rows and one correlation ID; earlier commits are never described as rolled back.

## Import

Before opening the mutation transaction, the planner validates exact manifest version, closed
fields, within-manifest duplicate natural keys, parent references, target scopes, authorization,
and absence of password plaintext/hashes, client secrets, signing material, sessions, tokens,
recovery/TOTP material, and audit records.

| Mode | Contract |
| --- | --- |
| `merge` | Create missing entities; existing tenant-qualified natural keys are intentional `skipped` outcomes and remain unchanged. |
| `overwrite` | Create missing entities and update only the documented mutable-field allowlist; never move ownership/parents, replace immutable IDs, delete omitted entities, or rotate existing credentials. |
| `dry-run` | Execute the same planner against a consistent snapshot; make no mutation/audit/secret/real-ID effect; report `credentialWillBeGenerated` instead of plaintext. |

Any missing parent, invalid mapping, collision, authorization failure, or runtime item failure is an
error and rolls back the complete import. A successful response never contains `errors[]`. Newly
generated confidential-client credentials are returned once only after commit and are never logged.
The audit record retains actor, mode, manifest version and digest, and aggregate counts only.

## Export

- Require dedicated `admin:export:read` plus the entity's read permission.
- The closed entity set is organizations, users, clients, roles, and audit; SDK/server/CLI docs and
  types must agree.
- Organizations require global export authority. Users and clients require organization scope.
  Roles require both organization and application scope verified through the relationship. Audit
  requires organization and a bounded date range.
- Every entity has an exact field allowlist. Audit exports exclude raw metadata, IP address, user
  agent, description, body, and error; event-type-specific safe detail fields are explicitly mapped.
- User PII is permitted only under combined export and user-read authority for the exact tenant.
- Queries fetch at most 10,001 rows. More than 10,000 returns `export_too_large`; no truncation or
  partial export occurs.
- CSV cells whose first non-whitespace character is `=`, `+`, `-`, or `@` are neutralized before
  RFC-compatible quoting. JSON uses the same field allowlist.
- Audit records actor, type, scope, format, and row count without exported content.

## Compatibility and errors

| Case | Result | AR Ref |
| --- | --- | --- |
| Existing bulk consumer | Envelope preserved; new closed item codes/not-attempted state are additive | AR-3 |
| Import manifest contains password hash | Validation error before transaction | AR-3 |
| SDK requests unsupported export entity | Type-level and runtime rejection | AR-3 |
| Foreign tenant scope | Same not-found/not-authorized public result; zero target mutation/disclosure | AR-3 |
| Oversized export | Stable `export_too_large`; no output body with partial data | AR-3 |

## Testing requirements

- Exact positive and negative specification matrices for bulk, all import modes, and each export
  entity/format.
- Transaction rollback, lock/concurrency, infrastructure-stop, dry-run, credential-once, and
  migration compatibility implementation tests.
- Raw HTTP plus packed SDK/CLI journeys with independent database/output observations.
