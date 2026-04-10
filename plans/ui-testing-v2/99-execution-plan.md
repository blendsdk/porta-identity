# Execution Plan: UI Testing Phase 2

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-10 22:08
> **Progress**: 13/38 tasks (34%)

## Overview

Implement comprehensive Playwright browser-level UI tests covering all remaining auth workflow pages: forgot/reset password, magic link verification, invitation acceptance, login error states, consent edge cases, interaction lifecycle, 2FA edge cases, multi-tenant isolation, page quality, OIDC discovery, and accessibility.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                  | Sessions | Est. Time |
|-------|----------------------------------------|----------|-----------|
| 0     | **BUG FIX: Client Name on UI Pages**   | 1        | 20 min    |
| 1     | Test Infrastructure                    | 1        | 45 min    |
| 2     | Password Reset Tests                   | 1        | 60 min    |
| 3     | Magic Link & Invitation Tests          | 1        | 60 min    |
| 4     | Login States & Consent Tests           | 1        | 45 min    |
| 5     | Interaction Lifecycle & 2FA Edge Cases | 1        | 45 min    |
| 6     | Security & Tenant Isolation Tests      | 1        | 30 min    |
| 7     | Quality, Discovery & Accessibility     | 1        | 30 min    |

**Total: 8 sessions, ~6 hours**

---

## Phase 0: BUG FIX — Client Name on UI Pages

### Session 0.1: Fix clientName Resolution in Interaction Routes

**Reference**: [Bug: clientName shows raw client_id instead of human-readable name]
**Objective**: Fix the login page and error page handlers to resolve the client's `client_name` metadata instead of passing the raw `client_id` UUID.

**Bug Description**:
In `src/routes/interactions.ts`, the login page and error fallback contexts set:
```
client: { clientName: (params.client_id as string) ?? '' }
```
This passes the raw `client_id` (a UUID) as the display name. The consent page correctly resolves:
```
client: { clientName: client?.metadata()?.client_name ?? clientId }
```
Templates use `{{interaction.client.clientName}}` in i18n strings like `"Sign in to continue to {{clientName}}"`, causing users to see a UUID or `{{clientName}}` literal.

**Affected**: 2 occurrences in `src/routes/interactions.ts` (login handler + error/abort handler)

**Tasks**:

| #     | Task                                                    | File                                    |
|-------|---------------------------------------------------------|-----------------------------------------|
| 0.1.1 | Fix showLogin: resolve client_name from OIDC provider client metadata (lookup by client_id) | `src/routes/interactions.ts` |
| 0.1.2 | Fix error/abort context: resolve client_name from interaction params | `src/routes/interactions.ts` |
| 0.1.3 | Add unit test: login context includes human-readable clientName | `tests/unit/routes/interactions.test.ts` |
| 0.1.4 | Verify fix visually: existing password-login UI test shows correct name | `tests/ui/flows/password-login.spec.ts` |

**Deliverables**:
- [x] Login page shows human-readable client name (not UUID)
- [x] Error/abort pages show human-readable client name
- [x] Existing unit and UI tests still pass
- [x] `yarn verify` passes

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 1: Test Infrastructure

### Session 1.1: Fixtures, Seed Data & Extended Setup

**Reference**: [Infrastructure](03-infrastructure.md)
**Objective**: Create mail capture fixture, DB helper fixture, extend global-setup with additional seed users/orgs, and extend test-fixtures with new testData fields.

**Tasks**:

| #     | Task                                                    | File                                    |
|-------|---------------------------------------------------------|-----------------------------------------|
| 1.1.1 | Create mail capture fixture (MailHog API integration)   | `tests/ui/fixtures/mail-capture.ts`     |
| 1.1.2 | Create DB helper fixture (token creation, user queries, rate limit reset) | `tests/ui/fixtures/db-helpers.ts` |
| 1.1.3 | Extend global-setup with additional seed users (suspended, archived, deactivated, lockable, invited, resettable) | `tests/ui/setup/global-setup.ts` |
| 1.1.4 | Extend global-setup with additional orgs (suspended-org, archived-org) | `tests/ui/setup/global-setup.ts` |
| 1.1.5 | Extend test-fixtures TestData interface with Phase 2 fields | `tests/ui/fixtures/test-fixtures.ts` |
| 1.1.6 | Verify smoke test passes with new seed data (extend smoke to check new env vars) | `tests/ui/smoke.spec.ts` |

**Deliverables**:
- [ ] Mail capture fixture created and exports MailCapture interface
- [ ] DB helper fixture created and exports DbHelpers interface
- [ ] Global setup seeds 6 additional users + 2 additional orgs
- [ ] TestData interface extended with all Phase 2 fields
- [ ] Smoke test verifies new env vars are populated
- [ ] All existing UI tests still pass (no regressions)

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 2: Password Reset Tests

### Session 2.1: Forgot Password & Reset Password Flows

