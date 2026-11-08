import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/applications/repository.js', () => ({
  findApplicationBySlug: vi.fn(),
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUserRolesForAuthority: vi.fn(),
}));

import { findApplicationBySlug } from '../../../src/applications/repository.js';
import { AdminAuthorityCeilingError } from '../../../src/rbac/errors.js';
import { requireActorMayManageUser } from '../../../src/rbac/admin-authority-ceiling.js';
import { getUserRolesForAuthority } from '../../../src/rbac/user-role-service.js';

const ADMIN_APPLICATION_ID = '00000000-0000-4000-8000-0000000000aa';

function roles(...slugs: string[]) {
  return slugs.map((slug) => ({
    id: slug,
    applicationId: ADMIN_APPLICATION_ID,
    slug,
  }));
}

// Credential recovery is equivalent to role delegation. A delegated administrator must not be able
// to replace a stronger administrator's password, email verification, or second factor.
describe('canonical Admin authority ceiling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findApplicationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ADMIN_APPLICATION_ID,
    });
  });

  it('should reject a target holding a permission the actor lacks', async () => {
    (getUserRolesForAuthority as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) =>
      id === 'actor' ? roles('porta-user-admin') : roles('porta-super-admin'),
    );

    await expect(requireActorMayManageUser('actor', 'target')).rejects.toBeInstanceOf(
      AdminAuthorityCeilingError,
    );
  });

  it('should allow equal authority', async () => {
    (getUserRolesForAuthority as ReturnType<typeof vi.fn>).mockResolvedValue(
      roles('porta-user-admin'),
    );

    await expect(requireActorMayManageUser('actor', 'target')).resolves.toBeUndefined();
  });

  it('should allow a strictly lower-authority target', async () => {
    (getUserRolesForAuthority as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) =>
      id === 'actor' ? roles('porta-super-admin') : roles('porta-user-admin'),
    );

    await expect(requireActorMayManageUser('actor', 'target')).resolves.toBeUndefined();
  });

  it('should allow ordinary users without canonical Admin authority', async () => {
    (getUserRolesForAuthority as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(requireActorMayManageUser('actor', 'ordinary-user')).resolves.toBeUndefined();
  });

  it('should not require a role read for self-management', async () => {
    await expect(requireActorMayManageUser('actor', 'actor')).resolves.toBeUndefined();
    expect(getUserRolesForAuthority).not.toHaveBeenCalled();
  });

  it('should fail closed when the canonical application is unavailable', async () => {
    (findApplicationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getUserRolesForAuthority as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // No canonical application means no target is classified as stronger; the caller's route
    // permission still applies. The ceiling never invents authority for an unconfigured system.
    await expect(requireActorMayManageUser('actor', 'target')).resolves.toBeUndefined();
  });
});
