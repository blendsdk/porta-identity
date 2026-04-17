# Test Infrastructure: Testing Strategy

> **Document**: 03-test-infrastructure.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the foundational test infrastructure changes needed before any integration, E2E, or pentest tests can be written. This includes Vitest workspace configuration, test database setup, environment variables, and shared helpers.

## Architecture

### Current Architecture

- Single `vitest.config.ts` with flat configuration
- No workspace/project separation
- No test database
- No global setup/teardown for integration or E2E
- No test environment variables

### Proposed Changes

- Rewrite `vitest.config.ts` with 4 workspace projects (unit, integration, e2e, pentest)
- Create `docker/init-test-db.sql` for `porta_test` database
- Update `docker/docker-compose.yml` to mount init script
- Add test environment variables to `.env.example`
- Add `test:pentest` script to `package.json`
- Create global setup/teardown files for integration, E2E, and pentest projects

---

## Implementation Details

### Vitest Workspace Configuration

```typescript
// vitest.config.ts — New workspace-based configuration
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Coverage configuration (applies when running with --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',          // CLI tested via integration
        'src/types/**',        // Type definitions only
        'src/**/index.ts',     // Re-exports / barrel files
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Workspace projects — each project has its own include/setup/timeout
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          poolOptions: { threads: { singleThread: true } },
          // Sequential execution to avoid DB conflicts
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/e2e/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          poolOptions: { threads: { singleThread: true } },
        },
      },
      {
        test: {
          name: 'pentest',
          include: ['tests/pentest/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/pentest/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          poolOptions: { threads: { singleThread: true } },
        },
      },
    ],
  },
});
```

**Key design decisions:**
- `singleThread: true` for integration/e2e/pentest — prevents DB race conditions
- Different timeouts per project type (unit: 10s, integration: 30s, e2e/pentest: 60s)
- `globalSetup` for integration/e2e/pentest — handles DB/Redis/server lifecycle
- Coverage thresholds only enforced on `src/` (excludes test files)
- HTML coverage reporter added for local development debugging

### Package.json Script Updates

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "vitest run --project e2e",
    "test:pentest": "vitest run --project pentest",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

**Key change:** Use `--project` flag instead of path-based test selection. This ensures each project uses its own configuration (globalSetup, timeout, threading).

### Docker Test Database

```sql
-- docker/init-test-db.sql
-- Creates the test database. This script runs once on first container startup.
-- The porta_test database is used exclusively by integration, e2e, and pentest tests.
CREATE DATABASE porta_test;
GRANT ALL PRIVILEGES ON DATABASE porta_test TO porta;
```

```yaml
# docker/docker-compose.yml — Updated postgres service
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: porta
      POSTGRES_USER: porta
      POSTGRES_PASSWORD: porta_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql  # NEW
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U porta"]
      interval: 5s
      timeout: 5s
      retries: 5
```

**Note:** The init script runs once on first container creation. If the container already exists, you need to `docker compose down -v` to recreate volumes, then `docker compose up -d` to trigger the init script.

### Test Environment Variables

```bash
# .env.example — Additional test variables
# Test Database (used by integration, e2e, and pentest tests)
TEST_DATABASE_URL=postgresql://porta:porta_dev@localhost:5432/porta_test
TEST_REDIS_URL=redis://localhost:6379/1
TEST_SMTP_HOST=localhost
TEST_SMTP_PORT=1025
TEST_MAILHOG_URL=http://localhost:8025
```

**Key decisions:**
- Test DB: `porta_test` (separate database, same server)
- Test Redis: DB index `1` (separate from dev DB `0`)
- SMTP/MailHog: Same ports as dev (MailHog captures all emails regardless)

---

### Integration Test Global Setup

```typescript
// tests/integration/setup.ts
// 
// Global setup for integration tests. Runs ONCE before all integration test files.
// Connects to test database, runs migrations, and exports connection info.
// The teardown function runs ONCE after all integration test files complete.

import pg from 'pg';
import { connectDatabase, disconnectDatabase, getPool } from '../../src/lib/database.js';
import { connectRedis, disconnectRedis } from '../../src/lib/redis.js';
import { runMigrations } from '../../src/lib/migrator.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL 
  ?? 'postgresql://porta:porta_dev@localhost:5432/porta_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL 
  ?? 'redis://localhost:6379/1';

export async function setup() {
  // Override environment for all modules that use process.env
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'silent';

  // Verify test DB is accessible
  const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await testPool.query('SELECT 1');
  } catch (error) {
    await testPool.end();
    throw new Error(
      `Test database not available at ${TEST_DATABASE_URL}. ` +
      'Ensure Docker services are running: yarn docker:up'
    );
  }
  await testPool.end();

  // Connect using the app's connection manager (sets the global pool)
  await connectDatabase(TEST_DATABASE_URL);
  await connectRedis(TEST_REDIS_URL);

  // Run all migrations against test DB
  await runMigrations(getPool());
}

export async function teardown() {
  await disconnectDatabase();
  await disconnectRedis();
}
```

### Integration Test Database Helpers

```typescript
// tests/integration/helpers/database.ts
//
// Database helper functions for integration tests.
// Provides table truncation and test data seeding utilities.

import { getPool } from '../../../src/lib/database.js';

/**
 * Truncate all application tables in the correct order.
 * Called between test suites to ensure isolation.
 * Uses CASCADE to handle foreign key constraints.
 */
export async function truncateAllTables(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE
      audit_log, custom_claim_values, custom_claim_definitions,
      user_roles, role_permissions, permissions, roles,
      magic_link_tokens, password_reset_tokens, invitation_tokens,
      client_secrets, clients, users,
      application_modules, applications, organizations,
      oidc_payloads, signing_keys, system_config
    CASCADE
  `);
}

