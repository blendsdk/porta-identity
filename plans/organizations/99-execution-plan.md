# Execution Plan: Organization Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 15:50
> **Progress**: 15/20 tasks (75%)

## Overview

Implement the organization (tenant) management system for Porta v5, including
types, slug utilities, database repository, Redis cache, audit logging,
business-logic service, enhanced tenant resolver, super-admin middleware,
API routes with Zod validation, and comprehensive unit tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
|-------|--------------------------------|----------|-----------|
| 1     | Foundation Types & Slug Utils  | 1        | 30 min    |
| 2     | Repository & Cache Layer       | 2        | 60 min    |
| 3     | Audit Log & Organization Service | 2      | 60 min    |
| 4     | Enhanced Tenant Resolver       | 1        | 30 min    |
| 5     | API Routes & Server Integration | 2       | 60 min    |

**Total: 8 sessions, ~4 hours**

---

## Phase 1: Foundation Types & Slug Utilities

### Session 1.1: Types, Slug Utils, and Tests

**Reference**: [03-types-and-slugs.md](03-types-and-slugs.md)
**Objective**: Create organization types, row mapping, slug generation/validation, and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                          |
|-------|--------------------------------------------------------|--------------------------------------------------|
| 1.1.1 | Create organization types and row mapping function     | `src/organizations/types.ts`                     |
| 1.1.2 | Create slug generation and validation utilities        | `src/organizations/slugs.ts`                     |
| 1.1.3 | Write tests for slug utilities (~15 tests)             | `tests/unit/organizations/slugs.test.ts`         |
| 1.1.4 | Write tests for type mapping (~5 tests)                | `tests/unit/organizations/types.test.ts`         |

**Deliverables**:
- [ ] Organization types and interfaces exported
- [ ] Slug generation from names works correctly
- [ ] Slug validation catches all invalid cases
- [ ] Row-to-organization mapping works correctly
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Repository & Cache Layer

### Session 2.1: Organization Repository

**Reference**: [04-repository-and-cache.md](04-repository-and-cache.md)
**Objective**: Create PostgreSQL repository with all CRUD functions and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                              |
|-------|--------------------------------------------------------|------------------------------------------------------|
| 2.1.1 | Create organization repository with CRUD functions     | `src/organizations/repository.ts`                    |
| 2.1.2 | Write repository tests (~15 tests)                     | `tests/unit/organizations/repository.test.ts`        |

**Deliverables**:
- [ ] Insert, find, update, list, slugExists functions working
- [ ] Dynamic update query handles partial updates
- [ ] Paginated listing with filters and sorting
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: Organization Cache

**Reference**: [04-repository-and-cache.md](04-repository-and-cache.md)
**Objective**: Create Redis cache layer with get/set/invalidate and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                          |
|-------|--------------------------------------------------------|--------------------------------------------------|
| 2.2.1 | Create organization cache service (Redis)              | `src/organizations/cache.ts`                     |
| 2.2.2 | Write cache tests (~12 tests)                          | `tests/unit/organizations/cache.test.ts`         |

**Deliverables**:
- [ ] Cache get/set/invalidate by slug and ID
- [ ] Date serialization/deserialization round-trip
- [ ] Graceful degradation on Redis errors
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Audit Log & Organization Service

### Session 3.1: Audit Log Service

**Reference**: [05-service-and-audit.md](05-service-and-audit.md)
**Objective**: Create generic audit log writer and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                          |
|-------|--------------------------------------------------------|--------------------------------------------------|
| 3.1.1 | Create generic audit log writer service                | `src/lib/audit-log.ts`                           |
| 3.1.2 | Write audit log tests (~6 tests)                       | `tests/unit/lib/audit-log.test.ts`               |

**Deliverables**:
- [ ] Audit log writer inserts to audit_log table
- [ ] Fire-and-forget pattern (errors logged, never thrown)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 3.2: Organization Service

**Reference**: [05-service-and-audit.md](05-service-and-audit.md)
**Objective**: Create organization service with all business logic and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                          |
|-------|--------------------------------------------------------|--------------------------------------------------|
| 3.2.1 | Create organization service (CRUD + status lifecycle)  | `src/organizations/service.ts`                   |
| 3.2.2 | Create error types for domain errors                   | `src/organizations/errors.ts`                    |
| 3.2.3 | Write organization service tests (~25 tests)           | `tests/unit/organizations/service.test.ts`       |

**Deliverables**:
- [ ] Full CRUD with validation and cache integration
- [ ] Status lifecycle (suspend, activate, archive, restore)
- [ ] Super-admin protection rules enforced
- [ ] Audit logging on all write operations
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Enhanced Tenant Resolver

### Session 4.1: Update Tenant Resolver

**Reference**: [06-api-routes.md](06-api-routes.md)
**Objective**: Update tenant resolver with Redis cache and status differentiation.

**Tasks**:

| #     | Task                                                   | File(s)                                                        |
|-------|--------------------------------------------------------|----------------------------------------------------------------|
| 4.1.1 | Update tenant resolver middleware (cache + status)     | `src/middleware/tenant-resolver.ts`                            |
| 4.1.2 | Update tenant resolver tests (~10 tests)               | `tests/unit/middleware/tenant-resolver.test.ts`                |

