/**
 * Vitest workspace configuration with 4 projects.
 *
 * Each project has its own include pattern, timeout, and setup:
 * - unit:        Fast tests, no external services, 10s timeout
 * - integration: Real DB/Redis tests, sequential, 30s timeout
 * - e2e:         Full server + HTTP requests, sequential, 60s timeout
 * - pentest:     Security/attack tests, sequential, 60s timeout
 *
 * Integration/E2E/pentest use singleFork to prevent DB race conditions.
 * Coverage thresholds enforce minimum quality on src/ code.
 *
 * NOTE: globalSetup files are added to projects when their setup files
 * are created in later phases (Phase 3: integration, Phase 6: e2e,
 * Phase 10: pentest). Until then, the projects are defined without
 * globalSetup so --project flags work immediately.
 */
import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load .env so DATABASE_URL / REDIS_URL are available for deriving test URLs.
// This runs at config-parse time, before any test code.
dotenvConfig();

/**
 * Derive test database URL from DATABASE_URL in .env.
 * Replaces the database name (last path segment) with 'porta_test'.
 * Falls back to the default test URL if DATABASE_URL is not set.
 */
function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) return dbUrl.replace(/\/[^/]+$/, '/porta_test');
  return 'postgresql://porta:porta_dev@localhost:5432/porta_test';
}

/**
 * Derive test Redis URL from REDIS_URL in .env.
 * Appends '/1' (DB index 1) to isolate test data from dev.
 * Falls back to the default test URL if REDIS_URL is not set.
 */
function getTestRedisUrl(): string {
  if (process.env.TEST_REDIS_URL) return process.env.TEST_REDIS_URL;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) return redisUrl.replace(/\/\d*$/, '') + '/1';
  return 'redis://localhost:6379/1';
}

const testDbUrl = getTestDatabaseUrl();
const testRedisUrl = getTestRedisUrl();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Allow projects with no test files yet (e2e, pentest)
    passWithNoTests: true,

    // Coverage configuration (applies when running with --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**', // CLI tested via integration
        'src/types/**', // Type definitions only
        'src/**/index.ts', // Re-exports / barrel files
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
          setupFiles: ['tests/integration/setup-worker.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          pool: 'forks',
          fileParallelism: false, // Sequential execution to avoid DB conflicts
          // Override env vars so the app's config module reads test URLs.
          // dotenv won't override these since they're already set in process.env.
          env: {
            DATABASE_URL: testDbUrl,
            REDIS_URL: testRedisUrl,
            ISSUER_BASE_URL: 'http://localhost:3000',
            COOKIE_KEYS: 'test-cookie-key-1,test-cookie-key-2',
            SMTP_HOST: 'localhost',
            SMTP_PORT: '1025',
            SMTP_FROM: 'test@porta.local',
            NODE_ENV: 'test',
            LOG_LEVEL: 'fatal',
          },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          // globalSetup added in Phase 6 when tests/e2e/setup.ts is created
          testTimeout: 60_000,
          hookTimeout: 60_000,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'pentest',
          include: ['tests/pentest/**/*.test.ts'],
          environment: 'node',
          // globalSetup added in Phase 10 when tests/pentest/setup.ts is created
          testTimeout: 60_000,
          hookTimeout: 60_000,
          pool: 'forks',
        },
      },
    ],
  },
});
