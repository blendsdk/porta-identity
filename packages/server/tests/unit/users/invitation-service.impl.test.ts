/**
 * Implementation tests for the invitation acceptance transaction.
 *
 * These cover internals that the specification tests do not: exact statement ordering, rollback on
 * every rejection, and post-commit side effects. External boundaries are mocked so the assertions
 * target our control flow, not PostgreSQL or Redis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/users/cache.js', () => ({
  cacheUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn(),
  hashPassword: vi.fn(),
}));
vi.mock('../../../src/auth/token-repository.js', () => ({
  lockValidInvitationForUpdate: vi.fn(),
  consumeInvitation: vi.fn(),
}));
vi.mock('../../../src/users/repository.js', () => ({
  emailExistsWithClient: vi.fn(),
  insertUserWithClient: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { cacheUser } from '../../../src/users/cache.js';
import { validatePassword, hashPassword } from '../../../src/users/password.js';
import {
  lockValidInvitationForUpdate,
  consumeInvitation,
} from '../../../src/auth/token-repository.js';
import { emailExistsWithClient, insertUserWithClient } from '../../../src/users/repository.js';
import { acceptInvitation } from '../../../src/users/invitation-service.js';
import { UserValidationError } from '../../../src/users/errors.js';
import type { DeferredInvitationTokenRecord } from '../../../src/auth/token-repository.js';
import type { User } from '../../../src/users/types.js';

/** Build a complete user record for mocked repository results. */
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'invitee@test.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'Invited',
    familyName: 'Person',
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
    createdAt: new Date('2026-09-26T00:00:00Z'),
    updatedAt: new Date('2026-09-26T00:00:00Z'),
    ...overrides,
  };
}

/** A locked invitation as returned by the repository. */
function buildInvitation(
  overrides: Partial<DeferredInvitationTokenRecord> = {},
): DeferredInvitationTokenRecord {
  return {
    id: 'invitation-1',
    userId: null,
    tokenHash: 'hash-1',
    expiresAt: new Date('2026-10-03T00:00:00Z'),
    usedAt: null,
    createdAt: new Date('2026-09-26T00:00:00Z'),
    details: null,
    invitedBy: null,
    organizationId: 'org-1',
    email: 'invitee@test.com',
    givenName: 'Invited',
    familyName: 'Person',
    locale: 'en',
    ...overrides,
  };
}

/** Install a mocked transaction connection and capture its statement order. */
function installClient(): { statements: () => string[]; release: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = vi.fn();
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
    connect: vi.fn().mockResolvedValue({ query, release }),
  });
  return { statements: () => query.mock.calls.map((call) => String(call[0])), release };
}

describe('acceptInvitation (implementation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validatePassword).mockReturnValue({ isValid: true });
    vi.mocked(hashPassword).mockResolvedValue('hashed-password');
  });

  it('should reject an invalid password before opening a transaction', async () => {
    vi.mocked(validatePassword).mockReturnValue({ isValid: false, error: 'too weak' });

    await expect(
      acceptInvitation({ tokenHash: 'hash-1', organizationId: 'org-1', password: 'weak' }),
    ).rejects.toThrow(UserValidationError);
    expect(getPool).not.toHaveBeenCalled();
  });

  it('should create the user and consume the invitation inside one committed transaction', async () => {
    vi.mocked(lockValidInvitationForUpdate).mockResolvedValue(buildInvitation());
    vi.mocked(emailExistsWithClient).mockResolvedValue(false);
    vi.mocked(insertUserWithClient).mockResolvedValue(buildUser());
    vi.mocked(consumeInvitation).mockResolvedValue(true);
    const client = installClient();

    const result = await acceptInvitation({
      tokenHash: 'hash-1',
      organizationId: 'org-1',
      password: 'Strong-Password-9!',
    });

    expect(result).toEqual({ userId: 'user-1', email: 'invitee@test.com' });
    expect(client.statements()).toEqual(['BEGIN', 'COMMIT']);
    expect(insertUserWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: 'org-1',
        email: 'invitee@test.com',
        passwordHash: 'hashed-password',
        emailVerified: true,
      }),
    );
    expect(consumeInvitation).toHaveBeenCalledWith(expect.anything(), 'invitation-1', 'user-1');
    // Side effects happen only after the commit.
    expect(cacheUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'user.created', userId: 'user-1' }),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should roll back and return null when the invitation is not valid', async () => {
    vi.mocked(lockValidInvitationForUpdate).mockResolvedValue(null);
    const client = installClient();

    const result = await acceptInvitation({
      tokenHash: 'hash-1',
      organizationId: 'org-1',
      password: 'Strong-Password-9!',
    });

    expect(result).toBeNull();
    expect(client.statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(insertUserWithClient).not.toHaveBeenCalled();
    expect(cacheUser).not.toHaveBeenCalled();
  });

  it('should roll back when the invited email is already a user', async () => {
    vi.mocked(lockValidInvitationForUpdate).mockResolvedValue(buildInvitation());
    vi.mocked(emailExistsWithClient).mockResolvedValue(true);
    const client = installClient();

    const result = await acceptInvitation({
      tokenHash: 'hash-1',
      organizationId: 'org-1',
      password: 'Strong-Password-9!',
    });

    expect(result).toBeNull();
    expect(client.statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(insertUserWithClient).not.toHaveBeenCalled();
  });

  it('should roll back when the invitation cannot be consumed', async () => {
    vi.mocked(lockValidInvitationForUpdate).mockResolvedValue(buildInvitation());
    vi.mocked(emailExistsWithClient).mockResolvedValue(false);
    vi.mocked(insertUserWithClient).mockResolvedValue(buildUser());
    vi.mocked(consumeInvitation).mockResolvedValue(false);
    const client = installClient();

    const result = await acceptInvitation({
      tokenHash: 'hash-1',
      organizationId: 'org-1',
      password: 'Strong-Password-9!',
    });

    expect(result).toBeNull();
    expect(client.statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(cacheUser).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('should roll back and rethrow when the user insert fails unexpectedly', async () => {
    vi.mocked(lockValidInvitationForUpdate).mockResolvedValue(buildInvitation());
    vi.mocked(emailExistsWithClient).mockResolvedValue(false);
    vi.mocked(insertUserWithClient).mockRejectedValue(new Error('database unavailable'));
    const client = installClient();

    await expect(
      acceptInvitation({ tokenHash: 'hash-1', organizationId: 'org-1', password: 'Strong-Password-9!' }),
    ).rejects.toThrow('database unavailable');
    expect(client.statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
