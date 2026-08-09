/**
 * Per-worker setup for integration tests.
 *
 * Runs in EACH forked worker process before test files execute.
 * Connects the app's database pool and Redis client so that
 * repository modules (which call getPool() / getRedis()) work
 * correctly in the test environment.
 *
 * Environment variables (DATABASE_URL, REDIS_URL, etc.) are set by
 * the vitest.config.ts `env` option BEFORE this file is loaded,
 * so the app's config module reads the correct test values.
 *
 * The globalSetup (setup.ts) has already run migrations by this point.
 */

import { beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/lib/database.js';
import { connectRedis, disconnectRedis } from '../../src/lib/redis.js';

/**
 * Connect database pool and Redis before any tests in this worker.
 * Uses the app's standard connect functions — they read DATABASE_URL
 * and REDIS_URL from the config module (which reads process.env).
 */
beforeAll(async () => {
  await connectDatabase();
  await connectRedis();
});

/**
 * Disconnect cleanly after all tests in this worker finish.
 * Prevents open handle warnings from Vitest.
 */
afterAll(async () => {
  await disconnectRedis();
  await disconnectDatabase();
});
