import { describe, it, expect, vi } from 'vitest';
import { requestLogger } from '../../../src/middleware/request-logger.js';

// Mock the logger
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createMockContext(overrides = {}): Record<string, unknown> {
  const headers: Record<string, string> = {};
  return {
    status: 200,
    method: 'GET',
    url: '/test',
    state: {},
    set: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    _headers: headers,
    ...overrides,
  };
}

describe('requestLogger middleware', () => {
  it('sets X-Request-Id header', async () => {
    const middleware = requestLogger();
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect(ctx.set).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
  });

  it('stores requestId in ctx.state', async () => {
    const middleware = requestLogger();
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect((ctx.state as Record<string, unknown>).requestId).toBeDefined();
    expect(typeof (ctx.state as Record<string, unknown>).requestId).toBe('string');
  });

  it('generates unique request IDs', async () => {
    const middleware = requestLogger();
    const ctx1 = createMockContext();
    const ctx2 = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx1 as never, next);
    await middleware(ctx2 as never, next);

    expect((ctx1.state as Record<string, unknown>).requestId).not.toBe(
      (ctx2.state as Record<string, unknown>).requestId,
    );
  });

  it('calls next()', async () => {
    const middleware = requestLogger();
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('logs request info with method, url, status, and duration', async () => {
    const { logger } = await import('../../../src/lib/logger.js');
    vi.mocked(logger.info).mockClear();
    const middleware = requestLogger();
    const ctx = createMockContext({ method: 'POST', url: '/api/test', status: 201 });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        method: 'POST',
        url: '/api/test',
        status: 201,
        duration: expect.any(Number),
      }),
      expect.stringContaining('POST /api/test'),
    );
  });
});
