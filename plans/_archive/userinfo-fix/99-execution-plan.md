# Execution Plan: UserInfo (/me) Endpoint Fix

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-10 18:04
> **Progress**: 7/7 tasks (100%)

## Overview

Fix the `/me` (userinfo) endpoint "invalid token provided" error by making `resourceIndicators.defaultResource` conditional, then add dedicated E2E tests and update the existing confidential-client test.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
| ----- | ------------------------------ | -------- | --------- |
| 1     | Resource Indicators Fix        | 1        | 15 min    |
| 2     | UserInfo E2E Tests             | 1        | 30 min    |
| 3     | Verification                   | 1        | 15 min    |

**Total: 1 session, ~60 min**

---

## Phase 1: Resource Indicators Fix

### Session 1.1: Fix defaultResource Configuration

**Reference**: [Resource Indicators Fix](03-resource-indicators-fix.md)
**Objective**: Make `defaultResource` conditional so tokens work with `/me`

**Tasks**:

| #     | Task                                                          | File                              |
| ----- | ------------------------------------------------------------- | --------------------------------- |
| 1.1.1 | Change `defaultResource` to return `oneOf ?? undefined`       | `src/oidc/configuration.ts`       |
| 1.1.2 | Update/add unit tests for conditional `defaultResource` logic | `tests/unit/oidc/configuration.test.ts` |
| 1.1.3 | Run `yarn verify` — confirm no regressions                   | —                                 |

**Deliverables**:
- [ ] `defaultResource` returns `undefined` when no resource requested
- [ ] `defaultResource` returns the resource when explicitly requested
- [ ] Unit tests cover both cases
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: UserInfo E2E Tests

### Session 2.1: Create Dedicated UserInfo Tests + Update Existing Test

**Reference**: [UserInfo E2E Tests](04-userinfo-e2e-tests.md)
**Objective**: Comprehensive E2E coverage for the `/me` endpoint

**Tasks**:

| #     | Task                                                              | File                                          |
| ----- | ----------------------------------------------------------------- | --------------------------------------------- |
| 2.1.1 | Create `userinfo.spec.ts` with 4 test cases (happy path, errors, scope filtering) | `tests/ui/flows/userinfo.spec.ts` |
| 2.1.2 | Update `confidential-client.spec.ts` — strict 200 assertion on `/me` | `tests/ui/flows/confidential-client.spec.ts` |

**Deliverables**:
- [ ] 4 new userinfo E2E tests created
- [ ] Existing confidential-client test updated to strict assertion
- [ ] All new tests pass

**Verify**: `clear && sleep 3 && npx playwright test --config tests/ui/playwright.config.ts`

---

## Phase 3: Final Verification

### Session 3.1: Full Verification

**Objective**: Confirm everything passes with zero regressions

**Tasks**:

| #     | Task                                           | File |
| ----- | ---------------------------------------------- | ---- |
| 3.1.1 | Run all Playwright tests                       | —    |
| 3.1.2 | Run `yarn verify` (lint + build + all tests)   | —    |

**Deliverables**:
- [ ] All Playwright tests pass (26 existing + 4 new = 30+)
- [ ] All 2013+ unit/integration tests pass
- [ ] `yarn verify` passes

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Resource Indicators Fix
- [x] 1.1.1 Change `defaultResource` to return `oneOf ?? undefined` ✅ (completed: 2026-04-10 18:16)
- [x] 1.1.2 Update/add unit tests for conditional `defaultResource` logic ✅ (completed: 2026-04-10 18:16)
- [x] 1.1.3 Run `yarn verify` — confirm no regressions ✅ (completed: 2026-04-10 18:18, 2016 tests passed)

### Phase 2: UserInfo E2E Tests
- [x] 2.1.1 Create `userinfo.spec.ts` with 4 test cases ✅ (completed: 2026-04-10 18:18)
- [x] 2.1.2 Update `confidential-client.spec.ts` — strict 200 assertion ✅ (completed: 2026-04-10 18:18)

### Phase 3: Final Verification
- [x] 3.1.1 Run all Playwright tests ✅ (completed: 2026-04-10 18:19, 30 passed)
- [x] 3.1.2 Run `yarn verify` ✅ (completed: 2026-04-10 18:18, 2016 tests passed)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/userinfo-fix/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan userinfo-fix` to continue

---

## Dependencies

```
Phase 1 (Fix defaultResource)
    ↓
Phase 2 (E2E Tests — depend on fix being in place)
    ↓
Phase 3 (Final Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ All Playwright tests pass (30+)
5. ✅ All unit/integration tests pass (2013+)
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
