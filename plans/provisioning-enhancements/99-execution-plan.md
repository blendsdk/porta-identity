# Execution Plan: Provisioning System Enhancements

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-28 18:04
> **Progress**: 42/42 tasks (100%) ✅ COMPLETE

## Overview

Implement RD-26: Fix critical provisioning bugs, add missing client fields, and extend provisioning to users/modules/branding/2FA.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Bug Fixes & Credentials | 4 | ~6 hrs |
| 2 | Client Fields & Schema Parity | 2 | ~3 hrs |
| 3 | Richer Provisioning | 5 | ~8 hrs |
| 4 | Documentation Review & Update | 1 | ~1 hr |

**Total: 12 sessions, ~18 hours**

---

## Phase 1: Bug Fixes & Credentials

### Session 1.1: Import Engine SQL Fixes

**Reference**: [03-phase1-bug-fixes-credentials.md](03-phase1-bug-fixes-credentials.md) §1-3
**Objective**: Fix silently-dropped fields in processOrganization + processClient, fix client_id format

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Add `default_login_methods` to org INSERT SQL + parameter | `src/lib/data-import.ts` |
| 1.1.2 | Add `default_login_methods` to org UPDATE SQL (overwrite) | `src/lib/data-import.ts` |
| 1.1.3 | Add `login_methods` + `token_endpoint_auth_method` to client INSERT SQL | `src/lib/data-import.ts` |
| 1.1.4 | Add `login_methods` + `token_endpoint_auth_method` to client UPDATE SQL | `src/lib/data-import.ts` |
| 1.1.5 | Replace inline `randomBytes` with static import of `generateClientId()` | `src/lib/data-import.ts` |

**Deliverables**:
- [ ] processOrganization INSERT/UPDATE include default_login_methods
- [ ] processClient INSERT/UPDATE include login_methods + token_endpoint_auth_method
- [ ] Client ID uses generateClientId() (base64url format)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 1.2: Secret Generation & Credentials Types

**Reference**: [03-phase1-bug-fixes-credentials.md](03-phase1-bug-fixes-credentials.md) §4-6
**Objective**: Add ImportClientCredentials type, secret generation for confidential clients, credentials in result

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.2.1 | Add `ImportClientCredentials` interface + extend `ImportResult` with `credentials` array | `src/lib/data-import.ts` |
| 1.2.2 | Add `RETURNING id` to client INSERT, import crypto functions, implement secret generation for confidential clients | `src/lib/data-import.ts` |
| 1.2.3 | Extend existing SELECT to fetch `client_id, client_type` for skip/update paths | `src/lib/data-import.ts` |
| 1.2.4 | Populate credentials for all code paths (create/skip/update) | `src/lib/data-import.ts` |
| 1.2.5 | Update dry-run path with credential indicators (`'(would be generated)'`) | `src/lib/data-import.ts` |

**Deliverables**:
- [ ] ImportClientCredentials type defined and exported
- [ ] Confidential clients get auto-generated secret within transaction
- [ ] Credentials populated for created, skipped, updated, and dry-run clients
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 1.3: CLI Credentials Display + Examples

**Reference**: [03-phase1-bug-fixes-credentials.md](03-phase1-bug-fixes-credentials.md) §7-8
**Objective**: Display credentials table in CLI output, fix entity count, update examples

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.3.1 | Add credentials summary table to `displayResult()` with warning banner | `src/cli/commands/provision.ts` |
| 1.3.2 | Verify and fix entity count display (no double-counting) | `src/cli/commands/provision.ts` |
| 1.3.3 | Update example YAML files to demonstrate Phase 1 features | `examples/provision-*.yaml` |

