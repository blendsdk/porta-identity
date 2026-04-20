/**
 * Integration tests for the init command's database operations.
 *
 * Verifies the full bootstrap flow against a real PostgreSQL database
 * and Redis instance. Tests invoke the same service/repository functions
 * that `porta init` uses, in the same order, to confirm that:
 *   - All admin entities can be created with correct relationships
 *   - The safety guard detects existing initialization
 *   - Entities survive cache flush (data is in the DB, not just cache)
 *
 * The CLI wrappers (withBootstrap, withErrorHandling, prompts) are
 * already covered by 8 unit tests in tests/unit/cli/commands/init.test.ts.
 * This integration test focuses on the DB layer.
 *
 * Requires Docker services running: `yarn docker:up`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';

// Repository-level imports for direct DB operations
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import {
  findApplicationBySlug,
} from '../../../src/applications/repository.js';
import {
  createApplication,
  getApplicationBySlug,
} from '../../../src/applications/index.js';
import {
  createPermission,
  listPermissionsByApplication,
} from '../../../src/rbac/index.js';
import {
  createRole,
  assignPermissionsToRole,
  assignRolesToUser,
  getUserRoles,
} from '../../../src/rbac/index.js';
import {
  getPermissionsForRole,
} from '../../../src/rbac/mapping-repository.js';
import {
  createClient,
} from '../../../src/clients/index.js';
import {
  createUser,
  reactivateUser,
  markEmailVerified,
} from '../../../src/users/index.js';
import { findUserByEmail } from '../../../src/users/repository.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { getPool } from '../../../src/lib/database.js';

// ---------------------------------------------------------------------------
// Constants — mirror the init command's entity definitions
// ---------------------------------------------------------------------------

const ADMIN_PERMISSION_SLUGS = [
  'admin:organizations:manage',
  'admin:applications:manage',
  'admin:clients:manage',
  'admin:users:manage',
  'admin:roles:manage',
  'admin:permissions:manage',
  'admin:claims:manage',
  'admin:system:manage',
];

const ADMIN_PERMISSION_DEFS = ADMIN_PERMISSION_SLUGS.map((slug) => ({
  slug,
  name: slug
    .replace('admin:', '')
    .replace(':manage', '')
    .replace(/^\w/, (c) => c.toUpperCase()) +
    ' Management',
  description: `Manage ${slug.split(':')[1]}`,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Init Flow (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Full initialization ──────────────────────────────────────

  describe('full initialization on clean database', () => {
    it('should create all admin entities with correct relationships', async () => {
      // Step 1: Verify super-admin org exists (from seed)
      const superAdminOrg = await findSuperAdminOrganization();
      expect(superAdminOrg).not.toBeNull();
      expect(superAdminOrg!.isSuperAdmin).toBe(true);

      // Step 2: Ensure signing keys
      await ensureSigningKeys();

      // Step 3: Create application
      const adminApp = await createApplication({
        name: 'Porta Admin',
        slug: 'porta-admin',
        description: 'Porta administration application',
      });
      expect(adminApp).not.toBeNull();
      expect(adminApp.slug).toBe('porta-admin');

      // Step 4: Create 8 permissions
      const permissionIds: string[] = [];
      for (const def of ADMIN_PERMISSION_DEFS) {
        const perm = await createPermission({
          applicationId: adminApp.id,
          name: def.name,
          slug: def.slug,
          description: def.description,
        });
        permissionIds.push(perm.id);
      }

      // Verify permissions exist in DB
      const perms = await listPermissionsByApplication(adminApp.id);
      expect(perms).toHaveLength(8);
      const permSlugs = perms.map((p) => p.slug).sort();
      expect(permSlugs).toEqual([...ADMIN_PERMISSION_SLUGS].sort());

      // Step 5: Create role
      const adminRole = await createRole({
        applicationId: adminApp.id,
        name: 'Porta Administrator',
        slug: 'porta-admin',
        description: 'Full administrative access to Porta',
      });
      expect(adminRole.slug).toBe('porta-admin');

      // Step 6: Assign all permissions to role
      await assignPermissionsToRole(adminRole.id, permissionIds);
      const rolePerms = await getPermissionsForRole(adminRole.id);
      expect(rolePerms).toHaveLength(8);

      // Step 7: Create public PKCE client
      const { client: adminClient } = await createClient({
        organizationId: superAdminOrg!.id,
        applicationId: adminApp.id,
        clientName: 'Porta Admin CLI',
        clientType: 'public',
        applicationType: 'native',
        redirectUris: [
          'http://127.0.0.1/callback',
          'http://localhost/callback',
        ],
        postLogoutRedirectUris: [],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email offline_access',
        requirePkce: true,
      });
      expect(adminClient.clientName).toBe('Porta Admin CLI');

      // Verify client in DB
      const pool = getPool();
      const clientResult = await pool.query(
        'SELECT * FROM clients WHERE application_id = $1',
        [adminApp.id],
      );
      expect(clientResult.rows).toHaveLength(1);
      expect(clientResult.rows[0].client_type).toBe('public');
      expect(clientResult.rows[0].require_pkce).toBe(true);

      // Step 8: Create admin user
      const adminUser = await createUser({
        organizationId: superAdminOrg!.id,
        email: 'admin@test.example.com',
        givenName: 'Test',
        familyName: 'Admin',
        password: 'SecurePassword123!',
      });

      // Step 9: Activate user (if not already active) and verify email.
      // The service may create users as 'active' when a password is provided.
      if (adminUser.status !== 'active') {
        await reactivateUser(adminUser.id);
      }
      await markEmailVerified(adminUser.id);

      // Verify user state in DB
      const verifiedUser = await findUserByEmail(
        superAdminOrg!.id,
        'admin@test.example.com',
      );
      expect(verifiedUser).not.toBeNull();
      expect(verifiedUser!.status).toBe('active');
      expect(verifiedUser!.emailVerified).toBe(true);

      // Step 10: Assign admin role to user
      await assignRolesToUser(adminUser.id, [adminRole.id]);
      const userRoles = await getUserRoles(adminUser.id);
      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].slug).toBe('porta-admin');
    });
  });

  // ── Safety guard ─────────────────────────────────────────────

  describe('safety guard — already initialized', () => {
    it('should detect existing admin app via slug lookup', async () => {
      // Simulate first init: create the admin app
      await createApplication({
        name: 'Porta Admin',
        slug: 'porta-admin',
        description: 'Porta administration application',
      });

      // Verify the safety check would detect it
      const existingApp = await getApplicationBySlug('porta-admin');
      expect(existingApp).not.toBeNull();
      expect(existingApp!.slug).toBe('porta-admin');

      // Also verify via direct DB query (bypasses cache)
      const dbApp = await findApplicationBySlug('porta-admin');
      expect(dbApp).not.toBeNull();
    });
  });

  // ── Cache vs DB ──────────────────────────────────────────────

  describe('entity persistence after cache flush', () => {
    it('should retrieve all entities from DB after Redis flush', async () => {
      const superAdminOrg = await findSuperAdminOrganization();
      expect(superAdminOrg).not.toBeNull();

      // Create all entities
      await ensureSigningKeys();
      const app = await createApplication({
        name: 'Porta Admin',
        slug: 'porta-admin',
        description: 'Admin app',
      });
      const perm = await createPermission({
        applicationId: app.id,
        name: 'Test Permission',
        slug: 'admin:test:manage',
        description: 'Test',
      });
      const role = await createRole({
        applicationId: app.id,
        name: 'Test Role',
        slug: 'test-admin',
        description: 'Test',
      });
      await assignPermissionsToRole(role.id, [perm.id]);

      // Flush Redis — all cache entries are gone
      await flushTestRedis();

      // Verify entities are still retrievable from DB
      const appFromDb = await findApplicationBySlug('porta-admin');
      expect(appFromDb).not.toBeNull();
      expect(appFromDb!.name).toBe('Porta Admin');

      const permsFromDb = await listPermissionsByApplication(app.id);
      expect(permsFromDb).toHaveLength(1);
      expect(permsFromDb[0].slug).toBe('admin:test:manage');

      const rolePerms = await getPermissionsForRole(role.id);
      expect(rolePerms).toHaveLength(1);
    });
  });
});
