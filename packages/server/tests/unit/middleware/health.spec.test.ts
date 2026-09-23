import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infrastructure modules before importing the handler, mirroring the
// readiness-probe unit suite so the liveness probe is tested without a live
// PostgreSQL or Redis dependency.
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

import { healthCheck } from '../../../src/middleware/health.js';

/** Create a minimal Koa-like context object for unit testing. */
function createMockContext(): Record<string, unknown> {
  return {
    status: 200,
    body: null,
    method: 'GET',
    url: '/health',
    set: vi.fn(),
    state: {},
  };
}

/** Reject after `ms` so a hung dependency cannot stall the test indefinitely. */
function guardAfter(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

describe('healthCheck middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 with status "healthy" when DB and Redis are healthy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockResolvedValue('PONG');

    const ctx = createMockContext();
    await healthCheck()(ctx as never, vi.fn());

    expect(ctx.status).toBe(200);
    const body = ctx.body as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('healthy');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.redis).toBe('ok');
  });

  it('should return 503 when the database check fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    mockPing.mockResolvedValue('PONG');

    const ctx = createMockContext();
    await healthCheck()(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
    expect(body.checks.redis).toBe('ok');
  });

  it('should return 503 when the Redis check fails', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const ctx = createMockContext();
    await healthCheck()(ctx as never, vi.fn());

    expect(ctx.status).toBe(503);
    const body = ctx.body as { status: string; checks: Record<string, string> };
    expect(body.checks.database).toBe('ok');
    expect(body.checks.redis).toBe('error');
  });

  it('should fail within a bound when the database check hangs', async () => {
    mockQuery.mockImplementation(() => new Promise(() => {}));
    mockPing.mockResolvedValue('PONG');

    const ctx = createMockContext();
    const outcome = await Promise.race([
      healthCheck()(ctx as never, vi.fn()).then(() => 'done' as const),
      guardAfter(3_000),
    ]);

    expect(outcome).toBe('done');
    expect(ctx.status).toBe(503);
    const body = ctx.body as { checks: Record<string, string> };
    expect(body.checks.database).toBe('error');
  }, 10_000);

  it('should fail within a bound when the Redis check hangs', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockPing.mockImplementation(() => new Promise(() => {}));

    const ctx = createMockContext();
    const outcome = await Promise.race([
      healthCheck()(ctx as never, vi.fn()).then(() => 'done' as const),
      guardAfter(3_000),
    ]);

    expect(outcome).toBe('done');
    expect(ctx.status).toBe(503);
    const body = ctx.body as { checks: Record<string, string> };
    expect(body.checks.redis).toBe('error');
  }, 10_000);
});
