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
  /** Test application linked to the active test org (acme-corp) */
  testApp: { id: string; name: string; slug: string };
  /** Archived test application for status filter tests */
  archivedApp: { id: string; name: string; slug: string };
  /** Test public client linked to Acme Customer Portal */
  testClient: { id: string; clientId: string; name: string };
  /** Test confidential client linked to Acme Customer Portal */
  testConfidentialClient: { id: string; clientId: string; name: string };
  /** Test users in acme-corp for user page tests */
  testUsers: {
    active: { id: string; email: string; givenName: string; familyName: string };
    suspended: { id: string; email: string };
  };
  /** Test roles in Acme Customer Portal for RBAC page tests */
  testRoles: {
    editor: { id: string; name: string; slug: string };
    viewer: { id: string; name: string; slug: string };
  };
  /** Test permissions in Acme Customer Portal for RBAC page tests */
  testPermissions: {
    read: { id: string; name: string; slug: string };
    write: { id: string; name: string; slug: string };
    delete: { id: string; name: string; slug: string };
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
    createTestPermission,
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
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [user.id, role.id],
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

  // ── 8. Create test applications for application page tests ────────
  // Active application linked to acme-corp for list/detail tests
  const testApp = await createTestApplication({
    name: 'Acme Customer Portal',
    slug: 'acme-customer-portal',
    organizationId: activeOrg.id,
    description: 'Customer-facing portal application',
  });

  // Archived application for status filter tests
  const archivedApp = await createTestApplication({
    name: 'Legacy Dashboard',
    slug: 'legacy-dashboard',
    organizationId: activeOrg.id,
    description: 'Deprecated dashboard application',
  });
  await pool.query(
    `UPDATE applications SET status = 'archived' WHERE id = $1`,
    [archivedApp.id],
  );

  // ── 9. Create test OIDC clients for client page tests ─────────────
  // Public SPA client linked to Acme Customer Portal
  const { client: testPublicClient } = await createTestClientWithSecret(
    activeOrg.id,
    testApp.id,
    {
      clientName: 'Acme SPA Client',
      clientType: 'public',
      applicationType: 'web',
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      redirectUris: ['http://localhost:3000/callback'],
    },
  );

  // Confidential backend client linked to Acme Customer Portal
  const { client: testConfClient } = await createTestClientWithSecret(
    activeOrg.id,
    testApp.id,
    {
      clientName: 'Acme Backend Service',
      clientType: 'confidential',
      applicationType: 'web',
      tokenEndpointAuthMethod: 'client_secret_post',
      grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
      responseTypes: ['code'],
      redirectUris: ['http://localhost:4000/auth/callback'],
    },
  );

  // ── 10. Create test users for user page tests ─────────────────────
  // Active user in acme-corp for list/detail tests
  const testActiveUser = await createTestUserWithPassword(
    activeOrg.id,
    'TestPassword123!',
    {
      email: 'jane.doe@acme-test.local',
      givenName: 'Jane',
      familyName: 'Doe',
      emailVerified: true,
    },
  );

  // Suspended user in acme-corp for status filter tests
  const testSuspendedUser = await createTestUserWithPassword(
    activeOrg.id,
    'TestPassword123!',
    {
      email: 'suspended.user@acme-test.local',
      givenName: 'Suspended',
      familyName: 'Tester',
      emailVerified: false,
    },
  );
  await pool.query(
    `UPDATE users SET status = 'suspended' WHERE id = $1`,
    [testSuspendedUser.user.id],
  );

  // ── 11. Create test roles & permissions for RBAC page tests ───────
  // Roles and permissions scoped to the Acme Customer Portal app
  const editorRole = await createTestRole(testApp.id, {
    name: 'Editor',
    slug: 'editor',
    description: 'Can create and edit content',
  });

  const viewerRole = await createTestRole(testApp.id, {
    name: 'Viewer',
    slug: 'viewer',
    description: 'Read-only access to content',
  });

  const readPerm = await createTestPermission(testApp.id, {
    name: 'Read Content',
    slug: 'read-content',
    description: 'Permission to view content',
  });

  const writePerm = await createTestPermission(testApp.id, {
    name: 'Write Content',
    slug: 'write-content',
    description: 'Permission to create and edit content',
  });

  const deletePerm = await createTestPermission(testApp.id, {
    name: 'Delete Content',
    slug: 'delete-content',
    description: 'Permission to delete content',
  });

  // Assign permissions to roles: editor gets all 3, viewer gets read only
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2), ($1, $3), ($1, $4)`,
    [editorRole.id, readPerm.id, writePerm.id, deletePerm.id],
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
    [viewerRole.id, readPerm.id],
  );

  // ── 12. Create audit log entries ──────────────────────────────────
  // 12 entries with varied event types for the Audit Log page tests
  const auditEntries = [
    { eventType: 'user.login.success', category: 'authentication', desc: 'User logged in via magic link' },
    { eventType: 'user.created', category: 'admin', desc: 'Admin user created' },
    { eventType: 'organization.created', category: 'admin', desc: 'Organization Acme Corporation created' },
    { eventType: 'organization.updated', category: 'admin', desc: 'Organization status updated' },
    { eventType: 'client.created', category: 'admin', desc: 'Confidential client created' },
    { eventType: 'role.assigned', category: 'admin', desc: 'Role porta-admin assigned to user' },
    { eventType: 'config.updated', category: 'admin', desc: 'System config session_ttl updated' },
    { eventType: 'signing_key.rotated', category: 'security', desc: 'Signing keys rotated' },
    { eventType: 'session.revoked', category: 'security', desc: 'Admin session revoked' },
    { eventType: 'user.password_reset', category: 'authentication', desc: 'Password reset initiated' },
    { eventType: 'organization.suspended', category: 'admin', desc: 'Organization suspended for policy' },
    { eventType: 'export.completed', category: 'admin', desc: 'Data export completed (CSV, 42 records)' },
  ];

  for (const entry of auditEntries) {
    await pool.query(
      `INSERT INTO audit_log (actor_id, organization_id, event_type, event_category, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        superAdminOrg.id,
        entry.eventType,
        entry.category,
        entry.desc,
        JSON.stringify({ seeded: true }),
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
    testApp: { id: testApp.id, name: testApp.name, slug: testApp.slug },
    archivedApp: { id: archivedApp.id, name: archivedApp.name, slug: archivedApp.slug },
    testClient: { id: testPublicClient.id, clientId: testPublicClient.clientId, name: 'Acme SPA Client' },
    testConfidentialClient: { id: testConfClient.id, clientId: testConfClient.clientId, name: 'Acme Backend Service' },
    testUsers: {
      active: { id: testActiveUser.user.id, email: testActiveUser.user.email, givenName: 'Jane', familyName: 'Doe' },
      suspended: { id: testSuspendedUser.user.id, email: testSuspendedUser.user.email },
    },
    testRoles: {
      editor: { id: editorRole.id, name: editorRole.name, slug: editorRole.slug },
      viewer: { id: viewerRole.id, name: viewerRole.name, slug: viewerRole.slug },
    },
    testPermissions: {
      read: { id: readPerm.id, name: readPerm.name, slug: readPerm.slug },
      write: { id: writePerm.id, name: writePerm.name, slug: writePerm.slug },
      delete: { id: deletePerm.id, name: deletePerm.name, slug: deletePerm.slug },
    },
  };
}
