/** Specification tests for the canonical Admin role delegation ceiling. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  getApplicationBySlug: vi.fn(),
  findRoleById: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: dependencies.getApplicationBySlug,
}));

vi.mock('../../../src/rbac/role-service.js', () => ({
  findRoleById: dependencies.findRoleById,
}));

import { getPermissionsForAdminRole } from '../../../src/lib/admin-permissions.js';
import { requireCanonicalRoleDelegation } from '../../../src/rbac/admin-role-delegation.js';
import { RoleDelegationError } from '../../../src/rbac/errors.js';

const ADMIN_APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_APPLICATION_ID = '33333333-3333-4333-8333-333333333333';

/** Returns one canonical role projection used by the shared delegation check. */
function canonicalRole(slug = 'porta-super-admin') {
  return {
    id: ROLE_ID,
    applicationId: ADMIN_APPLICATION_ID,
    name: slug,
    slug,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.getApplicationBySlug.mockResolvedValue({ id: ADMIN_APPLICATION_ID });
  dependencies.findRoleById.mockResolvedValue(canonicalRole());
});

describe('canonical Admin role delegation', () => {
  it('rejects a canonical super-admin role from an actor with only invitation authority', async () => {
    await expect(
      requireCanonicalRoleDelegation([ROLE_ID], new Set(['admin:user:invite'])),
    ).rejects.toBeInstanceOf(RoleDelegationError);
  });

  it('allows a canonical role when the actor already holds every permission it grants', async () => {
    const permissions = new Set(getPermissionsForAdminRole('porta-super-admin'));

    await expect(requireCanonicalRoleDelegation([ROLE_ID], permissions)).resolves.toBeUndefined();
  });

  it('ignores an ordinary application role that is not a canonical Admin role', async () => {
    dependencies.findRoleById.mockResolvedValue({
      ...canonicalRole('ordinary-role'),
      applicationId: OTHER_APPLICATION_ID,
    });

    await expect(
      requireCanonicalRoleDelegation([ROLE_ID], new Set(['admin:user:invite'])),
    ).resolves.toBeUndefined();
  });

  it('deduplicates repeated role identifiers before reading canonical authority', async () => {
    dependencies.findRoleById.mockResolvedValue(null);

    await requireCanonicalRoleDelegation([ROLE_ID, ROLE_ID], new Set());

    expect(dependencies.findRoleById).toHaveBeenCalledOnce();
  });

  it('does nothing when the canonical application is not present', async () => {
    dependencies.getApplicationBySlug.mockResolvedValue(null);

    await expect(requireCanonicalRoleDelegation([ROLE_ID], new Set())).resolves.toBeUndefined();
    expect(dependencies.findRoleById).not.toHaveBeenCalled();
  });
});
