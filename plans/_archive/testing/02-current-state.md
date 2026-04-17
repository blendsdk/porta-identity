# Current State: Testing Strategy

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta v5 has a mature unit test suite built across RD-01 through RD-09, plus basic Docker Compose infrastructure for integration testing.

**Unit Tests (Comprehensive)**
- **91 unit test files** in `tests/unit/` covering all modules
- **1 integration test file** (`tests/integration/migrations.test.ts` — 33 tests)
- **Total: 1,677 tests across 92 files, zero failures**
- All service-layer tests use `vi.mock()` to mock repository, cache, and infrastructure dependencies
- Functional service pattern: standalone exported functions, not classes
- Repository pattern: all repos call `getPool()` internally (no Pool parameter injection)

**Test Framework**
- Vitest 4.1.3 installed as devDependency
- Basic `vitest.config.ts` — single config, no workspace/projects
- Test commands in `package.json`: `test`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`
- `test:e2e` script exists but `tests/e2e/` directory is empty
- No `test:pentest` script exists

**Docker Compose**
- `docker/docker-compose.yml` with Postgres 16, Redis 7, MailHog
- Postgres: `porta` database, `porta` user, `porta_dev` password
- Redis: default config, port 6379
- MailHog: SMTP on 1025, Web UI on 8025
- No test database (`porta_test`) — only the dev database exists
- No Docker init script for test database

**Environment**
- `.env.example` has dev environment variables only
- No test-specific environment variables (`TEST_DATABASE_URL`, `TEST_REDIS_URL`, etc.)

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `vitest.config.ts` | Test configuration | Add workspace/projects for unit/integration/e2e/pentest |
| `package.json` | Scripts | Add `test:pentest`, possibly update existing scripts |
| `docker/docker-compose.yml` | Docker services | Add test DB init script volume mount |
| `.env.example` | Environment template | Add test environment variables |
| `tests/integration/migrations.test.ts` | Existing integration test | Refactor to use new setup/teardown infrastructure |

### Code Analysis

#### Current Vitest Configuration

```typescript
// vitest.config.ts — Current (basic, no workspaces)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/cli/**'],
    },
    testTimeout: 30_000,
  },
});
```

**Issues:**
- No workspace/project separation — all tests run with same config
- No different timeouts for unit vs integration vs E2E
- No global setup/teardown for integration or E2E tests
- No singleThread configuration for DB-dependent tests
- No coverage thresholds configured
- No HTML coverage reporter

#### Current Integration Test Pattern

```typescript
// tests/integration/migrations.test.ts — DB skip pattern
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://porta:porta_dev@localhost:5432/porta';
let pool: pg.Pool;
let dbAvailable = false;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch {
    console.warn('Database not available — skipping integration tests');
  }
});

function requireDb(): boolean {
  if (!dbAvailable) return false;
  return true;
}
```

**Issues:**
- Uses dev database (`porta`), not a separate test database
- Manual skip logic — should use Vitest globalSetup to fail fast
- No table truncation between tests
- No shared test data seeding

#### Current Unit Test Mocking Pattern

```typescript
// Typical service test pattern
vi.mock('../../../src/organizations/repository.js', () => ({
  insertOrganization: vi.fn(),
  findOrganizationById: vi.fn(),
  // ...
}));

vi.mock('../../../src/organizations/cache.js', () => ({
  getCachedOrganization: vi.fn(),
  setCachedOrganization: vi.fn(),
  invalidateOrganizationCache: vi.fn(),
}));
```

**Key insight for integration tests:** Since repositories call `getPool()` internally, integration tests need to ensure `getPool()` returns a pool connected to the **test database**. This means calling `connectDatabase()` with `TEST_DATABASE_URL` in the global setup.

#### Current Server Factory

```typescript
// src/server.ts
export function createApp(oidcProvider?: Provider): Koa
```

**Key insight for E2E tests:** The `createApp()` function accepts an optional OIDC provider. E2E setup needs to:
1. Connect to test DB and Redis
2. Run migrations
3. Seed test data
4. Generate signing keys
5. Create OIDC provider
6. Create Koa app
7. Listen on random port

#### Current Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta_dev
    # No init script for test database
```

