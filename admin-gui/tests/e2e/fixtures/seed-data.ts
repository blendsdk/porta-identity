/**
 * Seed data module for Admin GUI E2E tests.
 *
 * Creates all test data needed by the E2E test suite: super-admin org,
 * admin application, RBAC roles, admin user with porta-admin role,
 * BFF confidential client, additional test orgs, and audit log entries.
 *
 * Uses the integration test factories from the root project for entity
 * creation to ensure consistency with the rest of the test suite.
 *
 * Called once during global setup — all tests share this seeded state.
 * Tests should NOT modify seed data (read-only) to avoid ordering issues.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of seeding — contains all entities and credentials for env var export */
export interface SeedResult {
  /** Super-admin organization (slug: 'porta-admin') */
  superAdminOrg: { id: string; slug: string };
  /** Admin application (for RBAC scope) */
  app: { id: string; name: string };
  /** porta-admin RBAC role */
  role: { id: string; slug: string };
  /** Admin user with porta-admin role */
  user: { id: string; email: string };
  /** Admin user's plaintext password */
  password: string;
  /** BFF confidential OIDC client */
  client: { clientId: string };
  /** BFF client's plaintext secret */
  clientSecret: string;
  /** Additional test organizations for list/filter tests */
  testOrgs: {
    active: { id: string; slug: string };
    suspended: { id: string; slug: string };
    archived: { id: string; slug: string };
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Porta server port in E2E tests */
const PORT_PORTA = 49300;

/** BFF server port in E2E tests */
const PORT_BFF = 49301;

/** Admin user email used for authentication in all E2E tests */
export const ADMIN_EMAIL = 'admin@porta-test.local';

/** Admin user password (used as fallback, primary auth is magic link) */
const ADMIN_PASSWORD = 'TestPassword123!';

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Seed all test data needed by the Admin GUI E2E test suite.
 *
 * Prerequisites:
 * - Database connected and migrations run
 * - seedBaseData() already called (creates super-admin org + system config)
 *
 * Creates:
 * 1. Admin application (for RBAC)
 * 2. porta-admin role + permissions
 * 3. Admin user with porta-admin role
 * 4. BFF confidential OIDC client
 * 5. Additional test orgs (active, suspended, archived)
 * 6. Audit log entries (12+)
 * 7. System config entries are already seeded by seedBaseData()
 *
 * @returns All created entities and credentials
 */
export async function seedAdminGuiTestData(): Promise<SeedResult> {
  // Dynamic imports — modules must be imported after env vars are set
  // and database is connected (they read config at import time)
  const { getPool } = await import('../../../../src/lib/database.js');
  const {
    createTestApplication,
    createTestRole,
    createTestUserWithPassword,
    createTestClientWithSecret,
    createTestOrganization,
  } = await import('../../../../tests/integration/helpers/factories.js');

  const pool = getPool();

  // ── 1. Find super-admin org (created by seedBaseData) ─────────────
  const { rows: superAdminRows } = await pool.query(
    `SELECT id, slug FROM organizations WHERE is_super_admin = true`,
  );
  if (superAdminRows.length === 0) {
    throw new Error('Super-admin org not found — was seedBaseData() called?');
  }
  const superAdminOrg = superAdminRows[0] as { id: string; slug: string };

  // ── 2. Create admin application (RBAC scope) ──────────────────────
  const app = await createTestApplication({
    name: 'Porta Admin',
    slug: 'porta-admin-app',
  });

  // ── 3. Create porta-admin role ────────────────────────────────────
  const role = await createTestRole(app.id, {
    name: 'Porta Admin',
    slug: 'porta-admin',
    description: 'Full admin access to all Porta management functions',
  });

  // ── 4. Create admin user with password ────────────────────────────
  const { user, password } = await createTestUserWithPassword(
    superAdminOrg.id,
    ADMIN_PASSWORD,
    {
      email: ADMIN_EMAIL,
      givenName: 'Admin',
      familyName: 'User',
      emailVerified: true,
    },
  );

  // ── 5. Assign porta-admin role to admin user ──────────────────────
  await pool.query(
    `INSERT INTO user_roles (id, user_id, role_id, organization_id)
     VALUES (gen_random_uuid(), $1, $2, $3)`,
    [user.id, role.id, superAdminOrg.id],
  );

  // ── 6. Create BFF confidential OIDC client ────────────────────────
  // Confidential client with client_secret_post auth — matches BFF's
  // OIDC token exchange requirements
  const { client, clientSecret } = await createTestClientWithSecret(
    superAdminOrg.id,
    app.id,
    {
      clientName: 'Admin GUI BFF (E2E)',
      clientType: 'confidential',
      applicationType: 'web',
      tokenEndpointAuthMethod: 'client_secret_post',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      redirectUris: [`http://localhost:${PORT_BFF}/auth/callback`],
    },
  );

  // ── 7. Create additional test organizations ───────────────────────
  // These provide data for the Organization list page: filtering,
  // search, and status display
  const activeOrg = await createTestOrganization({
    name: 'Acme Corporation',
    slug: 'acme-corp',
  });

  const suspendedOrg = await createTestOrganization({
    name: 'Suspended Corp',
    slug: 'suspended-corp',
  });
  await pool.query(
    `UPDATE organizations SET status = 'suspended' WHERE id = $1`,
    [suspendedOrg.id],
  );

  const archivedOrg = await createTestOrganization({
    name: 'Archived Inc',
    slug: 'archived-inc',
  });
  await pool.query(
    `UPDATE organizations SET status = 'archived' WHERE id = $1`,
    [archivedOrg.id],
  );

  // ── 8. Create audit log entries ───────────────────────────────────
  // 12 entries with varied actions for the Audit Log page tests
  const auditActions = [
    { action: 'user.login', resourceType: 'user', details: { method: 'magic_link' } },
    { action: 'user.created', resourceType: 'user', details: { email: ADMIN_EMAIL } },
    { action: 'org.created', resourceType: 'organization', details: { name: 'Acme Corporation' } },
    { action: 'org.updated', resourceType: 'organization', details: { field: 'status' } },
    { action: 'client.created', resourceType: 'client', details: { type: 'confidential' } },
    { action: 'role.assigned', resourceType: 'role', details: { role: 'porta-admin' } },
    { action: 'config.updated', resourceType: 'system_config', details: { key: 'session_ttl' } },
    { action: 'keys.rotated', resourceType: 'signing_key', details: { algorithm: 'ES256' } },
    { action: 'session.revoked', resourceType: 'session', details: { reason: 'admin' } },
    { action: 'user.password_reset', resourceType: 'user', details: { initiated: true } },
    { action: 'org.suspended', resourceType: 'organization', details: { reason: 'policy' } },
    { action: 'export.completed', resourceType: 'export', details: { format: 'csv', count: 42 } },
  ];

  for (const entry of auditActions) {
    await pool.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, resource_type, resource_id, organization_id, details)
       VALUES ('user', $1, $2, $3, gen_random_uuid()::text, $4, $5)`,
      [
        user.id,
        entry.action,
        entry.resourceType,
        superAdminOrg.id,
        JSON.stringify(entry.details),
      ],
    );
  }

  return {
    superAdminOrg,
    app: { id: app.id, name: app.name },
    role: { id: role.id, slug: role.slug },
    user: { id: user.id, email: user.email },
    password,
    client: { clientId: client.clientId },
    clientSecret,
    testOrgs: {
      active: { id: activeOrg.id, slug: activeOrg.slug },
      suspended: { id: suspendedOrg.id, slug: suspendedOrg.slug },
      archived: { id: archivedOrg.id, slug: archivedOrg.slug },
    },
  };
}
