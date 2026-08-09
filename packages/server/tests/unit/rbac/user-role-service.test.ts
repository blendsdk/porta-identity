/**
 * Unit tests for user-role service.
 *
 * Tests user role assignment, cache-first claims building,
 * and audit logging. All dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  assignRolesToUser: vi.fn(),
  removeRolesFromUser: vi.fn(),
  getRolesForUser: vi.fn(),
  getPermissionsForUser: vi.fn(),
  getUsersWithRole: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  getCachedUserRoles: vi.fn(),
  setCachedUserRoles: vi.fn(),
  getCachedUserPermissions: vi.fn(),
  setCachedUserPermissions: vi.fn(),
  invalidateUserRbacCache: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import {
  assignRolesToUser as mockRepoAssign,
  removeRolesFromUser as mockRepoRemove,
  getRolesForUser as mockRepoGetRoles,
  getPermissionsForUser as mockRepoGetPerms,
  getUsersWithRole as mockRepoGetUsers,
} from '../../../src/rbac/mapping-repository.js';
import {
  getCachedUserRoles as mockGetCachedRoles,
  setCachedUserRoles as mockSetCachedRoles,
  getCachedUserPermissions as mockGetCachedPerms,
  setCachedUserPermissions as mockSetCachedPerms,
  invalidateUserRbacCache as mockInvalidateUser,
} from '../../../src/rbac/cache.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';

import {
  assignRolesToUser,
  removeRolesFromUser,
  getUserRoles,
  getUserPermissions,
  getUsersWithRole,
  buildRoleClaims,
  buildPermissionClaims,
} from '../../../src/rbac/user-role-service.js';
import type { Role, Permission } from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-uuid-1',
    applicationId: 'app-uuid-1',
    name: 'CRM Editor',
    slug: 'crm-editor',
    description: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createTestPermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-uuid-1',
    applicationId: 'app-uuid-1',
    moduleId: null,
    name: 'Read Contacts',
    slug: 'crm:contacts:read',
    description: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values
  vi.mocked(mockRepoAssign).mockResolvedValue(undefined);
  vi.mocked(mockRepoRemove).mockResolvedValue(undefined);
  vi.mocked(mockGetCachedRoles).mockResolvedValue(null);
  vi.mocked(mockSetCachedRoles).mockResolvedValue(undefined);
  vi.mocked(mockGetCachedPerms).mockResolvedValue(null);
  vi.mocked(mockSetCachedPerms).mockResolvedValue(undefined);
  vi.mocked(mockInvalidateUser).mockResolvedValue(undefined);
  vi.mocked(mockAuditLog).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assignRolesToUser', () => {
  it('should assign roles and invalidate user cache', async () => {
    await assignRolesToUser('user-1', ['role-1', 'role-2'], 'admin-1');

    expect(mockRepoAssign).toHaveBeenCalledWith('user-1', ['role-1', 'role-2'], 'admin-1');
    expect(mockInvalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('should do nothing when roleIds is empty', async () => {
    await assignRolesToUser('user-1', []);

    expect(mockRepoAssign).not.toHaveBeenCalled();
    expect(mockInvalidateUser).not.toHaveBeenCalled();
  });

  it('should write audit log with userId and actorId', async () => {
    await assignRolesToUser('user-1', ['role-1'], 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.roles.assigned',
        eventCategory: 'admin',
        userId: 'user-1',
        actorId: 'admin-1',
      }),
    );
  });
});

describe('removeRolesFromUser', () => {
  it('should remove roles and invalidate user cache', async () => {
    await removeRolesFromUser('user-1', ['role-1'], 'admin-1');

    expect(mockRepoRemove).toHaveBeenCalledWith('user-1', ['role-1']);
    expect(mockInvalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('should do nothing when roleIds is empty', async () => {
    await removeRolesFromUser('user-1', []);

    expect(mockRepoRemove).not.toHaveBeenCalled();
    expect(mockInvalidateUser).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    await removeRolesFromUser('user-1', ['role-1'], 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.roles.removed',
        userId: 'user-1',
        actorId: 'admin-1',
      }),
    );
  });
});

describe('getUserRoles', () => {
  it('should delegate to mapping repository', async () => {
    const roles = [createTestRole()];
    vi.mocked(mockRepoGetRoles).mockResolvedValue(roles);

    const result = await getUserRoles('user-1');

    expect(result).toEqual(roles);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('user-1');
  });
});

describe('getUserPermissions', () => {
  it('should delegate to mapping repository', async () => {
    const perms = [createTestPermission()];
    vi.mocked(mockRepoGetPerms).mockResolvedValue(perms);

    const result = await getUserPermissions('user-1');

    expect(result).toEqual(perms);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('user-1');
  });
});

describe('getUsersWithRole', () => {
  it('should delegate to mapping repository with default pagination', async () => {
    vi.mocked(mockRepoGetUsers).mockResolvedValue({ rows: [], total: 0 });

    await getUsersWithRole('role-1', 'org-1');

    expect(mockRepoGetUsers).toHaveBeenCalledWith('role-1', 'org-1', 1, 20);
  });

  it('should pass custom pagination options', async () => {
    vi.mocked(mockRepoGetUsers).mockResolvedValue({ rows: [], total: 0 });

    await getUsersWithRole('role-1', 'org-1', { page: 3, pageSize: 50 });

    expect(mockRepoGetUsers).toHaveBeenCalledWith('role-1', 'org-1', 3, 50);
  });
});

// ===========================================================================
// Token claims building (hot path)
// ===========================================================================

describe('buildRoleClaims', () => {
  it('should return cached slugs on cache hit', async () => {
    vi.mocked(mockGetCachedRoles).mockResolvedValue(['admin', 'editor']);

    const result = await buildRoleClaims('user-1');

    expect(result).toEqual(['admin', 'editor']);
    // Should NOT call the DB
    expect(mockRepoGetRoles).not.toHaveBeenCalled();
  });

  it('should query DB and cache result on cache miss', async () => {
    vi.mocked(mockGetCachedRoles).mockResolvedValue(null);
    vi.mocked(mockRepoGetRoles).mockResolvedValue([
      createTestRole({ slug: 'admin' }),
      createTestRole({ slug: 'editor' }),
    ]);

    const result = await buildRoleClaims('user-1');

    expect(result).toEqual(['admin', 'editor']);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('user-1');
    expect(mockSetCachedRoles).toHaveBeenCalledWith('user-1', ['admin', 'editor']);
  });

  it('should return empty array when user has no roles', async () => {
    vi.mocked(mockGetCachedRoles).mockResolvedValue(null);
    vi.mocked(mockRepoGetRoles).mockResolvedValue([]);

    const result = await buildRoleClaims('user-1');

    expect(result).toEqual([]);
    expect(mockSetCachedRoles).toHaveBeenCalledWith('user-1', []);
  });

  it('should return cached empty array (no DB call)', async () => {
    // Empty array is a valid cached value — means user has no roles
    vi.mocked(mockGetCachedRoles).mockResolvedValue([]);

    const result = await buildRoleClaims('user-1');

    expect(result).toEqual([]);
    expect(mockRepoGetRoles).not.toHaveBeenCalled();
  });
});

describe('buildPermissionClaims', () => {
  it('should return cached slugs on cache hit', async () => {
    vi.mocked(mockGetCachedPerms).mockResolvedValue(['crm:contacts:read', 'crm:deals:write']);

    const result = await buildPermissionClaims('user-1');

    expect(result).toEqual(['crm:contacts:read', 'crm:deals:write']);
    expect(mockRepoGetPerms).not.toHaveBeenCalled();
  });

  it('should query DB and cache result on cache miss', async () => {
    vi.mocked(mockGetCachedPerms).mockResolvedValue(null);
    vi.mocked(mockRepoGetPerms).mockResolvedValue([
      createTestPermission({ slug: 'crm:contacts:read' }),
      createTestPermission({ slug: 'crm:deals:write' }),
    ]);

    const result = await buildPermissionClaims('user-1');

    expect(result).toEqual(['crm:contacts:read', 'crm:deals:write']);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('user-1');
    expect(mockSetCachedPerms).toHaveBeenCalledWith(
      'user-1',
      ['crm:contacts:read', 'crm:deals:write'],
    );
  });

  it('should return empty array when user has no permissions', async () => {
    vi.mocked(mockGetCachedPerms).mockResolvedValue(null);
    vi.mocked(mockRepoGetPerms).mockResolvedValue([]);

    const result = await buildPermissionClaims('user-1');

    expect(result).toEqual([]);
    expect(mockSetCachedPerms).toHaveBeenCalledWith('user-1', []);
  });

  it('should return cached empty array (no DB call)', async () => {
    vi.mocked(mockGetCachedPerms).mockResolvedValue([]);

    const result = await buildPermissionClaims('user-1');

    expect(result).toEqual([]);
    expect(mockRepoGetPerms).not.toHaveBeenCalled();
  });
});
