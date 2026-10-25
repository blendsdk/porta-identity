/**
 * Implementation tests for tenant user service transactions.
 *
 * These tests pin the service-owned transaction boundary, target audit
 * attribution, duplicate-email mapping, and post-commit cache behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/users/repository.js', () => ({
  insertUser: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  getPasswordHash: vi.fn(),
  updateUser: vi.fn(),
  listUsers: vi.fn(),
  listUsersCursor: vi.fn(),
  emailExists: vi.fn(),
  updateLoginStats: vi.fn(),
}));

vi.mock('../../../src/users/cache.js', () => ({
  getCachedUserById: vi.fn(),
  cacheUser: vi.fn(),
  invalidateUserCache: vi.fn(),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verifyPassword: vi.fn(),
  ensureDummyPasswordHash: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn().mockResolvedValue(undefined),
  auditActorColumns: (actor: {
    kind: 'user' | 'service' | 'system';
    userId?: string;
    clientId?: string;
    clientName?: string;
  }) =>
    actor.kind === 'service'
      ? {
          actorId: undefined,
          actorType: 'client',
          actorClientId: actor.clientId,
          actorClientName: actor.clientName,
        }
      : actor.kind === 'user'
        ? {
            actorId: actor.userId,
            actorType: 'user',
            actorClientId: null,
            actorClientName: null,
          }
        : {
            actorId: undefined,
            actorType: 'system',
            actorClientId: null,
            actorClientName: null,
          },
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
  getDatabaseTransactionClient: () => ({ query: vi.fn() }),
  runDatabaseTransaction: async (work: () => Promise<unknown>) => work(),
  afterDatabaseCommit: async (effect: () => Promise<void>) => effect(),
}));

import * as repo from '../../../src/users/repository.js';
import * as cache from '../../../src/users/cache.js';
import { writeAuditLogInTransaction } from '../../../src/lib/audit-log.js';
import { createUser, updateUser } from '../../../src/users/service.js';
import {
  UserEmailConflictError,
  UserNotFoundError,
} from '../../../src/users/errors.js';
import type { User } from '../../../src/users/types.js';

function testUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'user@example.test',
    emailVerified: false,
    hasPassword: false,
    passwordChangedAt: null,
    givenName: 'Test',
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
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  (repo.insertUser as ReturnType<typeof vi.fn>).mockResolvedValue(testUser());
  (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(testUser({ givenName: 'Updated' }));
});

describe('tenant user service implementation', () => {
  it('writes the created target user and request metadata through the transaction writer', async () => {
    await createUser(
      { organizationId: 'org-1', email: 'user@example.test', emailVerified: true },
      { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
      { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
    );

    expect(writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        actorType: 'client',
        actorClientId: 'bff-client',
        actorClientName: 'Tenant BFF',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        eventType: 'user.created',
      }),
    );
    expect(cache.cacheUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
  });

  it('does not cache or return a created user when the durable audit write fails', async () => {
    (writeAuditLogInTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('audit unavailable'),
    );

    await expect(
      createUser(
        { organizationId: 'org-1', email: 'user@example.test' },
        { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
      ),
    ).rejects.toThrow('audit unavailable');

    expect(cache.cacheUser).not.toHaveBeenCalled();
  });

  it('maps a duplicate email check to the typed conflict before insert', async () => {
    (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      createUser({ organizationId: 'org-1', email: 'user@example.test' }),
    ).rejects.toBeInstanceOf(UserEmailConflictError);
    expect(repo.insertUser).not.toHaveBeenCalled();
  });

  it('maps a concurrent create unique violation to the typed email conflict', async () => {
    (repo.insertUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(
      createUser({ organizationId: 'org-1', email: 'user@example.test' }),
    ).rejects.toBeInstanceOf(UserEmailConflictError);
  });

  it('maps a concurrent update unique violation to the typed email conflict', async () => {
    (repo.updateUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(
      updateUser('user-1', { givenName: 'Updated' }),
    ).rejects.toBeInstanceOf(UserEmailConflictError);
    expect(cache.cacheUser).not.toHaveBeenCalled();
  });

  it('records explicit verification assertions in the update audit metadata', async () => {
    await updateUser(
      'user-1',
      { emailVerified: true, phoneNumberVerified: false },
      { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
    );

    expect(writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'user.updated',
        metadata: expect.objectContaining({
          emailVerified: true,
          phoneNumberVerified: false,
        }),
      }),
    );
  });

  it('keeps the user-not-found mapping for an update', async () => {
    (repo.updateUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('User not found'),
    );

    await expect(updateUser('missing', { givenName: 'Updated' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});
