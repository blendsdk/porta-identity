/**
 * Unit tests for the token endpoint rate limiter middleware.
 *
 * The middleware rate-limits `POST /:orgSlug/oidc/token` using a per-IP +
 * per-client_id composite key.  It reuses `checkRateLimit()` from the
 * auth rate limiter, which is mocked here to control test outcomes.
 *
 * Tests verify:
 *   T1  — Under limit → passes through with 200
 *   T2  — Over limit → 429 with error body
 *   T3  — Retry-After header on 429
 *   T4  — X-RateLimit-* informational headers on all responses
 *   T5  — Different IPs → independent counters
 *   T6  — Different client_ids → independent counters
 *   T7  — Non-POST method → passes through (no rate limiting)
 *   T8  — Non-token path → passes through (no rate limiting)
 *   T9  — Missing client_id → uses 'unknown' key
 *   T10 — Redis failure → passes through (graceful degradation)
 *   T11 — OAuth error format on 429 body
 *   T12 — Path regex matches valid slugs, rejects invalid ones
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the rate limiter module — we don't want real Redis in unit tests.
// The mock intercepts `checkRateLimit()` calls so we can control the result.
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
  tokenRateLimiter,
  TOKEN_PATH_REGEX,
  TOKEN_RATE_LIMIT,
} from '../../../src/middleware/token-rate-limiter.js';
import type { RateLimitResult } from '../../../src/auth/rate-limiter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Koa-like context for testing the token rate limiter middleware. */
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
 * Build a mock Koa context for the token rate limiter.
 *
 * @param path - Request path (e.g., '/acme/oidc/token')
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
    remaining: 29,
    resetAt: new Date(Date.now() + 300_000),
    retryAfter: 0,
    ...overrides,
  };
}

/**
 * Invoke the token rate limiter middleware with the given context.
 *
 * @returns Whether the `next()` callback was called
 */
