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

// ---------------------------------------------------------------------------
// Phase 2 seed data — additional users and orgs for status/error tests
// ---------------------------------------------------------------------------

/** Password shared by all additional test users (except invited, who has none) */
const ADDITIONAL_USER_PASSWORD = 'TestPassword123!';

/** Password for the resettable user — must be different from ADDITIONAL so reset tests can verify change */
const RESETTABLE_USER_PASSWORD = 'OldPassword123!';

/**
 * Additional users to seed for Phase 2 tests.
 *
 * Each user is created in the primary test org alongside the main test user.
 * Users with a password get a hashed password and emailVerified=true.
 * The 'invited' user has no password (simulates a pending invitation).
 */
const ADDITIONAL_USERS = [
  { email: 'suspended@test.example.com', status: 'suspended' as const, password: ADDITIONAL_USER_PASSWORD },
  { email: 'inactive@test.example.com', status: 'inactive' as const, password: ADDITIONAL_USER_PASSWORD },
  { email: 'locked@test.example.com', status: 'locked' as const, password: ADDITIONAL_USER_PASSWORD },
  // Lockable user: created as active, will be locked by individual tests
  { email: 'lockable@test.example.com', status: 'active' as const, password: ADDITIONAL_USER_PASSWORD },
  // Invited user: inactive with no password (simulates pending invitation acceptance)
  { email: 'invited@test.example.com', status: 'inactive' as const, password: null },
  // Resettable user: active, with known password for password reset tests
  { email: 'resettable@test.example.com', status: 'active' as const, password: RESETTABLE_USER_PASSWORD },
] as const;

/**
 * Additional orgs for tenant isolation tests.
 *
 * Created with non-active statuses so login attempts against them produce
 * appropriate error pages.
 */
const ADDITIONAL_ORGS = [
  { name: 'Suspended Org', slug: 'suspended-org', status: 'suspended' as const },
  { name: 'Archived Org', slug: 'archived-org', status: 'archived' as const },
] as const;

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

  // Create a full test tenant: org → app → public client (with secret) → user (with password)
  const {
    createFullTestTenant,
    createTestUserWithPassword,
    createTestUser,
    createTestOrganization,
  } = await import('../../integration/helpers/factories.js');

  const tenant = await createFullTestTenant({
    clientOverrides: {
      // Redirect URI that Playwright tests will use — matches the test server
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
    },
  });

  // Create a second tenant with a CONFIDENTIAL client for token endpoint E2E tests.
  // Confidential clients use client_secret_post for authentication and have
  // a stored SHA-256 hash of the secret in the database. This tenant exercises
  // the full OIDC flow: auth → token → id_token → introspect → userinfo.
  const confTenant = await createFullTestTenant({
    orgOverrides: { name: 'Confidential Test Org' },
    clientOverrides: {
      clientName: 'Confidential Test Client',
      clientType: 'confidential',
      applicationType: 'web',
      tokenEndpointAuthMethod: 'client_secret_post',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
    },
    userOverrides: {
      email: 'conf-test@example.com',
      givenName: 'Conf',
      familyName: 'Tester',
    },
  });

  // ── Step 9b: Seed additional users (Phase 2) ────────────────────────
  // Create users in various statuses for login error state and auth workflow tests.
  // Use direct DB update for non-active statuses (bypasses service-layer validation).
  const pool = (await import('../../../src/lib/database.js')).getPool();
  const resettableUserIdRef: { value: string } = { value: '' };

  for (const userData of ADDITIONAL_USERS) {
    if (userData.password) {
      // User with password — create with hashed password and verified email
      const { user } = await createTestUserWithPassword(
        tenant.org.id,
        userData.password,
        {
          email: userData.email,
          givenName: 'Test',
          familyName: userData.email.split('@')[0],
          emailVerified: true,
        },
      );

      // Update status if not 'active' (factory creates all users as active)
      if (userData.status !== 'active') {
        await pool.query(
          `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
          [userData.status, user.id],
        );
      }

      // Track resettable user ID for env var export
      if (userData.email === 'resettable@test.example.com') {
        resettableUserIdRef.value = user.id;
      }
    } else {
      // User without password (invited) — create without passwordHash
      const user = await createTestUser(tenant.org.id, {
        email: userData.email,
        givenName: 'Test',
        familyName: 'Invited',
      });

      // Set status to 'invited'
      await pool.query(
        `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
        [userData.status, user.id],
      );
    }
  }

  // ── Step 9c: Seed additional organizations (Phase 2) ────────────────
  // Create orgs with non-active statuses for tenant isolation tests.
  for (const orgData of ADDITIONAL_ORGS) {
    const org = await createTestOrganization({
      name: orgData.name,
      slug: orgData.slug,
    });

    // Update status (factory creates all orgs as active)
    await pool.query(
      `UPDATE organizations SET status = $1, updated_at = NOW() WHERE id = $2`,
      [orgData.status, org.id],
    );
  }

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

  // Confidential client test data — separate tenant with confidential client
  process.env.TEST_CONF_ORG_SLUG = confTenant.org.slug;
  process.env.TEST_CONF_CLIENT_ID = confTenant.client.clientId;
  process.env.TEST_CONF_CLIENT_SECRET = confTenant.clientSecret;
  process.env.TEST_CONF_USER_EMAIL = confTenant.user.email;
  process.env.TEST_CONF_USER_PASSWORD = confTenant.password ?? DEFAULT_TEST_PASSWORD;

  // Phase 2: Additional user emails and passwords for status tests
  process.env.UI_TEST_SUSPENDED_USER_EMAIL = 'suspended@test.example.com';
  process.env.UI_TEST_INACTIVE_USER_EMAIL = 'inactive@test.example.com';
  process.env.UI_TEST_LOCKED_USER_EMAIL = 'locked@test.example.com';
  process.env.UI_TEST_LOCKABLE_USER_EMAIL = 'lockable@test.example.com';
  process.env.UI_TEST_LOCKABLE_USER_PASSWORD = ADDITIONAL_USER_PASSWORD;
  process.env.UI_TEST_INVITED_USER_EMAIL = 'invited@test.example.com';
  process.env.UI_TEST_RESETTABLE_USER_EMAIL = 'resettable@test.example.com';
  process.env.UI_TEST_RESETTABLE_USER_PASSWORD = RESETTABLE_USER_PASSWORD;
  process.env.UI_TEST_RESETTABLE_USER_ID = resettableUserIdRef.value;

  // Phase 2: Additional org slugs for tenant isolation tests
  process.env.UI_TEST_SUSPENDED_ORG_SLUG = 'suspended-org';
  process.env.UI_TEST_ARCHIVED_ORG_SLUG = 'archived-org';

  // Store server reference for teardown — Playwright runs setup/teardown
  // in the same process, so module-level state persists
  (globalThis as Record<string, unknown>).__PORTA_UI_SERVER = server;
}

export default globalSetup;
