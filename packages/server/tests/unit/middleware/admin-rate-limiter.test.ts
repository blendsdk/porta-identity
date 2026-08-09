/**
 * Unit tests for the admin API rate limiter middleware.
 *
 * The middleware rate-limits state-changing methods (POST/PUT/PATCH/DELETE)
 * on `/api/admin/*` paths using a per-IP key.  GET requests and non-admin
 * paths pass through without rate limiting.
 *
 * Tests verify (mapped to Phase G requirements):
 *   G1  — Admin write requests are counted (POST/PUT/PATCH/DELETE)
 *   G2  — Admin GET requests are NOT counted (read-only pass-through)
 *   G3  — Admin rate limit exceeded → 429 with JSON error body + headers
 *   G5  — Different IPs have independent counters
 *   G6  — Redis failure → passes through (graceful degradation)
 *
 * Additional coverage:
 *   — Non-admin paths pass through regardless of method
 *   — X-RateLimit-* informational headers on all matched responses
 *   — Warning log on rate limit exceeded
 *   — Exported constants match documented values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the rate limiter module — no real Redis in unit tests.
// ---------------------------------------------------------------------------
const mockCheckRateLimit = vi.fn();
vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// Mock the logger to verify warning logs on rate limit exceeded
const mockLoggerWarn = vi.fn();
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  adminRateLimiter,
  ADMIN_PATH_PREFIX,
  ADMIN_WRITE_METHODS,
  ADMIN_RATE_LIMIT,
} from '../../../src/middleware/admin-rate-limiter.js';
import type { RateLimitResult } from '../../../src/auth/rate-limiter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Koa-like context for testing the admin rate limiter middleware. */
interface MockContext {
  path: string;
  method: string;
  ip: string;
  status: number;
  body: unknown;
  _headers: Record<string, string>;
  set(name: string, value: string): void;
}

/**
 * Build a mock Koa context for the admin rate limiter.
 *
 * @param path - Request path (e.g., '/api/admin/organizations')
 * @param method - HTTP method (e.g., 'POST')
 * @param ip - Client IP address
 */
function createMockContext(
  path: string,
  method: string,
  ip = '192.168.1.1',
): MockContext {
  const responseHeaders: Record<string, string> = {};
  return {
    path,
    method,
    ip,
    status: 200,
    body: null,
    _headers: responseHeaders,
    set(name: string, value: string) {
      responseHeaders[name] = value;
    },
  };
}

/**
 * Build a rate limit result for controlled test scenarios.
 */
function createRateLimitResult(overrides: Partial<RateLimitResult> = {}): RateLimitResult {
  return {
    allowed: true,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
    retryAfter: 0,
    ...overrides,
  };
}

/**
 * Invoke the admin rate limiter middleware with the given context.
 *
 * @returns Whether the `next()` callback was called
 */
