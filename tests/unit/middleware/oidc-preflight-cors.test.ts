/**
 * Unit tests for the OIDC preflight CORS middleware.
 *
 * Tests the middleware that pre-sets CORS headers at the outer Koa level
 * to work around node-oidc-provider's keepHeadersOnError: false issue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are available in vi.mock factories
// (vi.mock calls are hoisted above imports by Vitest)
// ---------------------------------------------------------------------------

const { mockConfig, mockGetClientByClientId } = vi.hoisted(() => ({
  mockConfig: { nodeEnv: 'development' as string },
  mockGetClientByClientId: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: (...args: unknown[]) => mockGetClientByClientId(...args),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { oidcPreflightCors } from '../../../src/middleware/oidc-preflight-cors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Koa-like context for testing. */
function createMockCtx(options: {
  method?: string;
  path?: string;
  origin?: string;
  orgSlug?: string;
  body?: Record<string, unknown>;
} = {}) {
  const headers: Record<string, string> = {};

  const ctx = {
    method: options.method ?? 'POST',
    path: options.path ?? '/acme/token',
    status: 200,
    params: { orgSlug: options.orgSlug ?? 'acme' },
    request: {
      body: options.body,
    },
    get: (name: string) => {
      if (name === 'Origin') return options.origin ?? '';
      return '';
    },
    set: (name: string, value: string) => {
      headers[name] = value;
    },
    _headers: headers,
  };

  return ctx;
}

type NextFn = () => Promise<void>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('oidcPreflightCors', () => {
  const middleware = oidcPreflightCors();

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.nodeEnv = 'development';
  });

  // =========================================================================
  // No Origin header — skip CORS
  // =========================================================================

  describe('no Origin header (backend/server requests)', () => {
    it('should call next() without setting any headers', async () => {
      const ctx = createMockCtx({ origin: '' });
      let nextCalled = false;
      const next: NextFn = async () => { nextCalled = true; };

      await middleware(ctx as any, next);

      expect(nextCalled).toBe(true);
      expect(ctx._headers).toEqual({});
    });

    it('should not look up clients for non-CORS requests', async () => {
      const ctx = createMockCtx({ origin: '', body: { client_id: 'abc' } });
      await middleware(ctx as any, async () => {});

      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // OPTIONS preflight
  // =========================================================================

  describe('OPTIONS preflight', () => {
    it('should respond with 204 and CORS headers in development', async () => {
      const ctx = createMockCtx({
        method: 'OPTIONS',
        origin: 'https://app.example.com',
      });
      let nextCalled = false;
      const next: NextFn = async () => { nextCalled = true; };

      await middleware(ctx as any, next);

      expect(nextCalled).toBe(false); // Short-circuited
      expect(ctx.status).toBe(204);
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
      expect(ctx._headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(ctx._headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(ctx._headers['Access-Control-Max-Age']).toBe('3600');
      expect(ctx._headers['Vary']).toBe('Origin');
    });

    it('should respond with 204 and CORS headers in production', async () => {
      mockConfig.nodeEnv = 'production';
      const ctx = createMockCtx({
        method: 'OPTIONS',
        origin: 'https://spa.example.com',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx.status).toBe(204);
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://spa.example.com');
      expect(ctx._headers['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  // =========================================================================
  // Development mode — actual requests
  // =========================================================================

  describe('development mode — actual requests', () => {
    it('should set CORS headers for any origin on POST', async () => {
      const ctx = createMockCtx({
        origin: 'https://psteniusubi.github.io',
        method: 'POST',
        path: '/acme/token',
      });
      let nextCalled = false;
      const next: NextFn = async () => { nextCalled = true; };

      await middleware(ctx as any, next);

      expect(nextCalled).toBe(true);
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://psteniusubi.github.io');
      expect(ctx._headers['Vary']).toBe('Origin');
    });

    it('should set CORS headers for any origin on GET', async () => {
      const ctx = createMockCtx({
        origin: 'http://localhost:8080',
        method: 'GET',
        path: '/acme/userinfo',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should not perform client lookup in development mode', async () => {
      const ctx = createMockCtx({
        origin: 'https://app.example.com',
        body: { client_id: 'test-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Open CORS paths (jwks, discovery)
  // =========================================================================

  describe('open CORS paths', () => {
    it('should allow any origin for /jwks in production', async () => {
      mockConfig.nodeEnv = 'production';
      const ctx = createMockCtx({
        origin: 'https://untrusted.example.com',
        method: 'GET',
        path: '/acme/jwks',
        orgSlug: 'acme',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://untrusted.example.com');
      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });

    it('should allow any origin for discovery in production', async () => {
      mockConfig.nodeEnv = 'production';
      const ctx = createMockCtx({
        origin: 'https://any.example.com',
        method: 'GET',
        path: '/myorg/.well-known/openid-configuration',
        orgSlug: 'myorg',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://any.example.com');
    });

    it('should allow any origin for oauth discovery in production', async () => {
      mockConfig.nodeEnv = 'production';
      const ctx = createMockCtx({
        origin: 'https://other.example.com',
        method: 'GET',
        path: '/myorg/.well-known/oauth-authorization-server',
        orgSlug: 'myorg',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://other.example.com');
    });
  });

  // =========================================================================
  // Production mode — client-based CORS
  // =========================================================================

  describe('production mode — client-based CORS', () => {
    beforeEach(() => {
      mockConfig.nodeEnv = 'production';
    });

    it('should allow origin matching client allowed_origins', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['https://spa.example.com'],
        redirectUris: ['https://other.example.com/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'my-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(mockGetClientByClientId).toHaveBeenCalledWith('my-client');
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://spa.example.com');
    });

    it('should allow origin matching redirect_uri origin', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: [],
        redirectUris: ['https://spa.example.com/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'my-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://spa.example.com');
    });

    it('should not set CORS headers for unauthorized origin', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['https://allowed.example.com'],
        redirectUris: ['https://allowed.example.com/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://evil.example.com',
        body: { client_id: 'my-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should not set CORS headers when client not found', async () => {
      mockGetClientByClientId.mockResolvedValue(null);

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'nonexistent' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should not set CORS headers when no client_id in body', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: {},
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });

    it('should not set CORS headers when body is undefined', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: undefined,
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should gracefully handle client lookup failure', async () => {
      mockGetClientByClientId.mockRejectedValue(new Error('DB down'));

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'my-client' },
      });
      let nextCalled = false;
      const next: NextFn = async () => { nextCalled = true; };

      await middleware(ctx as any, next);

      // Should still call next (request proceeds) but no CORS headers
      expect(nextCalled).toBe(true);
      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should handle redirect_uri with different port', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: [],
        redirectUris: ['http://localhost:3000/callback'],
      });

      const ctx = createMockCtx({
        origin: 'http://localhost:3000',
        body: { client_id: 'dev-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });

    it('should skip native app scheme redirect_uris', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: [],
        redirectUris: ['myapp://callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'native-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should ignore empty client_id', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: '' },
      });

      await middleware(ctx as any, async () => {});

      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });

    it('should ignore non-string client_id', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 123 as any },
      });

      await middleware(ctx as any, async () => {});

      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });
  });
});
