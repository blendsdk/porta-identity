/**
 * Permission repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID, slug uniqueness per app,
 * list by app, permission-in-use check, and cascade delete.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestApplication,
  createTestPermission,
  buildPermissionInput,
} from '../helpers/factories.js';
import {
  insertPermission,
  findPermissionById,
  listPermissionsByApplication,
} from '../../../src/rbac/permission-repository.js';
import { getPool } from '../../../src/lib/database.js';

describe('Permission Repository (Integration)', () => {
  let appId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    const app = await createTestApplication();
    appId = app.id;
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve a permission by ID', async () => {
    const perm = await createTestPermission(appId);

    const found = await findPermissionById(perm.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(perm.id);
    expect(found!.name).toBe(perm.name);
    expect(found!.slug).toBe(perm.slug);
    expect(found!.applicationId).toBe(appId);
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  // ── Slug Uniqueness per App ──────────────────────────────────

  it('should reject duplicate permission slugs within same app', async () => {
    await createTestPermission(appId, { slug: 'read-users' });

    await expect(
      insertPermission(buildPermissionInput(appId, { slug: 'read-users' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('should allow same slug in different apps', async () => {
    await createTestPermission(appId, { slug: 'read-users' });

    const otherApp = await createTestApplication();
    const perm2 = await createTestPermission(otherApp.id, { slug: 'read-users' });
    expect(perm2.slug).toBe('read-users');
  });

  // ── List by App ──────────────────────────────────────────────

  it('should list permissions by application', async () => {
    await createTestPermission(appId);
    await createTestPermission(appId);

    // Permission in different app
    const otherApp = await createTestApplication();
    await createTestPermission(otherApp.id);

    const perms = await listPermissionsByApplication(appId);
    expect(perms).toHaveLength(2);
    expect(perms.every((p) => p.applicationId === appId)).toBe(true);
  });

  // ── Cascade: delete app removes permissions ──────────────────

  it('should cascade delete permissions when app is deleted', async () => {
    const perm = await createTestPermission(appId);
    const pool = getPool();

    expect(await findPermissionById(perm.id)).not.toBeNull();

    // Delete app — should cascade to permissions
    await pool.query('DELETE FROM applications WHERE id = $1', [appId]);

    expect(await findPermissionById(perm.id)).toBeNull();
  });
});
