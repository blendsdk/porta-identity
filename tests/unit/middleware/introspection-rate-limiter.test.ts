/**
 * Unit tests for the introspection endpoint rate limiter middleware.
 *
 * The middleware rate-limits `POST /:orgSlug/oidc/token/introspection`
 * using a per-IP + per-client_id composite key.  It reuses
 * `checkRateLimit()` from the auth rate limiter, which is mocked here.
 *
 * Tests verify (mapped to Phase G requirements):
 *   G4  — Introspection rate limit at threshold → 429 (OAuth-format error)
 *   G5  — Different IPs have independent counters
 *   G6  — Redis failure → passes through (graceful degradation)
 *
 * Additional coverage:
 *   — Non-POST methods pass through (no rate limiting)
 *   — Non-introspection paths pass through
 *   — X-RateLimit-* informational headers on matched responses
 *   — Missing client_id → uses 'unknown' key
 *   — Path regex validates slug format
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
  introspectionRateLimiter,
  INTROSPECTION_PATH_REGEX,
  INTROSPECTION_RATE_LIMIT,
} from '../../../src/middleware/token-rate-limiter.js';
import type { RateLimitResult } from '../../../src/auth/rate-limiter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Koa-like context for testing the introspection rate limiter. */
interface MockContext {
  path: string;
  method: string;
  ip: string;
  status: number;
  body: unknown;
  request: { body: Record<string, unknown> | undefined };
  _headers: Record<string, string>;
  set(name: string, value: string): void;
}

/**
 * Build a mock Koa context for the introspection rate limiter.
 *
 * @param path - Request path (e.g., '/acme/oidc/token/introspection')
 * @param method - HTTP method (e.g., 'POST')
 * @param ip - Client IP address
 * @param requestBody - Parsed request body (may contain client_id)
 */
function createMockContext(
  path: string,
  method: string,
  ip = '192.168.1.1',
  requestBody?: Record<string, unknown>,
): MockContext {
  const responseHeaders: Record<string, string> = {};
  return {
    path,
    method,
    ip,
    status: 200,
    body: null,
    request: { body: requestBody },
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
    remaining: 99,
    resetAt: new Date(Date.now() + 60_000),
    retryAfter: 0,
    ...overrides,
  };
}

/**
 * Invoke the introspection rate limiter middleware with the given context.
 *
 * @returns Whether the `next()` callback was called
 */
