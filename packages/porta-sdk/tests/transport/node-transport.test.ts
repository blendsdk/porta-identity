/**
 * NodeTransport unit tests.
 *
 * Tests the Node.js / server-side HTTP transport with mocked global fetch.
 * Covers URL construction, headers, Bearer auth, 401 retry with refresh,
 * 204, errors, raw responses, FormData, and AbortSignal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNodeTransport } from '../../src/transport/node-transport.js';
import type { NodeTransportOptions } from '../../src/transport/node-transport.js';
import type { AuthProvider } from '../../src/auth/types.js';
import {
  PortaAuthenticationError,
  PortaValidationError,
  PortaNotFoundError,
  PortaForbiddenError,
  PortaConflictError,
  PortaRateLimitError,
  PortaServerError,
} from '../../src/errors/index.js';
import { SDK_VERSION } from '../../src/version.js';

// ── Test helpers ──────────────────────────────────────────────────

/**
 * Creates a mock Response object compatible with NodeTransport.
 * Uses the real Headers class (available in Node.js 22+).
 */
function createMockResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): Response {
  const h = new Headers(headers);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: h,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

/** Creates a mock AuthProvider with configurable getToken and refreshToken */
function createMockAuth(overrides?: Partial<AuthProvider>): AuthProvider {
  return {
    getToken: vi.fn().mockResolvedValue('test-access-token'),
    ...overrides,
  };
}

/** Creates a transport with default test options */
function createTransport(overrides?: Partial<NodeTransportOptions>) {
  const auth = createMockAuth();
  return {
    transport: createNodeTransport({
      baseUrl: 'https://porta.example.com',
      auth,
      ...overrides,
    }),
    auth,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('NodeTransport', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── URL Construction ──────────────────────────────────────────

  describe('URL construction', () => {
    it('should prepend baseUrl + /api/admin to path', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://porta.example.com/api/admin/organizations',
        expect.any(Object),
      );
    });

    it('should append query params to URL', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        params: { page: 1, pageSize: 20, search: 'acme' },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/admin/organizations?');
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=20');
      expect(url).toContain('search=acme');
    });

    it('should skip null and undefined params', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        params: { page: 1, cursor: null, filter: undefined },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).not.toContain('cursor');
      expect(url).not.toContain('filter');
    });

    it('should encode special characters in params', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        params: { search: 'hello world&more' },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('search=hello%20world%26more');
    });
  });

  // ── Headers ───────────────────────────────────────────────────

  describe('headers', () => {
    it('should set Accept: application/json', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Accept']).toBe('application/json');
    });

    it('should set X-Porta-SDK-Version header', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-Porta-SDK-Version']).toBe(SDK_VERSION);
    });

    it('should set Content-Type: application/json when body is present', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const { transport } = createTransport();

      await transport.request({
        method: 'POST',
        path: '/organizations',
        body: { name: 'Acme' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBe('application/json');
    });

    it('should NOT set Content-Type when no body is present', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBeUndefined();
    });

    it('should omit Content-Type when contentType is null (FormData)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();
      const fakeFormData = { append: vi.fn() };

      await transport.request({
        method: 'POST',
        path: '/branding/logo',
        body: fakeFormData,
        contentType: null,
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBeUndefined();
    });

    it('should use custom contentType when provided', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();

      await transport.request({
        method: 'POST',
        path: '/import',
        body: '<xml>data</xml>',
        contentType: 'application/xml',
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBe('application/xml');
    });

    it('should NOT include credentials: include (server-side uses tokens)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.credentials).toBeUndefined();
    });
  });

  // ── Bearer Token Authentication ───────────────────────────────

  describe('Bearer token authentication', () => {
    it('should set Authorization: Bearer header from auth.getToken()', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const auth = createMockAuth({
        getToken: vi.fn().mockResolvedValue('my-access-token'),
      });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Authorization']).toBe('Bearer my-access-token');
    });

    it('should call getToken() for each request', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const getToken = vi.fn()
        .mockResolvedValueOnce('token-1')
        .mockResolvedValueOnce('token-2');
      const auth = createMockAuth({ getToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await transport.request({ method: 'GET', path: '/organizations' });
      await transport.request({ method: 'GET', path: '/users' });

      expect(getToken).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer token-1');
      expect(mockFetch.mock.calls[1][1].headers['Authorization']).toBe('Bearer token-2');
    });

    it('should propagate getToken() errors', async () => {
      const auth = createMockAuth({
        getToken: vi.fn().mockRejectedValue(new Error('No credentials')),
      });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow('No credentials');

      // fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── 401 Retry with Token Refresh ──────────────────────────────

  describe('401 retry with token refresh', () => {
    it('should refresh token and retry on 401 when refreshToken is available', async () => {
      // First call returns 401, retry returns 200
      mockFetch
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Token expired' }))
        .mockResolvedValueOnce(createMockResponse(200, { data: { id: '123' } }));

      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      const result = await transport.request({ method: 'GET', path: '/organizations/123' });

      // Should have called fetch twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // refreshToken should have been called
      expect(refreshToken).toHaveBeenCalledOnce();
      // Retry should use the refreshed token
      expect(mockFetch.mock.calls[1][1].headers['Authorization']).toBe('Bearer refreshed-token');
      // Should return the successful response
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ data: { id: '123' } });
    });

    it('should throw PortaAuthenticationError when retry also returns 401', async () => {
      // Both calls return 401
      mockFetch
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Token expired' }))
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Still unauthorized' }));

      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaAuthenticationError);

      // Should have attempted refresh
      expect(refreshToken).toHaveBeenCalledOnce();
      // Should have called fetch twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on 401 when no refreshToken available', async () => {
      mockFetch.mockResolvedValue(createMockResponse(401, { error: 'Unauthorized' }));
      // Auth without refreshToken
      const auth = createMockAuth();
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaAuthenticationError);

      // Should only call fetch once — no retry
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should propagate refreshToken() errors', async () => {
      mockFetch.mockResolvedValue(createMockResponse(401, { error: 'Token expired' }));
      const refreshToken = vi.fn().mockRejectedValue(new Error('Refresh failed'));
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow('Refresh failed');

      // Should have attempted refresh but not retried fetch
      expect(refreshToken).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should handle non-401 error on retry correctly', async () => {
      // First call returns 401, retry returns 403
      mockFetch
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Token expired' }))
        .mockResolvedValueOnce(createMockResponse(403, { error: 'Forbidden' }));

      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaForbiddenError);
    });
  });

  // ── 204 Handling ──────────────────────────────────────────────

  describe('204 no content', () => {
    it('should return undefined body on 204', async () => {
      mockFetch.mockResolvedValue(createMockResponse(204));
      const { transport } = createTransport();

      const result = await transport.request({ method: 'DELETE', path: '/organizations/123' });

      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
    });

    it('should include response headers on 204', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(204, undefined, { 'x-request-id': 'req-123' }),
      );
      const { transport } = createTransport();

      const result = await transport.request({ method: 'DELETE', path: '/organizations/123' });

      expect(result.headers['x-request-id']).toBe('req-123');
    });
  });

  // ── Error Responses ───────────────────────────────────────────

  describe('error responses', () => {
    it('should throw PortaValidationError on 400', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(400, {
          error: 'Validation failed',
          details: [{ path: 'name', message: 'Required' }],
        }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'POST', path: '/organizations', body: {} }),
      ).rejects.toThrow(PortaValidationError);
    });

    it('should throw PortaForbiddenError on 403', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(403, { error: 'Insufficient permissions' }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaForbiddenError);
    });

    it('should throw PortaNotFoundError on 404', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(404, { error: 'Organization not found' }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations/unknown' }),
      ).rejects.toThrow(PortaNotFoundError);
    });

    it('should throw PortaConflictError on 409', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(409, { error: 'ETag mismatch' }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'PUT', path: '/organizations/123', body: {} }),
      ).rejects.toThrow(PortaConflictError);
    });

    it('should throw PortaRateLimitError on 429 with Retry-After', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '60' }),
      );
      const { transport } = createTransport();

      try {
        await transport.request({ method: 'POST', path: '/organizations', body: {} });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PortaRateLimitError);
        expect((err as PortaRateLimitError).retryAfter).toBe(60);
      }
    });

    it('should throw PortaServerError on 500', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(500, { error: 'Internal server error' }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaServerError);
    });

    it('should throw PortaServerError on 502', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(502, { error: 'Bad gateway' }),
      );
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaServerError);
    });
  });

  // ── Successful Responses ──────────────────────────────────────

  describe('successful responses', () => {
    it('should parse JSON body on 200', async () => {
      const responseBody = { data: { id: '123', name: 'Acme' } };
      mockFetch.mockResolvedValue(createMockResponse(200, responseBody));
      const { transport } = createTransport();

      const result = await transport.request({ method: 'GET', path: '/organizations/123' });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(responseBody);
    });

    it('should parse JSON body on 201', async () => {
      const responseBody = { data: { id: '456', name: 'New Org' } };
      mockFetch.mockResolvedValue(createMockResponse(201, responseBody));
      const { transport } = createTransport();

      const result = await transport.request({
        method: 'POST',
        path: '/organizations',
        body: { name: 'New Org' },
      });

      expect(result.status).toBe(201);
      expect(result.body).toEqual(responseBody);
    });

    it('should include lowercased response headers', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { data: {} }, { 'ETag': '"abc123"', 'X-Request-Id': 'req-456' }),
      );
      const { transport } = createTransport();

      const result = await transport.request({ method: 'GET', path: '/organizations/123' });

      expect(result.headers['etag']).toBe('"abc123"');
      expect(result.headers['x-request-id']).toBe('req-456');
    });

    it('should serialize JSON body on POST', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const { transport } = createTransport();
      const requestBody = { name: 'Acme', slug: 'acme' };

      await transport.request({
        method: 'POST',
        path: '/organizations',
        body: requestBody,
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBe(JSON.stringify(requestBody));
    });
  });

  // ── Raw Response ──────────────────────────────────────────────

  describe('raw response handling', () => {
    it('should return raw Response when responseType is raw', async () => {
      const mockResponse = createMockResponse(200, undefined, { 'content-type': 'text/csv' });
      mockFetch.mockResolvedValue(mockResponse);
      const { transport } = createTransport();

      const result = await transport.request({
        method: 'GET',
        path: '/export/users',
        responseType: 'raw',
      });

      expect(result.status).toBe(200);
      expect(result.body).toBeUndefined();
      expect(result.raw).toBe(mockResponse);
    });

    it('should not call json() when responseType is raw', async () => {
      const mockResponse = createMockResponse(200, undefined);
      mockFetch.mockResolvedValue(mockResponse);
      const { transport } = createTransport();

      await transport.request({
        method: 'GET',
        path: '/export/users',
        responseType: 'raw',
      });

      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  // ── Body Serialization ────────────────────────────────────────

  describe('body serialization', () => {
    it('should pass FormData body as-is when contentType is null', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const { transport } = createTransport();
      const fakeFormData = { type: 'FormData' };

      await transport.request({
        method: 'POST',
        path: '/branding/logo',
        body: fakeFormData,
        contentType: null,
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBe(fakeFormData);
    });

    it('should not send body for GET requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBeUndefined();
    });
  });

  // ── AbortSignal ───────────────────────────────────────────────

  describe('AbortSignal', () => {
    it('should pass AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();
      const controller = new AbortController();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        signal: controller.signal,
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBe(controller.signal);
    });

    it('should propagate AbortError when request is cancelled', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);
      const { transport } = createTransport();
      const controller = new AbortController();
      controller.abort();

      await expect(
        transport.request({
          method: 'GET',
          path: '/organizations',
          signal: controller.signal,
        }),
      ).rejects.toThrow('The operation was aborted');
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle non-2xx with unparseable body gracefully', async () => {
      const response = {
        status: 500,
        ok: false,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(new Error('No JSON')),
      } as unknown as Response;
      mockFetch.mockResolvedValue(response);
      const { transport } = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaServerError);
    });

    it('should handle 204 on retry after 401 refresh', async () => {
      // First call returns 401, retry returns 204
      mockFetch
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Token expired' }))
        .mockResolvedValueOnce(createMockResponse(204));

      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      const result = await transport.request({ method: 'DELETE', path: '/organizations/123' });

      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
    });

    it('should handle raw response on retry after 401 refresh', async () => {
      const rawResponse = createMockResponse(200, undefined, { 'content-type': 'text/csv' });
      mockFetch
        .mockResolvedValueOnce(createMockResponse(401, { error: 'Token expired' }))
        .mockResolvedValueOnce(rawResponse);

      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const auth = createMockAuth({ refreshToken });
      const transport = createNodeTransport({
        baseUrl: 'https://porta.example.com',
        auth,
      });

      const result = await transport.request({
        method: 'GET',
        path: '/export/users',
        responseType: 'raw',
      });

      expect(result.status).toBe(200);
      expect(result.raw).toBe(rawResponse);
    });

    it('should handle boolean and number params', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const { transport } = createTransport();

      await transport.request({
        method: 'GET',
        path: '/users',
        params: { active: true, limit: 50 },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('active=true');
      expect(url).toContain('limit=50');
    });
  });
});
