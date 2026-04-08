# Execution Plan: User Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 22:00
> **Progress**: 0/38 tasks (0%)

## Overview

Implement the user management module for Porta v5. Users are org-scoped entities with OIDC Standard Claims profiles, Argon2id password management, and a defined status lifecycle. This follows the same architectural patterns as the organizations and clients modules.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                    | Sessions | Est. Time |
| ----- | ------------------------ | -------- | --------- |
| 1     | Types, Errors & Password | 1        | 45 min    |
| 2     | Repository & Cache       | 1-2      | 60 min    |
| 3     | Claims & Service         | 2        | 90 min    |
| 4     | Routes & Integration     | 1        | 45 min    |
| 5     | Test: Types & Password   | 1        | 30 min    |
| 6     | Test: Repository & Cache | 1        | 45 min    |
| 7     | Test: Claims & Service   | 1-2      | 60 min    |
| 8     | Test: Routes & Account Finder | 1   | 45 min    |

**Total: 8-10 sessions, ~7 hours**

---

## Phase 1: Types, Errors & Password

### Session 1.1: Foundation Types and Password Utilities

**Reference**: [03-types-and-password.md](03-types-and-password.md)
**Objective**: Create the user data model and password management utilities.

**Tasks**:

| #     | Task                                              | File                    |
| ----- | ------------------------------------------------- | ----------------------- |
| 1.1.1 | Create User types, UserRow, mapRowToUser, input types, status type | `src/users/types.ts` |
| 1.1.2 | Create UserNotFoundError and UserValidationError   | `src/users/errors.ts`   |
| 1.1.3 | Create password validation, hashPassword, verifyPassword | `src/users/password.ts` |

**Deliverables**:
- [ ] `src/users/types.ts` with User, UserRow, mapRowToUser, CreateUserInput, UpdateUserInput, AddressInput, UserListOptions
- [ ] `src/users/errors.ts` with UserNotFoundError, UserValidationError
- [ ] `src/users/password.ts` with validatePassword, hashPassword, verifyPassword
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Repository & Cache

### Session 2.1: User Repository

**Reference**: [04-repository-and-cache.md](04-repository-and-cache.md)
**Objective**: Create the PostgreSQL data access layer for users.

**Tasks**:

| #     | Task                                          | File                       |
| ----- | --------------------------------------------- | -------------------------- |
| 2.1.1 | Create insertUser with all fields             | `src/users/repository.ts`  |
| 2.1.2 | Create findUserById, findUserByEmail, getPasswordHash | `src/users/repository.ts` |
| 2.1.3 | Create updateUser with dynamic SET builder    | `src/users/repository.ts`  |
| 2.1.4 | Create listUsers with pagination/search/sort  | `src/users/repository.ts`  |
| 2.1.5 | Create emailExists, updateLoginStats, countByOrganization | `src/users/repository.ts` |

**Deliverables**:
- [ ] Complete `src/users/repository.ts` with all CRUD + utility operations
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: User Cache

**Reference**: [04-repository-and-cache.md](04-repository-and-cache.md)
**Objective**: Create the Redis caching layer for users.

**Tasks**:

| #     | Task                                    | File                  |
| ----- | --------------------------------------- | --------------------- |
| 2.2.1 | Create getCachedUserById with Date deserialization | `src/users/cache.ts` |
| 2.2.2 | Create cacheUser with TTL              | `src/users/cache.ts`  |
| 2.2.3 | Create invalidateUserCache             | `src/users/cache.ts`  |

**Deliverables**:
- [ ] Complete `src/users/cache.ts` with get/set/invalidate
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Claims & Service

### Session 3.1: OIDC Claims Builder

**Reference**: [05-service-and-claims.md](05-service-and-claims.md)
**Objective**: Create the scope-based OIDC Standard Claims builder.

**Tasks**:

| #     | Task                                           | File                   |
| ----- | ---------------------------------------------- | ---------------------- |
| 3.1.1 | Create OidcClaims and OidcAddress types        | `src/users/claims.ts`  |
| 3.1.2 | Create buildUserClaims with scope-based mapping | `src/users/claims.ts` |
| 3.1.3 | Create hasAddress helper                       | `src/users/claims.ts`  |

**Deliverables**:
- [ ] Complete `src/users/claims.ts` with scope-based claims building
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 3.2: User Service

