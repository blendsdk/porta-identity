# Testing Strategy: Deferred Invitation Creation

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --------- | ------ |
| Server invitation logic (routes, service, repository) | 90% |
| SDK/CLI contract surfaces | 80% |
| Templates, locales, docs glue | 60% |

- Test names state behavior: `should [expected behavior] when [condition]`.
- Integration tests cover the invite → accept workflow against PostgreSQL; the UI flow covers the
  browser journey; the retained assurance harness covers production-security behavior.
- Targets follow the project defaults; no change requested.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> These cases derive only from `01-requirements.md`, the `03-XX` specs, and the Ambiguity Register.
> They define expected behavior before implementation. If the implementation disagrees, the
> implementation is wrong — never the expectation.

### Invitation storage and migration

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | Apply migration `033` to a database at `032` | `invitation_tokens` has nullable `user_id`, `NOT NULL organization_id`/`email`, profile columns, and a partial unique index on `(organization_id, email) WHERE used_at IS NULL`; the `invitation_ttl` seed is unchanged at `604800` | R8, AR-3, AR-4 |
| ST-2 | Insert an invitation for a new email | Row has `user_id = NULL`, `organization_id`, `email`, profile snapshot, hashed token, and expiry | R1, AR-3, AR-4 |
| ST-3 | Invite the same email twice | The first invitation is marked used; the second is the only live row; the first token no longer resolves | R3, AR-6 |
| ST-4 | Resolve a valid token under a different organization slug | `null` (no record) | R7, AR-9 |

### Invite API

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-5 | `POST .../users/invite` for an email with no user | `201` with `{ data: { invitationId, email, invitationSent, expiresAt } }`; zero users created; exactly one live invitation | R1, R9 |
| ST-6 | `POST .../users/invite` for an existing user | `409`; no invitation inserted | R2, AR-5 |
| ST-7 | Invite while `invitation_ttl = 3600` | `expiresAt` is approximately now + 3600 s | R8, AR-12 |
| ST-8 | Invite with an unknown role/claim reference | `400`; no invitation inserted | R12, AR-15 |
| ST-9 | Successful invite | Audit `user.invited` has `user_id = NULL`, actor = admin, metadata includes `invitationId` | R11, AR-14 |
| ST-34 | Two concurrent invites for the same email | Exactly one live invitation; the loser receives `409` (replace conflict), never a `500` or a duplicate | R3, AR-6, AR-10 |

### Acceptance

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-10 | `GET .../accept-invite/:token` with a valid token | Confirmation page; zero users; token still unused | R5, AR-11 |
| ST-11 | `GET .../accept-invite/:token?step=password` with a valid token | Password form with the invited email; zero users; token still unused | R6, AR-11 |
| ST-12 | `GET` with an unknown, expired, or used token | `invite-expired`, HTTP 400, `user.invite.failed` audit | R7, AR-16 |
| ST-13 | `GET` with a valid token when a user already exists for the email | `invite-expired`, HTTP 400, `user.invite.failed` audit | R7, AR-8 |
| ST-14 | `GET` with a valid token under a foreign organization slug | `invite-expired`, HTTP 400 | R7, AR-9 |
| ST-15 | Repeated `GET` (confirmation and password step) then a normal accept | Token remains valid; accept succeeds | R5, AR-11 |
| ST-16 | `POST` with a matching valid password | Exactly one user exists with `email_verified = true`, a password hash, and the invitation's profile; success page | R6, AR-10 |
| ST-17 | `POST` twice with the same token | Second call returns `invite-expired`; still exactly one user | R6, AR-10 |
| ST-18 | `POST` with mismatched passwords | Password form error; zero users; token still usable | R6, AR-11 |
| ST-19 | `POST` with a weak password | Password form error; zero users | R6, AR-11 |
| ST-20 | `POST` with an invalid CSRF token | HTTP 403; zero users | R7, AR-16 |
| ST-21 | Two concurrent `POST`s with the same valid token | Exactly one user created; the loser sees `invite-expired` | AR-10 |
| ST-22 | `POST` where a user appeared for the email after invite | `invite-expired`; no duplicate; failure audited | R7, AR-8 |
| ST-23 | `POST` after the invitation expiry passed | `invite-expired`; zero users | R7, AR-12 |
| ST-24 | Accept with pre-assigned roles/claims, one role deleted meanwhile | Acceptance succeeds; existing assignments applied; deleted one skipped | R12, AR-15 |

### No stale accounts

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-25 | Invite then never accept, past expiry | Zero `users` rows for that email; only an inert invitation row | R1, AR-17 |
| ST-26 | Invite then never accept, then re-invite | Exactly one live invitation; zero users | R1, R3 |

### Contracts and security

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-27 | Inspect `InviteUserResult` | Fields are exactly `invitationId`, `email`, `invitationSent`, `expiresAt`; no `userId`/`created` | R9, AR-7 |
| ST-28 | `porta user invite` human and JSON output | Shows the four new fields and never `userId` | R10, AR-19 |
| ST-29 | Admin UI invite success | Shows invitation success; does not load or select a non-existent user | R10, AR-19 |
| ST-30 | Compare rejection pages for unknown vs expired vs foreign tokens | Identical status and page | R7, AR-9 |
| ST-31 | Invite response body | Contains no user identity or profile data | R1, R9 |
| ST-32 | Inspect stored invitation token | Only the SHA-256 hash is stored; the plaintext never appears in logs | Security invariant, AR-9 |
| ST-33 | Existing magic-link and password-reset flows | Unchanged behavior; their tables are untouched | AR-18, AR-23 |