async function invokeMiddleware(
  ctx: MockContext,
): Promise<{ nextCalled: boolean }> {
  const middleware = introspectionRateLimiter();
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

describe('introspection-rate-limiter middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: allow requests
    mockCheckRateLimit.mockResolvedValue(createRateLimitResult());
  });

  // -------------------------------------------------------------------------
  // G4: Introspection rate limit at threshold → 429
  // -------------------------------------------------------------------------
  describe('G4: introspection rate limit exceeded returns 429', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 30 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: 'resource-server',
      });
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(false);
      expect(ctx.status).toBe(429);
    });

    it('should return OAuth-format error body on 429', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 45 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST');
      await invokeMiddleware(ctx);

      const body = ctx.body as Record<string, unknown>;
      expect(body.error).toBe('rate_limit_exceeded');
      expect(body.error_description).toBe(
        'Too many introspection requests. Please try again later.',
      );
      expect(body.retry_after).toBe(45);
    });

    it('should set Retry-After header on 429', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 25 }),
      );
      const ctx = createMockContext('/my-org/oidc/token/introspection', 'POST');
      await invokeMiddleware(ctx);

      expect(ctx._headers['Retry-After']).toBe('25');
    });

    it('should log a warning when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 60 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.5', {
        client_id: 'spam-rs',
      });
      await invokeMiddleware(ctx);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'introspection_rate_limit_exceeded',
          ip: '10.0.0.5',
          clientId: 'spam-rs',
        }),
        'Introspection endpoint rate limit exceeded',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Under limit → passes through
  // -------------------------------------------------------------------------
  it('should pass through when under the rate limit', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: true, remaining: 80 }),
    );
    const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
      client_id: 'my-rs',
    });
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(ctx.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // G5: Different IPs have independent counters
  // -------------------------------------------------------------------------
  describe('G5: different IPs have independent counters', () => {
    it('should use different rate limit keys for different IPs', async () => {
      const ctx1 = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: 'rs-a',
      });
      const ctx2 = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.2', {
        client_id: 'rs-a',
      });

      await invokeMiddleware(ctx1);
      await invokeMiddleware(ctx2);

      const key1 = mockCheckRateLimit.mock.calls[0][0] as string;
      const key2 = mockCheckRateLimit.mock.calls[1][0] as string;
      expect(key1).not.toBe(key2);
      expect(key1).toContain('10.0.0.1');
      expect(key2).toContain('10.0.0.2');
    });

    it('should use different rate limit keys for different client_ids', async () => {
      const ctx1 = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: 'rs-a',
      });
      const ctx2 = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: 'rs-b',
      });

      await invokeMiddleware(ctx1);
      await invokeMiddleware(ctx2);

      const key1 = mockCheckRateLimit.mock.calls[0][0] as string;
      const key2 = mockCheckRateLimit.mock.calls[1][0] as string;
      expect(key1).not.toBe(key2);
      expect(key1).toContain('rs-a');
      expect(key2).toContain('rs-b');
    });
  });

  // -------------------------------------------------------------------------
  // G6: Redis failure → pass through (graceful degradation)
  // -------------------------------------------------------------------------
  describe('G6: graceful degradation on Redis failure', () => {
    it('should pass through when checkRateLimit returns allowed on Redis failure', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: true, remaining: 100 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(ctx.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Non-POST method → passes through
  // -------------------------------------------------------------------------
  describe('non-POST methods pass through', () => {
    it('should pass through GET requests without rate limiting', async () => {
      const ctx = createMockContext('/acme/oidc/token/introspection', 'GET');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should pass through OPTIONS requests without rate limiting', async () => {
      const ctx = createMockContext('/acme/oidc/token/introspection', 'OPTIONS');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Non-introspection paths pass through
  // -------------------------------------------------------------------------
  describe('non-introspection paths pass through', () => {
    it('should not rate-limit the token endpoint', async () => {
      const ctx = createMockContext('/acme/oidc/token', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should not rate-limit admin API paths', async () => {
      const ctx = createMockContext('/api/admin/organizations', 'POST');
      const { nextCalled } = await invokeMiddleware(ctx);

      expect(nextCalled).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Missing client_id → uses 'unknown' key
  // -------------------------------------------------------------------------
  describe('missing client_id handling', () => {
    it('should use "unknown" when client_id is missing from body', async () => {
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {});
      await invokeMiddleware(ctx);

      const key = mockCheckRateLimit.mock.calls[0][0] as string;
      expect(key).toContain('unknown');
    });

    it('should use "unknown" when request body is undefined', async () => {
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1');
      await invokeMiddleware(ctx);

      const key = mockCheckRateLimit.mock.calls[0][0] as string;
      expect(key).toContain('unknown');
    });

    it('should use "unknown" when client_id is empty string', async () => {
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: '',
      });
      await invokeMiddleware(ctx);

      const key = mockCheckRateLimit.mock.calls[0][0] as string;
      expect(key).toContain('unknown');
    });
  });

  // -------------------------------------------------------------------------
  // Key namespace isolation — introspection keys use 'introspect:' not 'token:'
  // -------------------------------------------------------------------------
  it('should use "ratelimit:introspect:" namespace for keys', async () => {
    const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
      client_id: 'my-rs',
    });
    await invokeMiddleware(ctx);

    const key = mockCheckRateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^ratelimit:introspect:/);
    expect(key).not.toContain('ratelimit:token:');
  });

  // -------------------------------------------------------------------------
  // X-RateLimit-* informational headers
  // -------------------------------------------------------------------------
  describe('informational headers', () => {
    it('should set X-RateLimit-Limit and X-RateLimit-Remaining on allowed requests', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: true, remaining: 75 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST', '10.0.0.1', {
        client_id: 'my-rs',
      });
      await invokeMiddleware(ctx);

      expect(ctx._headers['X-RateLimit-Limit']).toBe(String(INTROSPECTION_RATE_LIMIT.max));
      expect(ctx._headers['X-RateLimit-Remaining']).toBe('75');
    });

    it('should set X-RateLimit headers even when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(
        createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 30 }),
      );
      const ctx = createMockContext('/acme/oidc/token/introspection', 'POST');
      await invokeMiddleware(ctx);

      expect(ctx._headers['X-RateLimit-Limit']).toBe(String(INTROSPECTION_RATE_LIMIT.max));
      expect(ctx._headers['X-RateLimit-Remaining']).toBe('0');
    });
  });

  // -------------------------------------------------------------------------
  // INTROSPECTION_PATH_REGEX validation
  // -------------------------------------------------------------------------
  describe('INTROSPECTION_PATH_REGEX', () => {
    it('should match valid org slug introspection paths', () => {
      expect(INTROSPECTION_PATH_REGEX.test('/acme/oidc/token/introspection')).toBe(true);
      expect(INTROSPECTION_PATH_REGEX.test('/my-org/oidc/token/introspection')).toBe(true);
      expect(INTROSPECTION_PATH_REGEX.test('/a/oidc/token/introspection')).toBe(true);
      expect(INTROSPECTION_PATH_REGEX.test('/org123/oidc/token/introspection')).toBe(true);
      expect(INTROSPECTION_PATH_REGEX.test('/test-org-1/oidc/token/introspection')).toBe(true);
    });

    it('should reject paths that do not match the introspection endpoint pattern', () => {
      // Token endpoint (not introspection)
      expect(INTROSPECTION_PATH_REGEX.test('/acme/oidc/token')).toBe(false);
      // Uppercase slug
      expect(INTROSPECTION_PATH_REGEX.test('/ACME/oidc/token/introspection')).toBe(false);
      // Slug starting with hyphen
      expect(INTROSPECTION_PATH_REGEX.test('/-invalid/oidc/token/introspection')).toBe(false);
      // No slug
      expect(INTROSPECTION_PATH_REGEX.test('/oidc/token/introspection')).toBe(false);
      // Extra path segments
      expect(INTROSPECTION_PATH_REGEX.test('/acme/oidc/token/introspection/extra')).toBe(false);
      // Admin path
      expect(INTROSPECTION_PATH_REGEX.test('/api/admin/introspection')).toBe(false);
      // Trailing slash
      expect(INTROSPECTION_PATH_REGEX.test('/acme/oidc/token/introspection/')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Exported constants
  // -------------------------------------------------------------------------
  describe('exported constants', () => {
    it('INTROSPECTION_RATE_LIMIT has max of 100', () => {
      expect(INTROSPECTION_RATE_LIMIT.max).toBe(100);
    });

    it('INTROSPECTION_RATE_LIMIT has windowSeconds of 60', () => {
      expect(INTROSPECTION_RATE_LIMIT.windowSeconds).toBe(60);
    });
  });
});
