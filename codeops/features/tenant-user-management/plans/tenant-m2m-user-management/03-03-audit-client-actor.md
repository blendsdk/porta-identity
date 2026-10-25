# Audit and Client Actor: Tenant-Scoped M2M User Management

> **Document**: 03-03-audit-client-actor.md
> **Parent**: [Index](00-index.md)

## Overview

Porta's audit log currently models only a user actor. A pure M2M call has no user account: the OAuth client is the principal. This component adds first-class client attribution, sets the target `user_id` on user events, makes mutation audit durable, and adds read audit for the new tenant user surface.

## Architecture

### Current Architecture

`audit_log` has `organization_id`, `user_id`, `actor_id`, event fields, metadata, IP, user agent, and timestamp (`packages/server/migrations/009_audit_log.sql:5-17`). `actor_id` is a nullable FK to `users`. The compatibility writer (`lib/audit-log.ts:46-76`) inserts rows and swallows failures; the transaction writer (`:88-111`) propagates failures. The existing tenant invite audit uses `actor_id=null` and metadata `serviceClientId` (`users/invite-service.ts:334-348`).

### Proposed Changes

- Add `actor_type`, `actor_client_id`, and `actor_client_name` to `audit_log`.
- Add a shared `AuditActor` union and write it through `AuditLogEntry`.
- Backfill existing service events and target user IDs.
- Make create/update/delete/lifecycle/role/invite mutations transaction-bound with `writeAuditLogInTransaction`.
- Add `user.read` and `user.listed` events for tenant reads.
- Return the new actor fields through the audit API, entity history, SDK, and CLI.

## Implementation Details

### Migration `034_audit_client_actor.sql`

```sql
ALTER TABLE audit_log
  ADD COLUMN actor_type VARCHAR(20),
  ADD COLUMN actor_client_id VARCHAR(255),
  ADD COLUMN actor_client_name VARCHAR(255);

-- Existing service-client events are identifiable from the invite metadata.
UPDATE audit_log
SET actor_type = 'client',
    actor_client_id = metadata->>'serviceClientId',
    actor_client_name = NULLIF(metadata->>'serviceClientName', '')
WHERE actor_id IS NULL
  AND metadata->>'actorKind' = 'service'
  AND metadata->>'serviceClientId' IS NOT NULL;

-- Existing rows with a live actor_id become user. Rows whose actor user was deleted have
-- actor_id NULL and become system; this historical classification is accepted.
UPDATE audit_log
SET actor_type = CASE
  WHEN actor_type IS NULL AND actor_id IS NOT NULL THEN 'user'
  WHEN actor_type IS NULL THEN 'system'
  ELSE actor_type
END;

-- Make user-entity history useful for historical rows. Only link users that still exist;
-- a deleted user's historical metadata must not violate the user_id foreign key.
UPDATE audit_log AS audit
SET user_id = (audit.metadata->>'userId')::uuid
WHERE audit.user_id IS NULL
  AND audit.metadata->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (audit.metadata->>'userId')::uuid
  );

ALTER TABLE audit_log
  ALTER COLUMN actor_type SET NOT NULL,
  ADD CONSTRAINT audit_log_actor_shape CHECK (
    (actor_type = 'client' AND actor_id IS NULL AND actor_client_id IS NOT NULL)
    OR (actor_type = 'user' AND actor_client_id IS NULL)
    OR (actor_type = 'system' AND actor_id IS NULL AND actor_client_id IS NULL)
  );

CREATE INDEX idx_audit_log_actor_client
  ON audit_log(actor_client_id, created_at DESC)
  WHERE actor_client_id IS NOT NULL;
```

The down migration drops the index, constraint, and columns. The user-actor branch intentionally
allows `actor_id` to become null when the actor user is later deleted, because the existing FK is
`ON DELETE SET NULL`; the row still retains `actor_type='user'` as historical attribution.