**Deliverables**:
- [ ] Credentials table shows Client Name, Client ID, Type, Secret
- [ ] Entity count is accurate
- [ ] Example files updated
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 1.4: Phase 1 Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Phase 1 tests
**Objective**: Comprehensive test coverage for all Phase 1 changes

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.4.1 | Unit tests: processOrganization default_login_methods (create + update + omitted) | `tests/unit/lib/data-import-extensions.test.ts` |
| 1.4.2 | Unit tests: processClient login_methods + token_endpoint_auth_method (public vs confidential) | `tests/unit/lib/data-import-extensions.test.ts` |
| 1.4.3 | Unit tests: client_id format + secret generation (confidential vs public vs overwrite) | `tests/unit/lib/data-import-extensions.test.ts` |
| 1.4.4 | Unit tests: credentials collection (created/skipped/updated/dry-run) + displayResult | `tests/unit/cli/provision.test.ts` |
| 1.4.5 | Integration tests: full provision flow + DB verification | `tests/integration/services/data-export-import.test.ts` |

**Deliverables**:
- [ ] All Phase 1 unit tests pass
- [ ] Integration tests verify DB state
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Client Fields & Schema Parity

### Session 2.1: New Client Fields + Secret Config

**Reference**: [04-phase2-client-fields.md](04-phase2-client-fields.md)
**Objective**: Add all missing client fields to YAML schema + import engine

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Add `post_logout_redirect_uris`, `allowed_origins`, `require_pkce` to provisionClientSchema + clientSchema | `src/cli/commands/provision.ts`, `src/lib/data-import.ts` |
| 2.1.2 | Add `token_endpoint_auth_method` to provisionClientSchema (explicit override) | `src/cli/commands/provision.ts` |
| 2.1.3 | Add `secret` sub-schema (label, expires_at, expires_in) + `parseDuration()` helper | `src/cli/commands/provision.ts` |
| 2.1.4 | Add validation: secret on public = error, expires_at + expires_in = error, require_pkce:false = warning | `src/cli/commands/provision.ts` |
| 2.1.5 | Update processClient() INSERT SQL with all Phase 2 fields + wire secret config | `src/lib/data-import.ts` |
| 2.1.6 | Update processClient() UPDATE SQL with all Phase 2 fields | `src/lib/data-import.ts` |
| 2.1.7 | Update transformToManifest() to flatten secret block (secret_label, secret_expires_at) | `src/cli/commands/provision.ts` |

**Deliverables**:
- [ ] All Phase 2 client fields accepted in YAML and persisted to DB
- [ ] Secret config (label + expiry) wired to secret generation
- [ ] Validation rules enforced
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 2.2: Phase 2 Tests + Examples

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Phase 2 tests
**Objective**: Test coverage for Phase 2 + update examples

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | Unit tests: new client fields (INSERT + UPDATE paths) | `tests/unit/lib/data-import-extensions.test.ts` |
| 2.2.2 | Unit tests: secret block parsing, duration parsing, validation errors | `tests/unit/cli/provision.test.ts` |
| 2.2.3 | Integration test: full provision with all Phase 2 fields → DB verification | `tests/integration/services/data-export-import.test.ts` |
| 2.2.4 | Update example YAML files for Phase 2 features | `examples/provision-enterprise.yaml` |

**Deliverables**:
- [ ] All Phase 2 tests pass
- [ ] Example files demonstrate all new fields
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Richer Provisioning

### Session 3.1: User Provisioning Schema + Transform

**Reference**: [05-phase3-richer-provisioning.md](05-phase3-richer-provisioning.md) §1-2
**Objective**: Add user schemas, allow_passwords flag, update transform

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Add provisionUserSchema, provisionUserRoleRefSchema, provisionUserClaimRefSchema | `src/cli/commands/provision.ts` |
| 3.1.2 | Add `users` to provisionOrganizationSchema + `allow_passwords` to provisioningSchema | `src/cli/commands/provision.ts` |
| 3.1.3 | Add user, userRoleAssignment, userClaimValue schemas to importManifestSchema | `src/lib/data-import.ts` |
| 3.1.4 | Update transformToManifest() — extract users, role assignments, claim values + password validation/hashing | `src/cli/commands/provision.ts` |