/**
 * Seed the minimum required data for tests.
 * This inserts the system config defaults and super-admin org
 * that many modules depend on.
 */
export async function seedBaseData(): Promise<void> {
  const pool = getPool();
  // Re-run the seed migration content for base data
  // (system_config defaults, super-admin org, etc.)
  // Implementation will extract seed SQL from migration 011
}
```

### Integration Test Redis Helpers

```typescript
// tests/integration/helpers/redis.ts
//
// Redis helper functions for integration tests.
// Provides flush and connection utilities for the test Redis DB.

import { getRedisClient } from '../../../src/lib/redis.js';

/**
 * Flush all keys in the test Redis database.
 * Uses FLUSHDB (not FLUSHALL) to only clear the current DB index.
 */
export async function flushTestRedis(): Promise<void> {
  const client = getRedisClient();
  await client.flushdb();
}
```

---

### E2E Test Global Setup

```typescript
// tests/e2e/setup.ts
//
// Global setup for E2E tests. Runs ONCE before all E2E test files.
// Starts a real Koa server with OIDC provider on a random port.

import { connectDatabase, disconnectDatabase, getPool } from '../../src/lib/database.js';
import { connectRedis, disconnectRedis } from '../../src/lib/redis.js';
import { runMigrations } from '../../src/lib/migrator.js';
import { ensureSigningKeys } from '../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../src/lib/system-config.js';
import { createOidcProvider } from '../../src/oidc/provider.js';
import { createApp } from '../../src/server.js';
import { initI18n } from '../../src/auth/i18n.js';
import { initTemplateEngine } from '../../src/auth/template-engine.js';
import type { Server } from 'node:http';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL 
  ?? 'postgresql://porta:porta_dev@localhost:5432/porta_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL 
  ?? 'redis://localhost:6379/1';

let server: Server;

export async function setup() {
  // Override environment
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'silent';
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = process.env.TEST_SMTP_HOST ?? 'localhost';
  process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1025';
  process.env.SMTP_FROM = 'test@porta.local';
  process.env.COOKIE_KEYS = 'test-cookie-key-1,test-cookie-key-2';

  // Connect infrastructure
  await connectDatabase(TEST_DATABASE_URL);
  await connectRedis(TEST_REDIS_URL);

  // Run migrations and seed
  await runMigrations(getPool());

  // Initialize i18n and template engine
  await initI18n();
  await initTemplateEngine();

  // Generate signing keys and load config
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // Determine test server port
  const port = 0; // OS assigns random available port

  // Set ISSUER_BASE_URL (needed by OIDC provider)
  // We'll update this after the server starts and we know the port
  process.env.ISSUER_BASE_URL = 'http://localhost:0';

  // Create OIDC provider and Koa app
  const provider = createOidcProvider({ jwks, ttl });
  const app = createApp(provider);

  // Start server on random port
  server = app.listen(port, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : 0;
    process.env.TEST_SERVER_URL = `http://localhost:${actualPort}`;
    process.env.ISSUER_BASE_URL = `http://localhost:${actualPort}`;
  });

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    if (server.listening) resolve();
    else server.on('listening', resolve);
  });
}

export async function teardown() {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await disconnectDatabase();
  await disconnectRedis();
}
```

### Pentest Global Setup

```typescript
// tests/pentest/setup.ts
//
// Global setup for penetration tests.
// Reuses the same E2E infrastructure — starts a real server.
// Identical to E2E setup, extracted to allow independent execution.

// Same structure as tests/e2e/setup.ts
// May import from a shared setup module to avoid duplication
```

**Design note:** The pentest setup is structurally identical to E2E setup. We'll either:
1. Extract a shared `tests/helpers/server-setup.ts` module used by both, or
2. Have pentest setup import from e2e setup

Option 1 is cleaner and will be implemented.

---

## Integration Points

### How Integration Tests Use Infrastructure

```
tests/integration/setup.ts (globalSetup)
    ↓ connects DB + Redis, runs migrations
tests/integration/**/*.test.ts
    ↓ import { truncateAllTables } from '../helpers/database.js'
    ↓ import { buildOrganization, ... } from '../helpers/factories.js'
    ↓ beforeEach → truncateAllTables()
    ↓ call real repository functions → verify against real DB
    ↓ afterAll → (globalSetup teardown handles disconnection)
```

### How E2E/Pentest Tests Use Infrastructure

```
tests/e2e/setup.ts (globalSetup)
    ↓ connects DB + Redis, runs migrations, starts Koa server
tests/e2e/**/*.test.ts
    ↓ import { OidcTestClient } from '../helpers/oidc-client.js'
    ↓ import { MailHogClient } from '../helpers/mailhog.js'
    ↓ const baseUrl = process.env.TEST_SERVER_URL
    ↓ make HTTP requests → verify responses
    ↓ check MailHog for sent emails
```

---

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Docker services not running | Global setup throws with clear message: "Ensure Docker services are running: yarn docker:up" |
| Test DB doesn't exist | Global setup throws: "porta_test database not found. Run: docker compose down -v && yarn docker:up" |
| Migration failure | Global setup throws with migration error details |
| Port already in use (E2E) | Use port `0` for OS auto-assignment — never conflicts |
| Redis connection refused | Global setup throws with Redis connection error |

## Testing Requirements

- Unit tests: Verify vitest.config.ts produces correct project configs
- Smoke test: `yarn test:unit` only runs unit tests
- Smoke test: `yarn test:integration` runs integration tests (requires Docker)
- Smoke test: `yarn test:e2e` runs E2E tests (requires Docker)
- Smoke test: `yarn test:pentest` runs pentest tests (requires Docker)
