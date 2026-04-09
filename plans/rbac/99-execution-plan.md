# Execution Plan: RBAC & Custom Claims

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-09 11:04
> **Progress**: 21/46 tasks (46%)

## Overview

Implement Authorization (RBAC) & Custom Claims for Porta v5. Two new modules (`src/rbac/`, `src/custom-claims/`), four new route files, OIDC token integration, and comprehensive tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                           | Sessions | Est. Time |
|-------|---------------------------------|----------|-----------|
| 1     | RBAC Types, Errors & Slugs      | 1        | 45 min    |
| 2     | RBAC Repository & Cache         | 2        | 90 min    |
| 3     | RBAC Services                   | 2        | 90 min    |
| 4     | Custom Claims Module            | 2        | 90 min    |
| 5     | Token Integration               | 1        | 45 min    |
| 6     | API Routes                      | 2        | 90 min    |
| 7     | Route Tests & Final Verification | 2       | 90 min    |

**Total: ~12 sessions, ~9 hours**

---

## Phase 1: RBAC Types, Errors & Slugs

### Session 1.1: RBAC Foundation Types + Tests

**Reference**: [03-rbac-types-and-errors.md](03-rbac-types-and-errors.md)
**Objective**: Create RBAC types, errors, slugs, and all their unit tests

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 1.1.1 | Create RBAC types (Role, Permission, UserRole interfaces, row types, input types, row mappers) | `src/rbac/types.ts` |
| 1.1.2 | Create RBAC error classes (RoleNotFoundError, PermissionNotFoundError, RbacValidationError) | `src/rbac/errors.ts` |
| 1.1.3 | Create slug/permission validation (generateRoleSlug, validateRoleSlug, validatePermissionSlug, parsePermissionSlug) | `src/rbac/slugs.ts` |
| 1.1.4 | Create unit tests for types (mapRowToRole, mapRowToPermission, mapRowToUserRole) | `tests/unit/rbac/types.test.ts` |
| 1.1.5 | Create unit tests for errors (all error classes) | `tests/unit/rbac/errors.test.ts` |
| 1.1.6 | Create unit tests for slugs (role slug gen/validation, permission slug validation/parsing) | `tests/unit/rbac/slugs.test.ts` |

