/**
 * Redis helper functions for integration tests.
 *
 * Provides flush utilities for the test Redis database (DB index 1).
 * Used alongside truncateAllTables() in beforeEach() hooks to ensure
 * complete isolation between tests — both DB and cache state are reset.
 */

import { getRedis } from '../../../src/lib/redis.js';

/**
 * Flush all keys in the test Redis database.
 *
 * Uses FLUSHDB (not FLUSHALL) to only clear the current DB index,
 * leaving other Redis databases untouched. The test environment
 * uses DB index 1 (configured via TEST_REDIS_URL) to isolate
 * from the development DB (index 0).
 */
export async function flushTestRedis(): Promise<void> {
  const client = getRedis();
  await client.flushdb();
}