**Deliverables**:
- [ ] User schemas defined in both files
- [ ] Transform extracts nested users to flat manifest
- [ ] Password validation + client-side hashing works
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 3.2: processUser + Password Handling

**Reference**: [05-phase3-richer-provisioning.md](05-phase3-richer-provisioning.md) §3
**Objective**: Implement user processing in import engine

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Implement processUser() function (create/skip/update with org scoping) | `src/lib/data-import.ts` |
| 3.2.2 | Add userMap to importData() + Phase 9 loop for users | `src/lib/data-import.ts` |
| 3.2.3 | Add allow_passwords warning display in CLI handler | `src/cli/commands/provision.ts` |

**Deliverables**:
- [ ] processUser handles create, merge-skip, overwrite-update
- [ ] userMap tracks orgSlug:email → userId
- [ ] Password hash stored correctly when provided
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 3.3: App Modules + Org Branding + 2FA Policy

**Reference**: [05-phase3-richer-provisioning.md](05-phase3-richer-provisioning.md) §6-8
**Objective**: Add module, branding, and 2FA provisioning

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.3.1 | Add provisionModuleSchema + modules to provisionApplicationSchema | `src/cli/commands/provision.ts` |
| 3.3.2 | Add applicationModule schema to importManifestSchema + processApplicationModule() | `src/lib/data-import.ts` |
| 3.3.3 | Add provisionBrandingSchema + branding to provisionOrganizationSchema | `src/cli/commands/provision.ts` |
| 3.3.4 | Update processOrganization() INSERT/UPDATE with branding columns + two_factor_policy | `src/lib/data-import.ts` |
| 3.3.5 | Update transformToManifest() for modules flattening + branding/2FA mapping | `src/cli/commands/provision.ts` |

**Deliverables**:
- [ ] App modules can be provisioned
- [ ] Org branding (text fields + URLs) persisted with correct column mapping
- [ ] 2FA policy persisted
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 3.4: User-Role & User-Claim Assignments + Processing Order

**Reference**: [05-phase3-richer-provisioning.md](05-phase3-richer-provisioning.md) §4-5, §9
**Objective**: Implement assignment processors, finalize 12-phase processing order

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.4.1 | Implement processUserRoleAssignment() (resolve user + role + ON CONFLICT) | `src/lib/data-import.ts` |
| 3.4.2 | Implement processUserClaimValue() (resolve user + claim + validate type + upsert) | `src/lib/data-import.ts` |
| 3.4.3 | Update importData() with full 12-phase processing order | `src/lib/data-import.ts` |
| 3.4.4 | Update module header comment to reflect 12 phases | `src/lib/data-import.ts` |

**Deliverables**:
- [ ] User-role assignments work with ON CONFLICT DO NOTHING
- [ ] User claim values validated against claim_type
- [ ] 12-phase processing order correct
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 3.5: Phase 3 Tests + Full Example

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) — Phase 3 tests
**Objective**: Complete test coverage for Phase 3 + comprehensive example

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.5.1 | Unit tests: user provisioning (create/skip/update + password handling) | `tests/unit/lib/data-import-extensions.test.ts` |
| 3.5.2 | Unit tests: user-role + user-claim assignments (success + error paths) | `tests/unit/lib/data-import-extensions.test.ts` |
| 3.5.3 | Unit tests: app modules, branding, 2FA policy + transform | `tests/unit/cli/provision.test.ts` |
| 3.5.4 | Integration tests: full Phase 3 provision + rollback test | `tests/integration/services/data-export-import.test.ts` |
| 3.5.5 | Create comprehensive example file | `examples/provision-full.yaml` |

**Deliverables**:
- [ ] All Phase 3 tests pass
- [ ] Rollback integration test confirms all-or-nothing
- [ ] provision-full.yaml demonstrates all features
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Documentation Review & Update

### Session 4.1: Documentation Review & Update

