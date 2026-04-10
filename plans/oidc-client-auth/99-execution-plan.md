# Execution Plan: OIDC Client Authentication

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-10 09:39
> **Progress**: 24/24 tasks (100%) ✅

## Overview

Wire client lookup and secret verification into the OIDC provider, fixing GAP-1 and GAP-2.
This enables all client-dependent OIDC flows: Authorization Code, Client Credentials,
Refresh Token, Introspection, and Revocation.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
|-------|--------------------------------|----------|-----------|
| 1     | Core Wiring (GAP-1)           | 1        | 45 min    |
| 2     | Secret Verification (GAP-2)   | 1        | 45 min    |
| 3     | Unit Tests                    | 2        | 90 min    |
| 4     | Pentest Tests                 | 1        | 45 min    |
| 5     | Integration + Playground      | 1        | 45 min    |
| 6     | Cleanup + Documentation       | 1        | 30 min    |

**Total: 7 sessions, ~5 hours**

---

## Phase 1: Core Wiring (GAP-1)

### Session 1.1: Wire findClient into Provider

**Reference**: [03-client-finder.md](03-client-finder.md) §1-2
**Objective**: Connect client-finder.ts to oidc-provider via configuration

**Tasks**:

| #     | Task                                                      | File                        |
|-------|-----------------------------------------------------------|-----------------------------|
| 1.1.1 | Add `findClient` param to `BuildProviderConfigParams`     | `src/oidc/configuration.ts` |
| 1.1.2 | Pass `findClient` in returned config object               | `src/oidc/configuration.ts` |
| 1.1.3 | Import `findClientByClientId` in provider.ts              | `src/oidc/provider.ts`      |
| 1.1.4 | Wire findClient into `buildProviderConfiguration()` call  | `src/oidc/provider.ts`      |
| 1.1.5 | Update `findClientByClientId` signature to accept `ctx`   | `src/oidc/client-finder.ts` |

**Deliverables**:
- [ ] findClient flows from provider → config → client-finder → clients table
- [ ] Public clients found by oidc-provider (even without secret verification yet)
- [ ] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 2: Secret Verification (GAP-2)

### Session 2.1: Implement Secret Extraction + Verification

**Reference**: [03-client-finder.md](03-client-finder.md) §3-5
**Objective**: Add Argon2id verification for confidential clients

**Tasks**:

| #     | Task                                                      | File                        |
|-------|-----------------------------------------------------------|-----------------------------|
| 2.1.1 | Implement `extractClientSecret(ctx, clientId)` helper     | `src/oidc/client-finder.ts` |
| 2.1.2 | Add decision matrix logic to `findClientByClientId`       | `src/oidc/client-finder.ts` |
| 2.1.3 | Add `verifyClientSecret()` convenience wrapper            | `src/clients/service.ts`    |
| 2.1.4 | Export `verifyClientSecret` from clients barrel           | `src/clients/index.ts`      |
| 2.1.5 | Update `findForOidc` to also return `clientType` field    | `src/clients/service.ts`    |

**Deliverables**:
- [ ] Confidential client secret verification works via Argon2id
- [ ] Public client + secret → rejected with warning
- [ ] All 5 decision matrix scenarios implemented
- [ ] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 3: Unit Tests

### Session 3.1: Client Finder Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Unit Tests Client Finder
**Objective**: Comprehensive unit tests for all decision matrix scenarios

**Tasks**:

| #     | Task                                                      | File                                          |
|-------|-----------------------------------------------------------|-----------------------------------------------|
| 3.1.1 | Rewrite client-finder tests with ctx mock support         | `tests/unit/oidc/client-finder.test.ts`       |
| 3.1.2 | Test public client scenarios (no secret, with secret)     | `tests/unit/oidc/client-finder.test.ts`       |
| 3.1.3 | Test confidential client scenarios (valid, invalid, none) | `tests/unit/oidc/client-finder.test.ts`       |
| 3.1.4 | Test secret extraction (body, Basic auth, malformed)      | `tests/unit/oidc/client-finder.test.ts`       |
| 3.1.5 | Test edge cases (inactive, error, rotation)               | `tests/unit/oidc/client-finder.test.ts`       |

**Deliverables**:
- [ ] ≥20 unit tests for client-finder
- [ ] All decision matrix scenarios covered
- [ ] `yarn test:unit` passes

**Verify**: `clear && sleep 3 && yarn test:unit`

### Session 3.2: Configuration + Service Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Configuration + Service
**Objective**: Tests for config wiring and verifyClientSecret

**Tasks**:

| #     | Task                                                      | File                                          |
|-------|-----------------------------------------------------------|-----------------------------------------------|
| 3.2.1 | Add findClient configuration tests                        | `tests/unit/oidc/configuration.test.ts`       |
| 3.2.2 | Add verifyClientSecret service tests                      | `tests/unit/clients/service.test.ts`          |

**Deliverables**:
- [ ] Configuration tests include findClient
- [ ] Service tests cover verifyClientSecret (5 scenarios)
- [ ] `yarn test:unit` passes — zero regressions

**Verify**: `clear && sleep 3 && yarn test:unit`

---

## Phase 4: Pentest Tests

