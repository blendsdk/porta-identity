import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHealthRouter } from '../../src/server/routes/health.js';
import type { BffConfig } from '../../src/server/config.js';

/**
 * Tests for health check route.
 * Verifies Redis and Porta connectivity checks and status responses.
 */

/** Create a minimal BFF config for testing */
function createConfig(): BffConfig {
  return {
    port: 4002,
    portaUrl: 'http://localhost:4000',
    publicUrl: 'http://localhost:4002',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    sessionSecret: 'a'.repeat(32),
    redisUrl: 'redis://localhost:6379',
    nodeEnv: 'development',
    logLevel: 'info',
  };
}

/** Create a mock Redis client */
function createMockRedis(pingResult: 'ok' | 'error' = 'ok') {
  return {
    ping: pingResult === 'ok'
      ? vi.fn().mockResolvedValue('PONG')
      : vi.fn().mockRejectedValue(new Error('Connection refused')),
  };
}

/** Create a mock Koa context for route testing */
function createMockCtx(): {
  ctx: Record<string, unknown>;
  getStatus: () => number;
  getBody: () => Record<string, unknown>;
} {
  let status = 200;
  let body: Record<string, unknown> = {};

  const ctx = {
    path: '/health',
    method: 'GET',
    get status() { return status; },
    set status(s: number) { status = s; },
    get body() { return body; },
    set body(b: unknown) { body = b as Record<string, unknown>; },
  };

  return {
    ctx,
    getStatus: () => status,
    getBody: () => body,
  };
}

/** Extract the route handler from the router */
function getHealthHandler(config: BffConfig, redis: unknown) {
  const router = createHealthRouter(config, redis as never);
  // Get the first GET route handler
  const layer = router.stack.find((l) => l.path === '/health' && l.methods.includes('GET'));
  if (!layer) throw new Error('Health route not found');
  // The handler is the last item in the stack array
  return layer.stack[layer.stack.length - 1];
}

describe('Health Check Route', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return 200 with status ok when all checks pass', async () => {
    const config = createConfig();
    const redis = createMockRedis('ok');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const handler = getHealthHandler(config, redis);
    const { ctx, getStatus, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    expect(getStatus()).toBe(200);
    expect(getBody().status).toBe('ok');
    expect((getBody().checks as Record<string, string>).redis).toBe('ok');
    expect((getBody().checks as Record<string, string>).porta).toBe('ok');
  });

  it('should return 503 with status degraded when Redis is down', async () => {
    const config = createConfig();
    const redis = createMockRedis('error');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const handler = getHealthHandler(config, redis);
    const { ctx, getStatus, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    expect(getStatus()).toBe(503);
    expect(getBody().status).toBe('degraded');
    expect((getBody().checks as Record<string, string>).redis).toBe('error');
    expect((getBody().checks as Record<string, string>).porta).toBe('ok');
  });

  it('should return 503 with status degraded when Porta is unreachable', async () => {
    const config = createConfig();
    const redis = createMockRedis('ok');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const handler = getHealthHandler(config, redis);
    const { ctx, getStatus, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    expect(getStatus()).toBe(503);
    expect(getBody().status).toBe('degraded');
    expect((getBody().checks as Record<string, string>).redis).toBe('ok');
    expect((getBody().checks as Record<string, string>).porta).toBe('error');
  });

  it('should return 503 with status error when both are down', async () => {
    const config = createConfig();
    const redis = createMockRedis('error');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const handler = getHealthHandler(config, redis);
    const { ctx, getStatus, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    expect(getStatus()).toBe(503);
    expect(getBody().status).toBe('error');
    expect((getBody().checks as Record<string, string>).redis).toBe('error');
    expect((getBody().checks as Record<string, string>).porta).toBe('error');
  });

  it('should include uptime in seconds', async () => {
    const config = createConfig();
    const redis = createMockRedis('ok');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const handler = getHealthHandler(config, redis);
    const { ctx, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    expect(typeof getBody().uptime).toBe('number');
    expect(getBody().uptime as number).toBeGreaterThanOrEqual(0);
  });

  it('should include individual check statuses', async () => {
    const config = createConfig();
    const redis = createMockRedis('ok');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const handler = getHealthHandler(config, redis);
    const { ctx, getBody } = createMockCtx();

    await handler(ctx as never, vi.fn());

    const checks = getBody().checks as Record<string, string>;
    expect(checks).toHaveProperty('redis');
    expect(checks).toHaveProperty('porta');
    expect(['ok', 'error']).toContain(checks.redis);
    expect(['ok', 'error']).toContain(checks.porta);
  });
});
