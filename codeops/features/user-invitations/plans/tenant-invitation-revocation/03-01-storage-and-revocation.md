# Storage and Revocation

> **Parent**: [Index](00-index.md)
> **Authority**: AR #2, #5–9

## Ownership schema

Add `packages/server/migrations/036_invitation_application_owner.sql`: nullable `invitation_tokens.application_id UUID REFERENCES applications(id) ON DELETE SET NULL`. Existing rows remain NULL. No default/backfill, expiry rewrite, unused-index change or new worker. Down drops this column and its FK only (AR #7).

Extend `InsertInvitationInput` with optional `applicationId?: string | null`. Insert it as a parameter, defaulting to null. `inviteUser` passes `allowedApplicationId ?? null` derived from authenticated caller; do not trust any client-supplied field/details/roles as ownership. Existing admin callers omit the boundary and remain null-owned (AR #2).

Do not extend exported invitation-read records just for revocation: the new service can use a scoped update directly and needs only the returned id. This avoids unrelated fixture churn (AR #9).

## Revocation transaction

New `packages/server/src/users/invitation-revocation-service.ts` exports:

```typescript
interface RevokeInvitationOptions {
  organizationId: string;
  applicationId: string;
  invitationId: string;
  actor: AuditActor;
  auditContext?: AuditRequestContext;
}
function revokeInvitation(options: RevokeInvitationOptions): Promise<void>;
```

Use `runDatabaseTransaction` and its routed `getPool().query` plus `getDatabaseTransactionClient`. One conditional `UPDATE invitation_tokens SET used_at = NOW() WHERE id=$1 AND organization_id=$2 AND application_id=$3 AND user_id IS NULL AND used_at IS NULL AND expires_at > NOW() RETURNING id` (AR #5/#6).

If no row returns, commit a no-op without querying why it failed. If one returns, call `writeAuditLogInTransaction` with existing actor/context helpers, `eventType: 'user.invite.revoked'`, `eventCategory: 'admin'`, fixed description `User invitation revoked`, metadata `{invitationId, applicationId}`. Do not attach email, hash, token, recipient or result classification. No post-commit effect or automatic retry. Audit/query error propagates for sanitized global handling; transaction rollback preserves original authority (AR #6).

## Concurrency

The UPDATE row lock serializes against existing acceptance `SELECT FOR UPDATE`. First operation to obtain the relevant row lock and commit wins; rollback does not win. Revocation first makes acceptance find no valid row and creates no user. Acceptance first leaves `user_id`/`used_at` changed, so revocation does nothing. Concurrent duplicate revocations yield one actual update/audit. Existing PostgreSQL transaction-time `NOW()` semantics remain unchanged (AR #5).

Revoke-by-id never addresses a replacement row. No email-based mutation, advisory locks, new mutex, token status, cache invalidation or schema redesign (AR #1/#5/#9).

## Rollout and rollback

Apply migration before enabling new code; upgrade every instance before promising complete ownership capture. Old writers continue inserting null while new writers set ownership, so their invitations are safely not tenant-revocable. Existing acceptance works throughout. Application deletion clears ownership and preserves link lifetime. On code rollback, leave the additive column unless a full downgrade is necessary. Stop/roll back all feature writers before optional down migration; dropping it destroys ownership and a later up migration cannot reconstruct it (AR #7).

Use the existing controlled maintenance procedure for DDL: drain active invitation transactions before migration 036, and verify its ledger entry plus nullable FK/schema afterward before enabling feature writers. ALTER TABLE requires an exclusive lock; additive/no-backfill does not promise zero-downtime application. Take a verified database backup before an ownership-destroying down migration (PF-008). No new deployment machinery is authorized.