**Reference**: [05-service-and-claims.md](05-service-and-claims.md)
**Objective**: Create the business logic orchestrator.

**Tasks**:

| #     | Task                                           | File                    |
| ----- | ---------------------------------------------- | ----------------------- |
| 3.2.1 | Create createUser, getUserById, getUserByEmail, updateUser, listUsersByOrganization | `src/users/service.ts` |
| 3.2.2 | Create status lifecycle: deactivate, reactivate, suspend, unsuspend, lock, unlock | `src/users/service.ts` |
| 3.2.3 | Create password management: setUserPassword, verifyUserPassword, clearUserPassword | `src/users/service.ts` |
| 3.2.4 | Create email verification and login tracking   | `src/users/service.ts` |
| 3.2.5 | Create findUserForOidc for account finder       | `src/users/service.ts` |
| 3.2.6 | Create barrel export                           | `src/users/index.ts`   |

**Deliverables**:
- [ ] Complete `src/users/service.ts` with all business logic
- [ ] Complete `src/users/index.ts` barrel export
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Routes & Integration

### Session 4.1: API Routes and Server Integration

**Reference**: [06-api-routes.md](06-api-routes.md), [05-service-and-claims.md](05-service-and-claims.md)
**Objective**: Create REST API endpoints and upgrade the account finder.

**Tasks**:

| #     | Task                                             | File                          |
| ----- | ------------------------------------------------ | ----------------------------- |
| 4.1.1 | Create user route handlers with Zod validation   | `src/routes/users.ts`         |
| 4.1.2 | Mount user routes in Koa app                     | `src/server.ts`               |
| 4.1.3 | Upgrade account finder to use user service/claims | `src/oidc/account-finder.ts` |

**Deliverables**:
- [ ] Complete `src/routes/users.ts` with all endpoints
- [ ] `src/server.ts` updated with user route mounting
- [ ] `src/oidc/account-finder.ts` upgraded from stub to full implementation
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Test — Types & Password

### Session 5.1: Types, Errors, and Password Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for foundation types and password utilities.

**Tasks**:

| #     | Task                                     | File                                      |
| ----- | ---------------------------------------- | ----------------------------------------- |
| 5.1.1 | Test mapRowToUser, all field mappings    | `tests/unit/users/types.test.ts`          |
| 5.1.2 | Test error classes                       | `tests/unit/users/errors.test.ts`         |
| 5.1.3 | Test validatePassword, hashPassword, verifyPassword | `tests/unit/users/password.test.ts` |

