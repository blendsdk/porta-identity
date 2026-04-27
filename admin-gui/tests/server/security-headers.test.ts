import { describe, it, expect, vi } from 'vitest';
import { securityHeaders } from '../../src/server/middleware/security-headers.js';
import type { BffConfig } from '../../src/server/config.js';

/**
 * Tests for security headers middleware.
 * Verifies all security headers are correctly set on responses.
 */

/** Create a minimal BFF config for testing */
function createConfig(overrides: Partial<BffConfig> = {}): BffConfig {
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
    ...overrides,
  };
}

/** Create a mock Koa context that captures headers */
function createMockCtx(path: string): {
  ctx: Record<string, unknown>;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const ctx = {
    path,
    set: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  return { ctx, headers };
}

describe('Security Headers Middleware', () => {
  it('should set Content-Security-Policy header', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
  });

  it('should set X-Frame-Options to DENY', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('should set X-Content-Type-Options to nosniff', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should set Referrer-Policy', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should set X-XSS-Protection', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
  });

  it('should set HSTS in production mode', async () => {
    const middleware = securityHeaders(createConfig({ nodeEnv: 'production' }));
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('should NOT set HSTS in development mode', async () => {
    const middleware = securityHeaders(createConfig({ nodeEnv: 'development' }));
    const { ctx, headers } = createMockCtx('/');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('should set no-cache headers on /api/ routes', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/api/organizations');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
    expect(headers['Pragma']).toBe('no-cache');
  });

  it('should set no-cache headers on /auth/ routes', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/auth/me');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
    expect(headers['Pragma']).toBe('no-cache');
  });

  it('should NOT set no-cache headers on static asset routes', async () => {
    const middleware = securityHeaders(createConfig());
    const { ctx, headers } = createMockCtx('/assets/index.js');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(headers['Cache-Control']).toBeUndefined();
    expect(headers['Pragma']).toBeUndefined();
  });
});
