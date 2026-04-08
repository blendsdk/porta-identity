import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getRedis } from '../../../src/lib/redis.js';
import {
  getCachedUserById,
  cacheUser,
  invalidateUserCache,
} from '../../../src/users/cache.js';
import type { User } from '../../../src/users/types.js';

/** Helper to mock Redis client */
function mockRedis(overrides: Record<string, unknown> = {}) {
  const client = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(client);
  return client;
}

/** Sample user for testing */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    organizationId: 'org-uuid-1',
    email: 'john@example.com',
    emailVerified: false,
    hasPassword: true,
    passwordChangedAt: null,
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

describe('user cache', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // getCachedUserById
  // -------------------------------------------------------------------------

  describe('getCachedUserById', () => {
    it('should return cached user with restored dates', async () => {
      const user = createTestUser({
        passwordChangedAt: new Date('2026-01-05T00:00:00Z'),
        lastLoginAt: new Date('2026-01-10T08:00:00Z'),
      });
      const redis = mockRedis({ get: vi.fn().mockResolvedValue(JSON.stringify(user)) });

      const result = await getCachedUserById('user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-uuid-1');
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.passwordChangedAt).toBeInstanceOf(Date);
      expect(result!.lastLoginAt).toBeInstanceOf(Date);
      expect(redis.get).toHaveBeenCalledWith('user:id:user-uuid-1');
    });

    it('should return null on cache miss', async () => {
      mockRedis();

      const result = await getCachedUserById('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on redis error', async () => {
      mockRedis({ get: vi.fn().mockRejectedValue(new Error('redis down')) });

      const result = await getCachedUserById('user-uuid-1');

      expect(result).toBeNull();
    });

    it('should return null on invalid JSON', async () => {
      mockRedis({ get: vi.fn().mockResolvedValue('not-valid-json{') });

      const result = await getCachedUserById('user-uuid-1');

      expect(result).toBeNull();
    });

    it('should handle null nullable date fields', async () => {
      const user = createTestUser(); // all nullable dates are null
      mockRedis({ get: vi.fn().mockResolvedValue(JSON.stringify(user)) });

      const result = await getCachedUserById('user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.passwordChangedAt).toBeNull();
      expect(result!.lockedAt).toBeNull();
      expect(result!.lastLoginAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cacheUser
  // -------------------------------------------------------------------------

  describe('cacheUser', () => {
    it('should store user with correct key and TTL', async () => {
      const user = createTestUser();
      const redis = mockRedis();

      await cacheUser(user);

      expect(redis.set).toHaveBeenCalledWith(
        'user:id:user-uuid-1',
        JSON.stringify(user),
        'EX',
        300,
      );
    });

    it('should not throw on redis error', async () => {
      const user = createTestUser();
      mockRedis({ set: vi.fn().mockRejectedValue(new Error('redis down')) });

      await expect(cacheUser(user)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // invalidateUserCache
  // -------------------------------------------------------------------------

  describe('invalidateUserCache', () => {
    it('should delete cache key', async () => {
      const redis = mockRedis();

      await invalidateUserCache('user-uuid-1');

      expect(redis.del).toHaveBeenCalledWith('user:id:user-uuid-1');
    });

    it('should not throw on redis error', async () => {
      mockRedis({ del: vi.fn().mockRejectedValue(new Error('redis down')) });

      await expect(invalidateUserCache('user-uuid-1')).resolves.not.toThrow();
    });
  });
});
