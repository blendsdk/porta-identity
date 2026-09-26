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

import { resolve4 } from 'node:dns/promises';
import { createServer, type Server } from 'node:http';
import {
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
  TEST_SMTP_HOST,
  TEST_SMTP_PORT,
  TEST_SMTP_FROM,
  TEST_COOKIE_KEYS,
  TEST_SIGNING_KEY_ENCRYPTION_KEY,
} from './constants.js';

/**
 * Reserved public host that resolves to IPv4 loopback in every test environment.
 *
 * Server tests default to this address when `TEST_SERVER_URL` is not supplied by the
 * managed setup, so it must resolve to `127.0.0.1` before a live-server suite runs.
 */
const RESERVED_LOOPBACK_HOST = 'porta-harness.ci.portaidentity.com';

// Module-level server reference for teardown
let server: Server | null = null;
let stopRecoveryWorker: (() => Promise<boolean>) | null = null;

/**
 * Verifies that a host resolves only to IPv4 loopback.
 *
 * The `*.ci.portaidentity.com` wildcard is reserved for test infrastructure and must resolve
 * to `127.0.0.1`. Failing here produces a clear message instead of a confusing connection
 * error when the reserved address is unavailable.
 *
 * @param host Host name to resolve.
 * @throws When the host cannot be resolved or maps to any address other than `127.0.0.1`.
 */
async function assertLoopbackDns(host: string): Promise<void> {
  let addresses: string[];

  try {
    addresses = await resolve4(host);
  } catch (error) {
    throw new Error(`Loopback DNS preflight could not resolve ${host}`, { cause: error });
  }

  if (addresses.length === 0 || addresses.some((address) => address !== '127.0.0.1')) {
    throw new Error(
      `Loopback DNS preflight expected ${host} to resolve only to 127.0.0.1, received: ${addresses.join(', ') || 'no addresses'}`,
    );
  }
}

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
  // ── Step 0: Verify the reserved loopback address ───────────────
  // The server binds to localhost, but tests fall back to the reserved
  // host when TEST_SERVER_URL is absent, so prove it resolves first.
  await assertLoopbackDns(RESERVED_LOOPBACK_HOST);

  // ── Step 1: Pre-allocate a port ────────────────────────────────
  // We need the port BEFORE creating the OIDC provider because
  // node-oidc-provider captures the issuer URL at construction time.
  // Bind a temporary server to port 0, grab the OS-assigned port,
  // then close it. The real server will bind to this same port.
  const tmpServer = createServer();
  await new Promise<void>((resolve) => tmpServer.listen(0, resolve));
  const tmpAddr = tmpServer.address();
  const port = typeof tmpAddr === 'object' && tmpAddr ? tmpAddr.port : 0;
  await new Promise<void>((resolve, reject) => {
    tmpServer.close((err) => (err ? reject(err) : resolve()));
  });

  // ── Step 2: Set environment variables ──────────────────────────
  // All env vars must be set BEFORE dynamic imports so that modules
  // (config, database, redis) read the correct values on first load.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'fatal';
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = TEST_SMTP_HOST;
  process.env.SMTP_PORT = TEST_SMTP_PORT;
  process.env.SMTP_FROM = TEST_SMTP_FROM;
  process.env.COOKIE_KEYS = TEST_COOKIE_KEYS;
  process.env.SIGNING_KEY_ENCRYPTION_KEY = TEST_SIGNING_KEY_ENCRYPTION_KEY;
  process.env.ISSUER_BASE_URL = `http://localhost:${port}`;
  process.env.TEST_SERVER_URL = `http://localhost:${port}`;

  // ── Step 3: Dynamic imports ────────────────────────────────────
  // Must happen AFTER env vars so modules pick up correct values.
  const { connectDatabase } = await import('../../src/lib/database.js');
  const { connectRedis } = await import('../../src/lib/redis.js');
  const { runMigrations } = await import('../../src/lib/migrator.js');
  const { ensureSigningKeys } = await import('../../src/lib/signing-keys.js');
  const { loadOidcTtlConfig } = await import('../../src/lib/system-config.js');
  const { createOidcProvider } = await import('../../src/oidc/provider.js');
  const { createApp } = await import('../../src/server.js');
  const { initI18n } = await import('../../src/auth/i18n.js');
  const { initTemplateEngine } = await import('../../src/auth/template-engine.js');
  const { startAccountRecoveryWorker, stopAccountRecoveryWorker } =
    await import('../../src/auth/recovery-service.js');

  // ── Step 4: Connect infrastructure ─────────────────────────────
  await connectDatabase();
  await connectRedis();

  // ── Step 5: Run migrations ─────────────────────────────────────
  await runMigrations();

  // ── Step 6: Initialize subsystems ──────────────────────────────
  await initI18n();
  await initTemplateEngine();

  // ── Step 7: Create OIDC provider and Koa app ───────────────────
  // Now the config module has the correct ISSUER_BASE_URL with the
  // pre-allocated port, so the provider's issuer will be correct.
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);

  // ── Step 8: Start server on the pre-allocated port ─────────────
  server = app.listen(port);
  await new Promise<void>((resolve) => {
    if (server!.listening) resolve();
    else server!.on('listening', resolve);
  });
  startAccountRecoveryWorker(provider);
  stopRecoveryWorker = stopAccountRecoveryWorker;
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

  if (stopRecoveryWorker) {
    const settled = await stopRecoveryWorker();
    stopRecoveryWorker = null;
    if (!settled) throw new Error('Recovery worker did not settle during test server teardown');
  }

  // Disconnect infrastructure
  await disconnectDatabase();
  await disconnectRedis();
}