**Deliverables**:
- [ ] Redis cache lookup before DB query
- [ ] Suspended org → 403, archived → 404
- [ ] Full Organization object on ctx.state
- [ ] Graceful degradation on Redis errors
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: API Routes & Server Integration

### Session 5.1: Super-Admin Middleware & Route Handlers

**Reference**: [06-api-routes.md](06-api-routes.md)
**Objective**: Create super-admin middleware, organization routes, and tests.

**Tasks**:

| #     | Task                                                   | File(s)                                              |
|-------|--------------------------------------------------------|------------------------------------------------------|
| 5.1.1 | Create super-admin authorization middleware            | `src/middleware/super-admin.ts`                       |
| 5.1.2 | Write super-admin middleware tests (~5 tests)          | `tests/unit/middleware/super-admin.test.ts`           |
| 5.1.3 | Create organization API route handlers                 | `src/routes/organizations.ts`                        |
| 5.1.4 | Write route handler tests (~15 tests)                  | `tests/unit/routes/organizations.test.ts`            |

**Deliverables**:
- [ ] Super-admin middleware rejects non-super-admin with 403
- [ ] All CRUD routes working with Zod validation
- [ ] Status action routes (suspend, activate, archive, restore)
- [ ] Validate slug endpoint
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 5.2: Server Integration & Barrel Export

**Reference**: [06-api-routes.md](06-api-routes.md)
**Objective**: Mount routes in server, create barrel export, final verification.

**Tasks**:

| #     | Task                                                   | File(s)                                          |
|-------|--------------------------------------------------------|--------------------------------------------------|
| 5.2.1 | Create barrel export for organizations module          | `src/organizations/index.ts`                     |
| 5.2.2 | Mount organization routes in server factory            | `src/server.ts`                                  |
| 5.2.3 | Final verification and cleanup                         | All files                                        |

**Deliverables**:
- [ ] Clean public API via barrel export
- [ ] Routes mounted and accessible in the server
- [ ] All existing tests still pass (no regressions)
- [ ] Full verify passing (`yarn verify`)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Foundation Types & Slug Utilities
- [x] 1.1.1 Create organization types and row mapping function ✅ (completed: 2026-04-08 16:06)
- [x] 1.1.2 Create slug generation and validation utilities ✅ (completed: 2026-04-08 16:07)
- [x] 1.1.3 Write tests for slug utilities (~24 tests) ✅ (completed: 2026-04-08 16:07)
- [x] 1.1.4 Write tests for type mapping (~5 tests) ✅ (completed: 2026-04-08 16:07)

### Phase 2: Repository & Cache Layer
- [x] 2.1.1 Create organization repository with CRUD functions ✅ (completed: 2026-04-08 16:12)
- [x] 2.1.2 Write repository tests (~19 tests) ✅ (completed: 2026-04-08 16:12)
- [x] 2.2.1 Create organization cache service (Redis) ✅ (completed: 2026-04-08 16:13)
- [x] 2.2.2 Write cache tests (~12 tests) ✅ (completed: 2026-04-08 16:14)

### Phase 3: Audit Log & Organization Service
- [x] 3.1.1 Create generic audit log writer service ✅ (completed: 2026-04-08 16:17)
- [x] 3.1.2 Write audit log tests (~6 tests) ✅ (completed: 2026-04-08 16:18)
- [x] 3.2.1 Create organization service (CRUD + status lifecycle) ✅ (completed: 2026-04-08 16:18)
- [x] 3.2.2 Create error types for domain errors ✅ (completed: 2026-04-08 16:17)
- [x] 3.2.3 Write organization service tests (~28 tests) ✅ (completed: 2026-04-08 16:19)

### Phase 4: Enhanced Tenant Resolver
- [x] 4.1.1 Update tenant resolver middleware (cache + status) ✅ (completed: 2026-04-08 16:24)
- [x] 4.1.2 Update tenant resolver tests (~10 tests) ✅ (completed: 2026-04-08 16:25)

### Phase 5: API Routes & Server Integration
- [ ] 5.1.1 Create super-admin authorization middleware
- [ ] 5.1.2 Write super-admin middleware tests (~5 tests)
- [ ] 5.1.3 Create organization API route handlers
- [ ] 5.1.4 Write route handler tests (~15 tests)
- [ ] 5.2.1 Create barrel export for organizations module
- [ ] 5.2.2 Mount organization routes in server factory
- [ ] 5.2.3 Final verification and cleanup

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/organizations/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode (see `make_plan.md`)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan organizations` to continue

---

## Dependencies

```
Phase 1: Types & Slugs
    ↓
Phase 2: Repository & Cache
    ↓
Phase 3: Audit Log & Service
    ↓
Phase 4: Enhanced Tenant Resolver
    ↓
Phase 5: API Routes & Server Integration
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed (20 tasks)
2. ✅ All verification passing (`yarn verify` — lint + build + ~335 tests)
3. ✅ No warnings/errors
4. ✅ All public functions have doc comments
5. ✅ All complex logic has explanatory comments
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
