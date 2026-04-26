import { describe, it, expect, vi } from 'vitest';
import { csrfProtection, getCsrfToken } from '../../src/server/middleware/csrf.js';

/**
 * Tests for CSRF protection middleware.
 * Verifies token generation, validation, safe method bypass,
 * and unauthenticated session bypass (session guard handles 401).
 */

/** Minimal auth session data for tests that require an authenticated session */
const AUTH_SESSION = {
  accessToken: 'test-access-token',
  user: { id: 'u1', email: 'test@example.com', name: 'Test', roles: [], orgId: 'o1' },
};

/** Create a mock Koa context for CSRF tests */
function createMockCtx(
  method: string,
  path: string,
  session: Record<string, unknown> | null,
  headers: Record<string, string> = {},
): Record<string, unknown> {
  return {
    method,
    path,
    session,
    status: 200,
    body: undefined,
    get: (name: string) => headers[name.toLowerCase()] || '',
  };
}

describe('CSRF Protection Middleware', () => {
  const middleware = csrfProtection();

  it('should generate CSRF token in session on first request', async () => {
    const session: Record<string, unknown> = {};
    const ctx = createMockCtx('GET', '/api/test', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(session.csrfSecret).toBeDefined();
    expect(typeof session.csrfSecret).toBe('string');
    expect((session.csrfSecret as string).length).toBe(64); // 32 bytes hex = 64 chars
    expect(next).toHaveBeenCalled();
  });

  it('should allow POST /api/* with valid X-CSRF-Token header (authenticated session)', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'valid-token-123',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should reject POST /api/* without X-CSRF-Token header (authenticated session)', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(403);
    expect((ctx.body as Record<string, string>).error).toBe('Invalid CSRF token');
  });

  it('should reject POST /api/* with invalid CSRF token (authenticated session)', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'wrong-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(403);
  });

  it('should allow GET /api/* without CSRF token (safe method)', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('GET', '/api/organizations', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should allow POST /auth/* without CSRF validation', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/auth/logout', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 with error message on rejection (authenticated session)', async () => {
    const session: Record<string, unknown> = { ...AUTH_SESSION, csrfSecret: 'valid-token-123' };
    const ctx = createMockCtx('DELETE', '/api/users/1', session, {
      'x-csrf-token': 'bad-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(403);
    expect(ctx.body).toEqual({ error: 'Invalid CSRF token' });
  });

  // ── Unauthenticated/expired session bypass ───────────────────────
  // When the session has no auth data (expired or never authenticated),
  // CSRF validation is skipped so the downstream session guard can
  // return a proper 401 instead of a misleading 403 "Invalid CSRF token".

  it('should skip CSRF validation for unauthenticated session (no accessToken)', async () => {
    const session: Record<string, unknown> = { csrfSecret: 'some-token' };
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'wrong-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    // Should pass through to next middleware (session guard will reject with 401)
    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should skip CSRF validation for empty session (expired)', async () => {
    // Simulates an expired session: koa-session creates a new empty session
    // with a freshly generated CSRF token, but no auth data
    const session: Record<string, unknown> = {};
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'stale-token-from-spa',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    // Should pass through — session guard handles the 401
    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should skip CSRF validation for session with accessToken but no user', async () => {
    const session: Record<string, unknown> = { accessToken: 'token', csrfSecret: 'csrf' };
    const ctx = createMockCtx('DELETE', '/api/users/1', session, {
      'x-csrf-token': 'wrong',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    // Missing user → not authenticated → skip CSRF
    expect(next).toHaveBeenCalled();
  });

  it('should skip CSRF validation for session with user but no accessToken', async () => {
    const session: Record<string, unknown> = { user: AUTH_SESSION.user, csrfSecret: 'csrf' };
    const ctx = createMockCtx('PUT', '/api/config', session, {
      'x-csrf-token': 'wrong',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    // Missing accessToken → not authenticated → skip CSRF
    expect(next).toHaveBeenCalled();
  });
});

describe('getCsrfToken', () => {
  it('should return the CSRF token from session', () => {
    const session = { csrfSecret: 'my-token' };
    expect(getCsrfToken(session)).toBe('my-token');
  });

  it('should return undefined if no session', () => {
    expect(getCsrfToken(undefined)).toBeUndefined();
  });

  it('should return undefined if session has no CSRF token', () => {
    expect(getCsrfToken({})).toBeUndefined();
  });
});
