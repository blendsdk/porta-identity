/**
 * Unit tests for error handler middleware.
 *
 * Verifies that internal details are never leaked in error responses.
 */

import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';

/** Minimal Koa context mock. */
function createMockContext() {
  return {
    status: 200,
    body: undefined as unknown,
    method: 'GET',
    path: '/test',
  };
}

describe('errorHandler middleware', () => {
  it('passes through when no error occurs', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    await middleware(ctx as any, async () => {
      ctx.status = 200;
      ctx.body = { ok: true };
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ ok: true });
  });

  it('returns 500 with generic message for unhandled errors', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await middleware(ctx as any, async () => {
      throw new Error('Database connection failed at /var/lib/postgres');
    });

    expect(ctx.status).toBe(500);
    expect((ctx.body as any).error).toBe('Internal server error');
    // Internal details MUST NOT be in the response
    expect(JSON.stringify(ctx.body)).not.toContain('Database');
    expect(JSON.stringify(ctx.body)).not.toContain('/var/lib');

    consoleSpy.mockRestore();
  });

  it('uses error status code when available (4xx)', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();

    const err = new Error('Not found') as Error & { status: number };
    err.status = 404;

    await middleware(ctx as any, async () => {
      throw err;
    });

    expect(ctx.status).toBe(404);
    expect((ctx.body as any).error).toBe('Not found');
  });

  it('returns generic message for 5xx errors even with error.message', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new Error('Internal DB pool exhausted') as Error & { status: number };
    err.status = 503;

    await middleware(ctx as any, async () => {
      throw err;
    });

    expect(ctx.status).toBe(503);
    expect((ctx.body as any).error).toBe('Internal server error');

    consoleSpy.mockRestore();
  });

  it('does not leak stack traces', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await middleware(ctx as any, async () => {
      throw new Error('Something broke');
    });

    const bodyStr = JSON.stringify(ctx.body);
    expect(bodyStr).not.toContain('at ');
    expect(bodyStr).not.toContain('.ts');
    expect(bodyStr).not.toContain('.js');
    expect(bodyStr).not.toContain('stack');

    consoleSpy.mockRestore();
  });

  it('logs 5xx errors to console', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await middleware(ctx as any, async () => {
      throw new Error('Boom');
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('does not log 4xx errors to console', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new Error('Bad request') as Error & { status: number };
    err.status = 400;

    await middleware(ctx as any, async () => {
      throw err;
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles non-Error throws', async () => {
    const ctx = createMockContext();
    const middleware = errorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await middleware(ctx as any, async () => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });

    expect(ctx.status).toBe(500);
    expect((ctx.body as any).error).toBe('Internal server error');

    consoleSpy.mockRestore();
  });
});