**Operational note:** this is not an additive-only migration. In one migration transaction it adds
columns, updates every audit row to set `actor_type`, backfills `user_id`, and applies `SET NOT NULL`.
PostgreSQL holds an `ACCESS EXCLUSIVE` lock for the duration, so deployment requires a documented
maintenance window, a verified pre-migration backup, and post-migration verification. Historical
rows whose actor user was deleted have `actor_id` NULL and cannot be distinguished from system rows;
they are classified `system`. This accepted historical limitation does not affect future actor
deletions, which retain `actor_type='user'`. The UUID regex is a format guard before the cast; the
migration test must cover valid/invalid metadata, a live actor-user deletion, and the accepted
historical deleted-actor classification. If the project prefers `pg_input_is_valid`, use it on
PostgreSQL 16 instead of the regex. The migration must not rewrite applied migrations.

### Audit Actor Contract

```typescript
export type AuditActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'service'; readonly clientId: string; readonly clientName: string }
  | { readonly kind: 'system' };
```

`AuditLogEntry` gains optional `actorType`, `actorClientId`, and `actorClientName`. The writer normalizes:

- `actorType` explicit, or `user` when `actorId` is set, or `client` when `actorClientId` is set, or `system`.
- For client actors, `actorId` must remain null.
- For user actors, `actorClientId` must remain null.
- The SQL insert includes the three new columns.

A small helper maps a `TenantActor` to an `AuditActor`:

```typescript
export function tenantActorToAuditActor(actor: TenantActor): AuditActor {
  return actor.kind === 'service'
    ? { kind: 'service', clientId: actor.clientId, clientName: actor.clientName }
    : { kind: 'user', userId: actor.userId };
}

export function inviteActorToAuditActor(actor: InviteActor): AuditActor {
  if (actor.kind === 'service' && actor.clientId) {
    return { kind: 'service', clientId: actor.clientId, clientName: actor.displayName };
  }
  return actor.userId ? { kind: 'user', userId: actor.userId } : { kind: 'system' };
}
```

`InviteActor` remains the invitation workflow contract because it carries `displayName` for the
invitation email and `permissions` for the delegation ceiling. Do not force `AuditActor` onto
`inviteUser`; map the actor at the audit boundary. Admin invitations map to a `user` audit actor,
service invitations to a `client` actor, and a missing user ID to `system`.

### Mutation Coverage

| Service / path | Event | Target `user_id` | Durability |
| --- | --- | --- | --- |
| `createUser` | `user.created` | New user | `runDatabaseTransaction` + `writeAuditLogInTransaction` |
| `updateUser` | `user.updated` | Updated user | Same |
| `deactivateUser` | `user.deactivated` | Target user | Same |
| `activateUser` | `user.activated` | Target user | Same |
| `deleteUser` | `user.deleted` | Target user (FK may null after delete) | Service-owned `runDatabaseTransaction` + transaction writer |
| `assignRolesToUser` | `user.roles.assigned` | Target user | Service-owned `runDatabaseTransaction`; convert the current best-effort `writeAuditLog` to `writeAuditLogInTransaction` |
| `removeRolesFromUser` | `user.roles.removed` | Target user | Service-owned `runDatabaseTransaction` + transaction writer |
| `inviteUser` | `user.invited` | No user yet; invite ID in metadata | Service-owned `runDatabaseTransaction`; email after commit |
| `acceptInvitation` | `user.created` | New user | Existing best-effort after-commit flow; outside this plan's mutation scope and documented as such |

Tenant routes are not under `adminMutationAudit`; the mutation services own the transaction boundary
and nested calls reuse the Admin transaction. The services accept an `AuditActor` at the audit
boundary instead of an optional actor ID. Admin routes pass `{ kind: 'user', userId:
ctx.state.adminUser.id }`; tenant routes pass `{ kind: 'service', clientId, clientName }`; the CLI
bootstrap uses `{ kind: 'system' }`. `inviteUser` keeps `InviteActor` and maps it with
`inviteActorToAuditActor`.

The target `user_id` must be set on every event that has a target user; invitations have no user
yet and record the invitation ID. Metadata continues to hold email, changed fields, role IDs, and
deletion details. Mutations and their audit rows commit together; if the audit insert fails, the
mutation rolls back.

