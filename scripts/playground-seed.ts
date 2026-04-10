/**
 * Playground Seed Script
 *
 * Seeds a local Porta instance with test data for manual OIDC flow testing
 * using the external tester at https://psteniusubi.github.io/oidc-tester/
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
const CLIENT_NAME = 'OIDC Tester';
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

  // Dynamic imports — ensures LOG_LEVEL=silent is set before logger initializes
  const { connectDatabase, disconnectDatabase } = await import('../src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../src/lib/redis.js');
  const { runMigrations } = await import('../src/lib/migrator.js');
  const { createOrganization, getOrganizationBySlug } = await import('../src/organizations/index.js');
  const { createApplication, getApplicationBySlug } = await import('../src/applications/index.js');
  const { createClient, generateSecret } = await import('../src/clients/index.js');
  const { createUser, getUserByEmail, reactivateUser } = await import('../src/users/index.js');

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  try {
    // Step 1: Run migrations
    console.log('[1/6] Running database migrations...');
    await runMigrations('up');
    console.log('  ✅ Migrations complete');

    // Step 2: Create or fetch organization
    console.log(`[2/6] Creating organization: ${ORG_NAME} (${ORG_SLUG})...`);
    let org = await getOrganizationBySlug(ORG_SLUG);
    if (!org) {
      org = await createOrganization({ name: ORG_NAME, slug: ORG_SLUG });
      console.log(`  ✅ Organization created: ${org.id}`);
    } else {
      console.log(`  ⚠️  Organization already exists: ${org.id}`);
    }

    // Step 3: Create or fetch application
    console.log(`[3/6] Creating application: ${APP_NAME}...`);
    let app = await getApplicationBySlug('playground-app');
    if (!app) {
      app = await createApplication({ name: APP_NAME });
      console.log(`  ✅ Application created: ${app.id}`);
    } else {
      console.log(`  ⚠️  Application already exists: ${app.id}`);
    }

    // Step 4: Create confidential OIDC client + generate secret
    console.log(`[4/6] Creating confidential OIDC client: ${CLIENT_NAME}...`);
    const clientResult = await createClient({
      organizationId: org.id,
      applicationId: app.id,
      clientName: CLIENT_NAME,
      clientType: 'confidential',
      applicationType: 'web',
      redirectUris: [REDIRECT_URI],
    });
    // Generate a client secret (only shown once — save it!)
    const secretResult = await generateSecret(clientResult.client.id);
    console.log(`  ✅ Client created — OIDC Client ID: ${clientResult.client.clientId}`);
    console.log(`  🔑 Client Secret: ${secretResult.plaintext}`);

    // Step 5: Create or fetch test user
    console.log(`[5/6] Creating test user: ${USER_EMAIL}...`);
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

    // Step 6: Activate the user (users are created as 'inactive')
    console.log('[6/6] Activating test user...');
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
    console.log(`  Organization:  ${ORG_NAME} (${ORG_SLUG})`);
    console.log(`  Application:   ${APP_NAME}`);
    console.log(`  Client ID:     ${clientResult.client.clientId}`);
    console.log(`  Client Secret: ${secretResult.plaintext}`);
    console.log(`  Test User:     ${USER_EMAIL} / ${USER_PASSWORD}`);
    console.log(`\n  OIDC Discovery: ${discoveryUrl}`);
    console.log('\n' + '━'.repeat(65));
    console.log(' Configure the OIDC tester at:');
    console.log('   https://psteniusubi.github.io/oidc-tester/\n');
    console.log(' With these settings:');
    console.log(`   Issuer/Authority:  ${issuerUrl}`);
    console.log(`   Client ID:         ${clientResult.client.clientId}`);
    console.log(`   Client Secret:     ${secretResult.plaintext}`);
    console.log(`   Redirect URI:      ${REDIRECT_URI}`);
    console.log('   Scope:             openid profile email');
    console.log('   Response Type:     code');
    console.log('   PKCE:              S256 (auto)');
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
