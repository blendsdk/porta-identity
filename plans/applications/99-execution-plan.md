# Execution Plan: Application & Client Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 18:20
> **Progress**: 31/30 tasks (100% — Phase 6 complete, 7 remaining in Phase 7)

## Overview

Implement the application, client, and secret management system for Porta v5.
Three entities across two new source modules (`src/applications/` and `src/clients/`),
two new route files, one new npm dependency (`argon2`), and updates to the existing
OIDC client-finder.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                              | Sessions | Est. Time |
|-------|------------------------------------|----------|-----------|
| 1     | Application Foundation (Types/Slugs/Errors) | 1  | 30 min    |
| 2     | Application Repository & Cache     | 2        | 60 min    |
| 3     | Application Service                | 1-2      | 45 min    |
| 4     | Client Foundation (Types/Crypto/Validators) | 2 | 60 min    |
| 5     | Client & Secret Repository         | 2        | 60 min    |
| 6     | Client & Secret Service            | 2        | 60 min    |
| 7     | API Routes & OIDC Integration      | 2-3      | 90 min    |

**Total: 12-14 sessions, ~6-7 hours**

---

## Phase 1: Application Foundation

### Session 1.1: Types, Slugs, Errors, and Tests

**Reference**: [03-application-module.md](03-application-module.md)
**Objective**: Create application types, slug utilities, error classes, and their tests.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 1.1.1 | Create application types, interfaces, and row mapping       | `src/applications/types.ts`                    |
| 1.1.2 | Create application slug generation and validation           | `src/applications/slugs.ts`                    |
| 1.1.3 | Create application domain error classes                     | `src/applications/errors.ts`                   |
| 1.1.4 | Write tests for types (~5 tests)                            | `tests/unit/applications/types.test.ts`        |
| 1.1.5 | Write tests for slugs (~15 tests)                           | `tests/unit/applications/slugs.test.ts`        |

**Deliverables**:
- [ ] Application and ApplicationModule interfaces exported
- [ ] Row mapping functions for both entities
- [ ] Slug generation from names and validation with reserved words
- [ ] ApplicationNotFoundError and ApplicationValidationError
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Application Repository & Cache

### Session 2.1: Application Repository

**Reference**: [03-application-module.md](03-application-module.md)
**Objective**: Create PostgreSQL repository with CRUD for apps and modules.

**Tasks**:

| #     | Task                                                        | File(s)                                              |
|-------|-------------------------------------------------------------|------------------------------------------------------|
| 2.1.1 | Create application repository (CRUD + module CRUD)          | `src/applications/repository.ts`                     |
| 2.1.2 | Write repository tests (~15 tests)                          | `tests/unit/applications/repository.test.ts`         |

**Deliverables**:
- [ ] Insert, find, update, list for applications
- [ ] Insert, find, update, list for modules
- [ ] Dynamic update query builder, paginated listing
- [ ] Slug existence checks (global for apps, scoped for modules)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: Application Cache

**Reference**: [03-application-module.md](03-application-module.md)
**Objective**: Create Redis cache layer for applications.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 2.2.1 | Create application cache (Redis get/set/invalidate)         | `src/applications/cache.ts`                    |
| 2.2.2 | Write cache tests (~8 tests)                                | `tests/unit/applications/cache.test.ts`        |

**Deliverables**:
- [ ] Cache by slug and ID with 5-min TTL
- [ ] Date deserialization round-trip
- [ ] Graceful degradation on Redis errors
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Application Service

### Session 3.1: Application Service and Barrel Export

**Reference**: [03-application-module.md](03-application-module.md)
**Objective**: Create application business logic service with full CRUD, status lifecycle, module management, and audit logging.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 3.1.1 | Create application service (CRUD + status + modules)        | `src/applications/service.ts`                  |
| 3.1.2 | Create barrel export                                        | `src/applications/index.ts`                    |
| 3.1.3 | Write service tests (~25 tests)                             | `tests/unit/applications/service.test.ts`      |

**Deliverables**:
- [ ] Full CRUD with cache integration
- [ ] Status lifecycle (activate, deactivate, archive)
- [ ] Module CRUD with per-app slug validation
- [ ] Audit logging on all write operations
- [ ] Clean barrel export
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Client Foundation

