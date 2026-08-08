/**
 * Unit tests for mapping repository.
 *
 * Tests role-permission and user-role join table operations.
 * The database pool is mocked — these are pure unit tests that
 * verify correct SQL generation, bulk operations, and row mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing the repository
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  assignPermissionsToRole,
  removePermissionsFromRole,
  getPermissionsForRole,
  getRolesWithPermission,
  assignRolesToUser,
  removeRolesFromUser,
  getRolesForUser,
  getPermissionsForUser,
  getUsersWithRole,
} from '../../../src/rbac/mapping-repository.js';
import type { RoleRow, PermissionRow, UserRoleRow } from '../../../src/rbac/types.js';

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

/** Standard test role row */
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

/** Standard test permission row */
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

/** Standard test user-role row */
function createTestUserRoleRow(overrides: Partial<UserRoleRow> = {}): UserRoleRow {
  return {
    user_id: 'user-uuid-1',
    role_id: 'role-uuid-1',
    assigned_by: 'admin-uuid-1',
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

// ===========================================================================
// Role-Permission Mapping
// ===========================================================================

describe('assignPermissionsToRole', () => {
  it('should do nothing when permissionIds array is empty', async () => {
    const mockQuery = mockPool();

    await assignPermissionsToRole('role-1', []);

    // Should not call the pool at all
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should insert a single permission assignment', async () => {
    const mockQuery = mockPool();

    await assignPermissionsToRole('role-1', ['perm-1']);

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO role_permissions');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('($1, $2)');
    expect(params).toEqual(['role-1', 'perm-1']);
  });

  it('should insert multiple permission assignments (bulk)', async () => {
    const mockQuery = mockPool();

    await assignPermissionsToRole('role-1', ['perm-1', 'perm-2', 'perm-3']);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('($1, $2), ($1, $3), ($1, $4)');
    expect(params).toEqual(['role-1', 'perm-1', 'perm-2', 'perm-3']);
  });

  it('should use ON CONFLICT DO NOTHING for idempotent assignment', async () => {
    const mockQuery = mockPool();

    await assignPermissionsToRole('role-1', ['perm-1']);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});

describe('removePermissionsFromRole', () => {
  it('should do nothing when permissionIds array is empty', async () => {
    const mockQuery = mockPool();

    await removePermissionsFromRole('role-1', []);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should delete a single permission mapping', async () => {
    const mockQuery = mockPool();

    await removePermissionsFromRole('role-1', ['perm-1']);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM role_permissions');
    expect(sql).toContain('role_id = $1');
    expect(sql).toContain('permission_id IN ($2)');
    expect(params).toEqual(['role-1', 'perm-1']);
  });

  it('should delete multiple permission mappings', async () => {
    const mockQuery = mockPool();

    await removePermissionsFromRole('role-1', ['perm-1', 'perm-2']);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('permission_id IN ($2, $3)');
    expect(params).toEqual(['role-1', 'perm-1', 'perm-2']);
  });
});

describe('getPermissionsForRole', () => {
  it('should return permissions joined with the permissions table', async () => {
    const rows = [
      createTestPermissionRow({ slug: 'crm:contacts:read' }),
      createTestPermissionRow({ id: 'perm-2', slug: 'crm:deals:write' }),
    ];
    mockPool(rows);

    const result = await getPermissionsForRole('role-1');

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('crm:contacts:read');
    expect(result[1].slug).toBe('crm:deals:write');
  });

  it('should return empty array when role has no permissions', async () => {
    mockPool([]);

    const result = await getPermissionsForRole('role-1');

    expect(result).toEqual([]);
  });

  it('should use JOIN and ORDER BY slug', async () => {
    const mockQuery = mockPool([]);

    await getPermissionsForRole('role-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('JOIN permissions p ON p.id = rp.permission_id');
    expect(sql).toContain('ORDER BY p.slug ASC');
    expect(params).toEqual(['role-1']);
  });
});

describe('getRolesWithPermission', () => {
  it('should return roles that have a specific permission', async () => {
    const rows = [
      createTestRoleRow({ name: 'Admin', slug: 'admin' }),
      createTestRoleRow({ id: 'role-2', name: 'Editor', slug: 'editor' }),
    ];
    mockPool(rows);

    const result = await getRolesWithPermission('perm-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Admin');
    expect(result[1].name).toBe('Editor');
  });

  it('should return empty array when no roles have the permission', async () => {
    mockPool([]);

    const result = await getRolesWithPermission('perm-1');

    expect(result).toEqual([]);
  });

  it('should use JOIN and ORDER BY name', async () => {
    const mockQuery = mockPool([]);

    await getRolesWithPermission('perm-1');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('JOIN roles r ON r.id = rp.role_id');
    expect(sql).toContain('ORDER BY r.name ASC');
  });
});

// ===========================================================================
// User-Role Mapping
// ===========================================================================

describe('assignRolesToUser', () => {
  it('should do nothing when roleIds array is empty', async () => {
    const mockQuery = mockPool();

    await assignRolesToUser('user-1', []);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should insert a single role assignment with assignedBy', async () => {
    const mockQuery = mockPool();

    await assignRolesToUser('user-1', ['role-1'], 'admin-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_roles');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toEqual(['user-1', 'admin-1', 'role-1']);
  });

  it('should insert multiple role assignments (bulk)', async () => {
    const mockQuery = mockPool();

    await assignRolesToUser('user-1', ['role-1', 'role-2', 'role-3'], 'admin-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('($1, $3, $2), ($1, $4, $2), ($1, $5, $2)');
    expect(params).toEqual(['user-1', 'admin-1', 'role-1', 'role-2', 'role-3']);
  });

  it('should use null for assignedBy when not provided', async () => {
    const mockQuery = mockPool();

    await assignRolesToUser('user-1', ['role-1']);

    const [, params] = mockQuery.mock.calls[0];
    // $2 = assignedBy should be null
    expect(params).toEqual(['user-1', null, 'role-1']);
  });

  it('should use ON CONFLICT DO NOTHING for idempotent assignment', async () => {
    const mockQuery = mockPool();

    await assignRolesToUser('user-1', ['role-1']);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});

describe('removeRolesFromUser', () => {
  it('should do nothing when roleIds array is empty', async () => {
    const mockQuery = mockPool();

    await removeRolesFromUser('user-1', []);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should delete a single role assignment', async () => {
    const mockQuery = mockPool();

    await removeRolesFromUser('user-1', ['role-1']);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM user_roles');
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('role_id IN ($2)');
    expect(params).toEqual(['user-1', 'role-1']);
  });

  it('should delete multiple role assignments', async () => {
    const mockQuery = mockPool();

    await removeRolesFromUser('user-1', ['role-1', 'role-2']);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('role_id IN ($2, $3)');
    expect(params).toEqual(['user-1', 'role-1', 'role-2']);
  });
});

describe('getRolesForUser', () => {
  it('should return roles joined with the roles table', async () => {
    const rows = [
      createTestRoleRow({ name: 'Admin' }),
      createTestRoleRow({ id: 'role-2', name: 'Editor' }),
    ];
    mockPool(rows);

    const result = await getRolesForUser('user-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Admin');
    expect(result[1].name).toBe('Editor');
  });

  it('should return empty array when user has no roles', async () => {
    mockPool([]);

    const result = await getRolesForUser('user-1');

    expect(result).toEqual([]);
  });

  it('should use JOIN and ORDER BY name', async () => {
    const mockQuery = mockPool([]);

    await getRolesForUser('user-1');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('JOIN roles r ON r.id = ur.role_id');
    expect(sql).toContain('ORDER BY r.name ASC');
  });
});

describe('getPermissionsForUser', () => {
  it('should resolve permissions through user roles', async () => {
    const rows = [
      createTestPermissionRow({ slug: 'crm:contacts:read' }),
      createTestPermissionRow({ id: 'perm-2', slug: 'crm:deals:write' }),
    ];
    mockPool(rows);

    const result = await getPermissionsForUser('user-1');

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('crm:contacts:read');
  });

  it('should return empty array when user has no permissions', async () => {
    mockPool([]);

    const result = await getPermissionsForUser('user-1');

    expect(result).toEqual([]);
  });

  it('should use DISTINCT and triple JOIN for full resolution chain', async () => {
    const mockQuery = mockPool([]);

    await getPermissionsForUser('user-1');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('SELECT DISTINCT p.*');
    expect(sql).toContain('JOIN role_permissions rp ON rp.role_id = ur.role_id');
    expect(sql).toContain('JOIN permissions p ON p.id = rp.permission_id');
    expect(sql).toContain('WHERE ur.user_id = $1');
    expect(sql).toContain('ORDER BY p.slug ASC');
  });
});

describe('getUsersWithRole', () => {
  it('should return paginated user-role assignments', async () => {
    const countRow = { count: '2' };
    const dataRows = [
      createTestUserRoleRow({ user_id: 'user-1' }),
      createTestUserRoleRow({ user_id: 'user-2' }),
    ];

    // Mock query: first call returns count, second returns data
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [countRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: dataRows, rowCount: 2 });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const result = await getUsersWithRole('role-1', 'org-1', 1, 10);

    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].userId).toBe('user-1');
    expect(result.rows[1].userId).toBe('user-2');
  });

  it('should calculate correct offset from page number', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await getUsersWithRole('role-1', 'org-1', 3, 10);

    // Data query should use OFFSET 20 (page 3, pageSize 10)
    const [, params] = mockQuery.mock.calls[1];
    expect(params).toEqual(['role-1', 'org-1', 10, 20]);
  });

  it('should return total 0 and empty rows when no users', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const result = await getUsersWithRole('role-1', 'org-1', 1, 10);

    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('should filter by organization via JOIN with users table', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await getUsersWithRole('role-1', 'org-1', 1, 10);

    // Both queries should join with users and filter by org
    const [countSql] = mockQuery.mock.calls[0];
    const [dataSql] = mockQuery.mock.calls[1];
    expect(countSql).toContain('JOIN users u ON u.id = ur.user_id');
    expect(countSql).toContain('u.organization_id = $2');
    expect(dataSql).toContain('JOIN users u ON u.id = ur.user_id');
    expect(dataSql).toContain('u.organization_id = $2');
  });
});