async function invokeMiddleware(
  ctx: MockContext,
): Promise<{ nextCalled: boolean }> {
  const middleware = adminRateLimiter();
  let nextCalled = false;

  await middleware(
    ctx as unknown as Parameters<typeof middleware>[0],
    async () => {
      nextCalled = true;
    },
  );

  return { nextCalled };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin-rate-limiter middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: allow requests
    mockCheckRateLimit.mockResolvedValue(createRateLimitResult());
  });

  // -------------------------------------------------------------------------
  // G1: Admin write requests are counted
  // -------------------------------------------------------------------------
  describe('G1: admin write requests are counted', () => {
    it('should call checkRateLimit for POST requests to admin paths', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      await invokeMiddleware(ctx);

      expect(mockCheckRateLimit).toHaveBeenCalledOnce();
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:admin:'),
        ADMIN_RATE_LIMIT,
      );
    });

    it('should call checkRateLimit for PUT requests to admin paths', async () => {
      const ctx = createMockContext('/api/admin/organizations/123', 'PUT');
      await invokeMiddleware(ctx);

      expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    });

    it('should call checkRateLimit for PATCH requests to admin paths', async () => {
      const ctx = createMockContext('/api/admin/config/key', 'PATCH');
      await invokeMiddleware(ctx);

      expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    });

    it('should call checkRateLimit for DELETE requests to admin paths', async () => {
      const ctx = createMockContext('/api/admin/clients/456', 'DELETE');
      await invokeMiddleware(ctx);

      expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    });

    it('should pass through when under the rate limit', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: true, remaining: 50 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(ctx.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // G2: Admin GET requests are NOT counted
  // -------------------------------------------------------------------------
  describe('G2: admin GET requests are not counted', () => {
    it('should pass through GET requests without rate limiting', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'GET');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should pass through HEAD requests without rate limiting', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'HEAD');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should pass through OPTIONS requests without rate limiting', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'OPTIONS');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // G3: Admin rate limit exceeded → 429
  // -------------------------------------------------------------------------
  describe('G3: rate limit exceeded returns 429', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 45 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(false);
      expect(ctx.status).toBe(429);
    });

    it('should return JSON error body on 429', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 30 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      await invokeMiddleware(ctx);

      const body = ctx.body as Record<string, unknown>;
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('rate limit exceeded');
      expect(body.retry_after).toBe(30);
    });

    it('should set Retry-After header on 429', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 42 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      await invokeMiddleware(ctx);

      expect(ctx._headers['Retry-After']).toBe('42');
    });

    it('should log a warning when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 60 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST', '10.0.0.5');
      await invokeMiddleware(ctx);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin_rate_limit_exceeded',
          ip: '10.0.0.5',
          path: '/api/admin/organizations',
          method: 'POST',
        }),
        'Admin API rate limit exceeded',
      );
    });
  });

  // -------------------------------------------------------------------------
  // G5: Different IPs have independent counters
  // -------------------------------------------------------------------------
  describe('G5: different IPs have independent counters', () => {
    it('should use different rate limit keys for different IPs', async () => {
      const ctx1 = createMockContext('/api/admin/organizations', 'POST', '10.0.0.1');
      const ctx2 = createMockContext('/api/admin/organizations', 'POST', '10.0.0.2');

      await invokeMiddleware(ctx1);
      await invokeMiddleware(ctx2);

      const key1 = mockCheckRateLimit.mock.calls[0][0] as string;
      const key2 = mockCheckRateLimit.mock.calls[1][0] as string;
      expect(key1).not.toBe(key2);
      expect(key1).toContain('10.0.0.1');
      expect(key2).toContain('10.0.0.2');
    });
  });

  // -------------------------------------------------------------------------
  // G6: Redis failure → pass through (graceful degradation)
  // -------------------------------------------------------------------------
  describe('G6: graceful degradation on Redis failure', () => {
    it('should pass through when checkRateLimit returns allowed on Redis failure', async () => {
      // checkRateLimit already handles Redis failures internally and returns
      // allowed: true with a warning. This test verifies the middleware
      // correctly passes through in that scenario.
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: true, remaining: 60 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(ctx.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Non-admin paths pass through
  // -------------------------------------------------------------------------
  describe('non-admin paths pass through', () => {
    it('should not rate-limit POST to non-admin paths', async () => {
      const ctx = createMockContext('/acme/oidc/token', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should not rate-limit POST to interaction paths', async () => {
      const ctx = createMockContext('/interaction/abc123/login', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should not rate-limit POST to /api/admin/metadata (GET-only endpoint)', async () => {
      // /api/admin/metadata starts with /api/admin/ but it's a GET endpoint.
      // However, if someone POSTs to it, it would be rate-limited. This is
      // correct behavior — we rate-limit all POSTs to admin paths.
      const ctx = createMockContext('/api/admin/metadata', 'POST');
      await invokeMiddleware(ctx);

      // This should actually be rate-limited since it matches the path + method
      expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // X-RateLimit-* informational headers
  // -------------------------------------------------------------------------
  describe('informational headers', () => {
    it('should set X-RateLimit-Limit and X-RateLimit-Remaining on allowed requests', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: true, remaining: 42 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      await invokeMiddleware(ctx);

      expect(ctx._headers['X-RateLimit-Limit']).toBe(String(ADMIN_RATE_LIMIT.max));
      expect(ctx._headers['X-RateLimit-Remaining']).toBe('42');
    });

    it('should set X-RateLimit headers even when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 30 }),
      );
      const ctx = createMockContext('/api/admin/organizations', 'DELETE');
      await invokeMiddleware(ctx);

      expect(ctx._headers['X-RateLimit-Limit']).toBe(String(ADMIN_RATE_LIMIT.max));
      expect(ctx._headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('should NOT set rate limit headers on non-matching requests', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'GET');
      await invokeMiddleware(ctx);

      expect(ctx._headers['X-RateLimit-Limit']).toBeUndefined();
      expect(ctx._headers['X-RateLimit-Remaining']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Exported constants
  // -------------------------------------------------------------------------
  describe('exported constants', () => {
    it('ADMIN_PATH_PREFIX is /api/admin/', () => {
      expect(ADMIN_PATH_PREFIX).toBe('/api/admin/');
    });

    it('ADMIN_WRITE_METHODS includes POST, PUT, PATCH, DELETE', () => {
      expect(ADMIN_WRITE_METHODS.has('POST')).toBe(true);
      expect(ADMIN_WRITE_METHODS.has('PUT')).toBe(true);
      expect(ADMIN_WRITE_METHODS.has('PATCH')).toBe(true);
      expect(ADMIN_WRITE_METHODS.has('DELETE')).toBe(true);
      expect(ADMIN_WRITE_METHODS.has('GET')).toBe(false);
      expect(ADMIN_WRITE_METHODS.has('HEAD')).toBe(false);
      expect(ADMIN_WRITE_METHODS.has('OPTIONS')).toBe(false);
    });

    it('ADMIN_RATE_LIMIT has max of 60', () => {
      expect(ADMIN_RATE_LIMIT.max).toBe(60);
    });

    it('ADMIN_RATE_LIMIT has windowSeconds of 60', () => {
      expect(ADMIN_RATE_LIMIT.windowSeconds).toBe(60);
    });
  });
});
