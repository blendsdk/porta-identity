import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertUser,
  findUserById,
  findUserByEmail,
  getPasswordHash,
  updateUser,
  listUsers,
  emailExists,
  updateLoginStats,
  countByOrganization,
} from '../../../src/users/repository.js';
import type { UserRow } from '../../../src/users/types.js';

/** Helper to create a mock pool with a query function returning given rows */
function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard test user row (snake_case, as from DB) */
function createTestRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-uuid-1',
    organization_id: 'org-uuid-1',
    email: 'john@example.com',
    email_verified: false,
    password_hash: '$argon2id$hash',
    password_changed_at: null,
    given_name: 'John',
    family_name: 'Doe',
    middle_name: null,
    nickname: null,
    preferred_username: null,
    profile_url: null,
    picture_url: null,
    website_url: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: null,
    phone_number: null,
    phone_number_verified: false,
    address_street: null,
    address_locality: null,
    address_region: null,
    address_postal_code: null,
    address_country: null,
    status: 'active',
    locked_at: null,
    locked_reason: null,
    last_login_at: null,
    login_count: 0,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('user repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // insertUser
  // -------------------------------------------------------------------------

  describe('insertUser', () => {
    it('should execute INSERT with all fields and return mapped User', async () => {
      const row = createTestRow();
      const mockQuery = mockPool([row]);

      const user = await insertUser({
        organizationId: 'org-uuid-1',
        email: 'john@example.com',
        passwordHash: '$argon2id$hash',
        givenName: 'John',
        familyName: 'Doe',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO users');
      expect(sql).toContain('RETURNING *');
      expect(user.id).toBe('user-uuid-1');
      expect(user.email).toBe('john@example.com');
      expect(user.hasPassword).toBe(true);
    });

    it('should insert user with minimal fields (email only)', async () => {
      const row = createTestRow({ password_hash: null });
      const mockQuery = mockPool([row]);

      const user = await insertUser({
        organizationId: 'org-uuid-1',
        email: 'john@example.com',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('org-uuid-1');
      expect(params[1]).toBe('john@example.com');
      expect(params[2]).toBeNull(); // passwordHash defaults to null
      expect(user.hasPassword).toBe(false);
    });

    it('should insert user with password hash', async () => {
      const row = createTestRow();
      const mockQuery = mockPool([row]);

      await insertUser({
        organizationId: 'org-uuid-1',
        email: 'john@example.com',
        passwordHash: '$argon2id$hash',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('$argon2id$hash');
    });
  });

  // -------------------------------------------------------------------------
  // findUserById
  // -------------------------------------------------------------------------

  describe('findUserById', () => {
    it('should return user when found', async () => {
      const row = createTestRow();
      mockPool([row]);

      const user = await findUserById('user-uuid-1');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('user-uuid-1');
      expect(user!.organizationId).toBe('org-uuid-1');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const user = await findUserById('nonexistent');

      expect(user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findUserByEmail
  // -------------------------------------------------------------------------

  describe('findUserByEmail', () => {
    it('should return user when found', async () => {
      const row = createTestRow();
      const mockQuery = mockPool([row]);

      const user = await findUserByEmail('org-uuid-1', 'john@example.com');

      expect(user).not.toBeNull();
      expect(user!.email).toBe('john@example.com');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('org-uuid-1');
      expect(params[1]).toBe('john@example.com');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const user = await findUserByEmail('org-uuid-1', 'missing@example.com');

      expect(user).toBeNull();
    });

    it('should scope to organization', async () => {
      const mockQuery = mockPool([]);

      await findUserByEmail('org-uuid-1', 'john@example.com');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('organization_id = $1');
    });
  });

  // -------------------------------------------------------------------------
  // getPasswordHash
  // -------------------------------------------------------------------------

  describe('getPasswordHash', () => {
    it('should return hash for active user', async () => {
      mockPool([{ password_hash: '$argon2id$hash' }]);

      const hash = await getPasswordHash('user-uuid-1');

      expect(hash).toBe('$argon2id$hash');
    });

    it('should return null for inactive user', async () => {
      mockPool([]); // Query filters by status = 'active', so no rows returned

      const hash = await getPasswordHash('user-uuid-1');

      expect(hash).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      mockPool([]);

      const hash = await getPasswordHash('nonexistent');

      expect(hash).toBeNull();
    });

    it('should return null when user has no password', async () => {
      mockPool([{ password_hash: null }]);

      const hash = await getPasswordHash('user-uuid-1');

      expect(hash).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateUser
  // -------------------------------------------------------------------------

  describe('updateUser', () => {
    it('should update specified fields only', async () => {
      const row = createTestRow({ given_name: 'Jane' });
      const mockQuery = mockPool([row]);

      await updateUser('user-uuid-1', { givenName: 'Jane' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE users SET');
      expect(sql).toContain('given_name = $2');
      expect(sql).toContain('WHERE id = $1');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('user-uuid-1');
      expect(params[1]).toBe('Jane');
    });

    it('should throw when no fields provided', async () => {
      mockPool([]);

      await expect(
        updateUser('user-uuid-1', {}),
      ).rejects.toThrow('No fields to update');
    });

    it('should throw when user not found', async () => {
      mockPool([]); // No rows returned from UPDATE

      await expect(
        updateUser('nonexistent', { givenName: 'Test' }),
      ).rejects.toThrow('User not found');
    });
  });

  // -------------------------------------------------------------------------
  // listUsers
  // -------------------------------------------------------------------------

  describe('listUsers', () => {
    it('should return paginated results', async () => {
      const row = createTestRow();
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      const result = await listUsers({ organizationId: 'org-uuid-1', page: 1, pageSize: 10 });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('john@example.com');
    });

    it('should filter by status', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listUsers({ organizationId: 'org-uuid-1', page: 1, pageSize: 10, status: 'active' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('status = $2');
    });

    it('should filter by search term', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listUsers({ organizationId: 'org-uuid-1', page: 1, pageSize: 10, search: 'john' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('%john%');
    });

    it('should sort by specified column', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listUsers({
        organizationId: 'org-uuid-1',
        page: 1,
        pageSize: 10,
        sortBy: 'email',
        sortOrder: 'asc',
      });

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('ORDER BY email ASC');
    });

    it('should scope to organization', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listUsers({ organizationId: 'org-uuid-1', page: 1, pageSize: 10 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('organization_id = $1');
    });
  });

  // -------------------------------------------------------------------------
  // emailExists
  // -------------------------------------------------------------------------

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockPool([{ exists: true }]);

      const exists = await emailExists('org-uuid-1', 'john@example.com');

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      mockPool([{ exists: false }]);

      const exists = await emailExists('org-uuid-1', 'missing@example.com');

      expect(exists).toBe(false);
    });

    it('should exclude specified user ID', async () => {
      const mockQuery = mockPool([{ exists: false }]);

      await emailExists('org-uuid-1', 'john@example.com', 'user-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('id != $3');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('user-uuid-1');
    });
  });

  // -------------------------------------------------------------------------
  // updateLoginStats
  // -------------------------------------------------------------------------

  describe('updateLoginStats', () => {
    it('should increment login_count and set last_login_at', async () => {
      const mockQuery = mockPool([]);

      await updateLoginStats('user-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('login_count = login_count + 1');
      expect(sql).toContain('last_login_at = NOW()');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('user-uuid-1');
    });
  });

  // -------------------------------------------------------------------------
  // countByOrganization
  // -------------------------------------------------------------------------

  describe('countByOrganization', () => {
    it('should return count of users in org', async () => {
      mockPool([{ count: '42' }]);

      const count = await countByOrganization('org-uuid-1');

      expect(count).toBe(42);
    });
  });
});
