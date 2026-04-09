/**
 * Unit tests for the two-factor cache — Redis-backed fast lookup layer.
 *
 * Mocks getRedis() and logger to test cache get/set/invalidate operations
 * and graceful degradation on Redis errors.
 */

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
  getCachedTwoFactorStatus,
  cacheTwoFactorStatus,
  invalidateTwoFactorCache,
} from '../../../src/two-factor/cache.js';
import type { TwoFactorStatus } from '../../../src/two-factor/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Redis client with get/set/del methods. */
function createMockRedis() {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);
  return redis;
}

/** Standard test 2FA status object. */
function createTestStatus(overrides: Partial<TwoFactorStatus> = {}): TwoFactorStatus {
  return {
    enabled: true,
    method: 'totp',
    totpConfigured: true,
    recoveryCodesRemaining: 8,
    ...overrides,
  };
}

describe('two-factor cache', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // getCachedTwoFactorStatus
  // -------------------------------------------------------------------------

  describe('getCachedTwoFactorStatus', () => {
    it('should return deserialized status on cache hit', async () => {
      const redis = createMockRedis();
      const status = createTestStatus();
      redis.get.mockResolvedValue(JSON.stringify(status));

      const result = await getCachedTwoFactorStatus('user-uuid-1');

      expect(redis.get).toHaveBeenCalledWith('2fa:status:user-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(true);
      expect(result!.method).toBe('totp');
      expect(result!.recoveryCodesRemaining).toBe(8);
    });

    it('should return null on cache miss', async () => {
      createMockRedis(); // get returns null by default

      const result = await getCachedTwoFactorStatus('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null and log warning on invalid JSON', async () => {
      const redis = createMockRedis();
      redis.get.mockResolvedValue('not-valid-json{{{');

      const result = await getCachedTwoFactorStatus('bad-data');
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cacheTwoFactorStatus
  // -------------------------------------------------------------------------

  describe('cacheTwoFactorStatus', () => {
    it('should store under the correct key with 300s TTL', async () => {
      const redis = createMockRedis();
      const status = createTestStatus();

      await cacheTwoFactorStatus('user-uuid-1', status);

      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        '2fa:status:user-uuid-1',
        JSON.stringify(status),
        'EX',
        300,
      );
    });

    it('should serialize the status as JSON', async () => {
      const redis = createMockRedis();
      const status = createTestStatus({ enabled: false, method: null });

      await cacheTwoFactorStatus('user-uuid-1', status);

      const storedJson = redis.set.mock.calls[0][1] as string;
      const parsed = JSON.parse(storedJson);
      expect(parsed.enabled).toBe(false);
      expect(parsed.method).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // invalidateTwoFactorCache
  // -------------------------------------------------------------------------

  describe('invalidateTwoFactorCache', () => {
    it('should delete the correct cache key', async () => {
      const redis = createMockRedis();

      await invalidateTwoFactorCache('user-uuid-1');

      expect(redis.del).toHaveBeenCalledWith('2fa:status:user-uuid-1');
    });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation on Redis errors
  // -------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('should return null on Redis get error', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await getCachedTwoFactorStatus('any-user');
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis set error', async () => {
      const redis = createMockRedis();
      redis.set.mockRejectedValue(new Error('Connection refused'));
      const status = createTestStatus();

      await expect(cacheTwoFactorStatus('user', status)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis del error', async () => {
      const redis = createMockRedis();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      await expect(invalidateTwoFactorCache('user')).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