**Reference**: [Password Reset Tests](04-password-reset-tests.md)
**Objective**: Implement all forgot-password, reset-password, and reset abuse test specs.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 2.1.1 | Implement forgot-password spec (8 tests: form render, submit, enumeration-safe, empty email, rate limit, CSRF, back link, flash) | `tests/ui/flows/forgot-password.spec.ts` |
| 2.1.2 | Implement reset-password spec (10 tests: valid token, happy path, expired, invalid, weak password, mismatch, CSRF, replay, login with new, old fails) | `tests/ui/flows/reset-password.spec.ts` |
| 2.1.3 | Implement reset-password-abuse spec (4 tests: brute-force, single-use, expired, rate limit) | `tests/ui/security/reset-password-abuse.spec.ts` |

**Deliverables**:
- [ ] forgot-password.spec.ts — 8 tests passing
- [ ] reset-password.spec.ts — 10 tests passing
- [ ] reset-password-abuse.spec.ts — 4 tests passing
- [ ] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 3: Magic Link & Invitation Tests

### Session 3.1: Magic Link Verification & Invitation Acceptance

**Reference**: [Magic Link & Invitation Tests](05-magic-link-invitation-tests.md)
**Objective**: Implement magic link verification, magic link abuse, and invitation acceptance test specs.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 3.1.1 | Implement magic-link-verify spec (6 tests: valid+interaction, valid+no-interaction, expired, invalid, used, email verified) | `tests/ui/flows/magic-link-verify.spec.ts` |
| 3.1.2 | Implement magic-link-abuse spec (4 tests: rate limit, enumeration, suspended user, brute-force) | `tests/ui/security/magic-link-abuse.spec.ts` |
| 3.1.3 | Implement invitation spec (9 tests: valid token, happy path, login after, expired, invalid, weak password, mismatch, CSRF, replay) | `tests/ui/flows/invitation.spec.ts` |

**Deliverables**:
- [ ] magic-link-verify.spec.ts — 6 tests passing
- [ ] magic-link-abuse.spec.ts — 4 tests passing
- [ ] invitation.spec.ts — 9 tests passing
- [ ] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 4: Login States & Consent Tests

### Session 4.1: Login Error States & Consent Edge Cases

**Reference**: [Login, Consent & Interaction Tests](06-login-consent-interaction-tests.md)
**Objective**: Implement login error state tests and consent edge case tests.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 4.1.1 | Implement login-error-states spec (9 tests: suspended, archived, locked, deactivated, suspended org, archived org, non-existent org, email preserved, lockout) | `tests/ui/flows/login-error-states.spec.ts` |
| 4.1.2 | Implement consent-edge-cases spec (5 tests: auto-consent, third-party scopes, deny, CSRF, content) | `tests/ui/flows/consent-edge-cases.spec.ts` |

**Deliverables**:
- [ ] login-error-states.spec.ts — 9 tests passing
- [ ] consent-edge-cases.spec.ts — 5 tests passing
- [ ] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 5: Interaction Lifecycle & 2FA Edge Cases

### Session 5.1: Interaction & Two-Factor Edge Cases

**Reference**: [Login, Consent & Interaction Tests](06-login-consent-interaction-tests.md), [Security & Accessibility Tests](08-security-accessibility-tests.md)
**Objective**: Implement interaction lifecycle tests and 2FA edge case tests.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 5.1.1 | Implement interaction-lifecycle spec (6 tests: abort, expired UID, invalid UID, direct access, back button, refresh) | `tests/ui/flows/interaction-lifecycle.spec.ts` |
| 5.1.2 | Implement two-factor-edge-cases spec (8 tests: invalid OTP, expired OTP, invalid TOTP, invalid recovery, setup QR, setup invalid, method UI, resend) | `tests/ui/flows/two-factor-edge-cases.spec.ts` |

**Deliverables**:
- [ ] interaction-lifecycle.spec.ts — 6 tests passing
- [ ] two-factor-edge-cases.spec.ts — 8 tests passing
- [ ] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 6: Security & Tenant Isolation Tests

### Session 6.1: Tenant Isolation

**Reference**: [Security & Accessibility Tests](08-security-accessibility-tests.md)
**Objective**: Implement multi-tenant UI isolation tests.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 6.1.1 | Implement tenant-isolation spec (4 tests: org branding, non-existent org, suspended org, archived org) | `tests/ui/security/tenant-isolation.spec.ts` |

**Deliverables**:
- [ ] tenant-isolation.spec.ts — 4 tests passing
- [ ] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 7: Quality, Discovery & Accessibility

### Session 7.1: Page Quality, OIDC Discovery & Accessibility

**Reference**: [Security & Accessibility Tests](08-security-accessibility-tests.md)
**Objective**: Implement page quality, OIDC discovery, and accessibility tests.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 7.1.1 | Implement page-quality spec (7 tests: console errors ×3, network errors, password types, autocomplete, security headers) | `tests/ui/security/page-quality.spec.ts` |
| 7.1.2 | Implement OIDC discovery tests (4 tests: discovery JSON, JWKS, auth endpoint, token endpoint) | `tests/ui/flows/oidc-discovery.spec.ts` |
| 7.1.3 | Implement form-accessibility spec (5 tests: labels, error association, focus, keyboard nav, consent a11y) | `tests/ui/accessibility/form-accessibility.spec.ts` |
| 7.1.4 | Run full verification: all UI tests + verify command | — |

