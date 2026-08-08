/**
 * User repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID/email, email uniqueness (CITEXT),
 * case insensitivity, update fields, password hash, list with search/status,
 * login tracking, status transitions, and cascade delete.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestUser,
  createTestUserWithPassword,
  buildUserInput,
} from '../helpers/factories.js';
import {
  insertUser,
  findUserById,
  findUserByEmail,
  getPasswordHash,
  updateUser,
  listUsers,
  updateLoginStats,
} from '../../../src/users/repository.js';
import { verifyPassword } from '../../../src/users/password.js';
import { getPool } from '../../../src/lib/database.js';

describe('User Repository (Integration)', () => {
  let orgId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    const org = await createTestOrganization();
    orgId = org.id;
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve a user by ID', async () => {
    const user = await createTestUser(orgId);

    const found = await findUserById(user.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.email).toBe(user.email);
    expect(found!.organizationId).toBe(orgId);
    expect(found!.status).toBe('active');
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  it('should insert and retrieve a user by email (org-scoped)', async () => {
    const user = await createTestUser(orgId);

    const found = await findUserByEmail(orgId, user.email);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  // ── Email Uniqueness (CITEXT) ────────────────────────────────

  it('should enforce email uniqueness per org', async () => {
    await createTestUser(orgId, { email: 'duplicate@test.com' });

    await expect(
      insertUser(buildUserInput(orgId, { email: 'duplicate@test.com' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('should allow same email in different orgs', async () => {
    await createTestUser(orgId, { email: 'shared@test.com' });

    const otherOrg = await createTestOrganization();
    // Same email in a different org should succeed
    const user2 = await createTestUser(otherOrg.id, { email: 'shared@test.com' });
    expect(user2.email).toBe('shared@test.com');
  });

  it('should treat emails case-insensitively (CITEXT)', async () => {
    await createTestUser(orgId, { email: 'User@Test.com' });

    // Lookup with different case should find the same user
    const found = await findUserByEmail(orgId, 'user@test.com');
    expect(found).not.toBeNull();

    // Inserting with different case should fail (CITEXT uniqueness)
    await expect(
      insertUser(buildUserInput(orgId, { email: 'USER@TEST.COM' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // ── Update ───────────────────────────────────────────────────

  it('should update user fields', async () => {
    const user = await createTestUser(orgId);

    const updated = await updateUser(user.id, {
      givenName: 'Updated',
      familyName: 'Name',
      emailVerified: true,
    });

    expect(updated.givenName).toBe('Updated');
    expect(updated.familyName).toBe('Name');
    expect(updated.emailVerified).toBe(true);
    expect(updated.email).toBe(user.email);
  });

  // ── Password Hash ────────────────────────────────────────────

  it('should store and retrieve password hash', async () => {
    const { user, password } = await createTestUserWithPassword(orgId);

    const hash = await getPasswordHash(user.id);
    expect(hash).not.toBeNull();

    // Verify the password matches
    const isValid = await verifyPassword(hash!, password);
    expect(isValid).toBe(true);
  });

  // ── List ─────────────────────────────────────────────────────

  it('should list users by org with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await createTestUser(orgId);
    }

    const page1 = await listUsers({
      organizationId: orgId,
      page: 1,
      pageSize: 3,
    });
    expect(page1.data).toHaveLength(3);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(2);
  });

  it('should list users with search', async () => {
    await createTestUser(orgId, { email: 'alice@example.com', givenName: 'Alice' });
    await createTestUser(orgId, { email: 'bob@example.com', givenName: 'Bob' });

    const result = await listUsers({
      organizationId: orgId,
      page: 1,
      pageSize: 50,
      search: 'alice',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].givenName).toBe('Alice');
  });

  it('should list users filtered by status', async () => {
    const user = await createTestUser(orgId);
    await updateUser(user.id, { status: 'suspended' });

    const result = await listUsers({
      organizationId: orgId,
      page: 1,
      pageSize: 50,
      status: 'suspended',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(user.id);
  });

  // ── Login Tracking ───────────────────────────────────────────

  it('should track login timestamps and count', async () => {
    const user = await createTestUser(orgId);

    // Initial state — no logins
    const initial = await findUserById(user.id);
    expect(initial!.lastLoginAt).toBeNull();
    expect(initial!.loginCount).toBe(0);

    // Record a login
    await updateLoginStats(user.id);

    const afterLogin = await findUserById(user.id);
    expect(afterLogin!.lastLoginAt).toBeInstanceOf(Date);
    expect(afterLogin!.loginCount).toBe(1);

    // Record another login
    await updateLoginStats(user.id);
    const afterSecond = await findUserById(user.id);
    expect(afterSecond!.loginCount).toBe(2);
  });

  // ── Status Transitions ───────────────────────────────────────

  it('should support all valid status transitions', async () => {
    const user = await createTestUser(orgId);

    // active → suspended
    const suspended = await updateUser(user.id, { status: 'suspended' });
    expect(suspended.status).toBe('suspended');

    // suspended → active
    const reactivated = await updateUser(user.id, { status: 'active' });
    expect(reactivated.status).toBe('active');

    // active → locked
    const locked = await updateUser(user.id, { status: 'locked' });
    expect(locked.status).toBe('locked');

    // locked → active
    const unlocked = await updateUser(user.id, { status: 'active' });
    expect(unlocked.status).toBe('active');

    // active → inactive
    const inactive = await updateUser(user.id, { status: 'inactive' });
    expect(inactive.status).toBe('inactive');
  });

  // ── Cascade Delete ───────────────────────────────────────────

  it('should cascade delete users when org is deleted', async () => {
    const user = await createTestUser(orgId);
    const pool = getPool();

    expect(await findUserById(user.id)).not.toBeNull();

    // Delete org — should cascade to users
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);

    expect(await findUserById(user.id)).toBeNull();
  });
});
