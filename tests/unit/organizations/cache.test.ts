import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getRedis } from '../../../src/lib/redis.js';
import { logger } from '../../../src/lib/logger.js';
import {
  getCachedOrganizationBySlug,
  getCachedOrganizationById,
  cacheOrganization,
  invalidateOrganizationCache,
} from '../../../src/organizations/cache.js';
import type { Organization } from '../../../src/organizations/types.js';

/** Create a mock Redis client with get/set/del methods */
function createMockRedis() {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);
  return redis;
}

/** Standard test organization object (camelCase) */
function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: '#3B82F6',
    brandingCompanyName: 'Acme Corp',
    brandingCustomCss: null,
    defaultLocale: 'en',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('organization cache', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // getCachedOrganizationBySlug
  // -------------------------------------------------------------------------

  describe('getCachedOrganizationBySlug', () => {
    it('should return deserialized organization on cache hit', async () => {
      const redis = createMockRedis();
      const org = createTestOrg();
      redis.get.mockResolvedValue(JSON.stringify(org));

      const result = await getCachedOrganizationBySlug('acme-corporation');

      expect(redis.get).toHaveBeenCalledWith('org:slug:acme-corporation');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('org-uuid-1');
      expect(result!.slug).toBe('acme-corporation');
    });

    it('should return null on cache miss', async () => {
      createMockRedis(); // get returns null by default

      const result = await getCachedOrganizationBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null and log warning on invalid JSON', async () => {
      const redis = createMockRedis();
      redis.get.mockResolvedValue('not-valid-json{{{');

      const result = await getCachedOrganizationBySlug('bad-data');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCachedOrganizationById
  // -------------------------------------------------------------------------

  describe('getCachedOrganizationById', () => {
    it('should return deserialized organization on cache hit', async () => {
      const redis = createMockRedis();
      const org = createTestOrg();
      redis.get.mockResolvedValue(JSON.stringify(org));

      const result = await getCachedOrganizationById('org-uuid-1');

      expect(redis.get).toHaveBeenCalledWith('org:id:org-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('org-uuid-1');
    });

    it('should return null on cache miss', async () => {
      createMockRedis();

      const result = await getCachedOrganizationById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cacheOrganization
  // -------------------------------------------------------------------------

  describe('cacheOrganization', () => {
    it('should store under both slug and ID keys', async () => {
      const redis = createMockRedis();
      const org = createTestOrg();

      await cacheOrganization(org);

      expect(redis.set).toHaveBeenCalledTimes(2);
      // First call: slug key
      expect(redis.set.mock.calls[0][0]).toBe('org:slug:acme-corporation');
      // Second call: ID key
      expect(redis.set.mock.calls[1][0]).toBe('org:id:org-uuid-1');
    });

    it('should set correct TTL (300 seconds)', async () => {
      const redis = createMockRedis();
      const org = createTestOrg();

      await cacheOrganization(org);

      // Both calls should use EX 300
      expect(redis.set.mock.calls[0][2]).toBe('EX');
      expect(redis.set.mock.calls[0][3]).toBe(300);
      expect(redis.set.mock.calls[1][2]).toBe('EX');
      expect(redis.set.mock.calls[1][3]).toBe(300);
    });

    it('should serialize dates as ISO strings and deserialize back correctly', async () => {
      const redis = createMockRedis();
      const org = createTestOrg({
        createdAt: new Date('2026-03-15T10:30:00Z'),
        updatedAt: new Date('2026-04-01T14:45:00Z'),
      });

      await cacheOrganization(org);

      // Capture the serialized JSON
      const serialized = redis.set.mock.calls[0][1] as string;
      const parsed = JSON.parse(serialized);

      // Dates should be ISO strings in the JSON
      expect(parsed.createdAt).toBe('2026-03-15T10:30:00.000Z');
      expect(parsed.updatedAt).toBe('2026-04-01T14:45:00.000Z');

      // Now simulate reading it back from cache
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedOrganizationBySlug(org.slug);

      // Dates should be restored as Date objects
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // invalidateOrganizationCache
  // -------------------------------------------------------------------------

  describe('invalidateOrganizationCache', () => {
    it('should delete both slug and ID keys', async () => {
      const redis = createMockRedis();

      await invalidateOrganizationCache('acme-corporation', 'org-uuid-1');

      expect(redis.del).toHaveBeenCalledWith(
        'org:slug:acme-corporation',
        'org:id:org-uuid-1',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation on Redis errors
  // -------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('should return null on Redis get error', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await getCachedOrganizationBySlug('any-slug');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis set error', async () => {
      const redis = createMockRedis();
      redis.set.mockRejectedValue(new Error('Connection refused'));
      const org = createTestOrg();

      // Should not throw
      await expect(cacheOrganization(org)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis del error', async () => {
      const redis = createMockRedis();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(
        invalidateOrganizationCache('slug', 'id'),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
