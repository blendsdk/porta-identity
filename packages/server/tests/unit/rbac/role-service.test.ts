/**
 * Unit tests for role service.
 *
 * Tests business logic: slug validation, uniqueness checks,
 * cache orchestration and audit logging.
 * All dependencies (repository, cache, audit) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('../../../src/rbac/role-repository.js', () => ({
  insertRole: vi.fn(),
  findRoleById: vi.fn(),
  lockRoleById: vi.fn(),
  findRoleBySlug: vi.fn(),
  updateRole: vi.fn(),
  captureRoleForDeletion: vi.fn(),
  deleteCapturedRole: vi.fn(),
  listRolesByApplication: vi.fn(),
  roleSlugExists: vi.fn(),
}));

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  assignPermissionsToRole: vi.fn(),
  removePermissionsFromRole: vi.fn(),
  getPermissionsForRole: vi.fn(),
  getUserIdsForRole: vi.fn(),
  lockRolePermissionTargets: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  getCachedRole: vi.fn(),
  setCachedRole: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getDatabaseTransactionClient: vi.fn(),
}));

vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerAuthorityCleanup: vi.fn(),
  registerDeletionCleanup: vi.fn(),
}));

vi.mock('../../../src/lib/authority-revocation.js', () => ({
  revokeAffectedAuthorityInTransaction: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: vi.fn(),
}));

import {
  insertRole as mockInsertRole,
  findRoleById as mockRepoFindById,
  lockRoleById as mockLockRole,
  updateRole as mockRepoUpdate,
  listRolesByApplication as mockRepoList,
  roleSlugExists as mockSlugExists,
} from '../../../src/rbac/role-repository.js';
import {
  assignPermissionsToRole as mockRepoAssignPerms,
  removePermissionsFromRole as mockRepoRemovePerms,
  getPermissionsForRole as mockRepoGetPerms,
  getUserIdsForRole as mockGetUserIds,
  lockRolePermissionTargets as mockLockTargets,
} from '../../../src/rbac/mapping-repository.js';
import {
  getCachedRole as mockGetCached,
  setCachedRole as mockSetCached,
} from '../../../src/rbac/cache.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';
import { writeAuditLogInTransaction as mockTransactionalAudit } from '../../../src/lib/audit-log.js';
import { getDatabaseTransactionClient } from '../../../src/lib/database.js';
import { registerAuthorityCleanup as mockAuthorityCleanup } from '../../../src/lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction as mockRevokeAuthority } from '../../../src/lib/authority-revocation.js';
import { getApplicationBySlug as mockGetApplicationBySlug } from '../../../src/applications/service.js';

import {
  createRole,
  findRoleById,
  findRoleBySlug,
  updateRole,
  listRolesByApplication,
  assignPermissionsToRole,
  removePermissionsFromRole,
  getPermissionsForRole,
} from '../../../src/rbac/role-service.js';
import { RoleNotFoundError, RbacValidationError } from '../../../src/rbac/errors.js';
import type { Permission, Role } from '../../../src/rbac/types.js';
import type { Application } from '../../../src/applications/types.js';

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

function createTestPermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-1',
    applicationId: 'app-uuid-1',
    moduleId: null,
    name: 'Read records',
    slug: 'app:records:read',
    description: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createAdminApplication(): Application {
  return {
    id: 'app-uuid-1',
    name: 'Porta Admin',
    slug: 'porta-admin',
    description: null,
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values
  vi.mocked(mockSlugExists).mockResolvedValue(false);
  vi.mocked(mockGetCached).mockResolvedValue(null);
  vi.mocked(mockSetCached).mockResolvedValue(undefined);
  vi.mocked(mockAuditLog).mockResolvedValue(undefined);
  vi.mocked(mockTransactionalAudit).mockResolvedValue(undefined);
  vi.mocked(getDatabaseTransactionClient).mockReturnValue({ query: vi.fn() } as never);
  vi.mocked(mockAuthorityCleanup).mockResolvedValue(undefined);
  vi.mocked(mockRevokeAuthority).mockResolvedValue({ grantIds: [] });
  vi.mocked(mockGetApplicationBySlug).mockResolvedValue(null);
  vi.mocked(mockGetUserIds).mockResolvedValue([]);
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
    expect(mockInsertRole).toHaveBeenCalledWith(expect.objectContaining({ slug: 'crm-editor' }));
  });

  it('should preserve a free-form role claim value after trimming it', async () => {
    const role = createTestRole({ slug: 'GROUP_ADMIN' });
    vi.mocked(mockInsertRole).mockResolvedValue(role);

    const result = await createRole({
      applicationId: 'app-uuid-1',
      name: 'CRM Editor',
      slug: '  GROUP_ADMIN  ',
    });

    expect(result.slug).toBe('GROUP_ADMIN');
    expect(mockInsertRole).toHaveBeenCalledWith(expect.objectContaining({ slug: 'GROUP_ADMIN' }));
  });

  it('should throw RbacValidationError for a control character in a slug', async () => {
    await expect(
      createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor', slug: 'INVALID\nSLUG' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should throw RbacValidationError for duplicate slug', async () => {
    vi.mocked(mockSlugExists).mockResolvedValue(true);

    await expect(createRole({ applicationId: 'app-uuid-1', name: 'CRM Editor' })).rejects.toThrow(
      RbacValidationError,
    );
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

  it.each(['porta-super-admin', 'porta-admin'])(
    'rejects reserved canonical role creation for %s',
    async (slug) => {
      vi.mocked(mockGetApplicationBySlug).mockResolvedValue(createAdminApplication());

      await expect(
        createRole({ applicationId: 'app-uuid-1', name: 'Reserved', slug }),
      ).rejects.toThrow(RbacValidationError);
      expect(mockInsertRole).not.toHaveBeenCalled();
    },
  );
});

describe('findRoleById', () => {
  it('should return cached role on cache hit', async () => {
    const role = createTestRole();
    vi.mocked(mockGetCached).mockResolvedValue(role);

    const result = await findRoleById('app-uuid-1', 'role-uuid-1');

    expect(result).toEqual(role);
    expect(mockRepoFindById).not.toHaveBeenCalled();
  });

  it('should query DB and cache result on cache miss', async () => {
    const role = createTestRole();
    vi.mocked(mockGetCached).mockResolvedValue(null);
    vi.mocked(mockRepoFindById).mockResolvedValue(role);

    const result = await findRoleById('app-uuid-1', 'role-uuid-1');

    expect(result).toEqual(role);
    expect(mockRepoFindById).toHaveBeenCalledWith('app-uuid-1', 'role-uuid-1');
    expect(mockSetCached).toHaveBeenCalledWith(role);
  });

  it('should return null when not found in cache or DB', async () => {
    vi.mocked(mockGetCached).mockResolvedValue(null);
    vi.mocked(mockRepoFindById).mockResolvedValue(null);

    const result = await findRoleById('app-uuid-1', 'non-existent');

    expect(result).toBeNull();
    expect(mockSetCached).not.toHaveBeenCalled();
  });
});

describe('updateRole canonical identity', () => {
  it('rejects renaming an ordinary Admin role to a reserved canonical slug', async () => {
    vi.mocked(mockGetApplicationBySlug).mockResolvedValue(createAdminApplication());
    vi.mocked(mockLockRole).mockResolvedValue(createTestRole());

    await expect(
      updateRole('app-uuid-1', 'role-uuid-1', { slug: 'porta-super-admin' }),
    ).rejects.toThrow(RbacValidationError);
    expect(mockRepoUpdate).not.toHaveBeenCalled();
    expect(mockRevokeAuthority).not.toHaveBeenCalled();
  });
});

describe('findRoleBySlug', () => {
  it('should delegate to repository', async () => {
    const { findRoleBySlug: mockRepoFindBySlug } =
      await import('../../../src/rbac/role-repository.js');
    const role = createTestRole();
    vi.mocked(mockRepoFindBySlug).mockResolvedValue(role);

    const result = await findRoleBySlug('app-1', 'crm-editor');

    expect(result).toEqual(role);
  });
});

describe('updateRole', () => {
  it('should update role and schedule its exact cache cleanup', async () => {
    const existing = createTestRole();
    const updated = createTestRole({ name: 'Updated' });
    vi.mocked(mockLockRole).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    const result = await updateRole('app-uuid-1', 'role-uuid-1', { name: 'Updated' });

    expect(result.role.name).toBe('Updated');
    expect(mockRepoUpdate).toHaveBeenCalledWith('app-uuid-1', 'role-uuid-1', {
      name: 'Updated',
    });
    expect(mockAuthorityCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ roleIds: ['role-uuid-1'], revokeOidcState: false }),
    );
  });

  it('should throw RoleNotFoundError when role does not exist', async () => {
    vi.mocked(mockLockRole).mockResolvedValue(null);

    await expect(updateRole('app-uuid-1', 'non-existent', { name: 'X' })).rejects.toThrow(
      RoleNotFoundError,
    );
  });

  it('should validate a changed slug for control characters', async () => {
    const existing = createTestRole();
    vi.mocked(mockLockRole).mockResolvedValue(existing);

    await expect(
      updateRole('app-uuid-1', 'role-uuid-1', { slug: 'INVALID\nSLUG' }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should check slug uniqueness when slug is changing', async () => {
    const existing = createTestRole();
    vi.mocked(mockLockRole).mockResolvedValue(existing);
    vi.mocked(mockSlugExists).mockResolvedValue(true);

    await expect(updateRole('app-uuid-1', 'role-uuid-1', { slug: 'taken-slug' })).rejects.toThrow(
      RbacValidationError,
    );
  });

  it('should skip slug validation when slug is not changing', async () => {
    const existing = createTestRole({ slug: 'crm-editor' });
    const updated = createTestRole({ name: 'New Name' });
    vi.mocked(mockLockRole).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    // Same slug as existing — should not trigger validation
    await updateRole('app-uuid-1', 'role-uuid-1', {
      slug: 'crm-editor',
      name: 'New Name',
    });

    expect(mockSlugExists).not.toHaveBeenCalled();
  });

  it('should write audit log on update', async () => {
    const existing = createTestRole();
    vi.mocked(mockLockRole).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(existing);

    await updateRole('app-uuid-1', 'role-uuid-1', { name: 'Updated' }, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.updated', actorId: 'admin-1' }),
    );
  });

  it('should return an unchanged role without update or cleanup work', async () => {
    const existing = createTestRole();
    vi.mocked(mockLockRole).mockResolvedValue(existing);

    await expect(updateRole('app-uuid-1', 'role-uuid-1', { name: existing.name })).resolves.toEqual(
      { role: existing, reauthenticationRequired: false },
    );
    expect(mockRepoUpdate).not.toHaveBeenCalled();
    expect(mockAuthorityCleanup).not.toHaveBeenCalled();
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
  it('should delegate to mapping repository and schedule affected-user cleanup', async () => {
    const role = createTestRole();
    vi.mocked(mockLockTargets).mockResolvedValue({
      role,
      permissions: [createTestPermission(), createTestPermission({ id: 'perm-2' })],
      assignedPermissionIds: [],
    });
    vi.mocked(mockRepoAssignPerms).mockResolvedValue(['perm-1', 'perm-2']);

    await assignPermissionsToRole('app-uuid-1', 'role-uuid-1', ['perm-1', 'perm-2'], 'admin-1');

    expect(mockRepoAssignPerms).toHaveBeenCalledWith('app-uuid-1', 'role-uuid-1', [
      'perm-1',
      'perm-2',
    ]);
    expect(mockAuthorityCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ revokeOidcState: false }),
    );
  });

  it('should do nothing when permissionIds is empty', async () => {
    await assignPermissionsToRole('app-uuid-1', 'role-uuid-1', []);

    expect(mockRepoAssignPerms).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission()],
      assignedPermissionIds: [],
    });
    vi.mocked(mockRepoAssignPerms).mockResolvedValue(['perm-1']);

    await assignPermissionsToRole('app-uuid-1', 'role-uuid-1', ['perm-1'], 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'role.permissions.assigned' }),
    );
  });

  it('should stop after an idempotent repository assignment', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission()],
      assignedPermissionIds: ['perm-1'],
    });
    vi.mocked(mockRepoAssignPerms).mockResolvedValue([]);

    await assignPermissionsToRole('app-uuid-1', 'role-uuid-1', ['perm-1'], 'admin-1');

    expect(mockGetUserIds).not.toHaveBeenCalled();
    expect(mockAuthorityCleanup).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('rejects assigning a canonical permission through an ordinary Admin role', async () => {
    vi.mocked(mockGetApplicationBySlug).mockResolvedValue(createAdminApplication());
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission({ slug: 'admin:user:read' })],
      assignedPermissionIds: [],
    });

    await expect(assignPermissionsToRole('app-uuid-1', 'role-uuid-1', ['perm-1'])).rejects.toThrow(
      RbacValidationError,
    );
    expect(mockRepoAssignPerms).not.toHaveBeenCalled();
  });
});

describe('removePermissionsFromRole', () => {
  it('should delegate to mapping repository and revoke affected authority', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission()],
      assignedPermissionIds: ['perm-1'],
    });
    vi.mocked(mockRepoRemovePerms).mockResolvedValue(['perm-1']);

    await removePermissionsFromRole('app-uuid-1', 'role-uuid-1', ['perm-1'], 'admin-1');

    expect(mockRepoRemovePerms).toHaveBeenCalledWith('app-uuid-1', 'role-uuid-1', ['perm-1']);
    expect(mockRevokeAuthority).toHaveBeenCalledWith([]);
    expect(mockTransactionalAudit).toHaveBeenCalled();
  });

  it('should do nothing when permissionIds is empty', async () => {
    await removePermissionsFromRole('app-uuid-1', 'role-uuid-1', []);

    expect(mockRepoRemovePerms).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission()],
      assignedPermissionIds: ['perm-1'],
    });
    vi.mocked(mockRepoRemovePerms).mockResolvedValue(['perm-1']);

    await removePermissionsFromRole('app-uuid-1', 'role-uuid-1', ['perm-1']);

    expect(mockTransactionalAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'role.permissions.removed' }),
    );
  });

  it('should return false without revocation when no requested mapping exists', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission()],
      assignedPermissionIds: [],
    });

    await expect(
      removePermissionsFromRole('app-uuid-1', 'role-uuid-1', ['perm-1'], 'admin-1'),
    ).resolves.toEqual({ reauthenticationRequired: false });
    expect(mockRevokeAuthority).not.toHaveBeenCalled();
    expect(mockRepoRemovePerms).not.toHaveBeenCalled();
  });

  it('rejects removing a canonical permission through an ordinary Admin role', async () => {
    vi.mocked(mockGetApplicationBySlug).mockResolvedValue(createAdminApplication());
    vi.mocked(mockLockTargets).mockResolvedValue({
      role: createTestRole(),
      permissions: [createTestPermission({ slug: 'admin:user:read' })],
      assignedPermissionIds: ['perm-1'],
    });

    await expect(
      removePermissionsFromRole('app-uuid-1', 'role-uuid-1', ['perm-1']),
    ).rejects.toThrow(RbacValidationError);
    expect(mockRevokeAuthority).not.toHaveBeenCalled();
    expect(mockRepoRemovePerms).not.toHaveBeenCalled();
  });
});

describe('getPermissionsForRole', () => {
  it('should delegate to mapping repository', async () => {
    vi.mocked(mockRepoGetPerms).mockResolvedValue([]);
    vi.mocked(mockRepoFindById).mockResolvedValue(createTestRole());

    const result = await getPermissionsForRole('app-uuid-1', 'role-uuid-1');

    expect(result).toEqual([]);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('app-uuid-1', 'role-uuid-1');
  });
});
