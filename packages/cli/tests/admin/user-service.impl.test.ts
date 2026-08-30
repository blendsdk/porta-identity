/** Focused implementation tests for the validated user administration boundary. */

import { describe, expect, it, vi } from 'vitest';
import { createAdminUserOperations } from '../../src/admin/user-service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '33333333-3333-4333-8333-333333333333';

/** Builds the complete SDK-shaped user needed by projection validators. */
function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: userId,
    organizationId,
    email: 'person@example.test',
    emailVerified: false,
    hasPassword: false,
    passwordChangedAt: null,
    givenName: 'Ada',
    familyName: 'Lovelace',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: 'en',
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
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Supplies every SDK operation while allowing focused overrides. */
function domain(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(),
    get: vi.fn(),
    getHistory: vi.fn(),
    invitePreview: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: vi.fn(),
    clearPassword: vi.fn(),
    verifyEmail: vi.fn(),
    suspend: vi.fn(),
    unsuspend: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    purge: vi.fn(),
    ...overrides,
  };
}

describe('admin user service implementation', () => {
  it('retains the ETag outside the frozen detail projection', async () => {
    const operations = createAdminUserOperations(() =>
      domain({ get: vi.fn().mockResolvedValue({ data: user(), etag: '"revision-1"' }) }),
    );

    const result = await operations.get(organizationId, userId);

    expect(result).toMatchObject({ kind: 'success', value: { etag: '"revision-1"' } });
    expect(result.kind === 'success' && Object.isFrozen(result.value.detail)).toBe(true);
    expect(result.kind === 'success' && 'etag' in result.value.detail).toBe(false);
  });

  it('rejects a complete page when one row is malformed', async () => {
    const operations = createAdminUserOperations(() =>
      domain({
        list: vi.fn().mockResolvedValue({
          data: [user(), user({ id: 'invalid', email: 'unsafe\u0000@example.test' })],
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
      }),
    );

    await expect(operations.list(organizationId, { page: 1 })).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('does not retain secret or non-allowlisted response fields', async () => {
    const operations = createAdminUserOperations(() =>
      domain({
        get: vi.fn().mockResolvedValue({
          data: user({ passwordHash: 'secret-hash', recoveryCodes: ['secret-code'] }),
          etag: null,
        }),
      }),
    );

    const result = await operations.get(organizationId, userId);

    expect(result.kind).toBe('success');
    expect(JSON.stringify(result)).not.toMatch(/secret|passwordHash|recoveryCodes/);
  });

  it('obtains a fresh domain for each validated operation only', async () => {
    const list = vi
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    const provider = vi.fn(() => domain({ list }));
    const operations = createAdminUserOperations(provider);

    await operations.list(organizationId, { page: 0 });
    await operations.list(organizationId, { page: 1 });

    expect(provider).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledOnce();
  });

  it('projects exact mutation payloads despite runtime extra properties', async () => {
    const create = vi.fn().mockResolvedValue(user());
    const invite = vi.fn().mockResolvedValue({
      userId,
      email: 'person@example.test',
      created: true,
      invitationSent: true,
      expiresAt: '2026-08-31T10:00:00.000Z',
    });
    const invitePreview = vi
      .fn()
      .mockResolvedValue({ subject: 'Welcome', text: 'Hello', html: '<b>Hello</b>' });
    const update = vi.fn().mockResolvedValue(user({ givenName: 'Updated' }));
    const operations = createAdminUserOperations(() =>
      domain({ create, invite, invitePreview, update }),
    );
    const hostileCreate = {
      email: 'person@example.test',
      organizationId: '22222222-2222-4222-8222-222222222222',
      roles: [{ applicationId: 'app', roleId: 'admin' }],
    };
    const hostileInvite = {
      email: 'person@example.test',
      organizationId: '22222222-2222-4222-8222-222222222222',
      roles: [{ applicationId: 'app', roleId: 'admin' }],
      claims: [{ applicationId: 'app', claimDefinitionId: 'admin', value: true }],
    };
    const hostileUpdate = {
      givenName: 'Updated',
      email: 'changed@example.test',
      organizationId: '22222222-2222-4222-8222-222222222222',
      address: { country: 'GB', internal: 'drop-me' },
    };

    await operations.create(organizationId, hostileCreate);
    await operations.invite(organizationId, hostileInvite);
    await operations.previewInvitation(organizationId, hostileInvite);
    await operations.update(organizationId, userId, hostileUpdate);

    expect(create).toHaveBeenCalledWith({ organizationId, email: 'person@example.test' });
    expect(invite).toHaveBeenCalledWith({ organizationId, email: 'person@example.test' });
    expect(invitePreview).toHaveBeenCalledWith({ organizationId, email: 'person@example.test' });
    expect(update).toHaveBeenCalledWith(
      organizationId,
      userId,
      { givenName: 'Updated', address: { country: 'GB' } },
      undefined,
    );
  });

  it('rejects same-organization responses for a different requested user', async () => {
    const otherUserId = '55555555-5555-4555-8555-555555555555';
    const get = vi.fn().mockResolvedValue({ data: user({ id: otherUserId }), etag: null });
    const update = vi.fn().mockResolvedValue(user({ id: otherUserId }));
    const operations = createAdminUserOperations(() => domain({ get, update }));

    await expect(operations.get(organizationId, userId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
    await expect(
      operations.update(organizationId, userId, { givenName: 'Updated' }),
    ).resolves.toEqual({ kind: 'outcome-unknown' });
  });

  it.each([
    ['control-bearing timestamp', '2026-08-01T10:00:00.000Z\n'],
    ['impossible calendar date', '2026-02-31T10:00:00.000Z'],
    ['non-ISO date', 'August 1, 2026 10:00:00 UTC'],
  ])('rejects a %s from a remote detail response', async (_label, updatedAt) => {
    const operations = createAdminUserOperations(() =>
      domain({ get: vi.fn().mockResolvedValue({ data: user({ updatedAt }), etag: null }) }),
    );

    await expect(operations.get(organizationId, userId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('rejects unsafe integer response fields', async () => {
    const operations = createAdminUserOperations(() =>
      domain({
        list: vi.fn().mockResolvedValue({
          data: [],
          total: Number.MAX_SAFE_INTEGER + 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
      }),
    );

    await expect(operations.list(organizationId, { page: 1 })).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });
});
