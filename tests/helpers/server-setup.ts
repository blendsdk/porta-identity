/**
 * Shared server setup module for E2E and pentest test suites.
 *
 * Provides setup() and teardown() functions that:
 * 1. Set test environment variables (DATABASE_URL, REDIS_URL, etc.)
 * 2. Connect to the test database and Redis
 * 3. Run all migrations against the test database
 * 4. Initialize i18n and template engine
 * 5. Generate signing keys and load OIDC TTL config
 * 6. Create and start a Koa server with a real OIDC provider on a random port
 * 7. Tear everything down cleanly (server → DB → Redis)
 *
 * Both E2E and pentest global setup files import from here to avoid
 * code duplication — the test infrastructure is identical for both suites.
 *
 * Connection functions read from process.env, so we set the env vars
 * BEFORE calling connectDatabase()/connectRedis().
 */

import type { Server } from 'node:http';
import {
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
  TEST_SMTP_HOST,
  TEST_SMTP_PORT,
  TEST_SMTP_FROM,
  TEST_COOKIE_KEYS,
} from './constants.js';

// Module-level server reference for teardown
let server: Server | null = null;

/**
 * Start the full Porta test server.
 *
 * Sets process.env variables, connects infrastructure, runs migrations,
 * initializes subsystems, creates the OIDC provider and Koa app, and
 * starts listening on a random OS-assigned port.
 *
 * After this resolves, `process.env.TEST_SERVER_URL` contains the
 * base URL (e.g., `http://localhost:49123`) for test HTTP requests.
 */
export async function setup(): Promise<void> {
  // Override environment — modules read process.env internally
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'fatal';
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = TEST_SMTP_HOST;
  process.env.SMTP_PORT = TEST_SMTP_PORT;
  process.env.SMTP_FROM = TEST_SMTP_FROM;
  process.env.COOKIE_KEYS = TEST_COOKIE_KEYS;
  // Temporary ISSUER_BASE_URL — updated once we know the port
  process.env.ISSUER_BASE_URL = 'http://localhost:0';

  // Dynamic imports — must happen AFTER env vars are set so modules
  // pick up the correct DATABASE_URL and REDIS_URL on initialization
  const { connectDatabase } = await import('../../src/lib/database.js');
  const { connectRedis } = await import('../../src/lib/redis.js');
  const { runMigrations } = await import('../../src/lib/migrator.js');
  const { ensureSigningKeys } = await import('../../src/lib/signing-keys.js');
  const { loadOidcTtlConfig } = await import('../../src/lib/system-config.js');
  const { createOidcProvider } = await import('../../src/oidc/provider.js');
  const { createApp } = await import('../../src/server.js');
  const { initI18n } = await import('../../src/auth/i18n.js');
  const { initTemplateEngine } = await import('../../src/auth/template-engine.js');

  // Connect infrastructure
  await connectDatabase();
  await connectRedis();

  // Run all migrations against the test database
  await runMigrations();

  // Initialize i18n and template engine
  await initI18n();
  await initTemplateEngine();

  // Generate signing keys (creates if none exist) and load TTL config
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // Create the OIDC provider and Koa app
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);

  // Start server on port 0 — OS assigns a random available port
  server = app.listen(0, () => {
    const addr = server!.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : 0;
    process.env.TEST_SERVER_URL = `http://localhost:${actualPort}`;
    process.env.ISSUER_BASE_URL = `http://localhost:${actualPort}`;
  });

  // Wait for server to be fully ready before returning
  await new Promise<void>((resolve) => {
    if (server!.listening) resolve();
    else server!.on('listening', resolve);
  });
}

/**
 * Shut down the test server and disconnect from infrastructure.
 *
 * Closes the HTTP server first, then disconnects DB and Redis pools
 * to prevent hanging connections after tests complete.
 */
export async function teardown(): Promise<void> {
  // Dynamic imports for disconnect functions
  const { disconnectDatabase } = await import('../../src/lib/database.js');
  const { disconnectRedis } = await import('../../src/lib/redis.js');

  // Close the HTTP server
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }

  // Disconnect infrastructure
  await disconnectDatabase();
  await disconnectRedis();
}