async function invokeMiddleware(
  ctx: MockContext,
): Promise<{ nextCalled: boolean }> {
  const middleware = tokenRateLimiter();
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

describe('token-rate-limiter middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: allow requests
    mockCheckRateLimit.mockResolvedValue(createRateLimitResult());
  });

  // -------------------------------------------------------------------------
  // T1: Under limit → passes through
  // -------------------------------------------------------------------------
  it('T1: should pass through when under the rate limit', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: true, remaining: 25 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'my-client',
    });
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(ctx.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // T2: Over limit → 429
  // -------------------------------------------------------------------------
  it('T2: should return 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 120 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'my-client',
    });
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(false);
    expect(ctx.status).toBe(429);
  });

  // -------------------------------------------------------------------------
  // T3: Retry-After header on 429
  // -------------------------------------------------------------------------
  it('T3: should set Retry-After header when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 180 }),
    );
    const ctx = createMockContext('/my-org/oidc/token', 'POST');
    await invokeMiddleware(ctx);

    expect(ctx._headers['Retry-After']).toBe('180');
  });

  // -------------------------------------------------------------------------
  // T4: X-RateLimit-* informational headers on all responses
  // -------------------------------------------------------------------------
  it('T4: should set X-RateLimit-Limit and X-RateLimit-Remaining on allowed requests', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: true, remaining: 22 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'my-client',
    });
    await invokeMiddleware(ctx);

    expect(ctx._headers['X-RateLimit-Limit']).toBe(String(TOKEN_RATE_LIMIT.max));
    expect(ctx._headers['X-RateLimit-Remaining']).toBe('22');
  });

  it('T4b: should set X-RateLimit headers even when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 60 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST');
    await invokeMiddleware(ctx);

    expect(ctx._headers['X-RateLimit-Limit']).toBe(String(TOKEN_RATE_LIMIT.max));
    expect(ctx._headers['X-RateLimit-Remaining']).toBe('0');
  });

  // -------------------------------------------------------------------------
  // T5: Different IPs → independent counters
  // -------------------------------------------------------------------------
  it('T5: should use different rate limit keys for different IPs', async () => {
    const ctx1 = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'my-client',
    });
    const ctx2 = createMockContext('/acme/oidc/token', 'POST', '10.0.0.2', {
      client_id: 'my-client',
    });

    await invokeMiddleware(ctx1);
    await invokeMiddleware(ctx2);

    // Verify checkRateLimit was called with different keys
    const key1 = mockCheckRateLimit.mock.calls[0][0] as string;
    const key2 = mockCheckRateLimit.mock.calls[1][0] as string;
    expect(key1).not.toBe(key2);
    expect(key1).toContain('10.0.0.1');
    expect(key2).toContain('10.0.0.2');
  });

  // -------------------------------------------------------------------------
  // T6: Different client_ids → independent counters
  // -------------------------------------------------------------------------
  it('T6: should use different rate limit keys for different client_ids', async () => {
    const ctx1 = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'client-a',
    });
    const ctx2 = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: 'client-b',
    });

    await invokeMiddleware(ctx1);
    await invokeMiddleware(ctx2);

    const key1 = mockCheckRateLimit.mock.calls[0][0] as string;
    const key2 = mockCheckRateLimit.mock.calls[1][0] as string;
    expect(key1).not.toBe(key2);
    expect(key1).toContain('client-a');
    expect(key2).toContain('client-b');
  });

  // -------------------------------------------------------------------------
  // T7: Non-POST method → passes through
  // -------------------------------------------------------------------------
  it('T7: should pass through without rate limiting for non-POST methods', async () => {
    const ctx = createMockContext('/acme/oidc/token', 'GET');
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    // checkRateLimit should not have been called
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('T7b: should pass through for OPTIONS requests to token endpoint', async () => {
    const ctx = createMockContext('/acme/oidc/token', 'OPTIONS');
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T8: Non-token path → passes through
  // -------------------------------------------------------------------------
  it('T8: should pass through without rate limiting for non-token paths', async () => {
    const ctx = createMockContext('/api/admin/organizations', 'POST');
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('T8b: should pass through for OIDC paths that are not the token endpoint', async () => {
    const ctx = createMockContext('/acme/oidc/auth', 'POST');
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T9: Missing client_id → uses 'unknown' key
  // -------------------------------------------------------------------------
  it('T9: should use "unknown" as client key when client_id is missing from body', async () => {
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {});
    await invokeMiddleware(ctx);

    const key = mockCheckRateLimit.mock.calls[0][0] as string;
    expect(key).toContain('unknown');
  });

  it('T9b: should use "unknown" when request body is undefined', async () => {
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1');
    await invokeMiddleware(ctx);

    const key = mockCheckRateLimit.mock.calls[0][0] as string;
    expect(key).toContain('unknown');
  });

  it('T9c: should use "unknown" when client_id is empty string', async () => {
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.1', {
      client_id: '',
    });
    await invokeMiddleware(ctx);

    const key = mockCheckRateLimit.mock.calls[0][0] as string;
    expect(key).toContain('unknown');
  });

  // -------------------------------------------------------------------------
  // T10: Redis failure → passes through (graceful degradation)
  // -------------------------------------------------------------------------
  it('T10: should pass through when checkRateLimit returns allowed on Redis failure', async () => {
    // checkRateLimit already handles Redis failures internally and returns
    // allowed: true with a warning. This test verifies that behaviour flows
    // through the middleware correctly.
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: true, remaining: 30 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST');
    const { nextCalled } = await invokeMiddleware(ctx);

    expect(nextCalled).toBe(true);
    expect(ctx.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // T11: OAuth error format on 429 body
  // -------------------------------------------------------------------------
  it('T11: should return OAuth-format error body on rate limit exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 90 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST');
    await invokeMiddleware(ctx);

    const body = ctx.body as Record<string, unknown>;
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.error_description).toBe(
      'Too many token requests. Please try again later.',
    );
    expect(body.retry_after).toBe(90);
  });

  it('T11b: should log a warning when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(
      createRateLimitResult({ allowed: false, remaining: 0, retryAfter: 60 }),
    );
    const ctx = createMockContext('/acme/oidc/token', 'POST', '10.0.0.5', {
      client_id: 'spam-client',
    });
    await invokeMiddleware(ctx);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'token_rate_limit_exceeded',
        ip: '10.0.0.5',
        clientId: 'spam-client',
      }),
      'Token endpoint rate limit exceeded',
    );
  });

  // -------------------------------------------------------------------------
  // T12: Path regex validation
  // -------------------------------------------------------------------------
  describe('TOKEN_PATH_REGEX', () => {
    it('should match valid org slug token paths', () => {
      expect(TOKEN_PATH_REGEX.test('/acme/oidc/token')).toBe(true);
      expect(TOKEN_PATH_REGEX.test('/my-org/oidc/token')).toBe(true);
      expect(TOKEN_PATH_REGEX.test('/a/oidc/token')).toBe(true);
      expect(TOKEN_PATH_REGEX.test('/org123/oidc/token')).toBe(true);
      expect(TOKEN_PATH_REGEX.test('/test-org-1/oidc/token')).toBe(true);
    });

    it('should reject paths that do not match the token endpoint pattern', () => {
      // Uppercase slug
      expect(TOKEN_PATH_REGEX.test('/ACME/oidc/token')).toBe(false);
      // Slug starting with hyphen
      expect(TOKEN_PATH_REGEX.test('/-invalid/oidc/token')).toBe(false);
      // No slug
      expect(TOKEN_PATH_REGEX.test('/oidc/token')).toBe(false);
      // Extra path segments
      expect(TOKEN_PATH_REGEX.test('/acme/oidc/token/extra')).toBe(false);
      // Admin path
      expect(TOKEN_PATH_REGEX.test('/api/admin/token')).toBe(false);
      // Different OIDC endpoint
      expect(TOKEN_PATH_REGEX.test('/acme/oidc/auth')).toBe(false);
      // Trailing slash
      expect(TOKEN_PATH_REGEX.test('/acme/oidc/token/')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Exported constants
  // -------------------------------------------------------------------------
  describe('exported constants', () => {
    it('TOKEN_RATE_LIMIT has max of 30', () => {
      expect(TOKEN_RATE_LIMIT.max).toBe(30);
    });

    it('TOKEN_RATE_LIMIT has windowSeconds of 300 (5 minutes)', () => {
      expect(TOKEN_RATE_LIMIT.windowSeconds).toBe(300);
    });
  });
});
