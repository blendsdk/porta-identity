/**
 * Playwright global teardown — stops Porta + BFF and disconnects infrastructure.
 *
 * Runs once after all Admin GUI E2E test files complete. Performs clean shutdown:
 *   1. Closes the BFF HTTP server
 *   2. Disconnects BFF Redis client (session store)
 *   3. Closes the Porta HTTP server
 *   4. Disconnects Porta PostgreSQL pool
 *   5. Disconnects Porta Redis client
 *
 * Server and Redis references are retrieved from globalThis where they
 * were stored by global-setup.ts. Playwright runs setup and teardown
 * in the same process, so globalThis state persists.
 */

import type { Server } from 'node:http';
import type { Redis } from 'ioredis';
import type { FullConfig } from '@playwright/test';

/**
 * Close an HTTP server and wait for it to fully stop.
 *
 * @param server - The HTTP server to close
 * @param name - Server name for logging
 */
async function closeServer(server: Server, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  console.log(`[Admin GUI E2E] ${name} server stopped`);
}

/**
 * Playwright global teardown function.
 *
 * Called once after all test files have finished running.
 * Shuts down both servers and disconnects all infrastructure.
 *
 * @param _config - Playwright full configuration (unused, required by signature)
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('[Admin GUI E2E] Starting global teardown...');

  // ── 1. Close BFF server ────────────────────────────────────────────
  const bffServer = (globalThis as Record<string, unknown>).__ADMIN_GUI_BFF_SERVER as
    | Server
    | undefined;
  if (bffServer) {
    await closeServer(bffServer, 'BFF');
  }

  // ── 2. Disconnect BFF Redis (session store) ────────────────────────
  const bffRedis = (globalThis as Record<string, unknown>).__ADMIN_GUI_BFF_REDIS as
    | Redis
    | undefined;
  if (bffRedis) {
    await bffRedis.quit();
    console.log('[Admin GUI E2E] BFF Redis disconnected');
  }

  // ── 3. Close Porta server ──────────────────────────────────────────
  const portaServer = (globalThis as Record<string, unknown>).__ADMIN_GUI_PORTA_SERVER as
    | Server
    | undefined;
  if (portaServer) {
    await closeServer(portaServer, 'Porta');
  }

  // ── 4. Disconnect Porta infrastructure ─────────────────────────────
  // Dynamic imports — modules are already loaded in this process from setup
  const { disconnectDatabase } = await import('../../../../src/lib/database.js');
  const { disconnectRedis } = await import('../../../../src/lib/redis.js');

  await disconnectDatabase();
  await disconnectRedis();
  console.log('[Admin GUI E2E] Porta DB + Redis disconnected');

  console.log('[Admin GUI E2E] Global teardown complete');
}

export default globalTeardown;
