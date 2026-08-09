/**
 * Role repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID, slug uniqueness per app,
 * list by app, role-permission mapping, user-role assignment,
 * list user roles, and cascade delete.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestUser,
  createTestRole,
  createTestPermission,
  buildRoleInput,
} from '../helpers/factories.js';
import {
  insertRole,
  findRoleById,
  listRolesByApplication,
  roleSlugExists,
} from '../../../src/rbac/role-repository.js';
import {
  assignPermissionsToRole,
  removePermissionsFromRole,
  getPermissionsForRole,
  assignRolesToUser,
  removeRolesFromUser,
  getRolesForUser,
} from '../../../src/rbac/mapping-repository.js';
import { getPool } from '../../../src/lib/database.js';

describe('Role Repository (Integration)', () => {
  let appId: string;
  let orgId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    orgId = org.id;
    appId = app.id;
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve a role by ID', async () => {
    const role = await createTestRole(appId);

    const found = await findRoleById(role.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(role.id);
    expect(found!.name).toBe(role.name);
    expect(found!.slug).toBe(role.slug);
    expect(found!.applicationId).toBe(appId);
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  // ── Slug Uniqueness per App ──────────────────────────────────

  it('should reject duplicate role slugs within the same app', async () => {
    await createTestRole(appId, { slug: 'admin-role' });

    await expect(
      insertRole(buildRoleInput(appId, { slug: 'admin-role' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('should allow same slug in different apps', async () => {
    await createTestRole(appId, { slug: 'admin-role' });

    const otherApp = await createTestApplication();
    const role2 = await createTestRole(otherApp.id, { slug: 'admin-role' });
    expect(role2.slug).toBe('admin-role');
  });

  // ── List by App ──────────────────────────────────────────────

  it('should list roles by application', async () => {
    await createTestRole(appId);
    await createTestRole(appId);

    // Role in different app
    const otherApp = await createTestApplication();
    await createTestRole(otherApp.id);

    const roles = await listRolesByApplication(appId);
    expect(roles).toHaveLength(2);
    expect(roles.every((r) => r.applicationId === appId)).toBe(true);
  });

  // ── Role-Permission Mapping ──────────────────────────────────

  it('should assign and remove permissions from a role', async () => {
    const role = await createTestRole(appId);
    const perm = await createTestPermission(appId);

    // Assign permission to role
    await assignPermissionsToRole(role.id, [perm.id]);

    // List permissions for role
    const perms = await getPermissionsForRole(role.id);
    expect(perms).toHaveLength(1);
    expect(perms[0].id).toBe(perm.id);

    // Remove permission from role
    await removePermissionsFromRole(role.id, [perm.id]);
    const afterRemove = await getPermissionsForRole(role.id);
    expect(afterRemove).toHaveLength(0);
  });

  // ── User-Role Assignment ─────────────────────────────────────

  it('should assign and remove roles from a user', async () => {
    const role = await createTestRole(appId);
    const user = await createTestUser(orgId);

    // Assign role to user
    await assignRolesToUser(user.id, [role.id]);

    // List roles for user
    const roles = await getRolesForUser(user.id);
    expect(roles).toHaveLength(1);
    expect(roles[0].id).toBe(role.id);

    // Remove role from user
    await removeRolesFromUser(user.id, [role.id]);
    const afterRemove = await getRolesForUser(user.id);
    expect(afterRemove).toHaveLength(0);
  });

  // ── Cascade Delete ───────────────────────────────────────────

  it('should cascade delete role mappings when role is deleted', async () => {
    const role = await createTestRole(appId);
    const perm = await createTestPermission(appId);
    const user = await createTestUser(orgId);

    await assignPermissionsToRole(role.id, [perm.id]);
    await assignRolesToUser(user.id, [role.id]);

    // Delete the role — mappings should cascade
    const pool = getPool();
    await pool.query('DELETE FROM roles WHERE id = $1', [role.id]);

    // Permission should still exist (it's not deleted, just the mapping)
    const permsForRole = await getPermissionsForRole(role.id);
    expect(permsForRole).toHaveLength(0);

    const userRoles = await getRolesForUser(user.id);
    expect(userRoles).toHaveLength(0);
  });

  // ── slugExists ───────────────────────────────────────────────

  it('should check slug existence per application', async () => {
    const role = await createTestRole(appId, { slug: 'existing-role' });

    expect(await roleSlugExists(appId, 'existing-role')).toBe(true);
    expect(await roleSlugExists(appId, 'nonexistent-role')).toBe(false);
    // Exclude own ID for updates
    expect(await roleSlugExists(appId, 'existing-role', role.id)).toBe(false);
  });
});
