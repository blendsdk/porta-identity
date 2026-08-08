import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Mock Redis
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

// Mock system config for config loaders
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getRedis } from '../../../src/lib/redis.js';
import { getSystemConfigNumber } from '../../../src/lib/system-config.js';
import { logger } from '../../../src/lib/logger.js';
import {
  checkRateLimit,
  resetRateLimit,
  buildLoginRateLimitKey,
  buildMagicLinkRateLimitKey,
  buildPasswordResetRateLimitKey,
  loadLoginRateLimitConfig,
  loadMagicLinkRateLimitConfig,
  loadPasswordResetRateLimitConfig,
} from '../../../src/auth/rate-limiter.js';
import type { RateLimitConfig } from '../../../src/auth/rate-limiter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Redis client with configurable responses */
function mockRedis(incrValue = 1, ttlValue = 300) {
  const mockClient = {
    incr: vi.fn().mockResolvedValue(incrValue),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(ttlValue),
    del: vi.fn().mockResolvedValue(1),
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);
  return mockClient;
}

/** Default rate limit config for tests */
const DEFAULT_CONFIG: RateLimitConfig = { max: 10, windowSeconds: 900 };

describe('rate-limiter', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // checkRateLimit
  // -------------------------------------------------------------------------

  describe('checkRateLimit', () => {
    it('should allow first request and set expiry', async () => {
      const redis = mockRedis(1, -1);

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.retryAfter).toBe(0);
      expect(redis.incr).toHaveBeenCalledWith('test-key');
      // count === 1, so expire should be set
      expect(redis.expire).toHaveBeenCalledWith('test-key', 900);
    });

    it('should allow subsequent requests within limit', async () => {
      mockRedis(5, 600);

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
      expect(result.retryAfter).toBe(0);
    });

    it('should allow request at exactly the max limit', async () => {
      mockRedis(10, 300);

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should reject request when count exceeds max', async () => {
      mockRedis(11, 300);

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(300);
    });

    it('should reject with correct retryAfter based on TTL', async () => {
      mockRedis(15, 120);

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(120);
    });

    it('should set expiry when TTL is -1 (missing expiry edge case)', async () => {
      const redis = mockRedis(5, -1);

      await checkRateLimit('test-key', DEFAULT_CONFIG);

      // expire called twice: once for count===1 check (not triggered since count=5),
      // and once for ttl===-1 fix
      expect(redis.expire).toHaveBeenCalledWith('test-key', 900);
    });

    it('should return resetAt as a Date in the future', async () => {
      mockRedis(1, 600);
      const before = Date.now();

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBeGreaterThan(before);
    });

    it('should not set expiry when count > 1 and TTL is positive', async () => {
      const redis = mockRedis(3, 500);

      await checkRateLimit('test-key', DEFAULT_CONFIG);

      // expire should NOT be called — count !== 1 and ttl > 0
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('should gracefully degrade on Redis error', async () => {
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({
        incr: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
      expect(result.retryAfter).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should gracefully degrade when getRedis throws', async () => {
      (getRedis as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Redis not connected');
      });

      const result = await checkRateLimit('test-key', DEFAULT_CONFIG);

      expect(result.allowed).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // resetRateLimit
  // -------------------------------------------------------------------------

  describe('resetRateLimit', () => {
    it('should delete the rate limit key', async () => {
      const redis = mockRedis();

      await resetRateLimit('test-key');

      expect(redis.del).toHaveBeenCalledWith('test-key');
    });

    it('should not throw on Redis error', async () => {
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({
        del: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });

      await expect(resetRateLimit('test-key')).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Key builders
  // -------------------------------------------------------------------------

  describe('buildLoginRateLimitKey', () => {
    it('should include ratelimit:login prefix and org ID', () => {
      const key = buildLoginRateLimitKey('org-1', '127.0.0.1', 'user@test.com');
      expect(key).toMatch(/^ratelimit:login:org-1:/);
    });

    it('should produce a 16-char hex hash suffix', () => {
      const key = buildLoginRateLimitKey('org-1', '127.0.0.1', 'user@test.com');
      const hash = key.split(':')[3];
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should produce different keys for different IPs', () => {
      const key1 = buildLoginRateLimitKey('org-1', '1.2.3.4', 'user@test.com');
      const key2 = buildLoginRateLimitKey('org-1', '5.6.7.8', 'user@test.com');
      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different emails', () => {
      const key1 = buildLoginRateLimitKey('org-1', '127.0.0.1', 'a@test.com');
      const key2 = buildLoginRateLimitKey('org-1', '127.0.0.1', 'b@test.com');
      expect(key1).not.toBe(key2);
    });

    it('should produce consistent keys for same input', () => {
      const key1 = buildLoginRateLimitKey('org-1', '127.0.0.1', 'user@test.com');
      const key2 = buildLoginRateLimitKey('org-1', '127.0.0.1', 'user@test.com');
      expect(key1).toBe(key2);
    });
  });

  describe('buildMagicLinkRateLimitKey', () => {
    it('should include ratelimit:magic prefix', () => {
      const key = buildMagicLinkRateLimitKey('org-1', 'user@test.com');
      expect(key).toMatch(/^ratelimit:magic:org-1:/);
    });

    it('should produce different keys for different emails', () => {
      const key1 = buildMagicLinkRateLimitKey('org-1', 'a@test.com');
      const key2 = buildMagicLinkRateLimitKey('org-1', 'b@test.com');
      expect(key1).not.toBe(key2);
    });

    it('should use SHA-256 hash of email', () => {
      const key = buildMagicLinkRateLimitKey('org-1', 'test@example.com');
      const expectedHash = crypto.createHash('sha256').update('test@example.com').digest('hex').slice(0, 16);
      expect(key).toBe(`ratelimit:magic:org-1:${expectedHash}`);
    });
  });

  describe('buildPasswordResetRateLimitKey', () => {
    it('should include ratelimit:reset prefix', () => {
      const key = buildPasswordResetRateLimitKey('org-1', 'user@test.com');
      expect(key).toMatch(/^ratelimit:reset:org-1:/);
    });

    it('should produce different keys for different orgs', () => {
      const key1 = buildPasswordResetRateLimitKey('org-1', 'user@test.com');
      const key2 = buildPasswordResetRateLimitKey('org-2', 'user@test.com');
      expect(key1).not.toBe(key2);
    });
  });

  // -------------------------------------------------------------------------
  // Config loaders
  // -------------------------------------------------------------------------

  describe('loadLoginRateLimitConfig', () => {
    it('should load config from system_config with correct keys', async () => {
      (getSystemConfigNumber as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(15)   // rate_limit_login_max
        .mockResolvedValueOnce(600); // rate_limit_login_window

      const config = await loadLoginRateLimitConfig();

      expect(config).toEqual({ max: 15, windowSeconds: 600 });
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_login_max', 10);
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_login_window', 900);
    });

    it('should use default values when system_config returns defaults', async () => {
      (getSystemConfigNumber as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(900);

      const config = await loadLoginRateLimitConfig();

      expect(config).toEqual({ max: 10, windowSeconds: 900 });
    });
  });

  describe('loadMagicLinkRateLimitConfig', () => {
    it('should load config with magic link keys and defaults', async () => {
      (getSystemConfigNumber as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(900);

      const config = await loadMagicLinkRateLimitConfig();

      expect(config).toEqual({ max: 5, windowSeconds: 900 });
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_magic_link_max', 5);
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_magic_link_window', 900);
    });
  });

  describe('loadPasswordResetRateLimitConfig', () => {
    it('should load config with password reset keys and defaults', async () => {
      (getSystemConfigNumber as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(900);

      const config = await loadPasswordResetRateLimitConfig();

      expect(config).toEqual({ max: 5, windowSeconds: 900 });
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_password_reset_max', 5);
      expect(getSystemConfigNumber).toHaveBeenCalledWith('rate_limit_password_reset_window', 900);
    });
  });
});