### Session 4.1: Client Types, Errors, and Crypto

**Reference**: [04-client-module.md](04-client-module.md), [05-secret-management.md](05-secret-management.md)
**Objective**: Create client types, error classes, and cryptographic utilities. Install argon2.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 4.1.1 | Install `argon2` npm dependency                             | `package.json`                                 |
| 4.1.2 | Create client types, interfaces, and row mapping            | `src/clients/types.ts`                         |
| 4.1.3 | Create client domain error classes                          | `src/clients/errors.ts`                        |
| 4.1.4 | Create crypto utilities (client ID, secret, Argon2id)       | `src/clients/crypto.ts`                        |
| 4.1.5 | Write tests for types (~6 tests)                            | `tests/unit/clients/types.test.ts`             |
| 4.1.6 | Write tests for crypto (~10 tests)                          | `tests/unit/clients/crypto.test.ts`            |

**Deliverables**:
- [ ] argon2 installed and working
- [ ] Client, ClientSecret, input/output types exported
- [ ] Row mapping functions
- [ ] ClientNotFoundError and ClientValidationError
- [ ] generateClientId(), generateSecret(), hashSecret(), verifySecretHash()
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 4.2: Redirect URI Validators

**Reference**: [04-client-module.md](04-client-module.md)
**Objective**: Create redirect URI validation and default grant type logic.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 4.2.1 | Create redirect URI validators and default grant types      | `src/clients/validators.ts`                    |
| 4.2.2 | Write validator tests (~18 tests)                           | `tests/unit/clients/validators.test.ts`        |

**Deliverables**:
- [ ] Redirect URI validation (HTTPS, fragments, wildcards, custom schemes)
- [ ] Default grant types by client/app type combo
- [ ] Default token endpoint auth method by client type
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Client & Secret Repository

### Session 5.1: Client Repository

**Reference**: [04-client-module.md](04-client-module.md)
**Objective**: Create PostgreSQL CRUD for clients.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 5.1.1 | Create client repository (CRUD with org/app filters)        | `src/clients/repository.ts`                    |
| 5.1.2 | Write client repository tests (~12 tests)                   | `tests/unit/clients/repository.test.ts`        |

**Deliverables**:
- [ ] Insert, find by ID, find by client_id, update, list with filters
- [ ] Dynamic update query builder
- [ ] Paginated listing with org/app/status/search filters
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 5.2: Secret Repository

**Reference**: [05-secret-management.md](05-secret-management.md)
**Objective**: Create PostgreSQL CRUD for client secrets.

**Tasks**:

| #     | Task                                                        | File(s)                                              |
|-------|-------------------------------------------------------------|------------------------------------------------------|
| 5.2.1 | Create secret repository                                    | `src/clients/secret-repository.ts`                   |
| 5.2.2 | Write secret repository tests (~10 tests)                   | `tests/unit/clients/secret-repository.test.ts`       |

**Deliverables**:
- [ ] Insert, find, list, list active, revoke, update last_used_at, cleanup
- [ ] Active secrets filter (status=active AND not expired)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Client & Secret Service

### Session 6.1: Client Cache and Service

**Reference**: [04-client-module.md](04-client-module.md)
**Objective**: Create client cache layer and business logic service.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 6.1.1 | Create client cache (Redis)                                 | `src/clients/cache.ts`                         |
| 6.1.2 | Write cache tests (~8 tests)                                | `tests/unit/clients/cache.test.ts`             |
| 6.1.3 | Create client service (CRUD + status + OIDC mapping)        | `src/clients/service.ts`                       |
| 6.1.4 | Write client service tests (~22 tests)                      | `tests/unit/clients/service.test.ts`           |

**Deliverables**:
- [ ] Client cache by client_id and internal ID
- [ ] Client CRUD with org/app validation
- [ ] Default grant types/auth method applied on creation
- [ ] Client status lifecycle (activate, deactivate, revoke)
- [ ] findForOidc() returning OIDC metadata format
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 6.2: Secret Service and Barrel Export

