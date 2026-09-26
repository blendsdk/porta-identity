# Current State: Deferred Invitation Creation

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The invite flow is split across two route modules:

- The admin invite route `POST /api/admin/organizations/:orgId/users/invite` validates the request,
  rejects an existing email with `409`, creates the user immediately, inserts an invitation token
  with JSONB `details`, sends the email, and returns `{ userId, email, created, invitationSent,
  expiresAt }`.
- The public accept routes `GET`/`POST /:orgSlug/auth/accept-invite/:token` validate the token by
  hash plus a `users` join for tenant authority, then set the password, mark the email verified,
  mark the token used, and apply pre-assignments.

`invitation_tokens.user_id` is `NOT NULL REFERENCES users(id)`, so the token cannot exist without a
user. This is the root of the stale-account behavior (AR-2).

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `packages/server/src/routes/users.ts` | Invite + preview routes, schemas, pre-assignment validation | Stop creating the user; email/org-keyed insert; new response shape; replace pending invite |
| `packages/server/src/routes/invitation.ts` | Accept-invite GET/POST handlers | Confirmation step; create user transactionally from the invitation |
| `packages/server/src/auth/token-repository.ts` | Invitation token insert/find/consume | New record shape and email/org lookup; transactional consume |
| `packages/server/src/users/invitation-service.ts` | New acceptance module | Owns the create-user-and-consume transaction (`acceptInvitation`); `users/service.ts` keeps its existing exports |
| `packages/server/src/users/repository.ts` | `insertUser`, `findUserByEmail`, password lookup | Transaction-aware insert helper for the accept transaction |
| `packages/server/src/lib/system-config-catalog.ts` | `invitation_ttl` default `604800` | No change — default stays 7 days (AR-12) |
| `packages/server/migrations/030_global_configuration_catalog.sql` | Seeds `invitation_ttl=604800` | Do not edit; migration 033 does not change the TTL seed (AR-12) |
| `packages/server/templates/default/pages/accept-invite.hbs` | Password form | Keep; shown after confirmation |
| `packages/server/locales/default/en/invitation.json` | Invitation strings | Add confirmation title/description/button |
| `packages/sdk/src/types/users.ts` | `InviteUserResult` | New result shape |
| `packages/cli/src/commands/user.ts` | `porta user invite` output | New result fields |
| `packages/cli/src/admin/user-service.ts` | Admin invite response validator | New result shape |
| `docs/api/users.md` | Invite contract and lifecycle note | Rewrite invite section |

### Code Analysis

Invite route (current), `packages/server/src/routes/users.ts:487`:

```ts
const existingUser = await userService.getUserByEmail(orgId, body.email);
if (existingUser) { ctx.status = 409; ctx.body = { error: 'User already exists in this organization' }; return; }
const user = await userService.createUser({ organizationId: orgId, email: body.email, ... });
await insertInvitationToken(user.id, hash, expiresAt, details, adminUser.id);
```

Accept route (current), `packages/server/src/routes/invitation.ts:276`:

```ts
await setUserPassword(tokenRecord.userId, password);
await markEmailVerified(tokenRecord.userId);
await markTokenUsed('invitation_tokens', tokenRecord.id);
await applyPreAssignments(tokenRecord, org.id);
```

Token tenant authority (current), `packages/server/src/auth/token-repository.ts:741`:

```sql
FROM invitation_tokens AS token
JOIN users AS account ON account.id = token.user_id
WHERE token.token_hash = $1 AND account.organization_id = $2
```

Because the token requires a user, the join is the only way to know the tenant. Removing the user
from invite time requires storing `organization_id` on the token itself (AR-3, AR-9).

Documentation already describes the intended model and drifts from the code:

- `docs/api/users.md:148` — "Invitation is a token flow, not a status: a freshly invited user is
  created `active` and sets a password on accepting."
- `docs/api/users.md:60` — claims `200 OK (existing user re-invited)`, but the route returns `409`.

## Gaps Identified

### Gap 1: Stale accounts from unaccepted invitations

**Current Behavior:** An invite creates an `active` user with no password; it stays forever if the
invitation is never accepted, and no cleanup command or worker exists.
**Required Behavior:** No user exists until acceptance (R1).
**Fix Required:** Email/org-keyed invitation storage and creation at acceptance (03-01, 03-02).

### Gap 2: The invitation must carry everything the user needs

**Current Behavior:** Profile fields live on the pre-created user; `details` stores only
pre-assignments and message metadata.
**Required Behavior:** The invitation stores the profile snapshot so acceptance can create the user.
**Fix Required:** Add `organization_id`, `email`, `given_name`, `family_name`, `locale` columns
(AR-4).

### Gap 3: Single-use under two stores

**Current Behavior:** Accept performs separate statements; the user already exists, so replay is
naturally blocked by the account.
**Required Behavior:** With the user created at acceptance, the transaction itself must guarantee
single use and no duplicate account (AR-10).
**Fix Required:** Lock the invitation row, re-check, insert user, link and consume, commit.

### Gap 4: Result contract assumes a created user

**Current Behavior:** `InviteUserResult` exposes `userId` and `created`.
**Required Behavior:** No user exists at invite time (AR-7).
**Fix Required:** New result shape across server, SDK, CLI, Admin UI, and tests.

### Gap 5: Documentation drift

**Current Behavior:** Docs describe create-at-invite; `invitation_ttl` defaults to 7 days and the
seeded value is applied by migration 030.
**Required Behavior:** Docs match deferral; the 7-day default is unchanged (AR-12, AR-22).
**Fix Required:** Documentation updates only; migration 033 does not change the TTL seed.

## Dependencies

### Internal Dependencies

- `packages/server/src/lib/system-config.ts` (`getSystemConfigNumber`) for `invitation_ttl`.
- `packages/server/src/auth/tokens.ts` (`generateToken`, `hashToken`).
- `packages/server/src/auth/email-service.ts` (`sendInvitationEmail`).
- `packages/server/src/lib/database.ts` pool/client for the accept transaction.
- Existing UI invitation fixture (`packages/server/tests/ui/fixtures/db-helpers.ts:287`).

### External Dependencies

- PostgreSQL (schema and transaction), Redis and MailHog for integration/UI/assurance runs (already
  required by the repository's verification commands).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| A missed acceptance-conflict branch creates a duplicate or exposes account state | Low | High | Generic expired page for every failure; unique `(organization_id, email)` constraint; spec tests first |
| Existing tests assume an invited user exists (UI fixtures, acceptance tests) | High | Medium | Inventory captured in 07; update fixtures and tests in the same phases |
| `assurance:compat` requires a clean committed revision | Medium | Medium | Run it as a dedicated committed checkpoint in the verification phase |
| Docs/CI structure tests assert migration/doc lists | Medium | Low | Update `docs/` and run `yarn test:structure` before commits |
