import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock infrastructure modules before importing the handler.
// vi.hoisted() declares variables that are available to the hoisted
// vi.mock factories (which run before any top-level const/let).
// ---------------------------------------------------------------------------
const { mockQuery, mockPing } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPing: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({ query: mockQuery }),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue({ ping: mockPing }),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { readyHandler } from '../../../src/middleware/ready.js';
import { logger } from '../../../src/lib/logger.js';

/** Create a minimal Koa-like context object for unit testing. */
function createMockContext(): Record<string, unknown> {
  return {
    status: 200,
    body: null,
    method: 'GET',
    url: '/ready',
    set: vi.fn(),
    state: {},
  };
}

describe('readyHandler middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 with status "ready" when DB and Redis are healthy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockResolvedValue('PONG');

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(ctx.status).toBe(200);
    const body = ctx.body as { status: string; checks: Record<string, { ok: boolean }> };
    expect(body.status).toBe('ready');
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
  });

  it('should return 503 with status "not_ready" when DB is down', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    mockPing.mockResolvedValue('PONG');

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, { ok: boolean; error?: string }> };
    expect(body.status).toBe('not_ready');
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.error).toContain('connection refused');
    expect(body.checks.redis.ok).toBe(true);
  });

  it('should return 503 with status "not_ready" when Redis is down', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, { ok: boolean; error?: string }> };
    expect(body.status).toBe('not_ready');
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(false);
    expect(body.checks.redis.error).toContain('ECONNREFUSED');
  });

  it('should return 503 when both DB and Redis are down', async () => {
    mockQuery.mockRejectedValue(new Error('db error'));
    mockPing.mockRejectedValue(new Error('redis error'));

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, { ok: boolean }> };
    expect(body.status).toBe('not_ready');
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.redis.ok).toBe(false);
  });

  it('should log a warning when the probe is degraded', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    mockPing.mockResolvedValue('PONG');

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ready.degraded' }),
      'readiness probe failed',
    );
  });

  it('should NOT log a warning when the probe is healthy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockResolvedValue('PONG');

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should handle DB timeout as a failure', async () => {
    // Simulate a query that never resolves (will hit the 2s timeout)
    mockQuery.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );
    mockPing.mockResolvedValue('PONG');

    const middleware = readyHandler();
    const ctx = createMockContext();
    await middleware(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, { ok: boolean; error?: string }> };
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.error).toContain('timeout');
  }, 10_000); // extended timeout for this test
});
