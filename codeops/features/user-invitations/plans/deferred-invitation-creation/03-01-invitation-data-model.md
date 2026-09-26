# Invitation Data Model: Deferred Invitation Creation

> **Document**: 03-01-invitation-data-model.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the invitation storage change and the transactional acceptance primitive. The
invitation becomes an email/org-keyed token that can exist without a user, and the acceptance
transaction is the only place a user is created from an invitation.

## Architecture

### Current Architecture

`invitation_tokens` has a `NOT NULL` foreign key to `users`, so an invitation cannot exist without
an account. Tenant authority is derived by joining `users` on the token's `user_id`. The invite
route inserts the user and token as separate statements; acceptance updates the existing user.

### Proposed Changes

| Change | Detail |
| ------ | ------ |
| `user_id` | Nullable; populated at acceptance for traceability |
| `organization_id` | New, `NOT NULL`, FK to `organizations(id) ON DELETE CASCADE` |
| `email` | New `CITEXT`, `NOT NULL`; the invited address |
| `given_name`, `family_name` | New `VARCHAR(255)` profile snapshot |
| `locale` | New `VARCHAR(10)` profile snapshot |
| Live-invite uniqueness | Partial unique index on `(organization_id, email) WHERE used_at IS NULL` |
| Tenant lookup | `findValidInvitationToken` matches `organization_id` directly, no `users` join |
| Acceptance | One transaction locks the invitation, creates the user, links and consumes the token |

## Implementation Details

### Migration `033_invitation_deferred_user_creation.sql`

Up:

```sql
ALTER TABLE invitation_tokens
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN email CITEXT,
  ADD COLUMN given_name VARCHAR(255),
  ADD COLUMN family_name VARCHAR(255),
  ADD COLUMN locale VARCHAR(10);

UPDATE invitation_tokens AS token
   SET organization_id = account.organization_id,
       email = account.email
  FROM users AS account
 WHERE account.id = token.user_id
   AND token.organization_id IS NULL;

ALTER TABLE invitation_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE invitation_tokens ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE invitation_tokens ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX idx_invitation_active_email
  ON invitation_tokens (organization_id, email)
  WHERE used_at IS NULL;
```

The `WHERE` clause of the partial index covers only live rows (`used_at IS NULL`); replaced or
accepted invitations are excluded. Expired-but-unused rows still count as live, so the replace flow
must mark them used before inserting a new one (see below).

Down (documented limitation: refuses if any invitation has `user_id IS NULL`):

```sql
DROP INDEX IF EXISTS idx_invitation_active_email;
DELETE FROM invitation_tokens WHERE user_id IS NULL;
ALTER TABLE invitation_tokens ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invitation_tokens
  DROP COLUMN locale, DROP COLUMN family_name, DROP COLUMN given_name,
  DROP COLUMN email, DROP COLUMN organization_id;
```

### New Types

`packages/server/src/auth/token-repository.ts`:

```ts
/** Invitation token record as used after deferral. `userId` is null until acceptance. */
export interface DeferredInvitationTokenRecord {
  id: string;
  userId: string | null;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  details: Record<string, unknown> | null;
  invitedBy: string | null;
  organizationId: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  locale: string | null;
}

/** Input for creating (and replacing) an invitation. */
export interface InsertInvitationInput {
  organizationId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  givenName?: string | null;
  familyName?: string | null;
  locale?: string | null;
  details?: Record<string, unknown> | null;
  invitedBy?: string | null;
}
```

### New and Changed Functions

> **Phasing:** Phase 1 adds the deferred `replaceInvitation`, `findDeferredInvitationToken`,
> `lockValidInvitationForUpdate`, and `consumeInvitation` functions and a nullable-`userId`
> deferred record alongside the legacy user-joined `InvitationTokenRecord`,
> `findValidInvitationToken`, and `insertInvitationToken`, so route consumers keep compiling and
> every phase can be committed. Phase 2 switches routes and tests to the deferred API, renames
> `findDeferredInvitationToken` to `findValidInvitationToken` and the deferred record to
> `InvitationTokenRecord`, and removes the legacy lookup, record, and `insertInvitationToken`.
> `typecheck` runs in both phase gates.

`auth/token-repository.ts`:

- `replaceInvitation(input): Promise<{ id: string }>` — one transaction: marks every live or expired
  invitation for `(organization_id, email)` used, then inserts the new row with `user_id = NULL`.
  Guarantees at most one live invitation per email; a concurrent insert conflict surfaces as a
  replace conflict (see Error Handling).
- `findDeferredInvitationToken(tokenHash, organizationId): Promise<DeferredInvitationTokenRecord | null>`
  — direct `organization_id` match; no `users` join. Renamed to `findValidInvitationToken` in Phase 2.
- `lockValidInvitationForUpdate(client, tokenHash, organizationId): Promise<DeferredInvitationTokenRecord | null>`
  — `SELECT ... WHERE used_at IS NULL AND expires_at > NOW() ... FOR UPDATE`.
- `consumeInvitation(client, invitationId, userId): Promise<boolean>` — sets `user_id` and
  `used_at = NOW()` only when still unused.

`users/repository.ts`:

- `insertUserWithClient(client, data): Promise<User>` — the existing insert body, extracted so it can
  run inside the accept transaction; `insertUser` delegates to it with a pooled client.
- `emailExistsWithClient(client, organizationId, email): Promise<boolean>` — tenant-scoped existence
  check inside the transaction.

### New Module `users/invitation-service.ts`

`acceptInvitation` owns the transaction:

```ts
/**
 * Create the user for one valid invitation and consume it atomically.
 *
 * @returns The created user id and email, or null for every invalid/expired/used/conflicting case.
 */
export async function acceptInvitation(input: {
  tokenHash: string;
  organizationId: string;
  password: string;
}): Promise<{ userId: string; email: string } | null>;
```

Sequence:

1. `validatePassword` and `hashPassword` before opening the transaction.
2. `BEGIN`; `lockValidInvitationForUpdate`; roll back and return `null` when no row.
3. `emailExistsWithClient`; roll back and return `null` when a user already exists (generic
   rejection, AR-8).
4. `insertUserWithClient` with `emailVerified: true`, the hashed password, and the invitation's
   profile snapshot.
5. `consumeInvitation`; roll back on `false`.
6. `COMMIT`; then `cacheUser` and write the `user.created` audit event.

Pre-assignment application stays in the route after acceptance (best-effort, AR-15).

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Token not found, expired, used, or foreign tenant | Return `null`; route renders `invite-expired` and audits `user.invite.failed` | AR-9, AR-16 |
| Email already a user at acceptance | Return `null` (generic); audit as failed | AR-8 |
| Two concurrent accepts | Row lock serializes them; loser finds `used_at` set and returns `null` | AR-10 |
| Two concurrent invites for the same email | The replace transaction serializes on the live invitation; the loser maps the unique-index violation to the invite route's replace conflict (`409`), never a 500 | AR-6, AR-10 |
| Unique constraint on insert | Catch and return `null`; never a 500 | AR-10 |
| Password fails validation | `UserValidationError` before the transaction; route shows the existing message | AR-11 |
| `invitation_ttl` missing/corrupt | Existing `getSystemConfigNumber` behavior is unchanged; no fallback added | AR-12 |

> **Traceability:** Every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Unit: repository mapping, `replaceInvitation` marks previous rows used, `lockValidInvitationForUpdate`
  predicates, `consumeInvitation` single-use.
- Integration: acceptance creates exactly one user; concurrent double-submit creates one user;
  re-invite invalidates the previous token; no user row exists before acceptance or after expiry.
- Migration: `033` produces the expected columns and live-invitation index.
