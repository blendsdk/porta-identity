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
  getCachedApplicationBySlug,
  getCachedApplicationById,
  cacheApplication,
  invalidateApplicationCache,
} from '../../../src/applications/cache.js';
import type { Application } from '../../../src/applications/types.js';

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

/** Standard test application object (camelCase) */
function createTestApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-uuid-1',
    name: 'Business Suite',
    slug: 'business-suite',
    description: 'Main business application',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('application cache', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // getCachedApplicationBySlug
  // -------------------------------------------------------------------------

  describe('getCachedApplicationBySlug', () => {
    it('should return deserialized application on cache hit', async () => {
      const redis = createMockRedis();
      const app = createTestApp();
      redis.get.mockResolvedValue(JSON.stringify(app));

      const result = await getCachedApplicationBySlug('business-suite');

      expect(redis.get).toHaveBeenCalledWith('app:slug:business-suite');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('app-uuid-1');
      expect(result!.slug).toBe('business-suite');
    });

    it('should return null on cache miss', async () => {
      createMockRedis(); // get returns null by default

      const result = await getCachedApplicationBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null and log warning on invalid JSON', async () => {
      const redis = createMockRedis();
      redis.get.mockResolvedValue('not-valid-json{{{');

      const result = await getCachedApplicationBySlug('bad-data');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCachedApplicationById
  // -------------------------------------------------------------------------

  describe('getCachedApplicationById', () => {
    it('should return deserialized application on cache hit', async () => {
      const redis = createMockRedis();
      const app = createTestApp();
      redis.get.mockResolvedValue(JSON.stringify(app));

      const result = await getCachedApplicationById('app-uuid-1');

      expect(redis.get).toHaveBeenCalledWith('app:id:app-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('app-uuid-1');
    });

    it('should return null on cache miss', async () => {
      createMockRedis();

      const result = await getCachedApplicationById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cacheApplication
  // -------------------------------------------------------------------------

  describe('cacheApplication', () => {
    it('should store under both slug and ID keys', async () => {
      const redis = createMockRedis();
      const app = createTestApp();

      await cacheApplication(app);

      expect(redis.set).toHaveBeenCalledTimes(2);
      // First call: slug key
      expect(redis.set.mock.calls[0][0]).toBe('app:slug:business-suite');
      // Second call: ID key
      expect(redis.set.mock.calls[1][0]).toBe('app:id:app-uuid-1');
    });

    it('should set correct TTL (300 seconds)', async () => {
      const redis = createMockRedis();
      const app = createTestApp();

      await cacheApplication(app);

      // Both calls should use EX 300
      expect(redis.set.mock.calls[0][2]).toBe('EX');
      expect(redis.set.mock.calls[0][3]).toBe(300);
      expect(redis.set.mock.calls[1][2]).toBe('EX');
      expect(redis.set.mock.calls[1][3]).toBe(300);
    });

    it('should serialize dates as ISO strings and deserialize back correctly', async () => {
      const redis = createMockRedis();
      const app = createTestApp({
        createdAt: new Date('2026-03-15T10:30:00Z'),
        updatedAt: new Date('2026-04-01T14:45:00Z'),
      });

      await cacheApplication(app);

      // Capture the serialized JSON
      const serialized = redis.set.mock.calls[0][1] as string;
      const parsed = JSON.parse(serialized);

      // Dates should be ISO strings in the JSON
      expect(parsed.createdAt).toBe('2026-03-15T10:30:00.000Z');
      expect(parsed.updatedAt).toBe('2026-04-01T14:45:00.000Z');

      // Now simulate reading it back from cache
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedApplicationBySlug(app.slug);

      // Dates should be restored as Date objects
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // invalidateApplicationCache
  // -------------------------------------------------------------------------

  describe('invalidateApplicationCache', () => {
    it('should delete both slug and ID keys', async () => {
      const redis = createMockRedis();

      await invalidateApplicationCache('business-suite', 'app-uuid-1');

      expect(redis.del).toHaveBeenCalledWith(
        'app:slug:business-suite',
        'app:id:app-uuid-1',
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

      const result = await getCachedApplicationBySlug('any-slug');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return null on Redis get error for ID lookup', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await getCachedApplicationById('any-id');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis set error', async () => {
      const redis = createMockRedis();
      redis.set.mockRejectedValue(new Error('Connection refused'));
      const app = createTestApp();

      // Should not throw
      await expect(cacheApplication(app)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis del error', async () => {
      const redis = createMockRedis();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(
        invalidateApplicationCache('slug', 'id'),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
