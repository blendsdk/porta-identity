/**
 * Unit tests for permission repository.
 *
 * Tests all PostgreSQL CRUD operations for the permissions table.
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
  insertPermission,
  findPermissionById,
  findPermissionBySlug,
  updatePermission,
  deletePermission,
  listPermissionsByApplication,
  permissionSlugExists,
  countRolesWithPermission,
} from '../../../src/rbac/permission-repository.js';
import type { PermissionRow } from '../../../src/rbac/types.js';

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

/** Standard test permission row (snake_case, as from DB) */
function createTestPermissionRow(overrides: Partial<PermissionRow> = {}): PermissionRow {
  return {
    id: 'perm-uuid-1',
    application_id: 'app-uuid-1',
    module_id: 'mod-uuid-1',
    name: 'Read Contacts',
    slug: 'crm:contacts:read',
    description: 'View contact records',
    created_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('insertPermission', () => {
  it('should insert a permission with all fields and return mapped result', async () => {
    const row = createTestPermissionRow();
    const mockQuery = mockPool([row]);

    const result = await insertPermission({
      applicationId: 'app-uuid-1',
      moduleId: 'mod-uuid-1',
      name: 'Read Contacts',
      slug: 'crm:contacts:read',
      description: 'View contact records',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO permissions');
    expect(sql).toContain('RETURNING *');
    expect(params).toEqual([
      'app-uuid-1', 'mod-uuid-1', 'Read Contacts',
      'crm:contacts:read', 'View contact records',
    ]);

    // Verify mapping from snake_case to camelCase
    expect(result).toEqual({
      id: 'perm-uuid-1',
      applicationId: 'app-uuid-1',
      moduleId: 'mod-uuid-1',
      name: 'Read Contacts',
      slug: 'crm:contacts:read',
      description: 'View contact records',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
  });

  it('should insert with null moduleId and description when not provided', async () => {
    const row = createTestPermissionRow({ module_id: null, description: null });
    const mockQuery = mockPool([row]);

    await insertPermission({
      applicationId: 'app-uuid-1',
      name: 'Write Contacts',
      slug: 'crm:contacts:write',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([
      'app-uuid-1', null, 'Write Contacts',
      'crm:contacts:write', null,
    ]);
  });
});

describe('findPermissionById', () => {
  it('should return a permission when found', async () => {
    const row = createTestPermissionRow();
    mockPool([row]);

    const result = await findPermissionById('perm-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('perm-uuid-1');
    expect(result!.applicationId).toBe('app-uuid-1');
    expect(result!.moduleId).toBe('mod-uuid-1');
  });

  it('should return null when not found', async () => {
    mockPool([]);

    const result = await findPermissionById('non-existent');

    expect(result).toBeNull();
  });

  it('should query with the correct ID parameter', async () => {
    const mockQuery = mockPool([]);

    await findPermissionById('test-id');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM permissions WHERE id = $1',
      ['test-id'],
    );
  });
});

describe('findPermissionBySlug', () => {
  it('should return a permission when found by application ID and slug', async () => {
    const row = createTestPermissionRow();
    mockPool([row]);

    const result = await findPermissionBySlug('app-uuid-1', 'crm:contacts:read');

    expect(result).not.toBeNull();
    expect(result!.slug).toBe('crm:contacts:read');
  });

  it('should return null when not found', async () => {
    mockPool([]);

    const result = await findPermissionBySlug('app-uuid-1', 'non:existent:perm');

    expect(result).toBeNull();
  });

  it('should query with application_id AND slug', async () => {
    const mockQuery = mockPool([]);

    await findPermissionBySlug('app-1', 'crm:contacts:read');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM permissions WHERE application_id = $1 AND slug = $2',
      ['app-1', 'crm:contacts:read'],
    );
  });
});

describe('updatePermission', () => {
  it('should update only name when provided', async () => {
    const row = createTestPermissionRow({ name: 'Updated Name' });
    const mockQuery = mockPool([row]);

    const result = await updatePermission('perm-uuid-1', { name: 'Updated Name' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE permissions SET name = $2');
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual(['perm-uuid-1', 'Updated Name']);
    expect(result.name).toBe('Updated Name');
  });

  it('should update only description when provided', async () => {
    const row = createTestPermissionRow({ description: 'New desc' });
    const mockQuery = mockPool([row]);

    await updatePermission('perm-uuid-1', { description: 'New desc' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('description = $2');
    expect(params).toEqual(['perm-uuid-1', 'New desc']);
  });

  it('should update both name and description', async () => {
    const row = createTestPermissionRow({ name: 'New', description: 'New desc' });
    const mockQuery = mockPool([row]);

    await updatePermission('perm-uuid-1', { name: 'New', description: 'New desc' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('name = $2');
    expect(sql).toContain('description = $3');
    expect(params).toEqual(['perm-uuid-1', 'New', 'New desc']);
  });

  it('should allow setting description to null (clear it)', async () => {
    const row = createTestPermissionRow({ description: null });
    const mockQuery = mockPool([row]);

    await updatePermission('perm-uuid-1', { description: null });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('description = $2');
    expect(params).toEqual(['perm-uuid-1', null]);
  });

  it('should throw when no fields are provided', async () => {
    mockPool([]);

    await expect(updatePermission('perm-uuid-1', {})).rejects.toThrow('No fields to update');
  });

  it('should throw when permission is not found', async () => {
    mockPool([]);

    await expect(updatePermission('non-existent', { name: 'X' }))
      .rejects.toThrow('Permission not found');
  });
});

describe('deletePermission', () => {
  it('should return true when a permission is deleted', async () => {
    mockPool([], 1);

    const result = await deletePermission('perm-uuid-1');

    expect(result).toBe(true);
  });

  it('should return false when permission does not exist', async () => {
    mockPool([], 0);

    const result = await deletePermission('non-existent');

    expect(result).toBe(false);
  });

  it('should execute DELETE with the correct ID', async () => {
    const mockQuery = mockPool([], 1);

    await deletePermission('test-id');

    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM permissions WHERE id = $1',
      ['test-id'],
    );
  });
});

describe('listPermissionsByApplication', () => {
  it('should return all permissions for an application ordered by slug', async () => {
    const rows = [
      createTestPermissionRow({ slug: 'crm:contacts:read' }),
      createTestPermissionRow({ id: 'perm-uuid-2', slug: 'crm:deals:write' }),
    ];
    mockPool(rows);

    const result = await listPermissionsByApplication('app-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('crm:contacts:read');
    expect(result[1].slug).toBe('crm:deals:write');
  });

  it('should return empty array when no permissions exist', async () => {
    mockPool([]);

    const result = await listPermissionsByApplication('app-uuid-1');

    expect(result).toEqual([]);
  });

  it('should filter by moduleId when provided', async () => {
    const row = createTestPermissionRow();
    const mockQuery = mockPool([row]);

    await listPermissionsByApplication('app-1', 'mod-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('AND module_id = $2');
    expect(params).toEqual(['app-1', 'mod-1']);
  });

  it('should not filter by module when moduleId is not provided', async () => {
    const mockQuery = mockPool([]);

    await listPermissionsByApplication('app-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('module_id');
    expect(params).toEqual(['app-1']);
  });
});

describe('permissionSlugExists', () => {
  it('should return true when slug exists', async () => {
    mockPool([{ exists: true }]);

    const result = await permissionSlugExists('app-uuid-1', 'crm:contacts:read');

    expect(result).toBe(true);
  });

  it('should return false when slug does not exist', async () => {
    mockPool([{ exists: false }]);

    const result = await permissionSlugExists('app-uuid-1', 'non:existent:perm');

    expect(result).toBe(false);
  });

  it('should query with application_id and slug', async () => {
    const mockQuery = mockPool([{ exists: false }]);

    await permissionSlugExists('app-1', 'crm:contacts:read');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('application_id = $1 AND slug = $2');
    expect(params).toEqual(['app-1', 'crm:contacts:read']);
  });
});

describe('countRolesWithPermission', () => {
  it('should return the role count', async () => {
    mockPool([{ count: '3' }]);

    const result = await countRolesWithPermission('perm-uuid-1');

    expect(result).toBe(3);
  });

  it('should return 0 when no roles have the permission', async () => {
    mockPool([{ count: '0' }]);

    const result = await countRolesWithPermission('perm-uuid-1');

    expect(result).toBe(0);
  });

  it('should query the role_permissions table', async () => {
    const mockQuery = mockPool([{ count: '0' }]);

    await countRolesWithPermission('test-perm');

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*)::int as count FROM role_permissions WHERE permission_id = $1',
      ['test-perm'],
    );
  });
});
