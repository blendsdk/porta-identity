import { describe, it, expect, vi } from 'vitest';
import { csrfProtection, getCsrfToken } from '../../src/server/middleware/csrf.js';

/**
 * Tests for CSRF protection middleware.
 * Verifies token generation, validation, and safe method bypass.
 */

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

    expect(session._csrfToken).toBeDefined();
    expect(typeof session._csrfToken).toBe('string');
    expect((session._csrfToken as string).length).toBe(64); // 32 bytes hex = 64 chars
    expect(next).toHaveBeenCalled();
  });

  it('should allow POST /api/* with valid X-CSRF-Token header', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'valid-token-123',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should reject POST /api/* without X-CSRF-Token header', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(403);
    expect((ctx.body as Record<string, string>).error).toBe('Invalid CSRF token');
  });

  it('should reject POST /api/* with invalid CSRF token', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/api/organizations', session, {
      'x-csrf-token': 'wrong-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(403);
  });

  it('should allow GET /api/* without CSRF token (safe method)', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('GET', '/api/organizations', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should allow POST /auth/* without CSRF validation', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('POST', '/auth/logout', session);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 with error message on rejection', async () => {
    const session: Record<string, unknown> = { _csrfToken: 'valid-token-123' };
    const ctx = createMockCtx('DELETE', '/api/users/1', session, {
      'x-csrf-token': 'bad-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(403);
    expect(ctx.body).toEqual({ error: 'Invalid CSRF token' });
  });
});

describe('getCsrfToken', () => {
  it('should return the CSRF token from session', () => {
    const session = { _csrfToken: 'my-token' };
    expect(getCsrfToken(session)).toBe('my-token');
  });

  it('should return undefined if no session', () => {
    expect(getCsrfToken(undefined)).toBeUndefined();
  });

  it('should return undefined if session has no CSRF token', () => {
    expect(getCsrfToken({})).toBeUndefined();
  });
});