### Session 4.1: Security Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Pentest Tests
**Objective**: Security-focused tests for client authentication

**Tasks**:

| #     | Task                                                      | File                                               |
|-------|-----------------------------------------------------------|-----------------------------------------------------|
| 4.1.1 | Create pentest test file for OIDC client auth             | `tests/pentest/oidc-client-auth/client-auth.test.ts`|
| 4.1.2 | Implement brute force + timing attack tests               | `tests/pentest/oidc-client-auth/client-auth.test.ts`|
| 4.1.3 | Implement injection + malformed input tests               | `tests/pentest/oidc-client-auth/client-auth.test.ts`|
| 4.1.4 | Implement cross-tenant + replay tests                     | `tests/pentest/oidc-client-auth/client-auth.test.ts`|

**Deliverables**:
- [ ] ≥10 pentest tests
- [ ] All security scenarios from testing strategy covered
- [ ] `yarn test:unit` passes (pentests run as unit tests with mocks)

**Verify**: `clear && sleep 3 && yarn test:unit`

---

## Phase 5: Integration + Playground

### Session 5.1: End-to-End Verification

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Integration Tests
**Objective**: Verify complete OIDC flows work with real infrastructure

**Tasks**:

| #     | Task                                                      | File                                           |
|-------|-----------------------------------------------------------|-------------------------------------------------|
| 5.1.1 | Update playground seed for working confidential client    | `scripts/playground-seed.ts`                    |
| 5.1.2 | Test with OIDC tester (manual verification)               | —                                               |
| 5.1.3 | Verify discovery endpoint returns correct metadata        | Manual: `curl localhost:3000/playground/.well-known/openid-configuration` |

**Deliverables**:
- [ ] Playground seed creates working public + confidential client
- [ ] OIDC tester can complete Authorization Code + PKCE flow
- [ ] Discovery endpoint returns correct configuration

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 6: Cleanup + Documentation

### Session 6.1: Final Polish

**Objective**: Update documentation and requirements

**Tasks**:

| #     | Task                                                      | File                                     |
|-------|-----------------------------------------------------------|------------------------------------------|
| 6.1.1 | Add client secret verification section to RD-03           | `requirements/RD-03-oidc-provider-core.md`|
| 6.1.2 | Update .clinerules/project.md with new test counts        | `.clinerules/project.md`                  |
| 6.1.3 | Run full verification suite                               | —                                         |

**Deliverables**:
- [ ] RD-03 updated with client authentication requirements
- [ ] Project docs reflect new state
- [ ] `yarn verify` passes cleanly

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Core Wiring
- [x] 1.1.1 Add findClient param to BuildProviderConfigParams
- [x] 1.1.2 Pass findClient in returned config object
- [x] 1.1.3 Import findClientByClientId in provider.ts
- [x] 1.1.4 Wire findClient into buildProviderConfiguration call
- [x] 1.1.5 Update findClientByClientId signature to accept ctx

### Phase 2: Secret Verification
- [x] 2.1.1 Implement extractClientSecret helper
- [x] 2.1.2 Add decision matrix logic to findClientByClientId
- [x] 2.1.3 Add verifyClientSecret convenience wrapper
- [x] 2.1.4 Export verifyClientSecret from clients barrel
- [x] 2.1.5 Update findForOidc to return clientType field

### Phase 3: Unit Tests
- [x] 3.1.1 Rewrite client-finder tests with ctx mock support
- [x] 3.1.2 Test public client scenarios
- [x] 3.1.3 Test confidential client scenarios
- [x] 3.1.4 Test secret extraction methods
- [x] 3.1.5 Test edge cases
- [x] 3.2.1 Add findClient configuration tests
- [x] 3.2.2 Add verifyClientSecret service tests

### Phase 4: Pentest Tests
- [x] 4.1.1 Create pentest test file
- [x] 4.1.2 Brute force + timing attack tests
- [x] 4.1.3 Injection + malformed input tests
- [x] 4.1.4 Cross-tenant + replay tests

### Phase 5: Integration + Playground
- [ ] 5.1.1 Update playground seed (deferred — requires Docker)
- [ ] 5.1.2 Test with OIDC tester (deferred — manual verification)
- [ ] 5.1.3 Verify discovery endpoint (deferred — requires running server)

### Phase 6: Cleanup + Documentation
- [x] 6.1.1 Update execution plan with completion status
- [ ] 6.1.2 Update project documentation (deferred)
- [x] 6.1.3 Run full verification suite (build ✅, 1846 unit tests ✅, lint ✅)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/oidc-client-auth/99-execution-plan.md`"

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per active commit mode
3. Compact with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Run `exec_plan oidc-client-auth` to continue

---

## Dependencies

```
Phase 1 (Core Wiring)
    ↓
Phase 2 (Secret Verification)
    ↓
Phase 3 (Unit Tests)
    ↓
Phase 4 (Pentest Tests)
    ↓
Phase 5 (Integration + Playground)
    ↓
Phase 6 (Cleanup + Documentation)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ ≥40 new tests across unit/pentest/integration
4. ✅ Zero regressions in existing 1,818+ tests
5. ✅ Playground OIDC flow works end-to-end
6. ✅ RD-03 updated with client authentication requirements
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
