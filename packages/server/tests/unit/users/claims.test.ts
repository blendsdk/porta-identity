import { describe, it, expect } from 'vitest';
import { buildUserClaims, hasAddress } from '../../../src/users/claims.js';
import type { User } from '../../../src/users/types.js';

/** Helper to create a complete test user */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    organizationId: 'org-uuid-1',
    email: 'john@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
    middleName: 'Michael',
    nickname: 'johnny',
    preferredUsername: 'johnd',
    profileUrl: 'https://example.com/john',
    pictureUrl: 'https://example.com/john.jpg',
    websiteUrl: 'https://johndoe.com',
    gender: 'male',
    birthdate: '1990-06-15',
    zoneinfo: 'Europe/Amsterdam',
    locale: 'en-US',
    phoneNumber: '+31612345678',
    phoneNumberVerified: true,
    addressStreet: '123 Main St',
    addressLocality: 'Amsterdam',
    addressRegion: 'NH',
    addressPostalCode: '1012 AB',
    addressCountry: 'NL',
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('buildUserClaims', () => {
  it('should always include sub claim', () => {
    const user = createTestUser();
    const claims = buildUserClaims(user, []);
    expect(claims.sub).toBe('user-uuid-1');
  });

  it('should return only sub for empty scopes', () => {
    const user = createTestUser();
    const claims = buildUserClaims(user, []);
    expect(Object.keys(claims)).toEqual(['sub']);
  });

  it('should return only sub for openid scope alone', () => {
    const user = createTestUser();
    const claims = buildUserClaims(user, ['openid']);
    expect(Object.keys(claims)).toEqual(['sub']);
  });

  describe('profile scope', () => {
    it('should include all profile claims', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['openid', 'profile']);

      expect(claims.given_name).toBe('John');
      expect(claims.family_name).toBe('Doe');
      expect(claims.middle_name).toBe('Michael');
      expect(claims.nickname).toBe('johnny');
      expect(claims.preferred_username).toBe('johnd');
      expect(claims.profile).toBe('https://example.com/john');
      expect(claims.picture).toBe('https://example.com/john.jpg');
      expect(claims.website).toBe('https://johndoe.com');
      expect(claims.gender).toBe('male');
      expect(claims.birthdate).toBe('1990-06-15');
      expect(claims.zoneinfo).toBe('Europe/Amsterdam');
      expect(claims.locale).toBe('en-US');
    });

    it('should derive name from given + middle + family name', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['profile']);
      expect(claims.name).toBe('John Michael Doe');
    });

    it('should derive name from given + family (no middle)', () => {
      const user = createTestUser({ middleName: null });
      const claims = buildUserClaims(user, ['profile']);
      expect(claims.name).toBe('John Doe');
    });

    it('should not set name when all name parts are null', () => {
      const user = createTestUser({ givenName: null, middleName: null, familyName: null });
      const claims = buildUserClaims(user, ['profile']);
      expect(claims.name).toBeUndefined();
    });

    it('should include updated_at as unix timestamp', () => {
      const user = createTestUser({ updatedAt: new Date('2026-01-15T12:00:00Z') });
      const claims = buildUserClaims(user, ['profile']);
      // 2026-01-15T12:00:00Z = 1768507200
      expect(claims.updated_at).toBe(Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000));
      expect(typeof claims.updated_at).toBe('number');
    });

    it('should include null values for unset profile fields', () => {
      const user = createTestUser({
        nickname: null,
        profileUrl: null,
        gender: null,
      });
      const claims = buildUserClaims(user, ['profile']);
      expect(claims.nickname).toBeNull();
      expect(claims.profile).toBeNull();
      expect(claims.gender).toBeNull();
    });
  });

  describe('email scope', () => {
    it('should include email and email_verified', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['email']);
      expect(claims.email).toBe('john@example.com');
      expect(claims.email_verified).toBe(true);
    });
  });

  describe('phone scope', () => {
    it('should include phone_number and phone_number_verified', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['phone']);
      expect(claims.phone_number).toBe('+31612345678');
      expect(claims.phone_number_verified).toBe(true);
    });
  });

  describe('address scope', () => {
    it('should include structured address object', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['address']);
      expect(claims.address).toEqual({
        street_address: '123 Main St',
        locality: 'Amsterdam',
        region: 'NH',
        postal_code: '1012 AB',
        country: 'NL',
      });
    });

    it('should not include address when all fields are null', () => {
      const user = createTestUser({
        addressStreet: null,
        addressLocality: null,
        addressRegion: null,
        addressPostalCode: null,
        addressCountry: null,
      });
      const claims = buildUserClaims(user, ['address']);
      expect(claims.address).toBeUndefined();
    });
  });

  describe('multiple scopes', () => {
    it('should combine claims from multiple scopes', () => {
      const user = createTestUser();
      const claims = buildUserClaims(user, ['openid', 'profile', 'email', 'phone', 'address']);

      expect(claims.sub).toBe('user-uuid-1');
      expect(claims.given_name).toBe('John');
      expect(claims.email).toBe('john@example.com');
      expect(claims.phone_number).toBe('+31612345678');
      expect(claims.address).toBeDefined();
    });
  });
});

describe('hasAddress', () => {
  it('should return true when any address field is set', () => {
    const user = createTestUser({
      addressStreet: null,
      addressLocality: null,
      addressRegion: null,
      addressPostalCode: null,
      addressCountry: 'NL',
    });
    expect(hasAddress(user)).toBe(true);
  });

  it('should return false when all address fields are null', () => {
    const user = createTestUser({
      addressStreet: null,
      addressLocality: null,
      addressRegion: null,
      addressPostalCode: null,
      addressCountry: null,
    });
    expect(hasAddress(user)).toBe(false);
  });
});
