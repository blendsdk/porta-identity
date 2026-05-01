/**
 * OIDC Test Harness — Seed Script
 *
 * Creates the minimal test data needed for the OIDC test harness:
 *   - 1 organization (test-org)
 *   - 1 application (Test App)
 *   - 1 public client (for SPA, with PKCE + allowed_origins)
 *   - 1 confidential client (for BFF, with client_secret_post)
 *   - 1 test user (active, with password)
 *
 * Uses Porta's service layer directly (same pattern as scripts/playground-seed.ts)
 * for correct hashing (Argon2id passwords, SHA-256+Argon2id secrets).
 *
 * Idempotent: safe to re-run. Existing resources are found and reused.
 *
 * Outputs:
 *   - test-harness/config.generated.json — consumed by BFF and Playwright tests
 *   - test-harness/spa/config.json — consumed by the SPA (served by sirv)
 *
 * See: plans/oidc-test-harness/03-docker-infrastructure.md
 */

// Suppress pino logs BEFORE any module loads the logger.
// 'fatal' is the quietest valid level (config schema doesn't allow 'silent').
process.env.LOG_LEVEL = 'fatal';

// Point at the test-harness Postgres (port-mapped to localhost)
process.env.DATABASE_URL = 'postgres://porta:harness_pr0d_s3cret@localhost:5432/porta';
process.env.REDIS_URL = 'redis://localhost:6379';

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_NAME = 'Test Organization';
const ORG_SLUG = 'test-org';
const APP_NAME = 'Test App';

const SPA_CLIENT_NAME = 'Test SPA';
const SPA_REDIRECT_URI = 'https://app.test:4100/callback.html';
const SPA_POST_LOGOUT_URI = 'https://app.test:4100/';

const BFF_CLIENT_NAME = 'Test BFF';
const BFF_REDIRECT_URI = 'http://app.test:4101/callback';
const BFF_POST_LOGOUT_URI = 'http://app.test:4101/';

const SHARED_SCOPE = 'openid profile email offline_access';

const TEST_USER_EMAIL = 'testuser@test.org';
const TEST_USER_PASSWORD = 'TestPassword123!';
const TEST_USER_GIVEN_NAME = 'Test';
const TEST_USER_FAMILY_NAME = 'User';

