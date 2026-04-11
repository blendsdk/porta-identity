# Execution Plan: 2FA UI Tests

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-11 01:40
> **Progress**: 8/8 tasks (100%) ✅

## Overview

Unblock 12 skipped Playwright 2FA tests by seeding 2FA-enabled users during global-setup using real service modules, adding TOTP/OTP helpers, and updating tests to use real 2FA flows.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
|-------|--------------------------------|----------|-----------|
| 1     | Seed & Fixtures                | 1        | 45 min    |
| 2     | Unblock Tests                  | 1        | 60 min    |
| 3     | Verification                   | 1        | 15 min    |

**Total: 3 sessions, ~2 hours**

---

## Phase 1: Seed & Fixtures

### Session 1.1: Global Setup + Test Helpers

**Reference**: [Seed & Fixtures](03-seed-fixtures.md)
**Objective**: Seed 2FA-enabled users during global-setup and create test helpers.

**Tasks**:

| #     | Task                                                    | File                                    |
|-------|---------------------------------------------------------|-----------------------------------------|
| 1.1.1 | Add 2FA encryption key to test env setup                | `tests/ui/setup/global-setup.ts`        |
| 1.1.2 | Seed email OTP user + TOTP user + recovery codes        | `tests/ui/setup/global-setup.ts`        |
| 1.1.3 | Create TOTP code generation helper                      | `tests/ui/fixtures/totp-helper.ts`      |
| 1.1.4 | Create shared OTP extraction helper                     | `tests/ui/fixtures/otp-helper.ts`       |
| 1.1.5 | Extend TestData interface with 2FA fields               | `tests/ui/fixtures/test-fixtures.ts`    |

**Deliverables**:
- [x] 2FA users seeded during global-setup
- [x] TOTP helper generates valid codes
- [x] TestData has 2FA fields populated
- [x] Smoke test passes with new seed data

**Verify**: `clear && sleep 3 && yarn test:ui -- tests/ui/smoke.spec.ts`

---

## Phase 2: Unblock Tests

### Session 2.1: Fix All 12 Fixme Tests

**Reference**: [Test Implementation](04-test-fixes.md)
**Objective**: Remove test.fixme() and update tests to use real 2FA flows.

**Tasks**:

| #     | Task                                                    | File                                          |
|-------|---------------------------------------------------------|-----------------------------------------------|
| 2.1.1 | Fix two-factor.spec.ts — remove fixme, use seeded users + MailHog OTP | `tests/ui/flows/two-factor.spec.ts` |
| 2.1.2 | Fix two-factor-edge-cases.spec.ts — remove fixme, use real 2FA flows | `tests/ui/flows/two-factor-edge-cases.spec.ts` |
| 2.1.3 | Seed TOTP-setup user (org with required_totp policy) if needed for setup tests | `tests/ui/setup/global-setup.ts` |

**Deliverables**:
- [x] All 12 previously-fixme tests passing
- [x] No new fixme annotations
- [x] All existing UI tests still pass

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Phase 3: Verification

### Session 3.1: Full Verification

**Tasks**:

| #     | Task                                                    | File |
|-------|---------------------------------------------------------|------|
| 3.1.1 | Run full UI test suite — all tests pass                 | —    |

**Verify**: `clear && sleep 3 && yarn verify && yarn test:ui`

---

## Task Checklist (All Phases)

### Phase 1: Seed & Fixtures
- [x] 1.1.1 Add 2FA encryption key to test env setup
- [x] 1.1.2 Seed email OTP user + TOTP user + recovery codes
- [x] 1.1.3 Create TOTP code generation helper
- [x] 1.1.4 Create shared OTP extraction helper
- [x] 1.1.5 Extend TestData interface with 2FA fields

### Phase 2: Unblock Tests
- [x] 2.1.1 Fix two-factor.spec.ts (4 tests)
- [x] 2.1.2 Fix two-factor-edge-cases.spec.ts (8 tests)

### Phase 3: Verification
- [x] 3.1.1 Full verification pass (build ✅, 1,869 unit tests ✅, lint 0 errors ✅)

---

## Dependencies

```
Phase 1 (Seed & Fixtures)
    ↓
Phase 2 (Unblock Tests)
    ↓
Phase 3 (Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 12 previously-fixme 2FA tests pass
2. ✅ All existing UI tests still pass (112+)
3. ✅ `yarn verify` passes
4. ✅ Real 2FA flows tested (email OTP via MailHog, TOTP via otpauth, recovery codes)
5. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
