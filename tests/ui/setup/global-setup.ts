/**
 * Playwright global setup — starts a real Porta server for UI tests.
 *
 * Reuses the shared server-setup module (same as E2E/pentest suites)
 * which handles the full startup sequence:
 *   1. Sets test environment variables (DATABASE_URL, REDIS_URL, etc.)
 *   2. Connects to the test database and Redis
 *   3. Runs all migrations against the test database
 *   4. Initializes i18n and template engine
 *   5. Generates signing keys and loads OIDC TTL config
 *   6. Creates a Koa server with a real OIDC provider
 *
 * After the server starts, this module seeds test data (org, app,
 * client, user) using the integration test factories and exports
 * the entity details as environment variables so Playwright tests
 * can access them via `process.env` in fixtures.
 *
 * Uses a dedicated port (49200) to avoid conflicts with:
 *   - Dev server (port 3000)
 *   - E2E tests (random port via OS assignment)
 *   - Pentest tests (random port via OS assignment)
 */

import type { Server } from 'node:http';
import type { FullConfig } from '@playwright/test';
import {
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
  TEST_SMTP_HOST,
  TEST_SMTP_PORT,
  TEST_SMTP_FROM,
  TEST_COOKIE_KEYS,
  DEFAULT_TEST_PASSWORD,
} from '../../helpers/constants.js';

/** Dedicated port for UI tests — distinct from E2E (random) and dev (3000) */
const UI_TEST_PORT = 49200;

/** Module-level server reference — read by global-teardown via env var */
let server: Server | null = null;

/**
 * Playwright global setup function.
 *
 * Called once before all test files. Starts the Porta server, seeds
 * test data, and sets environment variables for fixtures to read.
 *
 * @param _config - Playwright full configuration (unused, required by signature)
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  // ── Step 1: Set environment variables ──────────────────────────────
  // Must be set BEFORE dynamic imports so modules pick up correct values
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'fatal';
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = TEST_SMTP_HOST;
  process.env.SMTP_PORT = TEST_SMTP_PORT;
  process.env.SMTP_FROM = TEST_SMTP_FROM;
  process.env.COOKIE_KEYS = TEST_COOKIE_KEYS;
  process.env.ISSUER_BASE_URL = `http://localhost:${UI_TEST_PORT}`;

  // ── Step 2: Dynamic imports ────────────────────────────────────────
  // Import after env vars are set so modules read correct config
  const { connectDatabase } = await import('../../../src/lib/database.js');
  const { connectRedis } = await import('../../../src/lib/redis.js');
  const { runMigrations } = await import('../../../src/lib/migrator.js');
  const { ensureSigningKeys } = await import('../../../src/lib/signing-keys.js');
  const { loadOidcTtlConfig } = await import('../../../src/lib/system-config.js');
  const { createOidcProvider } = await import('../../../src/oidc/provider.js');
  const { createApp } = await import('../../../src/server.js');
  const { initI18n } = await import('../../../src/auth/i18n.js');
  const { initTemplateEngine } = await import('../../../src/auth/template-engine.js');

  // ── Step 3: Connect infrastructure ─────────────────────────────────
  await connectDatabase();
  await connectRedis();

  // ── Step 4: Run migrations ─────────────────────────────────────────
  await runMigrations();

  // ── Step 5: Initialize subsystems ──────────────────────────────────
  await initI18n();
  await initTemplateEngine();

  // ── Step 6: Signing keys & TTL config ──────────────────────────────
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // ── Step 7: Create OIDC provider & Koa app ─────────────────────────
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);

  // ── Step 8: Start server on dedicated port ─────────────────────────
  server = app.listen(UI_TEST_PORT, () => {
    console.log(`[UI Test] Porta server listening on port ${UI_TEST_PORT}`);
  });

  // Wait for server to be fully ready
  await new Promise<void>((resolve) => {
    if (server!.listening) resolve();
    else server!.on('listening', resolve);
  });

  // ── Step 9: Seed test data ─────────────────────────────────────────
  // Truncate existing data and re-seed base data for a clean slate
  const { truncateAllTables, seedBaseData } = await import(
    '../../integration/helpers/database.js'
  );
  await truncateAllTables();
  await seedBaseData();

  // Create a full test tenant: org → app → client (with secret) → user (with password)
  const { createFullTestTenant } = await import(
    '../../integration/helpers/factories.js'
  );
  const tenant = await createFullTestTenant({
    clientOverrides: {
      // Redirect URI that Playwright tests will use — matches the test server
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
    },
  });

  // ── Step 10: Export test data as environment variables ──────────────
  // Playwright fixtures read these to provide testData to each spec file
  const baseUrl = `http://localhost:${UI_TEST_PORT}`;
  process.env.TEST_UI_BASE_URL = baseUrl;
  process.env.TEST_ORG_SLUG = tenant.org.slug;
  process.env.TEST_CLIENT_ID = tenant.client.clientId;
  process.env.TEST_CLIENT_SECRET = tenant.clientSecret;
  process.env.TEST_REDIRECT_URI = `http://localhost:${UI_TEST_PORT}/callback`;
  process.env.TEST_USER_EMAIL = tenant.user.email;
  process.env.TEST_USER_PASSWORD = tenant.password ?? DEFAULT_TEST_PASSWORD;

  // Store server reference for teardown — Playwright runs setup/teardown
  // in the same process, so module-level state persists
  (globalThis as Record<string, unknown>).__PORTA_UI_SERVER = server;
}

export default globalSetup;
