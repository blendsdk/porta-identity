/**
 * Global setup for integration tests.
 *
 * Runs ONCE before all integration test files (in the main Vitest process).
 * Verifies the test database is accessible, then runs all migrations.
 *
 * This module uses direct pg.Pool and node-pg-migrate's runner()
 * instead of the app's config/database modules — because the app's
 * config module eagerly loads process.env at import time, and the
 * globalSetup process isn't the same as the worker processes where
 * tests run. Workers get their env vars from vitest.config.ts `env`.
 *
 * The teardown function is a no-op — workers manage their own connections.
 */

import { config as dotenvConfig } from 'dotenv';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import type { RunnerOption } from 'node-pg-migrate';
import { join } from 'node:path';

// Load .env so DATABASE_URL is available for deriving the test URL
dotenvConfig();

/**
 * Derive test database URL: prefer TEST_DATABASE_URL, else derive from
 * DATABASE_URL by replacing the database name with 'porta_test'.
 */
function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) return dbUrl.replace(/\/[^/]+$/, '/porta_test');
  return 'postgresql://porta:porta_dev@localhost:5432/porta_test';
}

const TEST_DATABASE_URL = getTestDatabaseUrl();

/**
 * Setup: verify test DB connectivity and run all pending migrations.
 * Called once by Vitest before any integration test file executes.
 */
export async function setup(): Promise<void> {
  // Verify the test database is reachable
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query('SELECT 1');
  } catch {
    await pool.end();
    throw new Error(
      `Test database not available at ${TEST_DATABASE_URL}. ` +
        'Ensure Docker services are running: yarn docker:up',
    );
  }
  await pool.end();

  // Run all migrations against the test database
  const migrationsDir = join(process.cwd(), 'migrations');
  const options: RunnerOption = {
    databaseUrl: TEST_DATABASE_URL,
    migrationsTable: 'pgmigrations',
    dir: migrationsDir,
    direction: 'up',
    count: Infinity,
    // Suppress migration output during tests
    log: () => {},
    decamelize: false,
  };

  await runner(options);
}

/**
 * Teardown: no-op for integration tests.
 * Worker processes manage their own DB/Redis connections via setup-worker.ts.
 */
export async function teardown(): Promise<void> {
  // Nothing to clean up — each worker handles its own disconnection
}