**Deliverables**:
- [ ] `src/rbac/types.ts` with all interfaces and row mappers
- [ ] `src/rbac/errors.ts` with 3 error classes
- [ ] `src/rbac/slugs.ts` with slug generation and permission format validation
- [ ] All type/error/slug tests passing (~36 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: RBAC Repository & Cache

### Session 2.1: Role & Permission Repositories + Tests

**Reference**: [04-rbac-repository-and-cache.md](04-rbac-repository-and-cache.md)
**Objective**: Implement role and permission PostgreSQL repositories with tests

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 2.1.1 | Create role repository (insert, find, update, delete, list, slugExists, countUsers) | `src/rbac/role-repository.ts` |
| 2.1.2 | Create unit tests for role repository | `tests/unit/rbac/role-repository.test.ts` |
| 2.1.3 | Create permission repository (insert, find, update, delete, list, slugExists, countRoles) | `src/rbac/permission-repository.ts` |
| 2.1.4 | Create unit tests for permission repository | `tests/unit/rbac/permission-repository.test.ts` |

**Deliverables**:
- [ ] Role repository with full CRUD + helper queries
- [ ] Permission repository with full CRUD + helper queries
- [ ] All repository tests passing (~28 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: Mapping Repository & Cache + Tests

**Reference**: [04-rbac-repository-and-cache.md](04-rbac-repository-and-cache.md)
**Objective**: Implement join table repository and Redis cache with tests

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 2.2.1 | Create mapping repository (role-permission + user-role operations, permission resolution) | `src/rbac/mapping-repository.ts` |
| 2.2.2 | Create unit tests for mapping repository | `tests/unit/rbac/mapping-repository.test.ts` |
| 2.2.3 | Create Redis cache (role cache, user roles/permissions cache, invalidation) | `src/rbac/cache.ts` |
| 2.2.4 | Create unit tests for cache | `tests/unit/rbac/cache.test.ts` |

**Deliverables**:
- [ ] Mapping repository with role-permission and user-role operations
- [ ] Redis cache with graceful degradation
- [ ] All mapping repo + cache tests passing (~32 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: RBAC Services

### Session 3.1: Role & Permission Services + Tests

**Reference**: [05-rbac-service.md](05-rbac-service.md)
**Objective**: Implement role and permission service layers with business logic and tests

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 3.1.1 | Create role service (CRUD with slug validation, deletion guards, cache orchestration, audit) | `src/rbac/role-service.ts` |
| 3.1.2 | Create unit tests for role service | `tests/unit/rbac/role-service.test.ts` |
| 3.1.3 | Create permission service (CRUD with slug format validation, deletion guards, audit) | `src/rbac/permission-service.ts` |
| 3.1.4 | Create unit tests for permission service | `tests/unit/rbac/permission-service.test.ts` |

**Deliverables**:
- [ ] Role service with full CRUD + permission management
- [ ] Permission service with full CRUD + slug format validation
- [ ] All service tests passing (~40 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 3.2: User-Role Service + Barrel Export + Tests

**Reference**: [05-rbac-service.md](05-rbac-service.md)
**Objective**: Implement user-role assignment service, claims builders, and barrel export

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 3.2.1 | Create user-role service (assign/remove, getUserRoles/Permissions, buildRoleClaims, buildPermissionClaims) | `src/rbac/user-role-service.ts` |
| 3.2.2 | Create unit tests for user-role service | `tests/unit/rbac/user-role-service.test.ts` |
| 3.2.3 | Create RBAC barrel export | `src/rbac/index.ts` |

**Deliverables**:
- [ ] User-role service with assignment management + claims building
- [ ] Barrel export for complete RBAC module
- [ ] All user-role service tests passing (~24 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Custom Claims Module

### Session 4.1: Custom Claims Types, Errors, Validators, Repository + Tests

**Reference**: [06-custom-claims-module.md](06-custom-claims-module.md)
**Objective**: Implement custom claims foundation layers with tests

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 4.1.1 | Create custom claims types (definitions, values, row mappers) | `src/custom-claims/types.ts` |
| 4.1.2 | Create custom claims errors (ClaimNotFoundError, ClaimValidationError) | `src/custom-claims/errors.ts` |
| 4.1.3 | Create validators (reserved names, claim name validation, value type validation) | `src/custom-claims/validators.ts` |
| 4.1.4 | Create unit tests for types and errors | `tests/unit/custom-claims/types.test.ts`, `tests/unit/custom-claims/errors.test.ts` |
| 4.1.5 | Create unit tests for validators | `tests/unit/custom-claims/validators.test.ts` |
| 4.1.6 | Create repository (definitions CRUD + values CRUD + joined queries) | `src/custom-claims/repository.ts` |
| 4.1.7 | Create unit tests for repository | `tests/unit/custom-claims/repository.test.ts` |

**Deliverables**:
- [ ] Custom claims types, errors, validators, and repository
- [ ] All foundation tests passing (~48 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 4.2: Custom Claims Cache, Service, Barrel Export + Tests

**Reference**: [06-custom-claims-module.md](06-custom-claims-module.md)
**Objective**: Implement custom claims service with token claims building

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 4.2.1 | Create cache (definitions cache with graceful degradation) | `src/custom-claims/cache.ts` |
| 4.2.2 | Create unit tests for cache | `tests/unit/custom-claims/cache.test.ts` |
| 4.2.3 | Create service (definition CRUD, value management, buildCustomClaims) | `src/custom-claims/service.ts` |
| 4.2.4 | Create unit tests for service | `tests/unit/custom-claims/service.test.ts` |
| 4.2.5 | Create barrel export | `src/custom-claims/index.ts` |

**Deliverables**:
- [ ] Custom claims cache, service, and barrel export
- [ ] All cache + service tests passing (~30 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Token Integration

### Session 5.1: Extend Account Finder + Update Tests

**Reference**: [07-token-integration-and-routes.md](07-token-integration-and-routes.md)
**Objective**: Inject RBAC and custom claims into OIDC token issuance flow

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 5.1.1 | Extend account-finder claims() to call buildRoleClaims, buildPermissionClaims, buildCustomClaims | `src/oidc/account-finder.ts` |
| 5.1.2 | Add/update account-finder tests for RBAC + custom claims in token output | `tests/unit/oidc/account-finder.test.ts` |

**Deliverables**:
- [ ] Token claims include roles, permissions, and custom claims
- [ ] Backward-compatible with existing standard OIDC claims
- [ ] All existing + new account-finder tests passing (+8 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: API Routes

### Session 6.1: Role & Permission Routes + Tests

**Reference**: [07-token-integration-and-routes.md](07-token-integration-and-routes.md)
**Objective**: Create admin API routes for roles and permissions

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 6.1.1 | Create role routes (8 endpoints with Zod validation) | `src/routes/roles.ts` |
| 6.1.2 | Create unit tests for role routes | `tests/unit/routes/roles.test.ts` |
| 6.1.3 | Create permission routes (6 endpoints with Zod validation) | `src/routes/permissions.ts` |
| 6.1.4 | Create unit tests for permission routes | `tests/unit/routes/permissions.test.ts` |

**Deliverables**:
- [ ] Role routes with 8 endpoints
- [ ] Permission routes with 6 endpoints
- [ ] All route tests passing (~28 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 6.2: User-Role & Custom Claim Routes + Server Mounting + Tests

**Reference**: [07-token-integration-and-routes.md](07-token-integration-and-routes.md)
**Objective**: Create remaining routes and mount all in server.ts

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 6.2.1 | Create user-role routes (4 endpoints) | `src/routes/user-roles.ts` |
| 6.2.2 | Create unit tests for user-role routes | `tests/unit/routes/user-roles.test.ts` |
| 6.2.3 | Create custom claims routes (9 endpoints) | `src/routes/custom-claims.ts` |
| 6.2.4 | Create unit tests for custom claims routes | `tests/unit/routes/custom-claims.test.ts` |
| 6.2.5 | Mount all new routers in server.ts | `src/server.ts` |

**Deliverables**:
- [ ] User-role routes with 4 endpoints
- [ ] Custom claims routes with 9 endpoints
- [ ] All routes mounted in server.ts
- [ ] All route tests passing (~26 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: Final Verification & Cleanup

### Session 7.1: Final Verification & Edge Cases

**Objective**: Run complete verification, fix any issues, ensure zero regressions

**Tasks**:

| #     | Task | File |
|-------|------|------|
| 7.1.1 | Run full `yarn verify` and fix any failures | All files |
| 7.1.2 | Review all new files for missing doc comments, incomplete error handling | All new files |
| 7.1.3 | Verify 980 baseline tests still pass + new tests (~300) | All test files |

**Deliverables**:
- [ ] All ~1280 tests passing
- [ ] `yarn verify` passing (lint + build + test)
- [ ] Zero regressions in existing functionality
- [ ] All code quality standards met (comments, doc comments, DRY)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: RBAC Types, Errors & Slugs
- [x] 1.1.1 Create RBAC types (Role, Permission, UserRole interfaces, row types, row mappers) ✅ (completed: 2026-04-09 10:40)
- [x] 1.1.2 Create RBAC error classes ✅ (completed: 2026-04-09 10:40)
- [x] 1.1.3 Create slug/permission validation ✅ (completed: 2026-04-09 10:41)
- [x] 1.1.4 Create unit tests for types (15 tests) ✅ (completed: 2026-04-09 10:42)
- [x] 1.1.5 Create unit tests for errors (12 tests) ✅ (completed: 2026-04-09 10:42)
- [x] 1.1.6 Create unit tests for slugs (53 tests) ✅ (completed: 2026-04-09 10:43)

### Phase 2: RBAC Repository & Cache
- [x] 2.1.1 Create role repository (26 tests) ✅ (completed: 2026-04-09 11:00)
- [x] 2.1.2 Create unit tests for role repository ✅ (completed: 2026-04-09 11:00)
- [x] 2.1.3 Create permission repository (27 tests) ✅ (completed: 2026-04-09 11:00)
- [x] 2.1.4 Create unit tests for permission repository ✅ (completed: 2026-04-09 11:00)
- [x] 2.2.1 Create mapping repository (31 tests) ✅ (completed: 2026-04-09 11:00)
- [x] 2.2.2 Create unit tests for mapping repository ✅ (completed: 2026-04-09 11:00)
- [x] 2.2.3 Create Redis cache (24 tests) ✅ (completed: 2026-04-09 11:00)
- [x] 2.2.4 Create unit tests for cache ✅ (completed: 2026-04-09 11:00)

### Phase 3: RBAC Services
- [x] 3.1.1 Create role service (29 tests) ✅ (completed: 2026-04-09 11:02)
- [x] 3.1.2 Create unit tests for role service ✅ (completed: 2026-04-09 11:02)
- [x] 3.1.3 Create permission service (18 tests) ✅ (completed: 2026-04-09 11:02)
- [x] 3.1.4 Create unit tests for permission service ✅ (completed: 2026-04-09 11:02)
- [x] 3.2.1 Create user-role service (18 tests) ✅ (completed: 2026-04-09 11:02)
- [x] 3.2.2 Create unit tests for user-role service ✅ (completed: 2026-04-09 11:02)
- [x] 3.2.3 Update RBAC barrel export ✅ (completed: 2026-04-09 11:02)

### Phase 4: Custom Claims Module
- [ ] 4.1.1 Create custom claims types
- [ ] 4.1.2 Create custom claims errors
- [ ] 4.1.3 Create validators
- [ ] 4.1.4 Create unit tests for types and errors
- [ ] 4.1.5 Create unit tests for validators
- [ ] 4.1.6 Create repository
- [ ] 4.1.7 Create unit tests for repository
- [ ] 4.2.1 Create cache
- [ ] 4.2.2 Create unit tests for cache
- [ ] 4.2.3 Create service
- [ ] 4.2.4 Create unit tests for service
- [ ] 4.2.5 Create barrel export

### Phase 5: Token Integration
- [ ] 5.1.1 Extend account-finder claims() for RBAC + custom claims
- [ ] 5.1.2 Add/update account-finder tests

### Phase 6: API Routes
- [ ] 6.1.1 Create role routes
- [ ] 6.1.2 Create unit tests for role routes
- [ ] 6.1.3 Create permission routes
- [ ] 6.1.4 Create unit tests for permission routes
- [ ] 6.2.1 Create user-role routes
- [ ] 6.2.2 Create unit tests for user-role routes
- [ ] 6.2.3 Create custom claims routes
- [ ] 6.2.4 Create unit tests for custom claims routes
- [ ] 6.2.5 Mount all new routers in server.ts

### Phase 7: Final Verification
- [ ] 7.1.1 Run full verification and fix any failures
- [ ] 7.1.2 Review all new files for quality standards
- [ ] 7.1.3 Verify all tests pass (baseline + new)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/rbac/99-execution-plan.md`"
2. Load CodeOps rules: `get_rule("agents")`, `get_rule("code")`, `get_rule("testing")`, `get_rule("git-commands")`

### Ending a Session

1. Run the verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan rbac` to continue

---

## Dependencies

```
Phase 1: RBAC Types, Errors & Slugs
    ↓
Phase 2: RBAC Repository & Cache
    ↓
Phase 3: RBAC Services
    ↓ (Phase 4 can partially overlap with Phase 3)
Phase 4: Custom Claims Module
    ↓
Phase 5: Token Integration (depends on Phase 3 + Phase 4)
    ↓
Phase 6: API Routes (depends on Phase 3 + Phase 4)
    ↓
Phase 7: Final Verification (depends on all above)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed (46/46 tasks)
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ ~300 new tests added, ~1280 total
5. ✅ Zero regressions in 980 baseline tests
6. ✅ All new code has doc comments and explanatory comments
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
