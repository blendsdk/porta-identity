# Execution Plan: Confidential Client E2E

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-10 16:39
> **Progress**: 0/12 tasks (0%)

## Overview

Fix the OIDC token endpoint body parser conflict, remove dead `findClient` code,
and add a comprehensive Playwright E2E test for the confidential client workflow.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title               | Sessions | Est. Time |
|-------|---------------------|----------|-----------|
| 1     | Body Parser Fix     | 1        | 30 min    |
| 2     | Dead Code Cleanup   | 1        | 20 min    |
| 3     | E2E Test Setup      | 1        | 30 min    |
| 4     | E2E Test Impl       | 1        | 45 min    |

**Total: 4 sessions, ~2 hours**

---

## Phase 1: Body Parser Fix

### Session 1.1: Fix Koa bodyparser for OIDC routes

**Reference**: [03-body-parser-fix.md](03-body-parser-fix.md)
**Objective**: Let oidc-provider parse its own request bodies

**Tasks**:

| #     | Task                                                             | File              |
|-------|------------------------------------------------------------------|-------------------|
| 1.1.1 | Remove global `app.use(bodyParser())` from server.ts             | `src/server.ts`   |
| 1.1.2 | Apply bodyparser selectively to API admin routes + interaction/auth routes | `src/server.ts` |
| 1.1.3 | Run `yarn verify` — ensure no regressions                       | —                 |

**Deliverables**:
- [ ] bodyParser no longer applied to OIDC routes
- [ ] Admin API routes still work (body parsing intact)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Dead Code Cleanup

### Session 2.1: Remove dead findClient code

**Reference**: [04-dead-code-cleanup.md](04-dead-code-cleanup.md)
**Objective**: Remove silently-ignored findClient config and related code

**Tasks**:

| #     | Task                                                             | File              |
|-------|------------------------------------------------------------------|-------------------|
| 2.1.1 | Delete `src/oidc/client-finder.ts` and `tests/unit/oidc/client-finder.test.ts` | — |
| 2.1.2 | Remove findClient from `configuration.ts` interface + implementation | `src/oidc/configuration.ts` |
| 2.1.3 | Remove findClient import + usage from `provider.ts`              | `src/oidc/provider.ts` |
| 2.1.4 | Update `tests/unit/oidc/configuration.test.ts` if needed         | tests |
| 2.1.5 | Run `yarn verify` — ensure no regressions                       | —                 |

**Deliverables**:
- [ ] Dead code removed
- [ ] No import/reference to client-finder.ts remains
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: E2E Test Setup

### Session 3.1: Seed confidential client + update fixtures

**Reference**: [05-e2e-test.md](05-e2e-test.md)
**Objective**: Prepare test infrastructure for confidential client testing

**Tasks**:

| #     | Task                                                             | File              |
|-------|------------------------------------------------------------------|-------------------|
| 3.1.1 | Seed confidential client + secret in `global-setup.ts`          | `tests/ui/setup/global-setup.ts` |
| 3.1.2 | Add confidential client data to `test-fixtures.ts` (TestData + helper) | `tests/ui/fixtures/test-fixtures.ts` |

**Deliverables**:
- [ ] Confidential client seeded with known client_secret
- [ ] Fixtures export confClientId, confClientSecret, startConfidentialAuthFlow

---

## Phase 4: E2E Test Implementation

### Session 4.1: Write confidential client workflow test

**Reference**: [05-e2e-test.md](05-e2e-test.md)
**Objective**: Complete E2E test for auth → token → id_token → introspect → userinfo

**Tasks**:

| #     | Task                                                             | File              |
|-------|------------------------------------------------------------------|-------------------|
| 4.1.1 | Write test: authentication + consent + capture auth code        | `tests/ui/flows/confidential-client.spec.ts` |
| 4.1.2 | Write test: token exchange with client_secret_post              | `tests/ui/flows/confidential-client.spec.ts` |
| 4.1.3 | Write test: ID token validation (decode JWT, check claims)      | `tests/ui/flows/confidential-client.spec.ts` |
| 4.1.4 | Write test: token introspection (active, client_id, sub)        | `tests/ui/flows/confidential-client.spec.ts` |
| 4.1.5 | Write test: userinfo request (sub, email, profile claims)       | `tests/ui/flows/confidential-client.spec.ts` |
| 4.1.6 | Run Playwright tests — all pass                                 | —                 |
| 4.1.7 | Run `yarn verify` — full regression check                       | —                 |

**Deliverables**:
- [ ] Comprehensive E2E test passing
- [ ] All existing tests still pass
- [ ] No "already parsed request body" warning in logs

**Verify**: `clear && sleep 3 && yarn verify && npx playwright test`

---

## Task Checklist (All Phases)

### Phase 1: Body Parser Fix
- [ ] 1.1.1 Remove global bodyParser from server.ts
- [ ] 1.1.2 Apply bodyparser selectively to non-OIDC routes
- [ ] 1.1.3 Verify no regressions

### Phase 2: Dead Code Cleanup
- [ ] 2.1.1 Delete client-finder.ts + its test
- [ ] 2.1.2 Clean configuration.ts
- [ ] 2.1.3 Clean provider.ts
- [ ] 2.1.4 Update configuration.test.ts
- [ ] 2.1.5 Verify no regressions

### Phase 3: E2E Test Setup
- [ ] 3.1.1 Seed confidential client in global-setup.ts
- [ ] 3.1.2 Update test-fixtures.ts

### Phase 4: E2E Test Implementation
- [ ] 4.1.1 Auth + consent + capture code
- [ ] 4.1.2 Token exchange
- [ ] 4.1.3 ID token validation
- [ ] 4.1.4 Token introspection
- [ ] 4.1.5 UserInfo request
- [ ] 4.1.6 Run Playwright tests
- [ ] 4.1.7 Full regression verify

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X per `plans/confidential-client-e2e/99-execution-plan.md`"

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per active commit mode
3. Compact with `/compact`

---

## Dependencies

```
Phase 1 (body parser fix)
    ↓
Phase 2 (dead code cleanup) — independent but logical after Phase 1
    ↓
Phase 3 (E2E test setup)
    ↓
Phase 4 (E2E test implementation) — depends on Phase 1 fix + Phase 3 setup
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ Playwright E2E test passes (auth → token → id_token → introspect → userinfo)
4. ✅ No "already parsed request body" warning from oidc-provider
5. ✅ No dead `findClient` code remaining
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