**Deliverables**:
- [ ] `tests/unit/users/types.test.ts` (~8 tests)
- [ ] `tests/unit/users/errors.test.ts` (~4 tests)
- [ ] `tests/unit/users/password.test.ts` (~10 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Test — Repository & Cache

### Session 6.1: Repository and Cache Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for PostgreSQL repository and Redis cache.

**Tasks**:

| #     | Task                                           | File                                        |
| ----- | ---------------------------------------------- | ------------------------------------------- |
| 6.1.1 | Test all repository operations (mocked pool)   | `tests/unit/users/repository.test.ts`       |
| 6.1.2 | Test cache get/set/invalidate (mocked redis)   | `tests/unit/users/cache.test.ts`            |

**Deliverables**:
- [ ] `tests/unit/users/repository.test.ts` (~20 tests)
- [ ] `tests/unit/users/cache.test.ts` (~10 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: Test — Claims & Service

### Session 7.1: Claims Builder Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for OIDC claims building.

**Tasks**:

| #     | Task                                         | File                                     |
| ----- | -------------------------------------------- | ---------------------------------------- |
| 7.1.1 | Test scope-based claims building             | `tests/unit/users/claims.test.ts`        |

**Deliverables**:
- [ ] `tests/unit/users/claims.test.ts` (~15 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 7.2: Service Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for service layer business logic.

**Tasks**:

| #     | Task                                                | File                                      |
| ----- | --------------------------------------------------- | ----------------------------------------- |
| 7.2.1 | Test CRUD operations (create, read, update, list)   | `tests/unit/users/service.test.ts`        |
| 7.2.2 | Test status lifecycle (all transitions)             | `tests/unit/users/service.test.ts`        |
| 7.2.3 | Test password and email management                  | `tests/unit/users/service.test.ts`        |
| 7.2.4 | Test login tracking and OIDC integration            | `tests/unit/users/service.test.ts`        |

**Deliverables**:
- [ ] `tests/unit/users/service.test.ts` (~30 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 8: Test — Routes & Account Finder

### Session 8.1: Route and Account Finder Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for API routes and upgraded account finder.

**Tasks**:

| #     | Task                                        | File                                             |
| ----- | ------------------------------------------- | ------------------------------------------------ |
| 8.1.1 | Test route handlers and Zod validation      | `tests/unit/routes/users.test.ts`                |
| 8.1.2 | Update account finder tests for new implementation | `tests/unit/oidc/account-finder.test.ts`   |
| 8.1.3 | Run final full verification                 | —                                                |

**Deliverables**:
- [ ] `tests/unit/routes/users.test.ts` (~20 tests)
- [ ] `tests/unit/oidc/account-finder.test.ts` updated (~6 tests)
- [ ] Final `yarn verify` passing with zero warnings/errors
- [ ] All ~123 new tests passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Types, Errors & Password
- [ ] 1.1.1 Create User types, UserRow, mapRowToUser, input types
- [ ] 1.1.2 Create UserNotFoundError and UserValidationError
- [ ] 1.1.3 Create password validation, hashPassword, verifyPassword

### Phase 2: Repository & Cache
- [ ] 2.1.1 Create insertUser with all fields
- [ ] 2.1.2 Create findUserById, findUserByEmail, getPasswordHash
- [ ] 2.1.3 Create updateUser with dynamic SET builder
- [ ] 2.1.4 Create listUsers with pagination/search/sort
- [ ] 2.1.5 Create emailExists, updateLoginStats, countByOrganization
- [ ] 2.2.1 Create getCachedUserById with Date deserialization
- [ ] 2.2.2 Create cacheUser with TTL
- [ ] 2.2.3 Create invalidateUserCache

### Phase 3: Claims & Service
- [ ] 3.1.1 Create OidcClaims and OidcAddress types
- [ ] 3.1.2 Create buildUserClaims with scope-based mapping
- [ ] 3.1.3 Create hasAddress helper
- [ ] 3.2.1 Create CRUD service functions
- [ ] 3.2.2 Create status lifecycle functions
- [ ] 3.2.3 Create password management functions
- [ ] 3.2.4 Create email verification and login tracking
- [ ] 3.2.5 Create findUserForOidc
- [ ] 3.2.6 Create barrel export

### Phase 4: Routes & Integration
- [ ] 4.1.1 Create user route handlers with Zod validation
- [ ] 4.1.2 Mount user routes in Koa app
- [ ] 4.1.3 Upgrade account finder to use user service/claims

### Phase 5: Test — Types & Password
- [ ] 5.1.1 Test mapRowToUser, all field mappings
- [ ] 5.1.2 Test error classes
- [ ] 5.1.3 Test validatePassword, hashPassword, verifyPassword

### Phase 6: Test — Repository & Cache
- [ ] 6.1.1 Test all repository operations
- [ ] 6.1.2 Test cache get/set/invalidate

### Phase 7: Test — Claims & Service
- [ ] 7.1.1 Test scope-based claims building
- [ ] 7.2.1 Test CRUD operations
- [ ] 7.2.2 Test status lifecycle
- [ ] 7.2.3 Test password and email management
- [ ] 7.2.4 Test login tracking and OIDC integration

### Phase 8: Test — Routes & Account Finder
- [ ] 8.1.1 Test route handlers and Zod validation
- [ ] 8.1.2 Update account finder tests
- [ ] 8.1.3 Run final full verification

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/users/99-execution-plan.md`"
2. Read relevant technical spec document(s)

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan users` to continue

---

## Dependencies

```
Phase 1 (Types, Errors, Password)
    ↓
Phase 2 (Repository, Cache)
    ↓
Phase 3 (Claims, Service)
    ↓
Phase 4 (Routes, Integration)
    ↓
Phase 5 (Test: Types & Password)
    ↓
Phase 6 (Test: Repository & Cache)
    ↓
Phase 7 (Test: Claims & Service)
    ↓
Phase 8 (Test: Routes & Account Finder)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 8 phases completed
2. ✅ All verification passing (`yarn verify` — lint + build + test)
3. ✅ No warnings/errors
4. ✅ ~123 new tests passing
5. ✅ No regressions in existing tests
6. ✅ Documentation updated (comments, doc comments)
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
