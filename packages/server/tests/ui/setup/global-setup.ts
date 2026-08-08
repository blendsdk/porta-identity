/**
 * Playwright global setup — starts a real Porta server for UI tests.
 *
 * Startup sequence:
 *   1. Sets test environment variables (DATABASE_URL, REDIS_URL, etc.)
 *   2. Connects to the test database and Redis
 *   3. Runs all migrations against the test database
 *   4. Truncates all tables (clean slate for signing keys)
 *   5. Initializes i18n and template engine
 *   6. Generates signing keys and loads OIDC TTL config
 *   7. Creates a Koa server with a real OIDC provider
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
// 2FA test constants — encryption key matching the server's dev/test fallback
// ---------------------------------------------------------------------------

/**
 * Dev/test encryption key — must match DEV_ENCRYPTION_KEY in src/two-factor/service.ts.
 * The server falls back to this when TWO_FACTOR_ENCRYPTION_KEY is not set.
 * We use the same key here to encrypt TOTP secrets during seeding.
 */
const TEST_2FA_ENCRYPTION_KEY = 'a'.repeat(64);

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
  // 64 hex chars = 32-byte key for AES-256-GCM signing key encryption.
  // Must be set explicitly — the DB may contain signing keys encrypted
  // with a different key from a prior test suite run.
  process.env.SIGNING_KEY_ENCRYPTION_KEY =
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

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

  // ── Step 5: Clean slate ────────────────────────────────────────────
  // Truncate all tables BEFORE ensureSigningKeys() — the DB may contain
  // signing keys encrypted with a different SIGNING_KEY_ENCRYPTION_KEY
  // from a prior test run (e.g. `yarn test` uses a different key).
  // Decrypting those with *this* run's key causes AES-GCM auth tag
  // mismatch → SigningKeyCryptoError. Truncating first ensures
  // ensureSigningKeys() auto-generates fresh keys with the correct key.
  const { truncateAllTables, seedBaseData } = await import(
    '../../integration/helpers/database.js'
  );
  await truncateAllTables();

  // ── Step 6: Initialize subsystems ──────────────────────────────────
  await initI18n();
  await initTemplateEngine();

  // ── Step 7: Signing keys & TTL config ──────────────────────────────
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // ── Step 8: Create OIDC provider & Koa app ─────────────────────────
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);

  // ── Step 9: Start server on dedicated port ─────────────────────────
  server = app.listen(UI_TEST_PORT, () => {
    console.log(`[UI Test] Porta server listening on port ${UI_TEST_PORT}`);
  });

  // Wait for server to be fully ready
  await new Promise<void>((resolve) => {
    if (server!.listening) resolve();
    else server!.on('listening', resolve);
  });

  // ── Step 10: Seed test data ────────────────────────────────────────
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

  // ── Step 9d: Seed 2FA-enabled users ─────────────────────────────────
  // Create users with email OTP and TOTP 2FA enabled. These are seeded
  // here (in the server process) so the server's in-memory cache sees the
  // correct state — unlike the previous approach of updating from Playwright
  // workers which ran in a separate process.
  const { encryptTotpSecret } = await import('../../../src/two-factor/crypto.js');
  const { generateTotpSecret } = await import('../../../src/two-factor/totp.js');
  const { generateRecoveryCodes, hashRecoveryCode } = await import('../../../src/two-factor/recovery.js');

  // 1. Email OTP user — has 2FA enabled with 'email' method
  const { user: twoFaEmailUser } = await createTestUserWithPassword(
    tenant.org.id,
    DEFAULT_TEST_PASSWORD,
    {
      email: 'ui-test-2fa-email@test.local',
      givenName: 'TwoFA',
      familyName: 'Email',
      emailVerified: true,
    },
  );
  await pool.query(
    `UPDATE users SET two_factor_enabled = true, two_factor_method = 'email' WHERE id = $1`,
    [twoFaEmailUser.id],
  );

  // 2. TOTP user — has 2FA enabled with 'totp' method + encrypted secret + recovery codes
  const { user: twoFaTotpUser } = await createTestUserWithPassword(
    tenant.org.id,
    DEFAULT_TEST_PASSWORD,
    {
      email: 'ui-test-2fa-totp@test.local',
      givenName: 'TwoFA',
      familyName: 'TOTP',
      emailVerified: true,
    },
  );

  // Generate TOTP secret, encrypt it, and store in user_totp table
  const totpSecret = generateTotpSecret();
  const { encrypted, iv, tag } = encryptTotpSecret(totpSecret, TEST_2FA_ENCRYPTION_KEY);
  await pool.query(
    `INSERT INTO user_totp (id, user_id, encrypted_secret, encryption_iv, encryption_tag, verified)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, true)`,
    [twoFaTotpUser.id, encrypted, iv, tag],
  );
  await pool.query(
    `UPDATE users SET two_factor_enabled = true, two_factor_method = 'totp' WHERE id = $1`,
    [twoFaTotpUser.id],
  );

  // 3. Generate and store recovery codes for the TOTP user
  const recoveryCodes = generateRecoveryCodes(10);
  for (const code of recoveryCodes) {
    const codeHash = await hashRecoveryCode(code);
    await pool.query(
      `INSERT INTO two_factor_recovery_codes (id, user_id, code_hash)
       VALUES (gen_random_uuid(), $1, $2)`,
      [twoFaTotpUser.id, codeHash],
    );
  }

  // 4. TOTP setup tenant — org requires TOTP, user has NOT enrolled yet.
  //    When this user logs in, requiresTwoFactor() returns true and the
  //    server redirects to /two-factor/setup for TOTP enrollment.
  const twoFaSetupTenant = await createFullTestTenant({
    orgOverrides: { name: '2FA Setup Test Org' },
    clientOverrides: {
      clientName: '2FA Setup Client',
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
    },
    userOverrides: {
      email: 'ui-test-2fa-setup@test.local',
      givenName: 'TwoFA',
      familyName: 'Setup',
    },
  });
  // Set the org's 2FA policy to 'required_totp' — forces TOTP enrollment on login
  await pool.query(
    `UPDATE organizations SET two_factor_policy = 'required_totp' WHERE id = $1`,
    [twoFaSetupTenant.org.id],
  );

  // ── Step 9e: Seed login-method tenants ──────────────────────────────
  // Two dedicated tenants whose CLIENT overrides the effective login methods:
  //   - password-only: client.login_methods = ['password']
  //   - magic-link-only: client.login_methods = ['magic_link']
  // Both orgs keep the org default (['password', 'magic_link']); the
  // per-client override is what drives the login page rendering + POST
  // enforcement that tests/ui/flows/login-methods.spec.ts exercises.
  //
  // We use separate tenants (not the primary `tenant`) so these tests can
  // run in parallel with password-login / magic-link regression tests
  // without any risk of cross-contamination.
  const passwordOnlyTenant = await createFullTestTenant({
    orgOverrides: { name: 'Password-Only Login Methods Org' },
    clientOverrides: {
      clientName: 'Password-Only Client',
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
      loginMethods: ['password'],
    },
    userOverrides: {
      email: 'ui-test-lm-password-only@test.local',
      givenName: 'LM',
      familyName: 'PasswordOnly',
    },
  });

  const magicLinkOnlyTenant = await createFullTestTenant({
    orgOverrides: { name: 'Magic-Link-Only Login Methods Org' },
    clientOverrides: {
      clientName: 'Magic-Link-Only Client',
      redirectUris: [`http://localhost:${UI_TEST_PORT}/callback`],
      loginMethods: ['magic_link'],
    },
    userOverrides: {
      email: 'ui-test-lm-magic-only@test.local',
      givenName: 'LM',
      familyName: 'MagicOnly',
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

  // 2FA test data — seeded users with 2FA enabled
  process.env.UI_TEST_2FA_EMAIL_USER = 'ui-test-2fa-email@test.local';
  process.env.UI_TEST_2FA_TOTP_USER = 'ui-test-2fa-totp@test.local';
  process.env.UI_TEST_TOTP_SECRET = totpSecret;
  process.env.UI_TEST_RECOVERY_CODES = JSON.stringify(recoveryCodes);

  // 2FA TOTP setup tenant — org requires TOTP, user has NOT enrolled yet
  // When this user logs in, the server redirects to /two-factor/setup
  process.env.UI_TEST_2FA_SETUP_ORG_SLUG = twoFaSetupTenant.org.slug;
  process.env.UI_TEST_2FA_SETUP_CLIENT_ID = twoFaSetupTenant.client.clientId;
  process.env.UI_TEST_2FA_SETUP_USER_EMAIL = twoFaSetupTenant.user.email;
  process.env.UI_TEST_2FA_SETUP_USER_PASSWORD = twoFaSetupTenant.password ?? DEFAULT_TEST_PASSWORD;

  // Login-method tenants — client.login_methods = ['password'] and ['magic_link']
  // Used by tests/ui/flows/login-methods.spec.ts to verify template rendering
  // and POST-enforcement in each mode without racing the primary tenant.
  process.env.UI_TEST_LM_PASSWORD_ONLY_ORG_SLUG = passwordOnlyTenant.org.slug;
  process.env.UI_TEST_LM_PASSWORD_ONLY_CLIENT_ID = passwordOnlyTenant.client.clientId;
  process.env.UI_TEST_LM_PASSWORD_ONLY_USER_EMAIL = passwordOnlyTenant.user.email;
  process.env.UI_TEST_LM_PASSWORD_ONLY_USER_PASSWORD =
    passwordOnlyTenant.password ?? DEFAULT_TEST_PASSWORD;

  process.env.UI_TEST_LM_MAGIC_LINK_ONLY_ORG_SLUG = magicLinkOnlyTenant.org.slug;
  process.env.UI_TEST_LM_MAGIC_LINK_ONLY_CLIENT_ID = magicLinkOnlyTenant.client.clientId;
  process.env.UI_TEST_LM_MAGIC_LINK_ONLY_USER_EMAIL = magicLinkOnlyTenant.user.email;
  process.env.UI_TEST_LM_MAGIC_LINK_ONLY_USER_PASSWORD =
    magicLinkOnlyTenant.password ?? DEFAULT_TEST_PASSWORD;

  // Store server reference for teardown — Playwright runs setup/teardown
  // in the same process, so module-level state persists
  (globalThis as Record<string, unknown>).__PORTA_UI_SERVER = server;
}

export default globalSetup;