**Needed:** Add `init-test-db.sql` volume mount to create `porta_test` database.

## Gaps Identified

### Gap 1: No Vitest Workspace Configuration

**Current:** Single flat config, all tests treated equally.
**Required:** Separate projects with different timeouts, setup files, and thread configs.
**Fix:** Rewrite `vitest.config.ts` with `projects` array.

### Gap 2: No Test Database

**Current:** Integration tests use dev database `porta`.
**Required:** Separate `porta_test` database that can be truncated freely.
**Fix:** Create `docker/init-test-db.sql` and mount in Docker Compose.

### Gap 3: No Test Infrastructure (Setup/Teardown/Helpers)

**Current:** Only `migrations.test.ts` with manual pool connection.
**Required:** Global setup that connects DB/Redis, runs migrations, provides helpers for truncation and seeding.
**Fix:** Create `tests/integration/setup.ts`, `tests/integration/helpers/database.ts`, etc.

### Gap 4: No E2E Infrastructure

**Current:** `tests/e2e/` directory doesn't exist.
**Required:** Full E2E setup that starts a real Koa server with OIDC provider.
**Fix:** Create `tests/e2e/setup.ts`, `tests/e2e/helpers/oidc-client.ts`, etc.

### Gap 5: No Pentest Infrastructure

**Current:** No security tests at all.
**Required:** Automated penetration tests covering OIDC attacks, auth bypass, injection, etc.
**Fix:** Create `tests/pentest/` with attack-specific test files.

### Gap 6: No Test Data Factories

**Current:** Unit tests create ad-hoc test data inline.
**Required:** Reusable factory functions for all domain entities.
**Fix:** Create `tests/integration/helpers/factories.ts` and `tests/fixtures/`.

### Gap 7: No Coverage Thresholds

**Current:** Coverage reported but no thresholds enforced.
**Required:** 80% lines, 80% functions, 75% branches, 80% statements.
**Fix:** Add `thresholds` to Vitest coverage config.

### Gap 8: No Test Environment Variables

**Current:** No `TEST_DATABASE_URL`, `TEST_REDIS_URL`, etc.
**Required:** Separate test env vars pointing to test database and test Redis DB.
**Fix:** Update `.env.example`, create integration/e2e setup that uses these vars.

## Dependencies

### Internal Dependencies

- All source modules in `src/` (organizations, applications, clients, users, auth, rbac, custom-claims, oidc, middleware, routes, cli, lib)
- `src/server.ts` — `createApp()` for E2E server creation
- `src/index.ts` — startup sequence (reference for E2E setup)
- All 11 migration files in `migrations/`
- Docker Compose configuration

### External Dependencies

- `vitest` 4.1.3 (installed)
- `pg` (installed) — for test database connections
- `ioredis` (installed) — for test Redis connections
- `nodemailer` (installed) — for email service integration tests
- No new npm dependencies needed — all test infrastructure can be built with existing packages

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Integration tests slow due to real DB | Medium | Medium | Truncate instead of recreate, reuse connections |
| E2E tests flaky due to timing | Medium | High | Generous timeouts, retry logic, deterministic data |
| Pentest false positives | Low | Medium | Careful assertion design, verify both rejection AND proper error codes |
| Coverage thresholds block CI | Low | Medium | Start with reasonable thresholds, can adjust later |
| getPool() coupling makes test DB injection hard | Medium | Medium | Set DATABASE_URL env var before importing modules in global setup |
| Port conflicts in E2E (random port) | Low | Low | Use `0` port for auto-assignment |
| Docker services not running | High | High | Clear error messages, skip with warning (like existing pattern) |
