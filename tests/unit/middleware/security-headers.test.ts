/**
 * Unit tests for the global security-headers middleware.
 *
 * The middleware sets defence-in-depth HTTP security headers on every
 * response. Tests exercise it with a minimal mock Koa context, verifying:
 *
 *   - All static security headers are present and correct on every response
 *   - Content-Security-Policy defaults to strict `default-src 'none'`
 *   - CSP is relaxed for text/html responses (inline styles + form-action)
 *   - HSTS is conditionally emitted based on issuer URL scheme
 *   - Headers survive downstream errors (set before `await next()`)
 *   - Exported constants match the values actually set
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the config module so we can control issuerBaseUrl for HSTS tests.
// vi.hoisted() ensures the variable is available when vi.mock's factory
// runs (vi.mock is hoisted above all imports by Vitest).
// ---------------------------------------------------------------------------
const mockConfig = vi.hoisted(() => ({
  issuerBaseUrl: 'http://localhost:3000',
}));
vi.mock('../../../src/config/index.js', () => ({
  config: mockConfig,
}));

import {
  securityHeaders,
  STATIC_SECURITY_HEADERS,
  DEFAULT_CSP,
  HTML_CSP,
  HSTS_VALUE,
} from '../../../src/middleware/security-headers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Koa-like context with header tracking for middleware invocation. */
interface MockContext {
  status: number;
  body: unknown;
  type: string;
  response: { get(name: string): string };
  _headers: Record<string, string>;
  set(name: string, value: string): void;
}

/**
 * Build a mock Koa context. The security-headers middleware only uses
 * `ctx.set()`, `ctx.response.get()`, and reads no request properties.
 */
function createMockContext(_contentType = ''): MockContext {
  const headers: Record<string, string> = {};
  return {
    status: 200,
    body: null,
    type: '',
    response: {
      get(name: string): string {
        return headers[name] || '';
      },
    },
    _headers: headers,
    set(name: string, value: string) {
      headers[name] = value;
    },
  };
}

/**
 * Invoke the security-headers middleware against a mock context.
 *
 * The `downstream` callback simulates the downstream Koa middleware chain.
 * It runs after Phase 1 (static headers set) and before Phase 3 (CSP
 * adjustment). Use it to set `ctx.type` or `Content-Type` to simulate
 * route handlers producing HTML or JSON responses.
 */