**Reference**: All plan documents + completed implementation
**Objective**: Ensure all documentation reflects the implemented changes

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Review implementation against docs/ coverage checklist | `docs/**/*.md` |
| 4.1.2 | Add/update documentation for new or changed features | `docs/cli/provisioning.md`, `docs/api/imports.md` |
| 4.1.3 | Update docs/index.md if new pages were added | `docs/index.md` |
| 4.1.4 | Update .clinerules/project.md if structure/rules changed | `.clinerules/project.md` |

**Deliverables**:
- [ ] All new/changed features are documented
- [ ] No stale or inaccurate documentation remains
- [ ] docs/index.md is up to date
- [ ] .clinerules/project.md reflects current project state

---

## Task Checklist (All Phases)

### Phase 1: Bug Fixes & Credentials
- [x] 1.1.1 Add default_login_methods to org INSERT SQL ✅ (completed: 2026-04-28 15:17)
- [x] 1.1.2 Add default_login_methods to org UPDATE SQL ✅ (completed: 2026-04-28 15:17)
- [x] 1.1.3 Add login_methods + token_endpoint_auth_method to client INSERT SQL ✅ (completed: 2026-04-28 15:17)
- [x] 1.1.4 Add login_methods + token_endpoint_auth_method to client UPDATE SQL ✅ (completed: 2026-04-28 15:17)
- [x] 1.1.5 Replace inline randomBytes with generateClientId() ✅ (completed: 2026-04-28 15:17)
- [x] 1.2.1 Add ImportClientCredentials type + extend ImportResult ✅ (completed: 2026-04-28 15:18)
- [x] 1.2.2 Add RETURNING id + crypto imports + secret generation ✅ (completed: 2026-04-28 15:18)
- [x] 1.2.3 Extend SELECT to fetch client_id, client_type ✅ (completed: 2026-04-28 15:18)
- [x] 1.2.4 Populate credentials for create/skip/update paths ✅ (completed: 2026-04-28 15:18)
- [x] 1.2.5 Update dry-run with credential indicators ✅ (completed: 2026-04-28 15:18)
- [x] 1.3.1 Add credentials summary table to displayResult() ✅ (completed: 2026-04-28 15:19)
- [x] 1.3.2 Verify and fix entity count display ✅ (completed: 2026-04-28 15:19)
- [x] 1.3.3 Update example YAML files ✅ (completed: 2026-04-28 15:19)
- [x] 1.4.1 Unit tests: org default_login_methods ✅ (completed: 2026-04-28 18:01)
- [x] 1.4.2 Unit tests: client login_methods + token_endpoint_auth_method ✅ (completed: 2026-04-28 18:01)
- [x] 1.4.3 Unit tests: client_id format + secret generation ✅ (completed: 2026-04-28 18:01)
- [x] 1.4.4 Unit tests: credentials collection + displayResult ✅ (completed: 2026-04-28 18:01)
- [x] 1.4.5 Integration tests: full provision + DB verification ✅ (completed: 2026-04-28 17:57 — smoke-test script)

### Phase 2: Client Fields & Schema Parity
- [x] 2.1.1 Add post_logout_redirect_uris, allowed_origins, require_pkce ✅ (completed: 2026-04-28 15:39)
- [x] 2.1.2 Add token_endpoint_auth_method explicit override ✅ (completed: 2026-04-28 15:41)
- [x] 2.1.3 Add secret sub-schema + parseDuration() ✅ (completed: 2026-04-28 15:41)
- [x] 2.1.4 Add validation rules (secret on public, mutual exclusion, pkce warning) ✅ (completed: 2026-04-28 15:42)
- [x] 2.1.5 Update processClient() INSERT SQL with Phase 2 fields ✅ (completed: 2026-04-28 15:40)
- [x] 2.1.6 Update processClient() UPDATE SQL with Phase 2 fields ✅ (completed: 2026-04-28 15:40)
- [x] 2.1.7 Update transformToManifest() to flatten secret block ✅ (completed: 2026-04-28 15:42)
- [x] 2.2.1 Unit tests: new client fields ✅ (completed: 2026-04-28 15:43)
- [x] 2.2.2 Unit tests: secret block + duration parsing + validation ✅ (completed: 2026-04-28 15:44)
- [x] 2.2.3 Integration test: Phase 2 fields DB verification ✅ (completed: 2026-04-28 17:57 — smoke-test script)
- [x] 2.2.4 Update example YAML files ✅ (completed: 2026-04-28 15:42)

