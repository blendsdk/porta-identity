# Requirements: Deferred Invitation Creation

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

An invitation is an offer, not an account. This feature changes the invite flow so that no user
record is created until the recipient accepts the invitation and sets a password. The invitation
itself is stored in the existing `invitation_tokens` token flow, keyed by organization and email,
with a single-use hashed token and a configurable lifetime (default 7 days). Accepting the
invitation creates the user, applies the pre-assigned roles and claims, and consumes the token in
one transaction. Expired or unaccepted invitations leave only an inert token row, so no stale user
account ever requires administrator cleanup.

## Functional Requirements

### Must Have

- [ ] R1 — Inviting an email that has no user records the invitation (`organization_id`, `email`,
  profile snapshot, details, hashed token, expiry) and creates **no** user row.
- [ ] R2 — Inviting an email that already has a user in the organization returns `409 Conflict` and
  creates no invitation.
- [ ] R3 — Inviting an email that already has a pending invitation invalidates the previous
  invitation and issues exactly one new one.
- [ ] R4 — The invitation email points at the existing `/:orgSlug/auth/accept-invite/:token` route.
- [ ] R5 — Opening the email link renders a non-mutating confirmation page; it never creates an
  account or consumes the token.
- [ ] R6 — After confirmation, the password form is shown; submitting it with a valid password
  creates the user, marks the email verified, links the invitation to the user, marks the token
  used (single-use), and applies pre-assigned roles and claims.
- [ ] R7 — An expired, used, unknown, foreign-tenant, or email-conflict token renders the existing
  `invite-expired` page and records a `user.invite.failed` audit event, indistinguishable across
  causes.
- [ ] R8 — Invitation validity defaults to 7 days (`604800` seconds, unchanged) and remains
  configurable through the existing `invitation_ttl` global configuration setting.
- [ ] R9 — The invite API returns `{ invitationId, email, invitationSent, expiresAt }`.
- [ ] R10 — The SDK, CLI (`porta user invite`), and Admin UI accept dialog expose the new result
  shape and no longer expect a created user.
- [ ] R11 — Audit records: `user.invited` at invite with `userId` omitted (stored as SQL NULL), and
  `user.created` plus `user.invite.accepted` at acceptance.

### Should Have

- [ ] R12 — Pre-assignment validation remains at invite time, with best-effort application at
  acceptance when a role or claim was deleted in between.

### Won't Have (Out of Scope)

- Listing, inspecting, revoking, or resending pending invitations.
- A new `UserStatus` value or any change to the user lifecycle.
- A Redis-backed invitation store.
- Any new background worker, scheduler, or purge mechanism.
- Import/export of pending invitations.
- Changes to login, magic-link, password-reset, OIDC, or two-factor flows.

## Technical Requirements

### Compatibility

- Existing `invitation_tokens` consumers (`deleteExpiredTokens`, UI test fixtures, pentest) remain
  valid with the widened schema.
- Applied migrations are never rewritten; the change is a new migration `033`.
- The SDK/CLI contract change is a breaking result-shape change recorded in the changelog by the
  release tooling, not hand-edited.

### Security

- Tokens stay 256-bit random, stored only as a SHA-256 hash, single-use, and TTL-bounded.
- Tenant authority is enforced in the lookup itself via `organization_id`; a token presented under
  a different organization slug resolves nothing.
- All acceptance failures render the same generic expired page (enumeration resistance).
- The accept `POST` keeps its CSRF check; the confirmation page performs no writes.
- No secret, token plaintext, or email address is written to logs.
- Pre-assignment inserts remain parameterized SQL with existence checks.

### Non-functional

- Accepting an invitation performs one database transaction for the user insert plus token
  consumption; cache population and audit happen after commit.
- No new dependency, table, worker, or configuration key is introduced.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| -------- | ------------------ | ------ | --------- | ------ |
| Account creation | Defer to acceptance; pending status + purge; Redis | Defer to acceptance | Removes stale accounts by construction; matches "invitation is a token flow" | AR-2 |
| Invitation storage | Reuse `invitation_tokens`; new `invitations` table | Reuse `invitation_tokens` | Smallest surface; existing token flow and housekeeping | AR-3 |
| Profile snapshot | Explicit columns; `details` JSONB | Explicit columns | Clear and queryable | AR-4 |
| Existing user on invite | `409`; re-invite | `409` | Preserves current code; docs corrected | AR-5 |
| Pending re-invite | Replace; allow multiple | Replace | One live link per email | AR-6 |
| Invite result | New shape; optional legacy fields | New shape | No user exists to identify | AR-7 |
| Accept conflict | Generic rejection; merge | Generic rejection | Enumeration-safe; no silent merge | AR-8 |
| Concurrency | Transactional consume; separate statements | Transactional consume | Guarantees single use | AR-10 |
| Confirmation | Confirmation page; keep single form | Confirmation page | User requirement; keeps prefetch harmless | AR-11 |
| Default lifetime | 24h; keep 7 days | Keep 7 days | User reversed the earlier 24h choice; default unchanged | AR-12 |
| Expired rows | No purge worker; add purge | No purge worker | Inert rows; avoids new support surface | AR-17 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Acceptance Criteria

1. [ ] An accepted invitation produces exactly one user with `email_verified=true` and a password.
2. [ ] An unaccepted invitation produces no `users` row, before and after expiry.
3. [ ] Re-invite invalidates the previous link (old token renders `invite-expired`).
4. [ ] A second concurrent acceptance cannot create a second user or reuse the token.
5. [ ] `yarn verify`, `yarn test:ui`, `yarn assurance:harness --project security --profile production-security`,
   and `yarn assurance:compat --select tenant-admin` pass.
6. [ ] All affected documentation is updated and `yarn docs:build` passes.
7. [ ] No dead code remains from the removed create-at-invite path.
