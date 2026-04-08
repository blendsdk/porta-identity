import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: vi.fn(),
}));

vi.mock('../../../src/users/claims.js', () => ({
  buildUserClaims: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { findUserForOidc } from '../../../src/users/service.js';
import { buildUserClaims } from '../../../src/users/claims.js';
import { findAccount } from '../../../src/oidc/account-finder.js';
import type { User } from '../../../src/users/types.js';

const sampleUser: User = {
  id: 'user-uuid-123',
  organizationId: 'org-uuid-1',
  email: 'john@example.com',
  emailVerified: true,
  status: 'active',
  givenName: 'John',
  familyName: 'Doe',
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
  phoneNumber: '+31612345678',
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  loginCount: 0,
  lastLoginAt: null,
  lockedAt: null,
  lockedReason: null,
  passwordChangedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('account-finder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns account for active user', async () => {
    (findUserForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(sampleUser);
    const result = await findAccount(null, 'user-uuid-123');
    expect(result).toBeDefined();
    expect(result!.accountId).toBe('user-uuid-123');
  });

  it('returns undefined for missing user', async () => {
    (findUserForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await findAccount(null, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('claims() returns correct standard claims', async () => {
    (findUserForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(sampleUser);
    (buildUserClaims as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-uuid-123',
      email: 'john@example.com',
      email_verified: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      phone_number: '+31612345678',
    });

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid profile email');

    expect(claims.sub).toBe('user-uuid-123');
    expect(claims.email).toBe('john@example.com');
    expect(claims.email_verified).toBe(true);
    expect(claims.name).toBe('John Doe');
    expect(claims.given_name).toBe('John');
    expect(claims.family_name).toBe('Doe');
    expect(claims.phone_number).toBe('+31612345678');

    // Verify buildUserClaims was called with scopes array
    expect(buildUserClaims).toHaveBeenCalledWith(sampleUser, ['openid', 'profile', 'email']);
  });

  it('claims() handles null name fields gracefully', async () => {
    const userNoName = { ...sampleUser, givenName: null, familyName: null };
    (findUserForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(userNoName);
    (buildUserClaims as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-uuid-123',
      given_name: null,
      family_name: null,
    });

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid profile');
    expect(claims.name).toBeUndefined();
    expect(claims.given_name).toBeNull();
    expect(claims.family_name).toBeNull();
  });

  it('returns undefined on service error', async () => {
    (findUserForOidc as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('service error'));
    const result = await findAccount(null, 'user-uuid-123');
    expect(result).toBeUndefined();
  });
});