**Deliverables**:
- [ ] page-quality.spec.ts — 7 tests passing
- [ ] oidc-discovery.spec.ts — 4 tests passing
- [ ] form-accessibility.spec.ts — 5 tests passing
- [ ] All UI tests pass (Phase 1 + Phase 2: ~131 total)
- [ ] `yarn verify` passes

**Verify**: `clear && sleep 3 && yarn verify && yarn test:ui`

---

## Task Checklist (All Phases)

### Phase 0: BUG FIX — Client Name on UI Pages
- [x] 0.1.1 Fix showLogin: resolve client_name from OIDC provider client metadata ✅ (completed: 2026-04-10 20:38)
- [x] 0.1.2 Fix error/abort context: resolve client_name from interaction params ✅ (completed: 2026-04-10 20:38)
- [x] 0.1.3 Add unit test: login context includes human-readable clientName ✅ (completed: 2026-04-10 20:39)
- [x] 0.1.4 Verify fix: yarn verify passes (2020 tests, 117 files, 0 failures) ✅ (completed: 2026-04-10 20:41)

### Phase 1: Test Infrastructure
- [x] 1.1.1 Create mail capture fixture (MailHog API) ✅ (completed: 2026-04-10 21:00)
- [x] 1.1.2 Create DB helper fixture (token creation, queries, rate limit reset) ✅ (completed: 2026-04-10 21:00)
- [x] 1.1.3 Extend global-setup: additional seed users ✅ (completed: 2026-04-10 21:00)
- [x] 1.1.4 Extend global-setup: additional orgs ✅ (completed: 2026-04-10 21:00)
- [x] 1.1.5 Extend test-fixtures: TestData interface ✅ (completed: 2026-04-10 21:00)
- [x] 1.1.6 Verify smoke test passes with new data ✅ (completed: 2026-04-10 21:00)

### Phase 2: Password Reset Tests
- [ ] 2.1.1 Implement forgot-password.spec.ts (8 tests)
- [ ] 2.1.2 Implement reset-password.spec.ts (10 tests)
- [ ] 2.1.3 Implement reset-password-abuse.spec.ts (4 tests)

### Phase 3: Magic Link & Invitation Tests
- [x] 3.1.1 Implement magic-link-verify.spec.ts (5 passing + 1 fixme) ✅ (completed: 2026-04-10 22:05)
- [x] 3.1.2 Implement magic-link-abuse.spec.ts (4 tests) ✅ (completed: 2026-04-10 22:05)
- [x] 3.1.3 Implement invitation.spec.ts (9 tests) ✅ (completed: 2026-04-10 22:05)

### Phase 4: Login States & Consent Tests
- [ ] 4.1.1 Implement login-error-states.spec.ts (9 tests)
- [ ] 4.1.2 Implement consent-edge-cases.spec.ts (5 tests)

### Phase 5: Interaction Lifecycle & 2FA Edge Cases
- [ ] 5.1.1 Implement interaction-lifecycle.spec.ts (6 tests)
- [ ] 5.1.2 Implement two-factor-edge-cases.spec.ts (8 tests)

### Phase 6: Security & Tenant Isolation
- [ ] 6.1.1 Implement tenant-isolation.spec.ts (4 tests)

### Phase 7: Quality, Discovery & Accessibility
- [ ] 7.1.1 Implement page-quality.spec.ts (7 tests)
- [ ] 7.1.2 Implement oidc-discovery.spec.ts (4 tests)
- [ ] 7.1.3 Implement form-accessibility.spec.ts (5 tests)
- [ ] 7.1.4 Full verification pass

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/ui-testing-v2/99-execution-plan.md`"
2. Read relevant technical spec document for the phase
3. Read existing fixtures and patterns from Phase 1 tests

### Ending a Session

1. Run: `clear && sleep 3 && yarn test:ui`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan ui-testing-v2` to continue

---

## Dependencies

```
Phase 0 (Bug Fix: clientName)
    ↓
Phase 1 (Infrastructure)
    ↓
Phase 2 (Password Reset)  ←  uses dbHelpers + mailCapture
    ↓
Phase 3 (Magic Link + Invitation)  ←  uses dbHelpers + mailCapture
    ↓
Phase 4 (Login States + Consent)  ←  uses testData extended fields
    ↓
Phase 5 (Interaction + 2FA)  ←  uses dbHelpers + startAuthFlow
    ↓
Phase 6 (Tenant Isolation)  ←  uses testData org slugs
    ↓
Phase 7 (Quality + A11y)  ←  uses all fixtures
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 8 phases completed (38 tasks)
2. ✅ clientName bug fixed on login + error pages
3. ✅ All ~89 new test cases passing
3. ✅ No regressions in existing UI tests (~42 Phase 1 tests)
4. ✅ No regressions in existing unit/E2E/pentest suites
5. ✅ `yarn verify` passing
6. ✅ `yarn test:ui` passing (~131 total UI tests)
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