const PORTA_BASE_URL = 'https://porta.local:3443';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🧪 OIDC Test Harness: Seed');
  console.log('   Creating minimal test data...\n');

  // Dynamic imports — ensures LOG_LEVEL=fatal is set before logger initializes
  const { connectDatabase, disconnectDatabase } = await import('../../src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../../src/lib/redis.js');
  const { createOrganization, getOrganizationBySlug, updateOrganization } = await import('../../src/organizations/index.js');
  const { createApplication, getApplicationBySlug } = await import('../../src/applications/index.js');
  const { createClient, listClientsByApplication, generateSecret } = await import('../../src/clients/index.js');
  const { createUser, getUserByEmail, reactivateUser } = await import('../../src/users/index.js');

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  try {
    // -----------------------------------------------------------------------
    // Phase A: Organization
    // -----------------------------------------------------------------------
    console.log('[A] Creating organization...');
    let org = await getOrganizationBySlug(ORG_SLUG);
    if (org) {
      console.log(`  ⚠️  Org "${ORG_NAME}" exists: ${org.id}`);
    } else {
      org = await createOrganization({ name: ORG_NAME, slug: ORG_SLUG });
      console.log(`  ✅ Org "${ORG_NAME}" created: ${org.id}`);
    }

    // Ensure login methods are set (password + magic_link for test coverage)
    await updateOrganization(org.id, {
      defaultLoginMethods: ['password', 'magic_link'],
    });
    console.log(`  🔐 Login methods: [password, magic_link]\n`);

    // -----------------------------------------------------------------------
    // Phase B: Application
    // -----------------------------------------------------------------------
    console.log('[B] Creating application...');
    let app = await getApplicationBySlug('test-app');
    if (app) {
      console.log(`  ⚠️  App "${APP_NAME}" exists: ${app.id}`);
    } else {
      app = await createApplication({ name: APP_NAME });
      console.log(`  ✅ App "${APP_NAME}" created: ${app.id}`);
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase C: Clients
    // -----------------------------------------------------------------------
    console.log('[C] Creating OIDC clients...');

    // Lookup existing clients (idempotent)
    const existingClients = await listClientsByApplication(app.id, { page: 1, pageSize: 100 });

    // --- SPA (public) client ---
    let spaClient = existingClients.data.find(
      (c: { clientName: string }) => c.clientName === SPA_CLIENT_NAME,
    );
    if (spaClient) {
      console.log(`  ⚠️  Client "${SPA_CLIENT_NAME}" exists: ${spaClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: org.id,
        applicationId: app.id,
        clientName: SPA_CLIENT_NAME,
        clientType: 'public',
        applicationType: 'web',
        redirectUris: [SPA_REDIRECT_URI],
        postLogoutRedirectUris: [SPA_POST_LOGOUT_URI],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: SHARED_SCOPE,
        // Explicitly set allowed_origins for production CORS (per AR-5)
        allowedOrigins: ['https://app.test:4100'],
      });
      spaClient = result.client;
      console.log(`  ✅ Client "${SPA_CLIENT_NAME}" created: ${spaClient.clientId}`);
    }

    // --- BFF (confidential) client ---
    let bffClient = existingClients.data.find(
      (c: { clientName: string }) => c.clientName === BFF_CLIENT_NAME,
    );
    if (bffClient) {
      console.log(`  ⚠️  Client "${BFF_CLIENT_NAME}" exists: ${bffClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: org.id,
        applicationId: app.id,
        clientName: BFF_CLIENT_NAME,
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [BFF_REDIRECT_URI],
        postLogoutRedirectUris: [BFF_POST_LOGOUT_URI],
        grantTypes: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'client_secret_post',
        scope: SHARED_SCOPE,
      });
      bffClient = result.client;
      console.log(`  ✅ Client "${BFF_CLIENT_NAME}" created: ${bffClient.clientId}`);
    }

    // Always generate a fresh secret for the BFF client (rotates each seed run)
    const secretResult = await generateSecret(bffClient.id);
    const bffSecret = secretResult.plaintext;
    console.log(`  🔑 BFF client secret: ${bffSecret}\n`);

    // -----------------------------------------------------------------------
    // Phase D: Test User
    // -----------------------------------------------------------------------
    console.log('[D] Creating test user...');
    let user = await getUserByEmail(org.id, TEST_USER_EMAIL);
    if (user) {
      console.log(`  ⚠️  User "${TEST_USER_EMAIL}" exists: ${user.id}`);
    } else {
      user = await createUser({
        organizationId: org.id,
        email: TEST_USER_EMAIL,
        givenName: TEST_USER_GIVEN_NAME,
        familyName: TEST_USER_FAMILY_NAME,
        password: TEST_USER_PASSWORD,
      });
      console.log(`  ✅ User "${TEST_USER_EMAIL}" created: ${user.id}`);
    }

    // Ensure user is active (users start as inactive after creation)
    try {
      await reactivateUser(user.id);
    } catch {
      // Already active — that's fine
    }
    console.log(`  ✅ User status: active\n`);

    // -----------------------------------------------------------------------
    // Phase E: Write Config
    // -----------------------------------------------------------------------
    console.log('[E] Writing config files...');

    const config = {
      orgSlug: ORG_SLUG,
      spa: {
        clientId: spaClient.clientId,
        redirectUri: SPA_REDIRECT_URI,
        postLogoutRedirectUri: SPA_POST_LOGOUT_URI,
        scope: SHARED_SCOPE,
      },
      bff: {
        clientId: bffClient.clientId,
        clientSecret: bffSecret,
        redirectUri: BFF_REDIRECT_URI,
        postLogoutRedirectUri: BFF_POST_LOGOUT_URI,
        scope: SHARED_SCOPE,
      },
      user: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      },
      porta: {
        issuer: `${PORTA_BASE_URL}/${ORG_SLUG}`,
        baseUrl: PORTA_BASE_URL,
      },
      mailhog: {
        apiUrl: 'http://localhost:8025/api',
      },
    };

    // Write to test-harness/config.generated.json (BFF + Playwright)
    const harnessRoot = path.resolve(import.meta.dirname ?? '.', '..');
    const configPath = path.join(harnessRoot, 'config.generated.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`  ✅ Config written: ${configPath}`);

    // Write to test-harness/spa/config.json (SPA — served by sirv)
    const spaConfigDir = path.join(harnessRoot, 'spa');
    if (!fs.existsSync(spaConfigDir)) {
      fs.mkdirSync(spaConfigDir, { recursive: true });
    }
    const spaConfigPath = path.join(spaConfigDir, 'config.json');
    fs.writeFileSync(spaConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`  ✅ SPA config written: ${spaConfigPath}\n`);

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    const SEP = '═'.repeat(60);
    console.log(SEP);
    console.log('🧪 Test Harness Seeded Successfully!\n');
    console.log(`  Organization: ${ORG_NAME} (${ORG_SLUG})`);
    console.log(`  Application:  ${APP_NAME}`);
    console.log(`  SPA Client:   ${spaClient.clientId} (public)`);
    console.log(`  BFF Client:   ${bffClient.clientId} (confidential)`);
    console.log(`  BFF Secret:   ${bffSecret}`);
    console.log(`  Test User:    ${TEST_USER_EMAIL} / ${TEST_USER_PASSWORD}`);
    console.log(`  Porta:        ${PORTA_BASE_URL}`);
    console.log(`  Issuer:       ${PORTA_BASE_URL}/${ORG_SLUG}`);
    console.log(SEP);

  } finally {
    await disconnectRedis();
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