### Phase 3: Richer Provisioning
- [x] 3.1.1 Add user schemas to provision.ts ✅ (completed: 2026-04-28 16:30)
- [x] 3.1.2 Add users + allow_passwords to top-level schemas ✅ (completed: 2026-04-28 16:30)
- [x] 3.1.3 Add user schemas to importManifestSchema ✅ (completed: 2026-04-28 16:30)
- [x] 3.1.4 Update transformToManifest() for users + password hashing ✅ (completed: 2026-04-28 16:30)
- [x] 3.2.1 Implement processUser() ✅ (completed: 2026-04-28 16:45)
- [x] 3.2.2 Add userMap + Phase 9 loop to importData() ✅ (completed: 2026-04-28 16:45)
- [x] 3.2.3 Add allow_passwords warning in CLI ✅ (completed: 2026-04-28 16:45)
- [x] 3.3.1 Add module schema to provision.ts ✅ (completed: 2026-04-28 16:50)
- [x] 3.3.2 Add module schema + processApplicationModule() to data-import.ts ✅ (completed: 2026-04-28 16:50)
- [x] 3.3.3 Add branding schema to provision.ts ✅ (completed: 2026-04-28 16:55)
- [x] 3.3.4 Update processOrganization() with branding + 2FA ✅ (completed: 2026-04-28 16:55)
- [x] 3.3.5 Update transformToManifest() for modules + branding/2FA ✅ (completed: 2026-04-28 16:55)
- [x] 3.4.1 Implement processUserRoleAssignment() ✅ (completed: 2026-04-28 17:00)
- [x] 3.4.2 Implement processUserClaimValue() ✅ (completed: 2026-04-28 17:00)
- [x] 3.4.3 Update importData() with 12-phase order ✅ (completed: 2026-04-28 17:00)
- [x] 3.4.4 Update module header comment ✅ (completed: 2026-04-28 17:00)
- [x] 3.5.1 Unit tests: user provisioning ✅ (completed: 2026-04-28 18:03)
- [x] 3.5.2 Unit tests: user-role + user-claim assignments ✅ (completed: 2026-04-28 18:03)
- [x] 3.5.3 Unit tests: modules, branding, 2FA + transform ✅ (completed: 2026-04-28 18:03)
- [x] 3.5.4 Integration tests: Phase 3 + rollback ✅ (completed: 2026-04-28 17:57 — smoke-test script)
- [x] 3.5.5 Create examples/provision-full.yaml ✅ (completed: 2026-04-28 18:00)

### Phase 4: Documentation Review & Update
- [x] 4.1.1 Review docs/ coverage checklist ✅ (completed: 2026-04-28 17:10)
- [x] 4.1.2 Update provisioning + imports docs ✅ (completed: 2026-04-28 17:10)
- [x] 4.1.3 Update docs/index.md if needed ✅ (completed: 2026-04-28 17:10 — no changes needed)
- [x] 4.1.4 Update .clinerules/project.md if needed ✅ (completed: 2026-04-28 17:10 — no structural changes)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/provisioning-enhancements/99-execution-plan.md`"

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan provisioning-enhancements` to continue

---

## Dependencies

```
Phase 1 (Bug Fixes & Credentials)
    ↓
Phase 2 (Client Fields & Schema Parity)
    ↓
Phase 3 (Richer Provisioning)
    ↓
Phase 4 (Documentation Review & Update)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules
5. ✅ Security hardened — secrets never logged, passwords hashed client-side, SQL parameterized
6. ✅ Documentation updated
7. ✅ Code reviewed (if applicable)
8. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
