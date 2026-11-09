/**
 * Regression tests for case-insensitive admin path gates.
 *
 * @koa/router matches case-insensitively by default. The audit, rate-limit, and CORS middleware
 * must use the same normalized path or a mixed-case admin request can bypass shared controls.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../src/config/index.js';
import { adminCors } from '../../../src/middleware/admin-cors.js';
import { adminRateLimiter } from '../../../src/middleware/admin-rate-limiter.js';

const checkRateLimit = vi.hoisted(() => vi.fn());

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit,
}));

function context(path: string, method = 'POST', origin?: string): Koa.Context {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = method;
  incoming.url = path;
  if (origin) incoming.headers.origin = origin;
  return new Koa().createContext(incoming, new ServerResponse(incoming));
}

describe('shared admin path normalization', () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfter: 0 });
  });

  it('rate-limits a mixed-case admin write path', async () => {
    const ctx = context('/Api/Admin/applications/abc/resource-servers');
    const next = vi.fn(async () => undefined);

    await adminRateLimiter()(ctx, next);

    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.response.get('X-RateLimit-Limit')).toBe('60');
  });

  it('applies admin CORS to a mixed-case admin path', async () => {
    const ctx = context('/Api/Admin/applications/abc/resource-servers', 'GET', 'https://app.test');
    const next = vi.fn(async () => undefined);

    await adminCors({ adminCorsOrigins: ['https://app.test'] } as AppConfig)(ctx, next);

    expect(ctx.response.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
