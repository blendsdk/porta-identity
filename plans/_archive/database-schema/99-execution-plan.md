# Execution Plan: Database Schema & Migrations

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 14:06
> **Progress**: 20/20 tasks (100%) ✅ COMPLETE

## Overview

Implement the complete PostgreSQL database schema for Porta v5: install `node-pg-migrate`, create 11 migration files (extensions, organizations, applications, clients, users, RBAC, custom claims, config, audit log, OIDC adapter, seed data), create a programmatic migration runner, and write integration tests verifying the full schema.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Migration System Setup | 1 | 20 min |
| 2 | Core Schema Migrations (001–004) | 1 | 30 min |
| 3 | Users, RBAC & Remaining Migrations (005–010) | 1–2 | 40 min |
| 4 | Seed Data & Migration Runner | 1 | 20 min |
| 5 | Testing & Verification | 1 | 30 min |

**Total: 4–5 sessions, ~2.5 hours**

---

## Phase 1: Migration System Setup

### Session 1.1: Install node-pg-migrate, Add Scripts

**Reference**: [03-migration-system.md](03-migration-system.md)
**Objective**: Install the migration tool, add yarn scripts, create the migrations directory.

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Install `node-pg-migrate` as a runtime dependency | `package.json`, `yarn.lock` |
| 1.1.2 | Add migration scripts to `package.json` (migrate, migrate:rollback, migrate:status, migrate:create) | `package.json` |
| 1.1.3 | Create `migrations/` directory with a `.gitkeep` placeholder | `migrations/.gitkeep` |

**Deliverables**:
- [ ] `node-pg-migrate` installed
- [ ] `yarn migrate`, `yarn migrate:rollback`, `yarn migrate:status`, `yarn migrate:create` scripts defined
- [ ] `migrations/` directory exists
- [ ] `yarn build` still passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 2: Core Schema Migrations (001–004)

### Session 2.1: Extensions, Organizations, Applications, Clients

**Reference**: [04-schema-core.md](04-schema-core.md)
**Objective**: Create the first four migration files covering database extensions and core entity tables.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create migration 001: PostgreSQL extensions (pgcrypto, citext) + trigger function | `migrations/001_extensions.sql` |
| 2.1.2 | Create migration 002: Organizations table with branding, partial unique index, trigger | `migrations/002_organizations.sql` |
| 2.1.3 | Create migration 003: Applications + application_modules tables | `migrations/003_applications.sql` |
| 2.1.4 | Create migration 004: Clients + client_secrets tables | `migrations/004_clients.sql` |

**Deliverables**:
- [ ] 4 migration files created with proper up/down sections
- [ ] All SQL follows RD-02 specification
- [ ] Comments on tables and key columns
- [ ] `yarn build` still passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 3: Users, RBAC & Remaining Migrations (005–010)

### Session 3.1: Users, Tokens, RBAC, Custom Claims

**Reference**: [05-schema-users-auth.md](05-schema-users-auth.md), [06-schema-rbac-config.md](06-schema-rbac-config.md)
**Objective**: Create migration files for users, auth tokens, roles/permissions, and custom claims.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create migration 005: Users table + magic_link_tokens + password_reset_tokens + invitation_tokens | `migrations/005_users.sql` |
| 3.1.2 | Create migration 006: Roles + permissions + role_permissions + user_roles | `migrations/006_roles_permissions.sql` |
| 3.1.3 | Create migration 007: Custom claim definitions + custom claim values | `migrations/007_custom_claims.sql` |

**Deliverables**:
- [ ] 3 migration files created with proper up/down sections
- [ ] Users table has all OIDC Standard Claims columns
- [ ] All FK constraints and indexes specified
- [ ] `yarn build` still passes

**Verify**: `clear && sleep 3 && yarn build`

### Session 3.2: Config, Audit Log, OIDC Adapter

**Reference**: [06-schema-rbac-config.md](06-schema-rbac-config.md)
**Objective**: Create migration files for system configuration, signing keys, audit log, and OIDC adapter.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Create migration 008: System config + signing keys | `migrations/008_config.sql` |
| 3.2.2 | Create migration 009: Audit log table | `migrations/009_audit_log.sql` |
| 3.2.3 | Create migration 010: OIDC payloads table | `migrations/010_oidc_adapter.sql` |

**Deliverables**:
- [ ] 3 migration files created with proper up/down sections
- [ ] Audit log uses ON DELETE SET NULL
- [ ] OIDC payloads has composite PK (id, type)
- [ ] `yarn build` still passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 4: Seed Data & Migration Runner

### Session 4.1: Seed Migration and Programmatic Runner

