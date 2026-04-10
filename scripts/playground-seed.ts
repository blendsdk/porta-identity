/**
 * Playground Seed Script
 *
 * Seeds a local Porta instance with test data for manual OIDC flow testing
 * using the external tester at https://psteniusubi.github.io/oidc-tester/
 *
 * Creates:
 *   - Organization "Playground" (slug: playground)
 *   - Application "Playground App"
 *   - Confidential client "OIDC Tester (Confidential)" + secret
 *   - Public client "OIDC Tester (Public)"
 *   - Test user test@playground.local
 *
 * Idempotent: safe to re-run. Existing resources are reused.
 * A new client secret is generated on each run for the confidential client.
 *
 * Prerequisites:
 *   - Docker services running (yarn docker:up)
 *   - .env file configured
 *
 * Usage:
 *   yarn tsx scripts/playground-seed.ts
 */

// Suppress pino infrastructure logs BEFORE any module loads the logger.
// Use 'fatal' (quietest valid level) since the config schema doesn't allow 'silent'.
process.env.LOG_LEVEL = 'fatal';

import dotenv from 'dotenv';
dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ORG_SLUG = 'playground';
const ORG_NAME = 'Playground';
const APP_NAME = 'Playground App';
const CONF_CLIENT_NAME = 'OIDC Tester (Confidential)';
const PUB_CLIENT_NAME = 'OIDC Tester (Public)';
const REDIRECT_URI = 'https://psteniusubi.github.io/oidc-tester/authorization-code-flow.html';
const USER_EMAIL = 'test@playground.local';
const USER_PASSWORD = 'Playground123!';
const USER_GIVEN = 'Test';
const USER_FAMILY = 'User';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🚀 Porta Playground Seed');
  console.log('   Setting up test data for OIDC flow testing...\n');

  // Dynamic imports — ensures LOG_LEVEL=fatal is set before logger initializes
  const { connectDatabase, disconnectDatabase } = await import('../src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../src/lib/redis.js');
  const { runMigrations } = await import('../src/lib/migrator.js');
  const { createOrganization, getOrganizationBySlug } = await import('../src/organizations/index.js');
  const { createApplication, getApplicationBySlug } = await import('../src/applications/index.js');
  const { createClient, listClientsByApplication, generateSecret } = await import('../src/clients/index.js');
  const { createUser, getUserByEmail, reactivateUser } = await import('../src/users/index.js');

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  try {
    // Step 1: Run migrations
    console.log('[1/7] Running database migrations...');
    await runMigrations('up');
    console.log('  ✅ Migrations complete');

    // Step 2: Create or fetch organization
    console.log(`[2/7] Creating organization: ${ORG_NAME} (${ORG_SLUG})...`);
    let org = await getOrganizationBySlug(ORG_SLUG);
    if (!org) {
      org = await createOrganization({ name: ORG_NAME, slug: ORG_SLUG });
      console.log(`  ✅ Organization created: ${org.id}`);
    } else {
      console.log(`  ⚠️  Organization already exists: ${org.id}`);
    }

    // Step 3: Create or fetch application
    console.log(`[3/7] Creating application: ${APP_NAME}...`);
    let app = await getApplicationBySlug('playground-app');
    if (!app) {
      app = await createApplication({ name: APP_NAME });
      console.log(`  ✅ Application created: ${app.id}`);
    } else {
      console.log(`  ⚠️  Application already exists: ${app.id}`);
    }

    // Step 4: Create or find confidential OIDC client
    console.log(`[4/7] Creating confidential OIDC client: ${CONF_CLIENT_NAME}...`);
    const existingClients = await listClientsByApplication(app.id, { page: 1, pageSize: 50 });
    let confClient = existingClients.data.find(c => c.clientName === CONF_CLIENT_NAME);
    if (!confClient) {
      const result = await createClient({
        organizationId: org.id,
        applicationId: app.id,
        clientName: CONF_CLIENT_NAME,
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [REDIRECT_URI],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email',
      });
      confClient = result.client;
      console.log(`  ✅ Confidential client created: ${confClient.clientId}`);
    } else {
      console.log(`  ⚠️  Confidential client already exists: ${confClient.clientId}`);
    }

    // Always generate a fresh secret (shown once)
    const secretResult = await generateSecret(confClient.id);
    console.log(`  🔑 New client secret generated (save this!): ${secretResult.plaintext}`);

    // Step 5: Create or find public OIDC client
    console.log(`[5/7] Creating public OIDC client: ${PUB_CLIENT_NAME}...`);
    let pubClient = existingClients.data.find(c => c.clientName === PUB_CLIENT_NAME);
    if (!pubClient) {
      const result = await createClient({
        organizationId: org.id,
        applicationId: app.id,
        clientName: PUB_CLIENT_NAME,
        clientType: 'public',
        applicationType: 'spa',
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [REDIRECT_URI],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email',
      });
      pubClient = result.client;
      console.log(`  ✅ Public client created: ${pubClient.clientId}`);
    } else {
      console.log(`  ⚠️  Public client already exists: ${pubClient.clientId}`);
    }

    // Step 6: Create or fetch test user
    console.log(`[6/7] Creating test user: ${USER_EMAIL}...`);
    let user = await getUserByEmail(org.id, USER_EMAIL);
    if (!user) {
      user = await createUser({
        organizationId: org.id,
        email: USER_EMAIL,
        givenName: USER_GIVEN,
        familyName: USER_FAMILY,
        password: USER_PASSWORD,
      });
      console.log(`  ✅ User created: ${user.id}`);
    } else {
      console.log(`  ⚠️  User already exists: ${user.id}`);
    }

    // Step 7: Activate the user (users are created as 'inactive')
    console.log('[7/7] Activating test user...');
    try {
      await reactivateUser(user.id);
      console.log('  ✅ User activated');
    } catch {
      console.log('  ⚠️  User may already be active');
    }

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------
    const issuerUrl = `http://localhost:3000/${ORG_SLUG}`;
    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;

    console.log('\n' + '═'.repeat(65));
    console.log('🎉 Playground ready!\n');
    console.log(`  Organization:        ${ORG_NAME} (${ORG_SLUG})`);
    console.log(`  Application:         ${APP_NAME}`);
    console.log(`  Test User:           ${USER_EMAIL} / ${USER_PASSWORD}`);
    console.log(`\n  OIDC Discovery: ${discoveryUrl}`);

    console.log('\n' + '━'.repeat(65));
    console.log(' Option A: Confidential Client (client_secret_basic)');
    console.log('━'.repeat(65));
    console.log(`   Client ID:     ${confClient.clientId}`);
    console.log(`   Client Secret: ${secretResult.plaintext}`);
    console.log(`   Auth Method:   client_secret_basic`);
    console.log(`   Redirect URI:  ${REDIRECT_URI}`);
    console.log('   Scope:         openid profile email');
    console.log('   Response Type: code');
    console.log('   PKCE:          S256 (auto)');

    console.log('\n' + '━'.repeat(65));
    console.log(' Option B: Public Client (PKCE only, no secret)');
    console.log('━'.repeat(65));
    console.log(`   Client ID:     ${pubClient.clientId}`);
    console.log('   Client Secret: (none — public client)');
    console.log('   Auth Method:   none');
    console.log(`   Redirect URI:  ${REDIRECT_URI}`);
    console.log('   Scope:         openid profile email');
    console.log('   Response Type: code');
    console.log('   PKCE:          S256 (required)');

    console.log('\n' + '━'.repeat(65));
    console.log(' Verify discovery endpoint:');
    console.log(`   curl ${discoveryUrl}`);
    console.log('\n Configure the OIDC tester at:');
    console.log('   https://psteniusubi.github.io/oidc-tester/');
    console.log(`\n Issuer/Authority: ${issuerUrl}`);
    console.log('━'.repeat(65));
    console.log('\n Start the server with: yarn dev\n');
  } finally {
    await disconnectRedis();
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
