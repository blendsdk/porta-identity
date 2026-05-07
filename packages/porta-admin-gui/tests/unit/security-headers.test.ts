/**
 * Unit tests for security headers middleware.
 *
 * Verifies all required security headers are set on every response.
 */

import { describe, it, expect } from 'vitest';
import { securityHeaders } from '../../src/middleware/security-headers.js';

/** Minimal Koa-like context mock for testing middleware. */
function createMockContext() {
  const headers: Record<string, string> = {};
  return {
    set(name: string, value: string) {
      headers[name] = value;
    },
    _headers: headers,
  };
}

describe('securityHeaders middleware', () => {
  it('sets Content-Security-Policy header', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['Content-Security-Policy']).toBeDefined();
    expect(ctx._headers['Content-Security-Policy']).toContain("default-src 'self'");
  });

  it('allows unsafe-inline styles for FluentUI', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['Content-Security-Policy']).toContain("'unsafe-inline'");
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets Referrer-Policy', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('does not set HSTS (HTTP localhost)', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    await middleware(ctx as any, async () => {});

    expect(ctx._headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('calls next() in the chain', async () => {
    const ctx = createMockContext();
    const middleware = securityHeaders();
    let nextCalled = false;
    await middleware(ctx as any, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });
});
