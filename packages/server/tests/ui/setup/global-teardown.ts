/**
 * Playwright global teardown — stops the Porta server and disconnects infrastructure.
 *
 * Runs once after all UI test files complete. Performs a clean shutdown:
 *   1. Closes the HTTP server (stops accepting new connections)
 *   2. Disconnects the PostgreSQL connection pool
 *   3. Disconnects the Redis client
 *
 * The server reference is retrieved from `globalThis.__PORTA_UI_SERVER`
 * which was set during global setup. Playwright runs setup and teardown
 * in the same process, so module-level state (globalThis) persists.
 */

import type { Server } from 'node:http';
import type { FullConfig } from '@playwright/test';

/**
 * Playwright global teardown function.
 *
 * Called once after all test files have finished running.
 * Shuts down the Porta server and disconnects DB/Redis.
 *
 * @param _config - Playwright full configuration (unused, required by signature)
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
  // Retrieve server reference stored by global-setup
  const server = (globalThis as Record<string, unknown>).__PORTA_UI_SERVER as Server | undefined;

  // Close the HTTP server — stop accepting new connections
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[UI Test] Porta server stopped');
  }

  // Disconnect infrastructure — dynamic imports since modules are
  // already loaded in this process from global setup
  const { disconnectDatabase } = await import('../../../src/lib/database.js');
  const { disconnectRedis } = await import('../../../src/lib/redis.js');

  await disconnectDatabase();
  await disconnectRedis();

  console.log('[UI Test] DB and Redis disconnected');
}

export default globalTeardown;
