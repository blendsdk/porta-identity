# RBAC Mutations: Roles and Permissions

> **Document**: 03-02-rbac-mutations.md
> **Parent**: [Index](00-index.md)

## Overview

Make existing CRUD and direct mappings application-safe, transactionally revoke only affected
authority, and preserve short request transactions. The implementation extends current repositories,
services, routes, and cleanup primitives without a migration or new subsystem (AR-4, AR-7, AR-9).

## Parent-Qualified Persistence

Every nested read/write accepts the route application UUID and includes it in the SQL predicate.
Role-permission writes lock the role and requested permissions in sorted UUID order, prove every
record belongs to the same application, then apply the complete one-request mutation. User-role
writes lock the target user and requested roles in sorted order. Permission creation validates an
optional module through `(application_id, id)` before insertion (AR-4).

Missing parent-child pairs use sanitized `404`. Foreign modules and mixed-application mappings use
sanitized `400` and create no partial rows. Existing parameterized SQL and Zod UUID/body validation
remain mandatory.

## Authority Revocation

A narrow transaction helper owns the repeated database operations already present in role and
permission deletion:

```ts
revokeAffectedAuthorityInTransaction(
  userIds: readonly string[],
): Promise<{ readonly grantIds: readonly string[] }>
```

It requires the active request transaction, revokes matching Admin sessions, deletes stored grants,
opaque access-token payloads, and refresh-token payloads, and returns identifiers needed by detached
cleanup. It performs no Redis I/O (AR-4, AR-9).

`registerAuthorityCleanup` is added beside the existing deletion cleanup internals with a minimal
immutable descriptor containing affected user/grant IDs and any exact RBAC record keys. It reuses
the existing post-commit hook, detached scheduling, exact-key deletion, and OIDC payload scan. It
does not add retries, persistence, a worker, or a second cleanup service (AR-9).

Reduction paths are user-role removal, role-permission removal, actual ordinary role-slug change,
role deletion, and permission deletion. Each captures/rechecks affected users immediately before
mutation. Name/description-only updates and idempotent removals do not revoke authority. Additions
schedule only affected users' RBAC cache invalidation after commit and never log them out (AR-4,
AR-7).

## Result Contracts

| Operation                                 | HTTP success                                       | SDK value                            |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Role update                               | `200 { data: { role, reauthenticationRequired } }` | `{ role, reauthenticationRequired }` |
| Role delete                               | `200 { data: { reauthenticationRequired } }`       | `{ reauthenticationRequired }`       |
| Permission delete                         | same                                               | same                                 |
| Role-permission remove                    | same                                               | same                                 |
| User-role remove                          | same                                               | same                                 |
| Create/add and permission metadata update | Existing success contract                          | Existing value                       |

Role update always uses its new envelope. A metadata-only or no-op role update returns
`reauthenticationRequired: false`.

The boolean is true only after a committed mutation actually changed the actor's effective
authority. It is false for no-op/idempotent removal. It is derived from captured user IDs, never
from UI inference (AR-7).

## Canonical Survivor and Audit

Every path that can remove an exact canonical `porta-super-admin` holder reuses one narrow
repository-owned survivor primitive extracted from the existing user-deletion query. It locks the
control-plane organization row and requires another active exact holder in the same transaction.
Both user deletion and user-role removal call that same primitive; no second survivor repository or
protection framework is added. Every generic canonical update, deletion, or mapping mutation is
rejected (AR-3–AR-4, AR-15, AR-18).

Routes pass `ctx.state.adminUser.id` to every service mutation. Transactional deletions/reductions
write their resource audit before commit; create/add/update paths retain existing audit flow but
always include the actor. User-role inserts persist the actor as `assigned_by`.

## Error Handling

| Error case                      | Handling                                                                    | AR Ref            |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| Missing nested record           | Sanitized `404`; no mutation                                                | AR-4              |
| Foreign module or mixed mapping | Sanitized `400`; atomic rejection                                           | AR-4              |
| Missing mutation capability     | Sanitized `403` before service work                                         | AR-3–AR-4         |
| Last exact super-admin removal  | Sanitized conflict; transaction rolls back                                  | AR-4              |
| Redis cleanup failure           | Fixed warning without identifiers; committed DB state remains authoritative | AR-4, AR-9        |
| Unknown client outcome          | UI exposes read-only Reload; it never repeats the mutation                  | AR-4, AR-7, AR-14 |

## Testing Requirements

- Repository/service specifications for parent qualification, stable locks, mixed batches, no-ops,
  affected-user capture, and additions.
- Integration specifications for rollback, concurrent survivor removal, database revocation, audit
  actor, and post-commit Redis behavior.
- Route specifications for exact capabilities, status/body shapes, and sanitized failures.
