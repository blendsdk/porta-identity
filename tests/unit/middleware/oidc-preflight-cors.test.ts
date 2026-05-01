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

const { mockConfig, mockGetClientByClientId, mockPoolQuery } = vi.hoisted(() => ({
  mockConfig: { nodeEnv: 'development' as string },
  mockGetClientByClientId: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: (...args: unknown[]) => mockGetClientByClientId(...args),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mockPoolQuery }),
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
  authorization?: string;
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
      if (name === 'Authorization') return options.authorization ?? '';
      return '';
    },
    set: (name: string, value: string) => {
      headers[name] = value;
    },
    _headers: headers,
  };

  return ctx;
}

/**
 * Create a mock PostgreSQL query result for access token lookup.
 * Simulates: SELECT payload->>'clientId' AS client_id FROM oidc_payloads ...
 */
function mockTokenResult(clientId: string | null) {
  if (clientId === null) {
    return { rows: [] };
  }
  return { rows: [{ client_id: clientId }] };
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
        redirectUris: ['https://porta.local:3443/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://porta.local:3443',
        body: { client_id: 'dev-client' },
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://porta.local:3443');
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

  // =========================================================================
  // Production mode — Bearer token CORS (userinfo / /me endpoint)
  // AccessToken is stored in PostgreSQL (oidc_payloads table), NOT Redis.
  // =========================================================================

  describe('production mode — Bearer token CORS', () => {
    beforeEach(() => {
      mockConfig.nodeEnv = 'production';
    });

    it('should resolve clientId from Bearer token in PostgreSQL and allow origin', async () => {
      // Simulate access token found in oidc_payloads with clientId
      mockPoolQuery.mockResolvedValue(mockTokenResult('spa-client'));
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: [],
        redirectUris: ['https://psteniusubi.github.io/oidc-tester/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://psteniusubi.github.io',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer opaque-token-abc123',
      });

      await middleware(ctx as any, async () => {});

      // Should query oidc_payloads for the token
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('oidc_payloads'),
        ['opaque-token-abc123'],
      );
      expect(mockGetClientByClientId).toHaveBeenCalledWith('spa-client');
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://psteniusubi.github.io');
      expect(ctx._headers['Vary']).toBe('Origin');
    });

    it('should resolve clientId from Bearer token for /userinfo path', async () => {
      mockPoolQuery.mockResolvedValue(mockTokenResult('web-client'));
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['http://localhost:4000'],
        redirectUris: [],
      });

      const ctx = createMockCtx({
        origin: 'http://localhost:4000',
        method: 'GET',
        path: '/acme/userinfo',
        authorization: 'Bearer token-xyz',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('http://localhost:4000');
    });

    it('should prefer client_id from body over Bearer token', async () => {
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['https://spa.example.com'],
        redirectUris: [],
      });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        body: { client_id: 'body-client' },
        authorization: 'Bearer some-token',
      });

      await middleware(ctx as any, async () => {});

      // Should use client_id from body, not look up Bearer token in DB
      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(mockGetClientByClientId).toHaveBeenCalledWith('body-client');
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://spa.example.com');
    });

    it('should not set CORS when Bearer token not found in PostgreSQL', async () => {
      mockPoolQuery.mockResolvedValue(mockTokenResult(null));

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer expired-token',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });

    it('should not set CORS when token payload has no clientId', async () => {
      // Token record exists but payload->>'clientId' returns null
      mockPoolQuery.mockResolvedValue({ rows: [{ client_id: null }] });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer token-no-client',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });

    it('should not set CORS when origin does not match Bearer token client', async () => {
      mockPoolQuery.mockResolvedValue(mockTokenResult('trusted-client'));
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['https://trusted.example.com'],
        redirectUris: ['https://trusted.example.com/callback'],
      });

      const ctx = createMockCtx({
        origin: 'https://evil.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer valid-token',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should gracefully handle database error during Bearer token lookup', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer some-token',
      });
      let nextCalled = false;

      await middleware(ctx as any, async () => { nextCalled = true; });

      // Request proceeds but no CORS headers
      expect(nextCalled).toBe(true);
      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should ignore non-Bearer authorization headers', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Basic dXNlcjpwYXNz',
      });

      await middleware(ctx as any, async () => {});

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should ignore empty Authorization header', async () => {
      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: '',
      });

      await middleware(ctx as any, async () => {});

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should handle POST with Bearer token (e.g., token revocation)', async () => {
      // POST request without client_id but with Bearer token
      mockPoolQuery.mockResolvedValue(mockTokenResult('my-client'));
      mockGetClientByClientId.mockResolvedValue({
        allowedOrigins: ['https://spa.example.com'],
        redirectUris: [],
      });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'POST',
        path: '/acme/revocation',
        body: { token: 'some-refresh-token' }, // No client_id
        authorization: 'Bearer access-token-for-revocation',
      });

      await middleware(ctx as any, async () => {});

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('oidc_payloads'),
        ['access-token-for-revocation'],
      );
      expect(ctx._headers['Access-Control-Allow-Origin']).toBe('https://spa.example.com');
    });

    it('should handle empty string clientId from PostgreSQL', async () => {
      // Edge case: payload->>'clientId' returns empty string
      mockPoolQuery.mockResolvedValue({ rows: [{ client_id: '' }] });

      const ctx = createMockCtx({
        origin: 'https://spa.example.com',
        method: 'GET',
        path: '/acme/me',
        authorization: 'Bearer token-empty-client',
      });

      await middleware(ctx as any, async () => {});

      expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(mockGetClientByClientId).not.toHaveBeenCalled();
    });
  });
});
