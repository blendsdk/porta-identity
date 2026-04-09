import { describe, it, expect } from 'vitest';
import type { UserRow } from '../../../src/users/types.js';
import { mapRowToUser } from '../../../src/users/types.js';

/**
 * Helper to create a complete UserRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createTestRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-uuid-1',
    organization_id: 'org-uuid-1',
    email: 'john@example.com',
    email_verified: true,
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    password_changed_at: new Date('2026-01-10T00:00:00Z'),
    given_name: 'John',
    family_name: 'Doe',
    middle_name: 'Michael',
    nickname: 'johnny',
    preferred_username: 'johnd',
    profile_url: 'https://example.com/john',
    picture_url: 'https://example.com/john.jpg',
    website_url: 'https://johndoe.com',
    gender: 'male',
    birthdate: '1990-06-15',
    zoneinfo: 'Europe/Amsterdam',
    locale: 'en-US',
    phone_number: '+31612345678',
    phone_number_verified: true,
    address_street: '123 Main St',
    address_locality: 'Amsterdam',
    address_region: 'NH',
    address_postal_code: '1012 AB',
    address_country: 'NL',
    two_factor_enabled: false,
    two_factor_method: null,
    status: 'active',
    locked_at: null,
    locked_reason: null,
    last_login_at: new Date('2026-01-15T08:00:00Z'),
    login_count: 5,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('types', () => {
  describe('mapRowToUser', () => {
    it('should correctly map a complete row with all fields populated', () => {
      const row = createTestRow();
      const user = mapRowToUser(row);

      expect(user).toEqual({
        id: 'user-uuid-1',
        organizationId: 'org-uuid-1',
        email: 'john@example.com',
        emailVerified: true,
        hasPassword: true,
        passwordChangedAt: new Date('2026-01-10T00:00:00Z'),
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
        twoFactorEnabled: false,
        twoFactorMethod: null,
        status: 'active',
        lockedAt: null,
        lockedReason: null,
        lastLoginAt: new Date('2026-01-15T08:00:00Z'),
        loginCount: 5,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
      });
    });

    it('should map row with null optional fields', () => {
      const row = createTestRow({
        password_hash: null,
        password_changed_at: null,
        given_name: null,
        family_name: null,
        middle_name: null,
        nickname: null,
        preferred_username: null,
        profile_url: null,
        picture_url: null,
        website_url: null,
        gender: null,
        birthdate: null,
        zoneinfo: null,
        locale: null,
        phone_number: null,
        phone_number_verified: false,
        address_street: null,
        address_locality: null,
        address_region: null,
        address_postal_code: null,
        address_country: null,
        last_login_at: null,
      });
      const user = mapRowToUser(row);

      expect(user.givenName).toBeNull();
      expect(user.familyName).toBeNull();
      expect(user.middleName).toBeNull();
      expect(user.profileUrl).toBeNull();
      expect(user.addressStreet).toBeNull();
      expect(user.lastLoginAt).toBeNull();
      expect(user.hasPassword).toBe(false);
    });

    it('should derive hasPassword = true when password_hash is set', () => {
      const row = createTestRow({ password_hash: '$argon2id$hash' });
      const user = mapRowToUser(row);
      expect(user.hasPassword).toBe(true);
    });

    it('should derive hasPassword = false when password_hash is null', () => {
      const row = createTestRow({ password_hash: null });
      const user = mapRowToUser(row);
      expect(user.hasPassword).toBe(false);
    });

    it('should handle all user statuses', () => {
      for (const status of ['active', 'inactive', 'suspended', 'locked'] as const) {
        const row = createTestRow({ status });
        const user = mapRowToUser(row);
        expect(user.status).toBe(status);
      }
    });

    it('should preserve birthdate as string', () => {
      const row = createTestRow({ birthdate: '1990-06-15' });
      const user = mapRowToUser(row);
      expect(user.birthdate).toBe('1990-06-15');
      expect(typeof user.birthdate).toBe('string');
    });

    it('should preserve date objects for timestamps', () => {
      const createdAt = new Date('2026-03-15T10:30:00Z');
      const updatedAt = new Date('2026-04-01T14:45:00Z');
      const row = createTestRow({ created_at: createdAt, updated_at: updatedAt });
      const user = mapRowToUser(row);

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
      expect(user.updatedAt.toISOString()).toBe('2026-04-01T14:45:00.000Z');
    });

    it('should not expose password_hash in User interface', () => {
      const row = createTestRow({ password_hash: '$argon2id$secret_hash' });
      const user = mapRowToUser(row);
      // The user object should not have a password_hash property
      expect('password_hash' in user).toBe(false);
      expect('passwordHash' in user).toBe(false);
      // Only the derived boolean should exist
      expect(user.hasPassword).toBe(true);
    });
  });
});
