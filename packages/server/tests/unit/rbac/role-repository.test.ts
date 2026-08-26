/**
 * Unit tests for role repository.
 *
 * Tests all PostgreSQL CRUD operations for the roles table.
 * The database pool is mocked — these are pure unit tests that
 * verify correct SQL generation and row mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing the repository
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertRole,
  findRoleById,
  findRoleBySlug,
  updateRole,
  deleteRole,
  listRolesByApplication,
  roleSlugExists,
  countUsersWithRole,
} from '../../../src/rbac/role-repository.js';
import type { RoleRow } from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock pool with a query function returning given rows */
function mockPool(rows: Record<string, unknown>[] = [], rowCount?: number) {
  const mockQuery = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard test role row (snake_case, as from DB) */
function createTestRoleRow(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 'role-uuid-1',
    application_id: 'app-uuid-1',
    name: 'CRM Editor',
    slug: 'crm-editor',
    description: 'Can edit CRM records',
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('insertRole', () => {
  it('should insert a role with all fields and return mapped result', async () => {
    const row = createTestRoleRow();
    const mockQuery = mockPool([row]);

    const result = await insertRole({
      applicationId: 'app-uuid-1',
      name: 'CRM Editor',
      slug: 'crm-editor',
      description: 'Can edit CRM records',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO roles');
    expect(sql).toContain('RETURNING *');
    expect(params).toEqual(['app-uuid-1', 'CRM Editor', 'crm-editor', 'Can edit CRM records']);

    // Verify mapping from snake_case to camelCase
    expect(result).toEqual({
      id: 'role-uuid-1',
      applicationId: 'app-uuid-1',
      name: 'CRM Editor',
      slug: 'crm-editor',
      description: 'Can edit CRM records',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    });
  });

  it('should insert with null slug and description when not provided', async () => {
    const row = createTestRoleRow({ slug: 'auto-slug', description: null });
    const mockQuery = mockPool([row]);

    await insertRole({
      applicationId: 'app-uuid-1',
      name: 'Auto Role',
    });

    const [, params] = mockQuery.mock.calls[0];
    // slug and description should be null when not provided
    expect(params).toEqual(['app-uuid-1', 'Auto Role', null, null]);
  });
});

describe('findRoleById', () => {
  it('should return a role when found', async () => {
    const row = createTestRoleRow();
    mockPool([row]);

    const result = await findRoleById('role-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('role-uuid-1');
    expect(result!.applicationId).toBe('app-uuid-1');
  });

  it('should return null when not found', async () => {
    mockPool([]);

    const result = await findRoleById('non-existent');

    expect(result).toBeNull();
  });

  it('should query with the correct ID parameter', async () => {
    const mockQuery = mockPool([]);

    await findRoleById('test-id');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM roles WHERE id = $1',
      ['test-id'],
    );
  });
});

describe('findRoleBySlug', () => {
  it('should return a role when found by application ID and slug', async () => {
    const row = createTestRoleRow();
    mockPool([row]);

    const result = await findRoleBySlug('app-uuid-1', 'crm-editor');

    expect(result).not.toBeNull();
    expect(result!.slug).toBe('crm-editor');
  });

  it('should return null when not found', async () => {
    mockPool([]);

    const result = await findRoleBySlug('app-uuid-1', 'non-existent');

    expect(result).toBeNull();
  });

  it('should query with application_id AND slug', async () => {
    const mockQuery = mockPool([]);

    await findRoleBySlug('app-1', 'my-role');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM roles WHERE application_id = $1 AND slug = $2',
      ['app-1', 'my-role'],
    );
  });
});

describe('updateRole', () => {
  it('should update only provided fields (partial update)', async () => {
    const row = createTestRoleRow({ name: 'Updated Name' });
    const mockQuery = mockPool([row]);

    const result = await updateRole('role-uuid-1', { name: 'Updated Name' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE roles SET name = $2');
    expect(sql).toContain('WHERE id = $1');
    expect(sql).toContain('RETURNING *');
    expect(params).toEqual(['role-uuid-1', 'Updated Name']);
    expect(result.name).toBe('Updated Name');
  });

  it('should update multiple fields at once', async () => {
    const row = createTestRoleRow({ name: 'New', slug: 'new-slug', description: 'New desc' });
    const mockQuery = mockPool([row]);

    await updateRole('role-uuid-1', {
      name: 'New',
      slug: 'new-slug',
      description: 'New desc',
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('name = $2');
    expect(sql).toContain('slug = $3');
    expect(sql).toContain('description = $4');
    expect(params).toEqual(['role-uuid-1', 'New', 'new-slug', 'New desc']);
  });

  it('should allow setting description to null (clear it)', async () => {
    const row = createTestRoleRow({ description: null });
    const mockQuery = mockPool([row]);

    await updateRole('role-uuid-1', { description: null });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('description = $2');
    expect(params).toEqual(['role-uuid-1', null]);
  });

  it('should throw when no fields are provided', async () => {
    mockPool([]);

    await expect(updateRole('role-uuid-1', {})).rejects.toThrow('No fields to update');
  });

  it('should throw when role is not found', async () => {
    mockPool([]); // Empty result = not found

    await expect(updateRole('non-existent', { name: 'X' })).rejects.toThrow('Role not found');
  });
});

describe('deleteRole', () => {
  it('should return true when a role is deleted', async () => {
    mockPool([], 1);

    const result = await deleteRole('role-uuid-1');

    expect(result).toBe(true);
  });

  it('should return false when role does not exist', async () => {
    mockPool([], 0);

    const result = await deleteRole('non-existent');

    expect(result).toBe(false);
  });

  it('should execute DELETE with the correct ID', async () => {
    const mockQuery = mockPool([], 1);

    await deleteRole('test-id');

    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM roles WHERE id = $1',
      ['test-id'],
    );
  });
});

describe('listRolesByApplication', () => {
  it('should return all roles for an application ordered by name', async () => {
    const rows = [
      createTestRoleRow({ name: 'Admin', slug: 'admin' }),
      createTestRoleRow({ id: 'role-uuid-2', name: 'Editor', slug: 'editor' }),
    ];
    mockPool(rows);

    const result = await listRolesByApplication('app-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Admin');
    expect(result[1].name).toBe('Editor');
  });

  it('should return empty array when no roles exist', async () => {
    mockPool([]);

    const result = await listRolesByApplication('app-uuid-1');

    expect(result).toEqual([]);
  });

  it('should query with ORDER BY name ASC', async () => {
    const mockQuery = mockPool([]);

    await listRolesByApplication('app-1');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM roles WHERE application_id = $1 ORDER BY name ASC',
      ['app-1'],
    );
  });
});

describe('roleSlugExists', () => {
  it('should return true when slug exists', async () => {
    mockPool([{ exists: true }]);

    const result = await roleSlugExists('app-uuid-1', 'crm-editor');

    expect(result).toBe(true);
  });

  it('should return false when slug does not exist', async () => {
    mockPool([{ exists: false }]);

    const result = await roleSlugExists('app-uuid-1', 'non-existent');

    expect(result).toBe(false);
  });

  it('should exclude a specific role ID when provided', async () => {
    const mockQuery = mockPool([{ exists: false }]);

    await roleSlugExists('app-1', 'my-slug', 'exclude-id');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('AND id != $3');
    expect(params).toEqual(['app-1', 'my-slug', 'exclude-id']);
  });

  it('should not use excludeId clause when not provided', async () => {
    const mockQuery = mockPool([{ exists: false }]);

    await roleSlugExists('app-1', 'my-slug');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('id !=');
    expect(params).toEqual(['app-1', 'my-slug']);
  });
});

describe('countUsersWithRole', () => {
  it('should return the user count', async () => {
    mockPool([{ count: '5' }]);

    const result = await countUsersWithRole('role-uuid-1');

    expect(result).toBe(5);
  });

  it('should return 0 when no users have the role', async () => {
    mockPool([{ count: '0' }]);

    const result = await countUsersWithRole('role-uuid-1');

    expect(result).toBe(0);
  });

  it('should query the user_roles table', async () => {
    const mockQuery = mockPool([{ count: '0' }]);

    await countUsersWithRole('test-role');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*)::int as count FROM user_roles WHERE role_id = $1',
      ['test-role'],
    );
  });
});