async function invokeMiddleware(
  downstream?: (ctx: MockContext) => void | Promise<void>,
): Promise<MockContext> {
  const middleware = securityHeaders();
  const ctx = createMockContext();

  await middleware(
    ctx as unknown as Parameters<typeof middleware>[0],
    async () => {
      if (downstream) {
        await downstream(ctx);
      }
    },
  );

  return ctx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('security-headers middleware', () => {
  beforeEach(() => {
    // Reset to HTTP issuer for most tests (no HSTS).
    mockConfig.issuerBaseUrl = 'http://localhost:3000';
  });

  // -------------------------------------------------------------------------
  // Static headers — present on every response
  // -------------------------------------------------------------------------

  describe('static security headers', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const ctx = await invokeMiddleware();
      expect(ctx._headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY', async () => {
      const ctx = await invokeMiddleware();
      expect(ctx._headers['X-Frame-Options']).toBe('DENY');
    });

    it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
      const ctx = await invokeMiddleware();
      expect(ctx._headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets X-XSS-Protection: 0 (disable legacy filter)', async () => {
      const ctx = await invokeMiddleware();
      expect(ctx._headers['X-XSS-Protection']).toBe('0');
    });

    it('sets Permissions-Policy restricting browser APIs', async () => {
      const ctx = await invokeMiddleware();
      const policy = ctx._headers['Permissions-Policy'];
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
      expect(policy).toContain('payment=()');
    });

    it('sets all headers from STATIC_SECURITY_HEADERS constant', async () => {
      const ctx = await invokeMiddleware();
      for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
        expect(ctx._headers[name], `header ${name}`).toBe(value);
      }
    });

    it('headers are present even when downstream sets no body', async () => {
      const ctx = await invokeMiddleware(() => {
        // Downstream does nothing — simulates a 404 passthrough.
      });
      for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
        expect(ctx._headers[name], `header ${name}`).toBe(value);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Content-Security-Policy — route-aware
  // -------------------------------------------------------------------------

  describe('Content-Security-Policy', () => {
    it('defaults to strict CSP for non-HTML responses', async () => {
      const ctx = await invokeMiddleware((c) => {
        // Simulate a JSON API response
        c._headers['Content-Type'] = 'application/json; charset=utf-8';
        c.body = { ok: true };
      });
      expect(ctx._headers['Content-Security-Policy']).toBe(DEFAULT_CSP);
    });

    it('defaults to strict CSP when no Content-Type is set', async () => {
      const ctx = await invokeMiddleware();
      expect(ctx._headers['Content-Security-Policy']).toBe(DEFAULT_CSP);
    });

    it('relaxes CSP for text/html responses', async () => {
      const ctx = await invokeMiddleware((c) => {
        // Simulate an HTML page response (login, consent, etc.)
        c._headers['Content-Type'] = 'text/html; charset=utf-8';
        c.body = '<html><body>Login</body></html>';
      });
      expect(ctx._headers['Content-Security-Policy']).toBe(HTML_CSP);
    });

    it('relaxes CSP for text/html without charset suffix', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/html';
        c.body = '<html></html>';
      });
      expect(ctx._headers['Content-Security-Policy']).toBe(HTML_CSP);
    });

    it('keeps strict CSP for text/plain responses', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/plain; charset=utf-8';
        c.body = 'User-agent: *\nDisallow: /\n';
      });
      expect(ctx._headers['Content-Security-Policy']).toBe(DEFAULT_CSP);
    });

    it('keeps strict CSP for application/json responses', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'application/json';
        c.body = '{}';
      });
      expect(ctx._headers['Content-Security-Policy']).toBe(DEFAULT_CSP);
    });

    it('HTML CSP allows inline styles', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/html';
      });
      expect(ctx._headers['Content-Security-Policy']).toContain("style-src 'unsafe-inline'");
    });

    it('HTML CSP restricts form submissions to same origin', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/html';
      });
      expect(ctx._headers['Content-Security-Policy']).toContain("form-action 'self'");
    });

    it('HTML CSP prevents iframe embedding', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/html';
      });
      expect(ctx._headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    });

    it('HTML CSP still blocks all default resource loading', async () => {
      const ctx = await invokeMiddleware((c) => {
        c._headers['Content-Type'] = 'text/html';
      });
      expect(ctx._headers['Content-Security-Policy']).toContain("default-src 'none'");
    });
  });

  // -------------------------------------------------------------------------
  // Strict-Transport-Security — conditional on issuer scheme
  // -------------------------------------------------------------------------

  describe('Strict-Transport-Security (HSTS)', () => {
    it('does NOT set HSTS when issuer is http://', async () => {
      mockConfig.issuerBaseUrl = 'http://localhost:3000';
      const ctx = await invokeMiddleware();
      expect(ctx._headers['Strict-Transport-Security']).toBeUndefined();
    });

    it('sets HSTS when issuer is https://', async () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com';
      const ctx = await invokeMiddleware();
      expect(ctx._headers['Strict-Transport-Security']).toBe(HSTS_VALUE);
    });

    it('HSTS includes max-age of one year', async () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com';
      const ctx = await invokeMiddleware();
      const hsts = ctx._headers['Strict-Transport-Security'];
      expect(hsts).toContain('max-age=31536000');
    });

    it('HSTS includes includeSubDomains', async () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com';
      const ctx = await invokeMiddleware();
      const hsts = ctx._headers['Strict-Transport-Security'];
      expect(hsts).toContain('includeSubDomains');
    });

    it('does NOT set HSTS for plain http development URLs', async () => {
      mockConfig.issuerBaseUrl = 'http://127.0.0.1:3000';
      const ctx = await invokeMiddleware();
      expect(ctx._headers['Strict-Transport-Security']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error resilience — headers survive downstream failures
  // -------------------------------------------------------------------------

  describe('error resilience', () => {
    it('static headers are set even when downstream throws', async () => {
      const middleware = securityHeaders();
      const ctx = createMockContext();

      try {
        await middleware(
          ctx as unknown as Parameters<typeof middleware>[0],
          async () => {
            throw new Error('Downstream failure');
          },
        );
      } catch {
        // Expected — error propagates up to the error handler middleware.
      }

      // Static headers were set in Phase 1 (before await next()),
      // so they survive the downstream error.
      for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
        expect(ctx._headers[name], `header ${name} after error`).toBe(value);
      }
      expect(ctx._headers['Content-Security-Policy']).toBe(DEFAULT_CSP);
    });
  });

  // -------------------------------------------------------------------------
  // Exported constants — verify they are frozen and well-formed
  // -------------------------------------------------------------------------

  describe('exported constants', () => {
    it('STATIC_SECURITY_HEADERS is frozen', () => {
      expect(Object.isFrozen(STATIC_SECURITY_HEADERS)).toBe(true);
    });

    it('STATIC_SECURITY_HEADERS contains exactly 5 headers', () => {
      expect(Object.keys(STATIC_SECURITY_HEADERS)).toHaveLength(5);
    });

    it('DEFAULT_CSP is a non-empty string', () => {
      expect(DEFAULT_CSP).toBeTruthy();
      expect(typeof DEFAULT_CSP).toBe('string');
    });

    it('HTML_CSP is a non-empty string', () => {
      expect(HTML_CSP).toBeTruthy();
      expect(typeof HTML_CSP).toBe('string');
    });

    it('HSTS_VALUE is a non-empty string', () => {
      expect(HSTS_VALUE).toBeTruthy();
      expect(typeof HSTS_VALUE).toBe('string');
    });

    it('HTML_CSP is a superset of DEFAULT_CSP directives', () => {
      // The HTML CSP should include everything the default CSP has, plus more.
      expect(HTML_CSP).toContain("default-src 'none'");
    });
  });
});
