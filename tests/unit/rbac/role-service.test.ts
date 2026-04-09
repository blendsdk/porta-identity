/**
 * Unit tests for role service.
 *
 * Tests business logic: slug validation, uniqueness checks,
 * deletion guards, cache orchestration, and audit logging.
 * All dependencies (repository, cache, audit) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('../../../src/rbac/role-repository.js', () => ({
  insertRole: vi.fn(),
  findRoleById: vi.fn(),
  findRoleBySlug: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  listRolesByApplication: vi.fn(),
  roleSlugExists: vi.fn(),
  countUsersWithRole: vi.fn(),
}));

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  assignPermissionsToRole: vi.fn(),
  removePermissionsFromRole: vi.fn(),
  getPermissionsForRole: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  getCachedRole: vi.fn(),
  setCachedRole: vi.fn(),
  invalidateRoleCache: vi.fn(),
  invalidateAllUserRbacCaches: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import {
  insertRole as mockInsertRole,
  findRoleById as mockRepoFindById,
  updateRole as mockRepoUpdate,
  deleteRole as mockRepoDelete,
  listRolesByApplication as mockRepoList,
  roleSlugExists as mockSlugExists,
  countUsersWithRole as mockCountUsers,
} from '../../../src/rbac/role-repository.js';
import {
  assignPermissionsToRole as mockRepoAssignPerms,
  removePermissionsFromRole as mockRepoRemovePerms,
  getPermissionsForRole as mockRepoGetPerms,
} from '../../../src/rbac/mapping-repository.js';
import {
  getCachedRole as mockGetCached,
  setCachedRole as mockSetCached,
  invalidateRoleCache as mockInvalidateRole,
  invalidateAllUserRbacCaches as mockInvalidateAll,
} from '../../../src/rbac/cache.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';

import {
  createRole,
  findRoleById,
  findRoleBySlug,
  updateRole,
  deleteRole,
  listRolesByApplication,
  assignPermissionsToRole,
  removePermissionsFromRole,
  getPermissionsForRole,
} from '../../../src/rbac/role-service.js';
import { RoleNotFoundError, RbacValidationError } from '../../../src/rbac/errors.js';
import type { Role } from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-uuid-1',
    applicationId: 'app-uuid-1',
    name: 'CRM Editor',
    slug: 'crm-editor',
    description: 'Can edit CRM records',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values
  vi.mocked(mockSlugExists).mockResolvedValue(false);
  vi.mocked(mockGetCached).mockResolvedValue(null);
  vi.mocked(mockSetCached).mockResolvedValue(undefined);
  vi.mocked(mockInvalidateRole).mockResolvedValue(undefined);
  vi.mocked(mockInvalidateAll).mockResolvedValue(undefined);
  vi.mocked(mockAuditLog).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRole', () => {
  it('should create a role with auto-generated slug', async () => {
    const role = createTestRole();
    vi.mocked(mockInsertRole).mockResolvedValue(role);

    const result = await createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor' });

    expect(result).toEqual(role);
    expect(mockInsertRole).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'crm-editor' }),
    );
  });

  it('should create a role with provided slug', async () => {
    const role = createTestRole({ slug: 'custom-slug' });
    vi.mocked(mockInsertRole).mockResolvedValue(role);

    const result = await createRole({
      applicationId: 'app-uuid-1',
      name: 'CRM Editor',
      slug: 'custom-slug',
    });

    expect(result.slug).toBe('custom-slug');
  });

  it('should throw RbacValidationError for invalid slug format', async () => {
    await expect(
      createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor', slug: 'INVALID SLUG' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should throw RbacValidationError for duplicate slug', async () => {
    vi.mocked(mockSlugExists).mockResolvedValue(true);

    await expect(
      createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should cache the new role after creation', async () => {
    const role = createTestRole();
    vi.mocked(mockInsertRole).mockResolvedValue(role);

    await createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor' });

    expect(mockSetCached).toHaveBeenCalledWith(role);
  });

  it('should write audit log on creation', async () => {
    const role = createTestRole();
    vi.mocked(mockInsertRole).mockResolvedValue(role);

    await createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor' }, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'role.created',
        eventCategory: 'admin',
        actorId: 'admin-1',
      }),
    );
  });
});

describe('findRoleById', () => {
  it('should return cached role on cache hit', async () => {
    const role = createTestRole();
    vi.mocked(mockGetCached).mockResolvedValue(role);

    const result = await findRoleById('role-uuid-1');

    expect(result).toEqual(role);
    expect(mockRepoFindById).not.toHaveBeenCalled();
  });

  it('should query DB and cache result on cache miss', async () => {
    const role = createTestRole();
    vi.mocked(mockGetCached).mockResolvedValue(null);
    vi.mocked(mockRepoFindById).mockResolvedValue(role);

    const result = await findRoleById('role-uuid-1');

    expect(result).toEqual(role);
    expect(mockRepoFindById).toHaveBeenCalledWith('role-uuid-1');
    expect(mockSetCached).toHaveBeenCalledWith(role);
  });

  it('should return null when not found in cache or DB', async () => {
    vi.mocked(mockGetCached).mockResolvedValue(null);
    vi.mocked(mockRepoFindById).mockResolvedValue(null);

    const result = await findRoleById('non-existent');

    expect(result).toBeNull();
    expect(mockSetCached).not.toHaveBeenCalled();
  });
});

describe('findRoleBySlug', () => {
  it('should delegate to repository', async () => {
    const { findRoleBySlug: mockRepoFindBySlug } = await import('../../../src/rbac/role-repository.js');
    const role = createTestRole();
    vi.mocked(mockRepoFindBySlug).mockResolvedValue(role);

    const result = await findRoleBySlug('app-1', 'crm-editor');

    expect(result).toEqual(role);
  });
});

describe('updateRole', () => {
  it('should update role and invalidate + re-cache', async () => {
    const existing = createTestRole();
    const updated = createTestRole({ name: 'Updated' });
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    const result = await updateRole('role-uuid-1', { name: 'Updated' });

    expect(result.name).toBe('Updated');
    expect(mockInvalidateRole).toHaveBeenCalledWith('role-uuid-1');
    expect(mockSetCached).toHaveBeenCalledWith(updated);
  });

  it('should throw RoleNotFoundError when role does not exist', async () => {
    vi.mocked(mockRepoFindById).mockResolvedValue(null);

    await expect(updateRole('non-existent', { name: 'X' })).rejects.toThrow(RoleNotFoundError);
  });

  it('should validate new slug format when slug is changing', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);

    await expect(
      updateRole('role-uuid-1', { slug: 'INVALID SLUG' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should check slug uniqueness when slug is changing', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockSlugExists).mockResolvedValue(true);

    await expect(
      updateRole('role-uuid-1', { slug: 'taken-slug' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should skip slug validation when slug is not changing', async () => {
    const existing = createTestRole({ slug: 'crm-editor' });
    const updated = createTestRole({ name: 'New Name' });
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    // Same slug as existing — should not trigger validation
    await updateRole('role-uuid-1', { slug: 'crm-editor', name: 'New Name' });

    expect(mockSlugExists).not.toHaveBeenCalled();
  });

  it('should write audit log on update', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(existing);

    await updateRole('role-uuid-1', { name: 'Updated' }, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.updated', actorId: 'admin-1' }),
    );
  });
});

describe('deleteRole', () => {
  it('should delete role when no users assigned', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockCountUsers).mockResolvedValue(0);
    vi.mocked(mockRepoDelete).mockResolvedValue(true);

    await deleteRole('role-uuid-1');

    expect(mockRepoDelete).toHaveBeenCalledWith('role-uuid-1');
    expect(mockInvalidateRole).toHaveBeenCalledWith('role-uuid-1');
  });

  it('should throw RoleNotFoundError when role does not exist', async () => {
    vi.mocked(mockRepoFindById).mockResolvedValue(null);

    await expect(deleteRole('non-existent')).rejects.toThrow(RoleNotFoundError);
  });

  it('should throw RbacValidationError when users assigned and force=false', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockCountUsers).mockResolvedValue(5);

    await expect(deleteRole('role-uuid-1', false)).rejects.toThrow(RbacValidationError);
  });

  it('should delete and invalidate all user caches when force=true', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoDelete).mockResolvedValue(true);

    await deleteRole('role-uuid-1', true);

    expect(mockRepoDelete).toHaveBeenCalled();
    expect(mockInvalidateAll).toHaveBeenCalled();
  });

  it('should write audit log on deletion', async () => {
    const existing = createTestRole();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockCountUsers).mockResolvedValue(0);
    vi.mocked(mockRepoDelete).mockResolvedValue(true);

    await deleteRole('role-uuid-1', false, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.deleted', actorId: 'admin-1' }),
    );
  });
});

describe('listRolesByApplication', () => {
  it('should delegate to repository', async () => {
    const roles = [createTestRole()];
    vi.mocked(mockRepoList).mockResolvedValue(roles);

    const result = await listRolesByApplication('app-1');

    expect(result).toEqual(roles);
  });
});

describe('assignPermissionsToRole', () => {
  it('should delegate to mapping repository and invalidate caches', async () => {
    vi.mocked(mockRepoAssignPerms).mockResolvedValue(undefined);

    await assignPermissionsToRole('role-1', ['perm-1', 'perm-2'], 'admin-1');

    expect(mockRepoAssignPerms).toHaveBeenCalledWith('role-1', ['perm-1', 'perm-2']);
    expect(mockInvalidateAll).toHaveBeenCalled();
  });

  it('should do nothing when permissionIds is empty', async () => {
    await assignPermissionsToRole('role-1', []);

    expect(mockRepoAssignPerms).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    vi.mocked(mockRepoAssignPerms).mockResolvedValue(undefined);

    await assignPermissionsToRole('role-1', ['perm-1'], 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.permissions.assigned' }),
    );
  });
});

describe('removePermissionsFromRole', () => {
  it('should delegate to mapping repository and invalidate caches', async () => {
    vi.mocked(mockRepoRemovePerms).mockResolvedValue(undefined);

    await removePermissionsFromRole('role-1', ['perm-1'], 'admin-1');

    expect(mockRepoRemovePerms).toHaveBeenCalledWith('role-1', ['perm-1']);
    expect(mockInvalidateAll).toHaveBeenCalled();
  });

  it('should do nothing when permissionIds is empty', async () => {
    await removePermissionsFromRole('role-1', []);

    expect(mockRepoRemovePerms).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    vi.mocked(mockRepoRemovePerms).mockResolvedValue(undefined);

    await removePermissionsFromRole('role-1', ['perm-1']);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.permissions.removed' }),
    );
  });
});

describe('getPermissionsForRole', () => {
  it('should delegate to mapping repository', async () => {
    vi.mocked(mockRepoGetPerms).mockResolvedValue([]);

    const result = await getPermissionsForRole('role-1');

    expect(result).toEqual([]);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('role-1');
  });
});
