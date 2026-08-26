import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../../src/users/types.js';

vi.mock('../../../src/users/service.js', () => ({ getUserById: vi.fn() }));

import { requireUserOrganization } from '../../../src/middleware/require-user-organization.js';
import { getUserById } from '../../../src/users/service.js';

const organizationId = '10000000-0000-4000-8000-000000000001';
const foreignOrganizationId = '20000000-0000-4000-8000-000000000002';
const userId = '30000000-0000-4000-8000-000000000003';

/** Creates the user fields needed by the organization guard. */
function userIn(ownedOrganizationId: string): User {
  return {
    id: userId,
    organizationId: ownedOrganizationId,
    email: 'tenant-user@example.test',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'Tenant',
    familyName: 'User',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: null,
    phoneNumber: null,
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Creates a minimal Koa-compatible context without exposing response internals. */
function context(params: Record<string, string>): {
  params: Record<string, string>;
  status: number;
  body: unknown;
} {
  return { params, status: 200, body: undefined };
}

describe('requireUserOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should continue when the user belongs to the organization path', async () => {
    vi.mocked(getUserById).mockResolvedValue(userIn(organizationId));
    const next = vi.fn();
    const ctx = context({ orgId: organizationId, userId });

    await requireUserOrganization()(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.status).toBe(200);
  });

  it('should return the same 404 for a missing or foreign user', async () => {
    for (const user of [null, userIn(foreignOrganizationId)]) {
      vi.mocked(getUserById).mockResolvedValueOnce(user);
      const next = vi.fn();
      const ctx = context({ orgId: organizationId, userId });

      await requireUserOrganization()(ctx as never, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.status).toBe(404);
      expect(ctx.body).toEqual({ error: 'User not found' });
    }
  });

  it('should reject malformed path identifiers without querying user storage', async () => {
    const next = vi.fn();
    const ctx = context({ orgId: 'not-a-uuid', userId });

    await requireUserOrganization()(ctx as never, next);

    expect(getUserById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(404);
  });

  it('should propagate storage failures without converting them to authorization success', async () => {
    vi.mocked(getUserById).mockRejectedValue(new Error('storage unavailable'));
    const next = vi.fn();
    const ctx = context({ orgId: organizationId, userId });

    await expect(requireUserOrganization()(ctx as never, next)).rejects.toThrow(
      'storage unavailable',
    );
    expect(next).not.toHaveBeenCalled();
  });
});