**Reference**: [03-migration-system.md](03-migration-system.md), [04-schema-core.md](04-schema-core.md)
**Objective**: Create the seed data migration and the programmatic migration runner utility.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Create migration 011: Seed data (super-admin org, default config values) | `migrations/011_seed.sql` |
| 4.1.2 | Create programmatic migration runner utility | `src/lib/migrator.ts` |
| 4.1.3 | Run `yarn docker:up` and `yarn migrate` to verify all migrations execute on real DB | Manual verification |

**Deliverables**:
- [ ] Seed migration inserts super-admin org and all config defaults
- [ ] `src/lib/migrator.ts` provides `runMigrations()` function
- [ ] All 11 migrations run successfully on fresh database
- [ ] `yarn build` still passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 5: Testing & Verification

### Session 5.1: Unit and Integration Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit tests for migration file validation and integration tests for schema verification.

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Write unit tests: migration file naming, structure, ordering | `tests/unit/migrations.test.ts` |
| 5.1.2 | Write integration tests: table existence and column verification | `tests/integration/migrations.test.ts` |
| 5.1.3 | Write integration tests: constraints (FK, unique, check, partial index) | `tests/integration/migrations.test.ts` |
| 5.1.4 | Write integration tests: cascade behavior, triggers, seed data | `tests/integration/migrations.test.ts` |

**Deliverables**:
- [ ] Unit tests validate migration files
- [ ] Integration tests verify all 19 tables exist
- [ ] Integration tests verify constraints and relationships
- [ ] Integration tests verify seed data
- [ ] `yarn verify` passes (lint + build + all tests)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Migration System Setup
- [x] 1.1.1 Install `node-pg-migrate` dependency ✅ (completed: 2026-04-08 13:55)
- [x] 1.1.2 Add migration scripts to `package.json` ✅ (completed: 2026-04-08 13:55)
- [x] 1.1.3 Create `migrations/` directory ✅ (completed: 2026-04-08 13:55)

### Phase 2: Core Schema Migrations (001–004)
- [x] 2.1.1 Create migration 001: Extensions + trigger function ✅ (completed: 2026-04-08 13:57)
- [x] 2.1.2 Create migration 002: Organizations ✅ (completed: 2026-04-08 13:57)
- [x] 2.1.3 Create migration 003: Applications + modules ✅ (completed: 2026-04-08 13:57)
- [x] 2.1.4 Create migration 004: Clients + secrets ✅ (completed: 2026-04-08 13:57)

### Phase 3: Users, RBAC & Remaining Migrations (005–010)
- [x] 3.1.1 Create migration 005: Users + token tables ✅ (completed: 2026-04-08 13:58)
- [x] 3.1.2 Create migration 006: Roles + permissions ✅ (completed: 2026-04-08 13:58)
- [x] 3.1.3 Create migration 007: Custom claims ✅ (completed: 2026-04-08 13:58)
- [x] 3.2.1 Create migration 008: Config + signing keys ✅ (completed: 2026-04-08 13:58)
- [x] 3.2.2 Create migration 009: Audit log ✅ (completed: 2026-04-08 13:58)
- [x] 3.2.3 Create migration 010: OIDC adapter ✅ (completed: 2026-04-08 13:58)

### Phase 4: Seed Data & Migration Runner
- [x] 4.1.1 Create migration 011: Seed data ✅ (completed: 2026-04-08 14:00)
- [x] 4.1.2 Create programmatic migration runner (`src/lib/migrator.ts`) ✅ (completed: 2026-04-08 14:01)
- [x] 4.1.3 Run migrations on real database (manual verification) ✅ (completed: 2026-04-08 14:03)

### Phase 5: Testing & Verification
- [x] 5.1.1 Write unit tests for migration file validation ✅ (completed: 2026-04-08 14:04)
- [x] 5.1.2 Write integration tests: table existence and columns ✅ (completed: 2026-04-08 14:05)
- [x] 5.1.3 Write integration tests: constraints ✅ (completed: 2026-04-08 14:05)
- [x] 5.1.4 Write integration tests: cascades, triggers, seed data ✅ (completed: 2026-04-08 14:05)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/database-schema/99-execution-plan.md`"
2. Read the referenced technical spec document(s) for the session

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active **commit mode** (see `make_plan.md`)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with `[x]`
3. Start new conversation for next session
4. Run `exec_plan database-schema` to continue

---

## Dependencies

```
Phase 1 (Migration System Setup)
    ↓
Phase 2 (Core Schema: 001–004)
    ↓
Phase 3 (Users, RBAC, Config: 005–010)
    ↓
Phase 4 (Seed Data & Runner)
    ↓
Phase 5 (Testing & Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All 11 migration files created and execute successfully
3. ✅ All 19 tables exist with correct schema
4. ✅ All constraints, indexes, and triggers working
5. ✅ Seed data creates super-admin org and config defaults
6. ✅ `src/lib/migrator.ts` provides programmatic migration runner
7. ✅ `yarn verify` passes (lint + build + all tests)
8. ✅ No warnings/errors
9. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