**Reference**: [05-secret-management.md](05-secret-management.md)
**Objective**: Create secret lifecycle service and barrel export for clients module.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 6.2.1 | Create secret service (generate, verify, revoke, cleanup)   | `src/clients/secret-service.ts`                |
| 6.2.2 | Create barrel export for clients module                     | `src/clients/index.ts`                         |
| 6.2.3 | Write secret service tests (~15 tests)                      | `tests/unit/clients/secret-service.test.ts`    |

**Deliverables**:
- [ ] generateAndStore() — gen + hash + insert + audit
- [ ] verify() — iterate active secrets, Argon2id check, update last_used_at
- [ ] revoke() — permanent revocation with audit
- [ ] cleanupExpired() — delete stale secrets
- [ ] Clean barrel export
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: API Routes & OIDC Integration

### Session 7.1: Application Routes

**Reference**: [06-api-routes-and-integration.md](06-api-routes-and-integration.md)
**Objective**: Create application admin API routes with Zod validation.

**Tasks**:

| #     | Task                                                        | File(s)                                              |
|-------|-------------------------------------------------------------|------------------------------------------------------|
| 7.1.1 | Create application route handlers                           | `src/routes/applications.ts`                         |
| 7.1.2 | Write application route tests (~15 tests)                   | `tests/unit/routes/applications.test.ts`             |

**Deliverables**:
- [ ] All 11 endpoints (app CRUD + status + module CRUD)
- [ ] Zod validation on all inputs
- [ ] Error mapping (404, 400)
- [ ] Super-admin middleware applied
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 7.2: Client Routes

**Reference**: [06-api-routes-and-integration.md](06-api-routes-and-integration.md)
**Objective**: Create client and secret admin API routes.

**Tasks**:

| #     | Task                                                        | File(s)                                        |
|-------|-------------------------------------------------------------|------------------------------------------------|
| 7.2.1 | Create client and secret route handlers                     | `src/routes/clients.ts`                        |
| 7.2.2 | Write client route tests (~18 tests)                        | `tests/unit/routes/clients.test.ts`            |

**Deliverables**:
- [ ] All 10 endpoints (client CRUD + status + secrets)
- [ ] Secret creation returns plaintext with warning
- [ ] Secret list never includes hashes
- [ ] Zod validation on all inputs
- [ ] Super-admin middleware applied
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 7.3: OIDC Integration & Server Mounting

**Reference**: [06-api-routes-and-integration.md](06-api-routes-and-integration.md)
**Objective**: Update client-finder, mount routes, final verification.

**Tasks**:

| #     | Task                                                        | File(s)                                                  |
|-------|-------------------------------------------------------------|----------------------------------------------------------|
| 7.3.1 | Update client-finder to delegate to client service          | `src/oidc/client-finder.ts`                              |
| 7.3.2 | Update client-finder tests                                  | `tests/unit/oidc/client-finder.test.ts`                  |
| 7.3.3 | Mount application and client routes in server               | `src/server.ts`                                          |
| 7.3.4 | Final verification and cleanup                              | All files                                                |

**Deliverables**:
- [ ] Client-finder delegates to client service (cache-backed)
- [ ] Existing client-finder tests updated (no regressions)
- [ ] Both routers mounted in server
- [ ] All 348+ existing tests still pass
- [ ] Full `yarn verify` passing
- [ ] All new files have doc comments

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Application Foundation
- [x] 1.1.1 Create application types, interfaces, and row mapping ✅ (completed: 2026-04-08 16:55)
- [x] 1.1.2 Create application slug generation and validation ✅ (completed: 2026-04-08 16:55)
- [x] 1.1.3 Create application domain error classes ✅ (completed: 2026-04-08 16:55)
- [x] 1.1.4 Write tests for types (~9 tests) ✅ (completed: 2026-04-08 16:55)
- [x] 1.1.5 Write tests for slugs (~26 tests) ✅ (completed: 2026-04-08 16:55)

### Phase 2: Application Repository & Cache
- [x] 2.1.1 Create application repository (CRUD + module CRUD) ✅ (completed: 2026-04-08 17:05)
- [x] 2.1.2 Write repository tests (~32 tests) ✅ (completed: 2026-04-08 17:06)
- [x] 2.2.1 Create application cache (Redis get/set/invalidate) ✅ (completed: 2026-04-08 18:11)
- [x] 2.2.2 Write cache tests (~13 tests) ✅ (completed: 2026-04-08 18:11)

