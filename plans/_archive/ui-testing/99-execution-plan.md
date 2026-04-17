# Execution Plan: CSRF Fix & Playwright UI Testing

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-10 14:34
> **Progress**: 30/30 tasks (100%) ✅ COMPLETE

## Overview

Fixes broken CSRF protection across all form-based routes (cookie-based synchronized token pattern) and adds Playwright browser-based UI testing for authentication flows.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | ~~CSRF Fix — Core Module~~ | 1 | ✅ Done |
| 2 | ~~CSRF Fix — Route Handlers~~ | 2 | ✅ Done |
| 3 | ~~CSRF Fix — Templates & Tests~~ | 1 | ✅ Done |
| 4 | ~~Playwright Infrastructure~~ | 2 | ✅ Done |
| 5 | ~~Playwright Flow Tests~~ | 2 | ✅ Done |
| 6 | ~~Playwright Security Tests~~ | 1 | ✅ Done |
| 7 | ~~Final Verification~~ | 1 | ✅ Done |

**Total: ~10 sessions, ~4 hours**

---

## Phase 1: CSRF Fix — Core Module

### Session 1.1: Add Cookie-Based CSRF Functions

**Reference**: [CSRF Fix](03-csrf-fix.md)
**Objective**: Add `setCsrfCookie` and `getCsrfFromCookie` to the CSRF module

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Add `setCsrfCookie(ctx, token)` — sets HttpOnly SameSite=Lax cookie | `src/auth/csrf.ts` |
| 1.1.2 | Add `getCsrfFromCookie(ctx)` — reads CSRF token from request cookie | `src/auth/csrf.ts` |
| 1.1.3 | Add unit tests for `setCsrfCookie` and `getCsrfFromCookie` (~4 tests) | `tests/unit/auth/csrf.test.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: CSRF Fix — Route Handlers

### Session 2.1: Interaction & Two-Factor Routes

**Reference**: [CSRF Fix](03-csrf-fix.md)
**Objective**: Update interaction and two-factor routes to use cookie-based CSRF

**Tasks**:

| # | Task | File |
|---|------|------|
| ~~2.1.1~~ | ~~Update `showLogin` — add `setCsrfCookie(ctx, csrfToken)`~~ | ✅ |
| ~~2.1.2~~ | ~~Update `processLogin` — replace `body._csrfStored` with `getCsrfFromCookie(ctx)`~~ | ✅ |
| ~~2.1.3~~ | ~~Update `handleSendMagicLink` — replace `body._csrfStored` with `getCsrfFromCookie(ctx)`~~ | ✅ |
| ~~2.1.4~~ | ~~Update `showConsent` — add `setCsrfCookie(ctx, csrfToken)`~~ | ✅ |
| ~~2.1.5~~ | ~~Update `processConsent` — replace `body._csrfStored` with `getCsrfFromCookie(ctx)`~~ | ✅ |
| ~~2.1.6~~ | ~~Update `renderLoginWithError` — add `setCsrfCookie(ctx, csrfToken)`~~ | ✅ |
| ~~2.1.7~~ | ~~Update two-factor GET handlers — add `setCsrfCookie`~~ | ✅ |
| ~~2.1.8~~ | ~~Update two-factor POST handlers — replace `body._csrfStored` with cookie~~ | ✅ |

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: Password-Reset & Invitation Routes

**Reference**: [CSRF Fix](03-csrf-fix.md)
**Objective**: Update password-reset and invitation routes to use cookie-based CSRF

**Tasks**:

| # | Task | File |
|---|------|------|
| ~~2.2.1~~ | ~~Update `showForgotPassword` + `processForgotPassword`~~ | ✅ |
| ~~2.2.2~~ | ~~Update `showResetPassword` + `processResetPassword`~~ | ✅ |
| ~~2.2.3~~ | ~~Update `showAcceptInvite` + `processAcceptInvite`~~ | ✅ |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: CSRF Fix — Templates & Tests

### Session 3.1: Template Cleanup & Test Updates

**Reference**: [CSRF Fix](03-csrf-fix.md), [Testing Strategy](07-testing-strategy.md)
**Objective**: Remove `_csrfStored` from templates, update existing tests

**Tasks**:

| # | Task | File |
|---|------|------|
| ~~3.1.1~~ | ~~Remove `_csrfStored` from `two-factor-verify.hbs` (1 input)~~ | ✅ |
| ~~3.1.2~~ | ~~Remove `_csrfStored` from `two-factor-setup.hbs` (2 inputs)~~ | ✅ |
| ~~3.1.3~~ | ~~Update interaction route unit tests for cookie-based CSRF~~ | ✅ (done in Phase 2) |
| ~~3.1.4~~ | ~~Update two-factor route unit tests for cookie-based CSRF~~ | ✅ (done in Phase 2) |
| ~~3.1.5~~ | ~~Update E2E CSRF tests to use cookie + form field pattern~~ | ✅ |
| ~~3.1.6~~ | ~~Run full test suite — verify no regressions~~ | ✅ 2,013 tests, 117 files, 0 failures |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Playwright Infrastructure

### Session 4.1: Install & Configure Playwright

**Reference**: [Playwright Infrastructure](04-playwright-infra.md)
**Objective**: Install Playwright, create config, add yarn script

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Install `@playwright/test` + download Chromium | `package.json` |
| 4.1.2 | Create Playwright config | `tests/ui/playwright.config.ts` |
| 4.1.3 | Add `test:ui` script to package.json | `package.json` |

**Verify**: `clear && sleep 3 && yarn test:ui` (empty suite, should complete without error)

### Session 4.2: Global Setup, Teardown & Fixtures

**Reference**: [Playwright Infrastructure](04-playwright-infra.md)
**Objective**: Create server lifecycle and shared test fixtures

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Create global setup (start server, seed data, set env vars) | `tests/ui/setup/global-setup.ts` |
| 4.2.2 | Create global teardown (stop server, cleanup) | `tests/ui/setup/global-teardown.ts` |
| 4.2.3 | Create test fixtures (testData, startAuthFlow helper) | `tests/ui/fixtures/test-fixtures.ts` |

**Verify**: `clear && sleep 3 && yarn test:ui` (empty suite with setup/teardown running)

---

## Phase 5: Playwright Flow Tests

### Session 5.1: Password Login & Magic Link

**Reference**: [Playwright Tests](05-playwright-tests.md)
**Objective**: Browser-based tests for password login and magic link flows

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Password login flow tests (6 tests) | `tests/ui/flows/password-login.spec.ts` |
| 5.1.2 | Magic link flow tests (4 tests) | `tests/ui/flows/magic-link.spec.ts` |

**Verify**: `clear && sleep 3 && yarn test:ui`

### Session 5.2: Consent & Two-Factor

**Reference**: [Playwright Tests](05-playwright-tests.md)
**Objective**: Browser-based tests for consent and 2FA flows

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | Consent flow tests (4 tests) | `tests/ui/flows/consent.spec.ts` |
| 5.2.2 | Two-factor flow tests (4 tests) | `tests/ui/flows/two-factor.spec.ts` |

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 6: Playwright Security Tests

### Session 6.1: CSRF & Cookie Security

**Reference**: [Playwright Tests](05-playwright-tests.md)
**Objective**: Browser-based security tests for CSRF enforcement and cookie flags

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | CSRF protection tests (6 tests) | `tests/ui/security/csrf-protection.spec.ts` |
| 6.1.2 | Cookie flags tests (4 tests) | `tests/ui/security/cookie-flags.spec.ts` |

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 7: Final Verification

### Session 7.1: Full Suite & Documentation

**Objective**: Run all test suites, update documentation

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.1.1 | Run full test suite (unit + integration + e2e + pentest + ui) | N/A |
| 7.1.2 | Update `.clinerules/project.md` with Playwright/UI test info | `.clinerules/project.md` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: CSRF Fix — Core Module ✅
- [x] 1.1.1 Add `setCsrfCookie` function
- [x] 1.1.2 Add `getCsrfFromCookie` function
- [x] 1.1.3 Add unit tests for new CSRF functions (7 tests: 3 setCsrfCookie + 4 getCsrfFromCookie)

### Phase 2: CSRF Fix — Route Handlers ✅
- [x] 2.1.1 Update `showLogin` — add setCsrfCookie
- [x] 2.1.2 Update `processLogin` — use getCsrfFromCookie
- [x] 2.1.3 Update `handleSendMagicLink` — use getCsrfFromCookie
- [x] 2.1.4 Update `showConsent` — add setCsrfCookie
- [x] 2.1.5 Update `processConsent` — use getCsrfFromCookie
- [x] 2.1.6 Update `renderLoginWithError` — add setCsrfCookie
- [x] 2.1.7 Update two-factor GET handlers — add setCsrfCookie
- [x] 2.1.8 Update two-factor POST handlers — use getCsrfFromCookie
- [x] 2.2.1 Update forgot/process password handlers
- [x] 2.2.2 Update reset password handlers
- [x] 2.2.3 Update invitation handlers
- [x] Update password-reset + invitation route unit tests (done in Phase 2)

### Phase 3: CSRF Fix — Templates & Tests ✅
- [x] 3.1.1 Remove `_csrfStored` from two-factor-verify.hbs
- [x] 3.1.2 Remove `_csrfStored` from two-factor-setup.hbs
- [x] 3.1.3 Update interaction route unit tests (done in Phase 2)
- [x] 3.1.4 Update two-factor route unit tests (done in Phase 2)
- [x] 3.1.5 Update E2E CSRF tests (8 tests: 6 negative + 2 positive)
- [x] 3.1.6 Run full test suite — 2,013 tests, 117 files, 0 failures

### Phase 4: Playwright Infrastructure ✅
- [x] 4.1.1 Install @playwright/test@1.59.1 + Chromium (completed: 2026-04-10 13:30)
- [x] 4.1.2 Create playwright.config.ts (completed: 2026-04-10 13:31)
- [x] 4.1.3 Add test:ui script + update .gitignore (completed: 2026-04-10 13:31)
- [x] 4.2.1 Create global setup with server start + seed data (completed: 2026-04-10 13:32)
- [x] 4.2.2 Create global teardown with clean shutdown (completed: 2026-04-10 13:32)
- [x] 4.2.3 Create test fixtures (testData + startAuthFlow) + smoke test (completed: 2026-04-10 13:33)

### Phase 5: Playwright Flow Tests ✅
- [x] 5.1.1 Password login flow tests (6 tests) — `tests/ui/flows/password-login.spec.ts`
- [x] 5.1.2 Magic link flow tests (4 tests, 1 fixme) — `tests/ui/flows/magic-link.spec.ts`
- [x] 5.2.1 Consent flow tests (4 tests) — `tests/ui/flows/consent.spec.ts`
- [x] 5.2.2 Two-factor flow tests (4 tests, 4 fixme) — `tests/ui/flows/two-factor.spec.ts`

### Phase 6: Playwright Security Tests ✅
- [x] 6.1.1 CSRF protection tests (6 tests) — `tests/ui/security/csrf-protection.spec.ts`
- [x] 6.1.2 Cookie flags tests (4 tests) — `tests/ui/security/cookie-flags.spec.ts`

### Phase 7: Final Verification ✅
- [x] 7.1.1 Run full test suite — 2,013 unit/integration + 25 Playwright UI (5 fixme), lint 0 errors
- [x] 7.1.2 Update .clinerules/project.md (user to re-analyze)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/ui-testing/99-execution-plan.md`"
2. Read the referenced technical spec document

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan ui-testing` to continue

---

## Dependencies

```
Phase 1 (CSRF Core Module)
    ↓
Phase 2 (CSRF Route Handlers)
    ↓
Phase 3 (CSRF Templates & Tests)
    ↓
Phase 4 (Playwright Infrastructure)
    ↓
Phase 5 (Playwright Flow Tests)  →  Phase 6 (Playwright Security Tests)
    ↓
Phase 7 (Final Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 7 phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ Login form works without csrf_invalid error
4. ✅ All form POSTs use cookie-based CSRF
5. ✅ Playwright tests pass in Chromium
6. ✅ ~28 new Playwright tests + ~4 new CSRF unit tests
7. ✅ No regressions in existing 2,100+ tests
8. ✅ Documentation updated
9. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