Cache side effects must move behind `afterDatabaseCommit`: a rolled-back create must not leave a cached user, and a rolled-back update/lifecycle change must not leave stale or new cache state. The existing user cache calls in `users/service.ts` are therefore converted to post-commit effects while the database mutation and audit row remain inside the transaction.

### Read Audit

Tenant `GET /:userId` writes `user.read`:

```json
{
  "eventType": "user.read",
  "eventCategory": "security",
  "actorType": "client",
  "actorClientId": "acme-bff",
  "actorClientName": "Acme BFF",
  "userId": "<target-user>",
  "metadata": { "source": "tenant-user-api" }
}
```

Tenant `GET /` writes `user.listed`:

```json
{
  "eventType": "user.listed",
  "eventCategory": "security",
  "actorType": "client",
  "actorClientId": "acme-bff",
  "actorClientName": "Acme BFF",
  "organizationId": "<tenant-org>",
  "metadata": {
    "source": "tenant-user-api",
    "page": 1,
    "pageSize": 20,
    "search": "optional",
    "status": "active",
    "sortBy": "created_at",
    "sortOrder": "desc",
    "resultCount": 20
  }
}
```

List metadata must never include the returned user IDs or profile values. Read audit uses `writeAuditLog` (best-effort) and never fails the read. Role-list and effective-permission reads are not audited in this slice.

### Direct Audit Inserts

Update every source insert that bypasses `writeAuditLog`:

- `packages/server/src/auth/token-repository.ts:649-664`: set `actor_type='user'`, `actor_id=token.userId` for the magic-link login row.
- `packages/server/src/lib/data-export.ts:238-255`: set `actor_type='user'`, `actor_id=options.actorId`; the function already returns when no actor is present.
- Any test/fixture direct insert must include `actor_type` or use the new central test-side audit insert helper; do not add a database default that could misclassify actors. Update the existing direct inserts listed in [02-current-state](02-current-state.md) and the writer unit test's SQL parameter expectations.

### API, SDK, and CLI

- `routes/audit.ts` selects and maps `actor_type`, `actor_client_id`, `actor_client_name`.
- `lib/entity-history.ts` returns the same fields for user history.
- `sdk/types/audit.ts` adds `actorType`, `actorClientId`, `actorClientName`.
- `sdk/types/common.ts` `HistoryEntry` adds the same fields.
- `cli/commands/audit.ts` displays `actorClientName (actorClientId)` for clients, `actorId` for users, or `—`.
- `cli/admin/user-service.ts` maps the client actor to a readable label instead of `System`.

### Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Audit insert fails during a mutation | Roll back the mutation; return the existing sanitized server error | AR-16 |
| Audit insert fails during a read | Log a bounded warning; return the read result | AR-13 |
| Client actor has no client ID | Reject at the writer boundary; never write an anonymous client row | AR-14 |
| Backfill metadata lacks a client name | Store null; display the client ID | AR-21 |
| Backfill `userId` is malformed | Leave `user_id` null; do not fail the migration | AR-21 |
| Historical row's actor user was deleted | Classify `system`; this accepted limitation does not affect future deletions, which retain `user` | AR-21 |
| Migration/backfill fails or the lock window is exceeded | Abort; restore the verified backup; rerun in a new maintenance window | AR-21 |
| User delete makes `user_id` null | Preserve metadata and client actor; the org audit row remains | AR-12 |

## Testing Requirements

- Migration test: columns/constraint/index exist; valid backfill; malformed metadata does not fail; a historical row whose actor user was deleted becomes `system`; a future actor deletion retains `actor_type='user'`; down migration.
- Unit tests: actor normalization, writer SQL parameter order, API mapping, CLI formatting; update the existing writer mocks and service/invite/role tests that assume the old writer.
- Integration tests: every tenant mutation writes the expected actor and target; audit failure rolls back create/update/delete/lifecycle/roles/invite; tenant delete/role transactions commit or roll back correctly; read audit failure does not block reads.
- Pentest tests: client actor cannot be forged as a user; no client secret in audit metadata.
- Compatibility tests: exact SDK input contracts and audit/history display.

## Traceability

- AR-13, AR-14, AR-15, AR-16, AR-21, AR-22.
- Requirements R10, R11, R16, R18.