### Phase 3: Application Service
- [x] 3.1.1 Create application service (CRUD + status + modules) ✅ (completed: 2026-04-08 18:15)
- [x] 3.1.2 Create barrel export ✅ (completed: 2026-04-08 18:15)
- [x] 3.1.3 Write service tests (~34 tests) ✅ (completed: 2026-04-08 18:16)

### Phase 4: Client Foundation
- [x] 4.1.1 Install argon2 npm dependency ✅ (completed: 2026-04-08 18:18)
- [x] 4.1.2 Create client types, interfaces, and row mapping ✅ (completed: 2026-04-08 18:19)
- [x] 4.1.3 Create client domain error classes ✅ (completed: 2026-04-08 18:19)
- [x] 4.1.4 Create crypto utilities (client ID, secret, Argon2id) ✅ (completed: 2026-04-08 18:19)
- [x] 4.1.5 Write tests for types (~9 tests) ✅ (completed: 2026-04-08 18:20)
- [x] 4.1.6 Write tests for crypto (~11 tests) ✅ (completed: 2026-04-08 18:20)
- [x] 4.2.1 Create redirect URI validators and default grant types ✅ (completed: 2026-04-08 18:22)
- [x] 4.2.2 Write validator tests (~27 tests) ✅ (completed: 2026-04-08 18:22)

### Phase 5: Client & Secret Repository
- [x] 5.1.1 Create client repository (CRUD with org/app filters) ✅ (completed: 2026-04-08 18:24)
- [x] 5.1.2 Write client repository tests (~19 tests) ✅ (completed: 2026-04-08 18:25)
- [x] 5.2.1 Create secret repository ✅ (completed: 2026-04-08 18:25)
- [x] 5.2.2 Write secret repository tests (~13 tests) ✅ (completed: 2026-04-08 18:26)

### Phase 6: Client & Secret Service
- [x] 6.1.1 Create client cache (Redis) ✅ (completed: 2026-04-08 19:10)
- [x] 6.1.2 Write cache tests (~14 tests) ✅ (completed: 2026-04-08 19:10)
- [x] 6.1.3 Create client service (CRUD + status + OIDC mapping) ✅ (completed: 2026-04-08 19:17)
- [x] 6.1.4 Write client service tests (~36 tests) ✅ (completed: 2026-04-08 19:18)
- [x] 6.2.1 Create secret service (generate, verify, revoke, cleanup) ✅ (completed: 2026-04-08 19:19)
- [x] 6.2.2 Create barrel export for clients module ✅ (completed: 2026-04-08 19:20)
- [x] 6.2.3 Write secret service tests (~15 tests) ✅ (completed: 2026-04-08 19:20)

### Phase 7: API Routes & OIDC Integration
- [ ] 7.1.1 Create application route handlers
- [ ] 7.1.2 Write application route tests (~15 tests)
- [ ] 7.2.1 Create client and secret route handlers
- [ ] 7.2.2 Write client route tests (~18 tests)
- [ ] 7.3.1 Update client-finder to delegate to client service
- [ ] 7.3.2 Update client-finder tests
- [ ] 7.3.3 Mount application and client routes in server
- [ ] 7.3.4 Final verification and cleanup

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/applications/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode (see `make_plan.md`)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan applications` to continue

---

## Dependencies

```
Phase 1: Application Foundation (types, slugs, errors)
    ↓
Phase 2: Application Repository & Cache
    ↓
Phase 3: Application Service
    ↓
Phase 4: Client Foundation (types, crypto, validators)
    ↓
Phase 5: Client & Secret Repository
    ↓
Phase 6: Client & Secret Service
    ↓
Phase 7: API Routes & OIDC Integration
```

**Note**: Phase 4 technically only depends on Phase 1 (not Phases 2-3), but executing
sequentially keeps context manageable and ensures the application module is complete
before building the client module that references it.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 7 phases completed (30 tasks)
2. ✅ All verification passing (`yarn verify` — lint + build + ~530 tests)
3. ✅ No warnings/errors
4. ✅ All public functions have doc comments
5. ✅ All complex logic has explanatory comments
6. ✅ Client-finder properly delegates to client service
7. ✅ Secret verification works via Argon2id
8. ✅ No regressions in existing 348 tests
9. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
