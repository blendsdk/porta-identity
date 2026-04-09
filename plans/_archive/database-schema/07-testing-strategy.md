# Testing Strategy: Database Schema & Migrations

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: Migration file validation (well-formed SQL, naming convention)
- Integration tests: Full migration lifecycle (up, down, re-up, seed data verification)
- Schema validation: All tables, columns, constraints, indexes, triggers verified against specification

### Test Infrastructure

- **Requires**: Docker services running (`yarn docker:up`) — PostgreSQL 16
- **Database**: Uses the development `porta` database directly (integration tests manage their own schema lifecycle via migrate up/down)
- **Framework**: Vitest (already configured)

## Test Categories

### Unit Tests

| Test | Description | Priority |
|------|-------------|----------|
| Migration file naming | All files match `NNN_description.sql` pattern | High |
| Migration file structure | All files contain `-- Up Migration` and `-- Down Migration` markers | High |
| Migration file ordering | No gaps or duplicates in numbering | Medium |
| SQL syntax basic check | Each migration contains valid SQL keywords (CREATE TABLE, etc.) | Medium |

**Location**: `tests/unit/migrations.test.ts`

These tests run without a database connection — they validate the migration files as text.

### Integration Tests

| Test | Components | Description |
|------|-----------|-------------|
| Full migration up | All 11 migrations | Run all migrations on fresh DB, verify success |
| Full migration down | All 11 migrations | Rollback all migrations, verify clean state |
| Migration idempotency | All migrations | Up → down → up works without errors |
| Table existence | All 19 tables | Verify each table exists after migrations |
| Column verification | Key tables | Verify critical columns exist with correct types |
| FK constraints | Cross-table | Verify foreign key relationships are enforced |
| Unique constraints | Organizations, users, etc. | Verify unique constraint violations are caught |
| Check constraints | Status columns | Verify invalid status values are rejected |
| Partial indexes | Organizations (super-admin) | Verify only one super-admin org allowed |
| CITEXT behavior | Users (email) | Verify case-insensitive email uniqueness |
| Cascade delete | Org → clients, org → users | Verify ON DELETE CASCADE removes child rows |
| SET NULL delete | Audit log FKs | Verify ON DELETE SET NULL preserves audit entries |
| Updated_at trigger | Organizations, users, etc. | Verify trigger auto-updates timestamp |
| Seed data | Super-admin org, config | Verify seed data is inserted correctly |
| Config defaults | System config | Verify all default config values are present |

**Location**: `tests/integration/migrations.test.ts`

These tests require a running PostgreSQL instance.

### Seed Data Verification Tests

| Scenario | Expected Result |
|----------|-----------------|
| Super-admin org exists | `organizations` has row with `slug = 'porta-admin'`, `is_super_admin = true` |
| Config defaults present | `system_config` has all expected keys (access_token_ttl, refresh_token_ttl, etc.) |
| Config value types | Each config value has correct `value_type` |
| No duplicate super-admin | Attempting to insert second super-admin org fails (unique partial index) |

## Test Data

### Fixtures Needed

For integration tests, we need test data to exercise constraints and relationships:

```typescript
// Test organization
const testOrg = {
  name: 'Test Corp',
  slug: 'test-corp',
  status: 'active',
};

// Test application
const testApp = {
  name: 'TestApp',
  slug: 'test-app',
  status: 'active',
};

// Test user (minimal — no password hash for schema tests)
const testUser = {
  // organization_id: set dynamically after org insert
  email: 'test@example.com',
  email_verified: false,
  status: 'active',
};
```

### Mock Requirements

- No mocks needed — integration tests use the real PostgreSQL database
- Tests manage their own schema via `runMigrations('up')` and `runMigrations('down')`

## Test Execution Plan

### Integration Test Flow

```
1. beforeAll:
   - Verify Docker PostgreSQL is running
   - Run all migrations DOWN to ensure clean state
   - Run all migrations UP

2. describe('Schema Structure'):
   - Verify all 19 tables exist
   - Verify key columns and types
   - Verify indexes exist

3. describe('Constraints'):
   - Test FK enforcement
   - Test unique constraints
   - Test check constraints
   - Test partial indexes

4. describe('Triggers'):
   - Test updated_at auto-update

5. describe('Seed Data'):
   - Verify super-admin org
   - Verify config defaults

6. describe('Cascade Behavior'):
   - Test ON DELETE CASCADE
   - Test ON DELETE SET NULL

7. describe('Migration Lifecycle'):
   - Run DOWN all
   - Verify tables are gone
   - Run UP all
   - Verify tables exist again

8. afterAll:
   - Clean up (leave migrations applied for dev use)
```

### Unit Test Flow

```
1. Read migration files from migrations/ directory
2. Validate naming convention
3. Validate structure (up/down markers)
4. Validate ordering
```

## Verification Checklist

- [ ] All unit tests pass (migration file validation)
- [ ] All integration tests pass (schema verification)
- [ ] All 19 tables created successfully
- [ ] All foreign key constraints enforced
- [ ] All indexes created
- [ ] All check constraints working
- [ ] CITEXT email uniqueness works
- [ ] Super-admin partial unique index works
- [ ] Cascade delete behavior correct
- [ ] SET NULL delete behavior correct
- [ ] Updated_at triggers fire correctly
- [ ] Seed data inserted correctly
- [ ] Migration up/down/up cycle works
- [ ] `yarn verify` passes (lint + build + test)
