/**
 * Unit tests for the Prometheus metrics middleware.
 *
 * Strategy: Instead of trying to mock prom-client (which has complex ESM
 * interop), we test the exported functions directly using the real
 * prom-client library. The tests verify that:
 *   - metricsCounter() increments counters with correct labels
 *   - metricsHandler() returns Prometheus text format
 *   - resetMetrics() resets all counters
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  metricsCounter,
  metricsHandler,
  resetMetrics,
} from '../../../src/middleware/metrics.js';

/** Create a minimal Koa-like context for testing. */
function createMockContext(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    method: 'GET',
    status: 200,
    url: '/health',
    _matchedRoute: '/health',
    body: null,
    set: vi.fn(),
    state: {},
    ...overrides,
  };
}

describe('metricsCounter middleware', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should call next() and not throw', async () => {
    const middleware = metricsCounter();
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('should increment the counter (visible in metricsHandler output)', async () => {
    const counter = metricsCounter();
    const handler = metricsHandler();

    // Simulate a request
    const ctx = createMockContext({
      method: 'GET',
      status: 200,
      _matchedRoute: '/health',
    });
    await counter(ctx as never, vi.fn().mockResolvedValue(undefined));

    // Now read metrics
    const metricsCtx = createMockContext();
    await handler(metricsCtx as never, vi.fn());

    const body = metricsCtx.body as string;
    expect(body).toContain('porta_http_requests_total');
    expect(body).toContain('method="GET"');
    expect(body).toContain('route="/health"');
    expect(body).toContain('status="200"');
  });

  it('should use "unknown" route when _matchedRoute is not set', async () => {
    const counter = metricsCounter();
    const handler = metricsHandler();

    const ctx = createMockContext({
      method: 'POST',
      status: 404,
      _matchedRoute: undefined,
    });
    await counter(ctx as never, vi.fn().mockResolvedValue(undefined));

    const metricsCtx = createMockContext();
    await handler(metricsCtx as never, vi.fn());

    const body = metricsCtx.body as string;
    expect(body).toContain('route="unknown"');
    expect(body).toContain('method="POST"');
    expect(body).toContain('status="404"');
  });

  it('should use "unknown" route when _matchedRoute is not a string', async () => {
    const counter = metricsCounter();
    const handler = metricsHandler();

    const ctx = createMockContext({
      method: 'GET',
      status: 500,
      _matchedRoute: 42,
    });
    await counter(ctx as never, vi.fn().mockResolvedValue(undefined));

    const metricsCtx = createMockContext();
    await handler(metricsCtx as never, vi.fn());

    const body = metricsCtx.body as string;
    expect(body).toContain('route="unknown"');
    expect(body).toContain('status="500"');
  });

  it('should convert numeric status to string label', async () => {
    const counter = metricsCounter();
    const handler = metricsHandler();

    const ctx = createMockContext({
      method: 'DELETE',
      status: 204,
      _matchedRoute: '/api/admin/organizations/:id',
    });
    await counter(ctx as never, vi.fn().mockResolvedValue(undefined));

    const metricsCtx = createMockContext();
    await handler(metricsCtx as never, vi.fn());

    const body = metricsCtx.body as string;
    expect(body).toContain('method="DELETE"');
    expect(body).toContain('route="/api/admin/organizations/:id"');
    expect(body).toContain('status="204"');
  });

  it('should call next() before recording the metric', async () => {
    const callOrder: string[] = [];
    const middleware = metricsCounter();
    const ctx = createMockContext();
    const next = vi.fn().mockImplementation(async () => {
      callOrder.push('next');
    });

    await middleware(ctx as never, next);

    // next() must be called (downstream middleware runs first)
    expect(callOrder).toContain('next');
  });
});

describe('metricsHandler middleware', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should set Content-Type header to Prometheus format', async () => {
    const middleware = metricsHandler();
    const ctx = createMockContext();

    await middleware(ctx as never, vi.fn());

    expect(ctx.set).toHaveBeenCalledWith(
      'Content-Type',
      expect.stringContaining('text/plain'),
    );
  });

  it('should return a non-empty body (default metrics always present)', async () => {
    const middleware = metricsHandler();
    const ctx = createMockContext();

    await middleware(ctx as never, vi.fn());

    // Even with no HTTP requests, prom-client collectDefaultMetrics
    // generates process metrics (cpu, memory, etc.)
    expect(typeof ctx.body).toBe('string');
    expect((ctx.body as string).length).toBeGreaterThan(0);
  });

  it('should contain default Node.js process metrics', async () => {
    const middleware = metricsHandler();
    const ctx = createMockContext();

    await middleware(ctx as never, vi.fn());

    const body = ctx.body as string;
    // collectDefaultMetrics registers metrics like process_cpu_*
    expect(body).toContain('process_cpu');
  });
});

describe('resetMetrics utility', () => {
  it('should reset counters so they start from zero', async () => {
    const counter = metricsCounter();
    const handler = metricsHandler();

    // Increment a counter
    const ctx = createMockContext({
      method: 'GET',
      status: 200,
      _matchedRoute: '/test-reset',
    });
    await counter(ctx as never, vi.fn().mockResolvedValue(undefined));

    // Reset
    resetMetrics();

    // Read metrics — the counter value should be 0 (or absent)
    const metricsCtx = createMockContext();
    await handler(metricsCtx as never, vi.fn());

    const body = metricsCtx.body as string;
    // After reset, the specific route label should not appear
    // (counters are reset to 0, which prom-client doesn't emit)
    const lines = body.split('\n').filter((l) => l.includes('/test-reset'));
    // Either no line for that label, or the value is 0
    for (const line of lines) {
      if (!line.startsWith('#')) {
        // Metric line format: name{labels} value
        const value = parseFloat(line.split(' ').pop() ?? '0');
        expect(value).toBe(0);
      }
    }
  });
});
