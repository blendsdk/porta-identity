# Accept Flow and Routes: Deferred Invitation Creation

> **Document**: 03-02-accept-flow-and-routes.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the HTTP behavior: the admin invite route stops creating users, and the public
accept-invite routes gain a non-mutating confirmation step before the password form. Acceptance
delegates to `acceptInvitation` (03-01) and then applies pre-assignments.

## Architecture

### Current Architecture

- `POST /api/admin/organizations/:orgId/users/invite` creates the user, then the token.
- `GET /:orgSlug/auth/accept-invite/:token` validates the token and renders the password form.
- `POST /:orgSlug/auth/accept-invite/:token` updates the existing user and consumes the token.

### Proposed Changes

| Route | Change |
| ----- | ------ |
| `POST .../users/invite` | Insert an email/org-keyed invitation; no user; new response shape |
| `GET .../accept-invite/:token` | Render a confirmation page; `?step=password` renders the password form |
| `POST .../accept-invite/:token` | Create the user transactionally, then apply pre-assignments, then audit |

## Implementation Details

### Invite Route — `packages/server/src/routes/users.ts`

1. Keep `inviteUserSchema` and `validatePreAssignments` unchanged.
2. Keep the existing-user check and `409` response.
3. Build `details` exactly as today (`personalMessage`, `roles`, `claims`, `inviterName`).
4. Read `expiresAt` from `getSystemConfigNumber('invitation_ttl')`.
5. Call `replaceInvitation({ organizationId, email, tokenHash, expiresAt, givenName, familyName,
   locale, details, invitedBy })`; the returned `id` is the `invitationId`.
6. Keep the absolute `inviteUrl` built from `config.issuerBaseUrl` and `sendInvitationEmail`.
7. Write `user.invited` with `userId` omitted, `actorId: adminUser.id`, and metadata
   `{ invitationId, hasPersonalMessage, preAssignedRoles, preAssignedClaims }`.
8. When `replaceInvitation` reports a concurrent replace conflict, respond `409` and insert nothing.
9. Respond `201` with `{ data: { invitationId, email, invitationSent: true, expiresAt } }`.

### Accept GET — `packages/server/src/routes/invitation.ts`

1. Resolve token hash and call `findValidInvitationToken(tokenHash, org.id)`.
2. If null, render `invite-expired` and audit `user.invite.failed` (unchanged).
3. Also render `invite-expired` and audit when `getUserByEmail(org.id, invitation.email)` already
   returns a user (AR-8). The page and audit must be identical to the invalid-token case.
4. When `ctx.query.step === 'password'`, render `accept-invite` (the existing password form) with the
   invitation's email pre-filled and `orgName: branding.companyName`.
5. Otherwise render the new `confirm-invite` page with `orgName`, `inviterName` from `details` when
   present, and an "accept" link to `?step=password`. No token is consumed and no row is written.

### Accept POST — `packages/server/src/routes/invitation.ts`

1. Keep the CSRF check, token re-validation, password-match check, and strength validation.
2. On any invalid token or email conflict, render `invite-expired` and audit `user.invite.failed`
   (identical for every cause).
3. Call `acceptInvitation({ tokenHash, organizationId: org.id, password })`.
4. When it returns `null`, render `invite-expired` and audit as failed.
5. On success, call `applyPreAssignments(tokenRecord, org.id, userId)` — the existing best-effort
   role/claim application with the new user id.
6. Write `user.invite.accepted` with the new `userId` and the pre-assignment counts (unchanged shape).
7. Render `invite-success` (unchanged).

`applyPreAssignments` keeps its current logic but takes the created `userId` instead of reading
`tokenRecord.userId`.

### Templates and Locales

New page `packages/server/templates/default/pages/confirm-invite.hbs`:

- Displays the organization name and the invitation description.
- Renders an anchor/button to `?step=password`.
- Performs no form submission and carries no state-changing action.

New keys in `packages/server/locales/default/en/invitation.json`:

```json
{
  "confirm_title": "You've been invited",
  "confirm_description": "You've been invited to join {{orgName}}. Continue to set your password and activate your account.",
  "confirm_button": "Accept invitation"
}
```

The password form keeps its existing keys; pass `orgName` on both GET renders so the existing
`invitation.description` string resolves correctly.

### Email

The invite URL is unchanged (`inviteUrl`). `sendInvitationEmail` currently requires a recipient with
a `users.id` (`EmailUser.id`) and records that id in the `email.send.invitation` audit row, whose
`user_id` is a foreign key to `users`. Deferral has no user to pass, so the invitation recipient type
gains an optional `id`: when it is absent, the writer omits `userId` (SQL NULL) and adds
`invitationId` to the audit metadata. The email template, subject, and URL are otherwise unchanged,
and the invite-preview route stops passing a placeholder user id.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Invalid/expired/used/foreign token on GET or POST | `invite-expired` page, HTTP 400, `user.invite.failed` audit | AR-16 |
| Email already a user at GET or POST | Same generic `invite-expired` page and audit | AR-8 |
| CSRF mismatch | Existing error re-render with HTTP 403 | AR-16 |
| Password mismatch/weak | Existing error re-render on the password form | AR-11 |
| `acceptInvitation` throws unexpectedly | Existing catch renders the generic error; no details leak; audit remains failed | AR-10 |
| Existing user invited | `409`, no invitation inserted | AR-5 |
| Two concurrent invites for the same email | One live invitation; the loser returns `409` (replace conflict) | AR-6, AR-10 |

### Rate Limiting

No new rate limiter is added to the accept routes. This matches the existing invitation,
magic-link, and password-reset routes: the token is 256-bit random, single-use, and TTL-bounded,
so online guessing is infeasible. The only behavioral change is that GET no longer renders the
password form directly; it remains non-mutating and CSRF-protected on POST. Adding a limiter would
be new support surface without a demonstrated risk and was excluded (AR-23).

> **Traceability:** Every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Unit: invite response shape; no `createUser` call; replace called; GET confirmation vs password
  step; GET does not call acceptance; POST success path; every failure renders `invite-expired`.
- Integration: invite then accept creates the user; invite then never accept leaves zero users;
  re-invite invalidates the old link; pre-assignments applied at acceptance.
- UI: confirmation page visible first; password form only after confirmation; full accept flow.
