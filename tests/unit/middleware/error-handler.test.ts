import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../../../src/middleware/error-handler.js';

// Mock the logger to prevent actual logging during tests
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createMockContext(overrides = {}): Record<string, unknown> {
  return {
    status: 200,
    body: null,
    method: 'GET',
    url: '/test',
    set: vi.fn(),
    state: {},
    ...overrides,
  };
}

describe('errorHandler middleware', () => {
  it('passes through when no error is thrown', async () => {
    const middleware = errorHandler();
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.status).toBe(200);
  });

  it('catches errors and sets status 500 for unknown errors', async () => {
    const middleware = errorHandler();
    const ctx = createMockContext();
    const next = vi.fn().mockRejectedValue(new Error('Something broke'));

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(500);
    expect(ctx.body).toEqual({
      error: 'Internal Server Error',
      status: 500,
    });
  });

  it('uses error.status when available', async () => {
    const middleware = errorHandler();
    const ctx = createMockContext();
    const error = Object.assign(new Error('Not Found'), { status: 404, expose: true });
    const next = vi.fn().mockRejectedValue(error);

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({
      error: 'Not Found',
      status: 404,
    });
  });

  it('hides error message for 500 errors (expose: false)', async () => {
    const middleware = errorHandler();
    const ctx = createMockContext();
    const error = Object.assign(new Error('DB connection failed'), { status: 500, expose: false });
    const next = vi.fn().mockRejectedValue(error);

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(500);
    expect(ctx.body).toEqual({
      error: 'Internal Server Error',
      status: 500,
    });
  });

  it('exposes error message when expose is true', async () => {
    const middleware = errorHandler();
    const ctx = createMockContext();
    const error = Object.assign(new Error('Bad Request'), { status: 400, expose: true });
    const next = vi.fn().mockRejectedValue(error);

    await middleware(ctx as never, next);

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({
      error: 'Bad Request',
      status: 400,
    });
  });

  it('logs 500 errors', async () => {
    const { logger } = await import('../../../src/lib/logger.js');
    const middleware = errorHandler();
    const ctx = createMockContext();
    const next = vi.fn().mockRejectedValue(new Error('Server crash'));

    await middleware(ctx as never, next);

    expect(logger.error).toHaveBeenCalled();
  });

  it('does not log 4xx errors', async () => {
    const { logger } = await import('../../../src/lib/logger.js');
    vi.mocked(logger.error).mockClear();
    const middleware = errorHandler();
    const ctx = createMockContext();
    const error = Object.assign(new Error('Not Found'), { status: 404, expose: true });
    const next = vi.fn().mockRejectedValue(error);

    await middleware(ctx as never, next);

    expect(logger.error).not.toHaveBeenCalled();
  });
});