## Test Categories

### Specification Tests (from ST-cases above)

| Test File | ST Cases Covered | Component |
| --------- | ---------------- | --------- |
| `packages/server/tests/unit/routes/invitation-deferral.spec.test.ts` | ST-5..ST-15, ST-18..ST-20, ST-24, ST-34 | Invite + accept GET/POST routes |
| `packages/server/tests/integration/services/invitation-deferred-acceptance.spec.test.ts` | ST-16, ST-17, ST-21..ST-23, ST-25, ST-26 | Transactional acceptance |
| `packages/server/tests/integration/migrations/invitation-deferral.spec.test.ts` | ST-1 | Migration |
| `packages/server/tests/unit/auth/invitation-token-repository.spec.test.ts` | ST-2..ST-4 | Token repository |
| `packages/server/tests/unit/security/invitation-enumeration.spec.test.ts` | ST-30, ST-31, ST-32 | Security |
| `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` | ST-27 | SDK contract |
| `packages/sdk/tests/agent/agent.test.ts` (updated) | ST-27 | SDK agent descriptor |
| `packages/cli/tests/commands/user-contract.spec.test.ts` | ST-28 | CLI contract |
| `packages/cli/tests/admin/user-service.spec.test.ts` | ST-29 | Admin UI |

Existing spec files updated rather than duplicated: `tests/unit/routes/invitation.test.ts`,
`tests/unit/routes/users.test.ts`, `tests/unit/auth/email-service.test.ts`,
`tests/unit/auth/system-config-consumers.spec.test.ts`,
`tests/integration/services/invitation-enhanced.test.ts`,
`tests/integration/services/invitation-deleted-preassignments.spec.test.ts`,
`tests/ui/flows/invitation.spec.ts`, `packages/sdk/tests/domains/users-contract.spec.test.ts`.

The existing `tests/unit/security/enumeration-resistance-*` contract and drivers cover
password-verification and recovery-work shape. The invitation rejection cases are static
page/status equality assertions with no account-specific work to compare, so they live in the
focused invitation security spec instead of that behavioral driver.

ST-33 (magic-link and password-reset unchanged) is a regression guard owned by the existing
magic-link and password-reset suites; it adds no new file and must stay green in the Phase 1,
Phase 2, and Phase 6 verification runs.

### Implementation Tests (edge cases, internals)

| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `packages/server/tests/unit/users/invitation-service.impl.test.ts` | Transaction ordering, rollback on conflict, cache/audit after commit | High |
| `packages/server/tests/unit/auth/token-repository.test.ts` | `replaceInvitation`, `consumeInvitation` predicates, mapping | High |
| `packages/cli/tests/admin/user-service.impl.test.ts` | Response validator rejects legacy shape; payload unchanged | Medium |

### Integration Tests

| Test | Components | Description |
| ---- | ---------- | ----------- |
| `invitation-deferred-acceptance.spec.test.ts` | routes + service + repository + PostgreSQL | Full invite → confirmation → accept, replay, conflict, concurrency |
| `migrations/invitation-deferral.spec.test.ts` | migration runner | Column/index/config assertions |
| updated `invitation-deleted-preassignments.spec.test.ts` | routes + RBAC | Pre-assignment best-effort at acceptance |

### End-to-End / UI Tests

| Scenario | Steps | Expected Result |
| -------- | ----- | --------------- |
| Full invitation journey | Invite via admin API → open email link → confirm → set password → sign in | Confirmation page first; account works after accept |
| Prefetch safety | Open the link repeatedly without confirming | No account created; link still usable |
| Expired link | Open an expired token | `invite-expired` page |

E2E disposition: N/A for a new Node E2E driver. The repository's `tests/e2e/` harness has no
invitation scenario, and the complete journey is already covered by the Playwright UI flow plus the
retained assurance harness; no new harness is created only to satisfy the template.

Retained assurance harness: the invitation path in
`test-harness/assurance/tests/human-auth-recovery-live-adapter.ts` must follow the link to the
confirmation page and then to `?step=password` before submitting, and must resolve the created
account (admin users search by email) only after acceptance. Protected-state capture is anchored on
the accepted account; the pre-acceptance state is the unused token.

## Test Data

### Fixtures Needed

- `packages/server/tests/ui/fixtures/db-helpers.ts` — `createInvitationToken` inserts
  `organization_id`/`email` with `user_id = NULL`.
- `packages/server/tests/ui/setup/global-setup.ts` — replace the pre-created inactive
  `invited@…` user with an invitation record.
- Integration helpers truncate list already includes `invitation_tokens`.

### Mock Requirements

- Email service may be mocked in unit route tests (existing pattern); integration tests use MailHog.
- No new external mocks.

## Verification Checklist

- [ ] All specification test cases (ST-*) defined with concrete input/output pairs
- [ ] Every ST case traces to a requirement, spec doc, or AR entry
- [ ] Specification tests written BEFORE implementation
- [ ] Specification tests verified to FAIL before implementation (red phase)
- [ ] All specification tests pass after implementation (green phase)
- [ ] Implementation tests written for edge cases and internals
- [ ] All unit / integration / UI / pentest tests pass
- [ ] `yarn verify`, `yarn test:ui`, `yarn assurance:harness --project security --profile production-security`, and `yarn assurance:compat --select tenant-admin` pass
- [ ] No regressions in existing tests
