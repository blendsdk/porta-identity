import { describe, it, expect, vi } from 'vitest';
import { sessionGuard } from '../../src/server/middleware/session-guard.js';

/**
 * Tests for session guard middleware.
 * Verifies that /api/* routes are protected and non-API routes pass through.
 */

/** Create a mock Koa context */
function createMockCtx(
  path: string,
  session?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    path,
    session: session ?? undefined,
    status: 200,
    body: undefined,
  };
}

describe('Session Guard Middleware', () => {
  const middleware = sessionGuard();

  it('should allow /api/* requests with valid session', async () => {
    const ctx = createMockCtx('/api/organizations', {
      accessToken: 'valid-token',
      user: { id: '1', email: 'admin@test.com', name: 'Admin', roles: ['porta-admin'], orgId: 'org-1' },
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('should reject /api/* requests without session', async () => {
    const ctx = createMockCtx('/api/organizations', undefined);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(401);
    expect((ctx.body as Record<string, string>).error).toBe('Not authenticated. Please log in.');
  });

  it('should reject /api/* requests with session missing accessToken', async () => {
    const ctx = createMockCtx('/api/organizations', {
      user: { id: '1', email: 'admin@test.com', name: 'Admin', roles: [], orgId: 'org-1' },
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(401);
  });

  it('should reject /api/* requests with session missing user', async () => {
    const ctx = createMockCtx('/api/organizations', {
      accessToken: 'valid-token',
    });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(401);
  });

  it('should pass through non-/api/* routes without checking session', async () => {
    const ctx = createMockCtx('/auth/login', undefined);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 401 with error message on rejection', async () => {
    const ctx = createMockCtx('/api/users', null);
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: 'Not authenticated. Please log in.' });
    expect(next).not.toHaveBeenCalled();
  });
});
