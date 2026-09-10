/**
 * Unit tests for permission service.
 *
 * Tests business logic: slug format validation, uniqueness checks,
 * lifecycle validation and audit logging.
 * All dependencies (repository, cache, audit) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('../../../src/rbac/permission-repository.js', () => ({
  insertPermission: vi.fn(),
  findPermissionById: vi.fn(),
  lockPermissionById: vi.fn(),
  lockPermissionModule: vi.fn(),
  findPermissionBySlug: vi.fn(),
  updatePermission: vi.fn(),
  capturePermissionForDeletion: vi.fn(),
  deleteCapturedPermission: vi.fn(),
  listPermissionsByApplication: vi.fn(),
  permissionSlugExists: vi.fn(),
}));

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  getRolesWithPermission: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  invalidateAllUserRbacCaches: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getDatabaseTransactionClient: vi.fn(),
}));

vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerDeletionCleanup: vi.fn(),
}));

vi.mock('../../../src/lib/authority-revocation.js', () => ({
  revokeAffectedAuthorityInTransaction: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: vi.fn(),
}));

import {
  insertPermission as mockInsert,
  findPermissionById as mockRepoFindById,
  lockPermissionById as mockLockPermission,
  findPermissionBySlug as mockRepoFindBySlug,
  updatePermission as mockRepoUpdate,
  listPermissionsByApplication as mockRepoList,
  permissionSlugExists as mockSlugExists,
} from '../../../src/rbac/permission-repository.js';
import { getRolesWithPermission as mockRepoGetRoles } from '../../../src/rbac/mapping-repository.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';
import { getDatabaseTransactionClient } from '../../../src/lib/database.js';
import { getApplicationBySlug as mockGetApplicationBySlug } from '../../../src/applications/service.js';

import {
  createPermission,
  findPermissionById,
  findPermissionBySlug,
  updatePermission,
  listPermissionsByApplication,
  getRolesWithPermission,
} from '../../../src/rbac/permission-service.js';
import { PermissionNotFoundError, RbacValidationError } from '../../../src/rbac/errors.js';
import type { Permission } from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestPermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-uuid-1',
    applicationId: 'app-uuid-1',
    moduleId: 'mod-uuid-1',
    name: 'Read Contacts',
    slug: 'crm:contacts:read',
    description: 'View contact records',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values
  vi.mocked(mockSlugExists).mockResolvedValue(false);
  vi.mocked(mockAuditLog).mockResolvedValue(undefined);
  vi.mocked(getDatabaseTransactionClient).mockReturnValue({ query: vi.fn() } as never);
  vi.mocked(mockGetApplicationBySlug).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPermission', () => {
  it('should preserve a free-form permission claim value after trimming it', async () => {
    const permission = createTestPermission({ slug: 'CAN_ADD_ORDER' });
    vi.mocked(mockInsert).mockResolvedValue(permission);

    const result = await createPermission({
      applicationId: 'app-uuid-1',
      name: 'Read Contacts',
      slug: '  CAN_ADD_ORDER  ',
    });

    expect(result).toEqual(permission);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ slug: 'CAN_ADD_ORDER' }));
  });

  it('should throw RbacValidationError for a whitespace-only slug', async () => {
    await expect(
      createPermission({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: '   ',
      }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should throw RbacValidationError for a slug containing control characters', async () => {
    await expect(
      createPermission({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: 'CAN\nREAD',
      }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should throw RbacValidationError for duplicate slug', async () => {
    vi.mocked(mockSlugExists).mockResolvedValue(true);

    await expect(
      createPermission({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: 'crm:contacts:read',
      }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should write audit log on creation', async () => {
    const permission = createTestPermission();
    vi.mocked(mockInsert).mockResolvedValue(permission);

    await createPermission(
      { applicationId: 'app-uuid-1', name: 'Read Contacts', slug: 'crm:contacts:read' },
      'admin-1',
    );

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'permission.created',
        eventCategory: 'admin',
        actorId: 'admin-1',
      }),
    );
  });
});

describe('findPermissionById', () => {
  it('should delegate to repository', async () => {
    const perm = createTestPermission();
    vi.mocked(mockRepoFindById).mockResolvedValue(perm);

    const result = await findPermissionById('app-uuid-1', 'perm-uuid-1');

    expect(result).toEqual(perm);
  });
});

describe('findPermissionBySlug', () => {
  it('should delegate to repository', async () => {
    const perm = createTestPermission();
    vi.mocked(mockRepoFindBySlug).mockResolvedValue(perm);

    const result = await findPermissionBySlug('app-1', 'crm:contacts:read');

    expect(result).toEqual(perm);
  });
});

describe('updatePermission', () => {
  it('should update name and description', async () => {
    const existing = createTestPermission();
    const updated = createTestPermission({ name: 'Updated Name' });
    vi.mocked(mockLockPermission).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    const result = await updatePermission('app-uuid-1', 'perm-uuid-1', {
      name: 'Updated Name',
    });

    expect(result.name).toBe('Updated Name');
  });

  it('should throw PermissionNotFoundError when permission does not exist', async () => {
    vi.mocked(mockLockPermission).mockResolvedValue(null);

    await expect(updatePermission('app-uuid-1', 'non-existent', { name: 'X' })).rejects.toThrow(
      PermissionNotFoundError,
    );
  });

  it('should write audit log on update', async () => {
    const existing = createTestPermission();
    vi.mocked(mockLockPermission).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(existing);

    await updatePermission('app-uuid-1', 'perm-uuid-1', { name: 'Updated' }, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'permission.updated', actorId: 'admin-1' }),
    );
  });

  it('should return an unchanged permission without update or audit work', async () => {
    const existing = createTestPermission();
    vi.mocked(mockLockPermission).mockResolvedValue(existing);

    await expect(
      updatePermission('app-uuid-1', 'perm-uuid-1', { name: existing.name }),
    ).resolves.toEqual(existing);
    expect(mockRepoUpdate).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

describe('listPermissionsByApplication', () => {
  it('should delegate to repository', async () => {
    const perms = [createTestPermission()];
    vi.mocked(mockRepoList).mockResolvedValue(perms);

    const result = await listPermissionsByApplication('app-1');

    expect(result).toEqual(perms);
  });

  it('should pass moduleId filter to repository', async () => {
    vi.mocked(mockRepoList).mockResolvedValue([]);

    await listPermissionsByApplication('app-1', 'mod-1');

    expect(mockRepoList).toHaveBeenCalledWith('app-1', 'mod-1');
  });
});

describe('getRolesWithPermission', () => {
  it('should delegate to mapping repository', async () => {
    vi.mocked(mockRepoGetRoles).mockResolvedValue([]);
    vi.mocked(mockRepoFindById).mockResolvedValue(createTestPermission());

    const result = await getRolesWithPermission('app-uuid-1', 'perm-1');

    expect(result).toEqual([]);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('app-uuid-1', 'perm-1');
  });
});
