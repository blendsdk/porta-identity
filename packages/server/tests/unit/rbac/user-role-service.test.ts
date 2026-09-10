/**
 * Unit tests for user-role service.
 *
 * Tests user role assignment, database-backed claims building,
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
  getRolesForOrganizationUser: vi.fn(),
  getPermissionsForOrganizationUser: vi.fn(),
  lockUserRoleTargets: vi.fn(),
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
}));

vi.mock('../../../src/lib/authority-revocation.js', () => ({
  revokeAffectedAuthorityInTransaction: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: vi.fn(),
}));

vi.mock('../../../src/users/repository.js', () => ({
  lockControlPlaneOrganization: vi.fn(),
  requireActiveSuperAdminSurvivor: vi.fn(),
}));

import {
  assignRolesToUser as mockRepoAssign,
  removeRolesFromUser as mockRepoRemove,
  getRolesForUser as mockRepoGetRoles,
  getPermissionsForUser as mockRepoGetPerms,
  getUsersWithRole as mockRepoGetUsers,
  getRolesForOrganizationUser as mockGetOrganizationRoles,
  getPermissionsForOrganizationUser as mockGetOrganizationPermissions,
  lockUserRoleTargets as mockLockTargets,
} from '../../../src/rbac/mapping-repository.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';
import { writeAuditLogInTransaction as mockTransactionalAudit } from '../../../src/lib/audit-log.js';
import { getDatabaseTransactionClient } from '../../../src/lib/database.js';
import { registerAuthorityCleanup as mockAuthorityCleanup } from '../../../src/lib/deletion-cleanup.js';
import { revokeAffectedAuthorityInTransaction as mockRevokeAuthority } from '../../../src/lib/authority-revocation.js';
import { getApplicationBySlug as mockGetApplicationBySlug } from '../../../src/applications/service.js';
import {
  lockControlPlaneOrganization as mockLockControlPlaneOrganization,
  requireActiveSuperAdminSurvivor as mockRequireSurvivor,
} from '../../../src/users/repository.js';
import { ADMIN_ROLE_DEFINITIONS } from '../../../src/lib/admin-permissions.js';

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

const APPLICATION_ID = 'app-uuid-1';

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
  vi.mocked(mockRepoAssign).mockResolvedValue(['role-uuid-1']);
  vi.mocked(mockRepoRemove).mockResolvedValue(['role-uuid-1']);
  vi.mocked(mockAuditLog).mockResolvedValue(undefined);
  vi.mocked(mockTransactionalAudit).mockResolvedValue(undefined);
  vi.mocked(getDatabaseTransactionClient).mockReturnValue({ query: vi.fn() } as never);
  vi.mocked(mockAuthorityCleanup).mockResolvedValue(undefined);
  vi.mocked(mockRevokeAuthority).mockResolvedValue({ grantIds: [] });
  vi.mocked(mockGetApplicationBySlug).mockResolvedValue(null);
  vi.mocked(mockLockControlPlaneOrganization).mockResolvedValue(false);
  vi.mocked(mockRequireSurvivor).mockResolvedValue(undefined);
  vi.mocked(mockLockTargets).mockResolvedValue({
    user: { id: 'user-1', status: 'active' },
    roles: [createTestRole()],
    assignedRoleIds: ['role-uuid-1'],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assignRolesToUser', () => {
  it('should assign roles and schedule targeted cache cleanup', async () => {
    const roles = [createTestRole({ id: 'role-1' }), createTestRole({ id: 'role-2' })];
    vi.mocked(mockLockTargets).mockResolvedValue({
      user: { id: 'user-1', status: 'active' },
      roles,
      assignedRoleIds: [],
    });
    vi.mocked(mockRepoAssign).mockResolvedValue(['role-1', 'role-2']);
    await assignRolesToUser('org-1', 'user-1', ['role-1', 'role-2'], 'admin-1');

    expect(mockRepoAssign).toHaveBeenCalledWith('org-1', 'user-1', ['role-1', 'role-2'], 'admin-1');
    expect(mockAuthorityCleanup).toHaveBeenCalledWith({
      userIds: ['user-1'],
      grantIds: [],
      roleIds: [],
      revokeOidcState: false,
    });
  });

  it('should do nothing when roleIds is empty', async () => {
    await assignRolesToUser('org-1', 'user-1', [], 'admin-1');

    expect(mockRepoAssign).not.toHaveBeenCalled();
    expect(mockAuthorityCleanup).not.toHaveBeenCalled();
  });

  it('should write audit log with userId and actorId', async () => {
    await assignRolesToUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.roles.assigned',
        eventCategory: 'admin',
        userId: 'user-1',
        actorId: 'admin-1',
      }),
    );
  });

  it('should not schedule cleanup or audit for an existing assignment', async () => {
    vi.mocked(mockRepoAssign).mockResolvedValue([]);

    await assignRolesToUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockAuthorityCleanup).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

describe('removeRolesFromUser', () => {
  it('locks the control-plane organization before the target user and roles', async () => {
    await removeRolesFromUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockLockControlPlaneOrganization).toHaveBeenCalledWith('org-1');
    expect(mockLockControlPlaneOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mockLockTargets.mock.invocationCallOrder[0]!,
    );
  });

  it('should remove roles and revoke only the affected user', async () => {
    await removeRolesFromUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockRevokeAuthority).toHaveBeenCalledWith(['user-1']);
    expect(mockRepoRemove).toHaveBeenCalledWith('org-1', 'user-1', ['role-uuid-1']);
    expect(mockAuthorityCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['user-1'], revokeOidcState: true }),
    );
  });

  it('should do nothing when roleIds is empty', async () => {
    await removeRolesFromUser('org-1', 'user-1', [], 'admin-1');

    expect(mockRepoRemove).not.toHaveBeenCalled();
    expect(mockAuthorityCleanup).not.toHaveBeenCalled();
  });

  it('should write audit log', async () => {
    await removeRolesFromUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockTransactionalAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'user.roles.removed',
        userId: 'user-1',
        actorId: 'admin-1',
      }),
    );
  });

  it('should return false without revocation when no requested assignment exists', async () => {
    vi.mocked(mockLockTargets).mockResolvedValue({
      user: { id: 'user-1', status: 'active' },
      roles: [createTestRole()],
      assignedRoleIds: [],
    });

    await expect(
      removeRolesFromUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1'),
    ).resolves.toEqual({ reauthenticationRequired: false });
    expect(mockRevokeAuthority).not.toHaveBeenCalled();
    expect(mockRepoRemove).not.toHaveBeenCalled();
  });

  it('checks the shared survivor guard before removing an active canonical super admin', async () => {
    vi.mocked(mockGetApplicationBySlug).mockResolvedValue({
      id: 'admin-app',
      slug: 'porta-admin',
    } as never);
    vi.mocked(mockLockTargets).mockResolvedValue({
      user: { id: 'user-1', status: 'active' },
      roles: [
        createTestRole({
          applicationId: 'admin-app',
          slug: ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug,
        }),
      ],
      assignedRoleIds: ['role-uuid-1'],
    });

    await removeRolesFromUser('org-1', 'user-1', ['role-uuid-1'], 'admin-1');

    expect(mockRequireSurvivor).toHaveBeenCalledWith('org-1', 'user-1');
    expect(mockRequireSurvivor.mock.invocationCallOrder[0]).toBeLessThan(
      mockRevokeAuthority.mock.invocationCallOrder[0]!,
    );
  });
});

describe('getUserRoles', () => {
  it('should delegate to mapping repository', async () => {
    const roles = [createTestRole()];
    vi.mocked(mockGetOrganizationRoles).mockResolvedValue(roles);

    const result = await getUserRoles('org-1', 'user-1');

    expect(result).toEqual(roles);
    expect(mockGetOrganizationRoles).toHaveBeenCalledWith('org-1', 'user-1');
  });
});

describe('getUserPermissions', () => {
  it('should delegate to mapping repository', async () => {
    const perms = [createTestPermission()];
    vi.mocked(mockGetOrganizationPermissions).mockResolvedValue(perms);

    const result = await getUserPermissions('org-1', 'user-1');

    expect(result).toEqual(perms);
    expect(mockGetOrganizationPermissions).toHaveBeenCalledWith('org-1', 'user-1');
  });
});

describe('getUsersWithRole', () => {
  it('should delegate to mapping repository with default pagination', async () => {
    vi.mocked(mockRepoGetUsers).mockResolvedValue({ rows: [], total: 0 });

    await getUsersWithRole('app-1', 'role-1', 'org-1');

    expect(mockRepoGetUsers).toHaveBeenCalledWith('app-1', 'role-1', 'org-1', 1, 20);
  });

  it('should pass custom pagination options', async () => {
    vi.mocked(mockRepoGetUsers).mockResolvedValue({ rows: [], total: 0 });

    await getUsersWithRole('app-1', 'role-1', 'org-1', { page: 3, pageSize: 50 });

    expect(mockRepoGetUsers).toHaveBeenCalledWith('app-1', 'role-1', 'org-1', 3, 50);
  });
});

// ===========================================================================
// Token claims building (hot path)
// ===========================================================================

describe('buildRoleClaims', () => {
  it('should return role slugs from PostgreSQL', async () => {
    vi.mocked(mockRepoGetRoles).mockResolvedValue([
      createTestRole({ slug: 'admin' }),
      createTestRole({ slug: 'editor' }),
    ]);

    const result = await buildRoleClaims('user-1', APPLICATION_ID);

    expect(result).toEqual(['admin', 'editor']);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('user-1', APPLICATION_ID);
  });

  it('should return empty array when user has no roles', async () => {
    vi.mocked(mockRepoGetRoles).mockResolvedValue([]);

    const result = await buildRoleClaims('user-1', APPLICATION_ID);

    expect(result).toEqual([]);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('user-1', APPLICATION_ID);
  });
});

describe('buildPermissionClaims', () => {
  it('should return permission slugs from PostgreSQL', async () => {
    vi.mocked(mockRepoGetPerms).mockResolvedValue([
      createTestPermission({ slug: 'crm:contacts:read' }),
      createTestPermission({ slug: 'crm:deals:write' }),
    ]);

    const result = await buildPermissionClaims('user-1', APPLICATION_ID);

    expect(result).toEqual(['crm:contacts:read', 'crm:deals:write']);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('user-1', APPLICATION_ID);
  });

  it('should return empty array when user has no permissions', async () => {
    vi.mocked(mockRepoGetPerms).mockResolvedValue([]);

    const result = await buildPermissionClaims('user-1', APPLICATION_ID);

    expect(result).toEqual([]);
    expect(mockRepoGetPerms).toHaveBeenCalledWith('user-1', APPLICATION_ID);
  });
});
