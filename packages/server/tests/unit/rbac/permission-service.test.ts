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
  findPermissionBySlug: vi.fn(),
  updatePermission: vi.fn(),
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
}));

import {
  insertPermission as mockInsert,
  findPermissionById as mockRepoFindById,
  findPermissionBySlug as mockRepoFindBySlug,
  updatePermission as mockRepoUpdate,
  listPermissionsByApplication as mockRepoList,
  permissionSlugExists as mockSlugExists,
} from '../../../src/rbac/permission-repository.js';
import { getRolesWithPermission as mockRepoGetRoles } from '../../../src/rbac/mapping-repository.js';
import { writeAuditLog as mockAuditLog } from '../../../src/lib/audit-log.js';

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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPermission', () => {
  it('should create a permission with valid slug format', async () => {
    const permission = createTestPermission();
    vi.mocked(mockInsert).mockResolvedValue(permission);

    const result = await createPermission({
      applicationId: 'app-uuid-1',
      name: 'Read Contacts',
      slug: 'crm:contacts:read',
    });

    expect(result).toEqual(permission);
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should throw RbacValidationError for invalid slug format', async () => {
    await expect(
      createPermission({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: 'invalid-slug-no-colons',
      }),
    ).rejects.toThrow(RbacValidationError);
  });

  it('should throw RbacValidationError for slug with only 2 segments', async () => {
    await expect(
      createPermission({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: 'crm:read',
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

    const result = await findPermissionById('perm-uuid-1');

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
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(updated);

    const result = await updatePermission('perm-uuid-1', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });

  it('should throw PermissionNotFoundError when permission does not exist', async () => {
    vi.mocked(mockRepoFindById).mockResolvedValue(null);

    await expect(updatePermission('non-existent', { name: 'X' })).rejects.toThrow(
      PermissionNotFoundError,
    );
  });

  it('should write audit log on update', async () => {
    const existing = createTestPermission();
    vi.mocked(mockRepoFindById).mockResolvedValue(existing);
    vi.mocked(mockRepoUpdate).mockResolvedValue(existing);

    await updatePermission('perm-uuid-1', { name: 'Updated' }, 'admin-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'permission.updated', actorId: 'admin-1' }),
    );
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

    const result = await getRolesWithPermission('perm-1');

    expect(result).toEqual([]);
    expect(mockRepoGetRoles).toHaveBeenCalledWith('perm-1');
  });
});
