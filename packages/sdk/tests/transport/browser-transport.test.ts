/**
 * BrowserTransport unit tests.
 *
 * Tests the browser-oriented HTTP transport with mocked global fetch.
 * Covers URL construction, headers, CSRF, 401 handling, 204, errors,
 * raw responses, FormData, and AbortSignal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBrowserTransport } from '../../src/transport/browser-transport.js';
import type { BrowserTransportOptions } from '../../src/transport/browser-transport.js';
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
 * Creates a mock Response object compatible with BrowserTransport.
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

/** Default transport options for tests */
function createTransport(overrides?: Partial<BrowserTransportOptions>) {
  return createBrowserTransport({
    baseUrl: 'https://porta.example.com',
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('BrowserTransport', () => {
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
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://porta.example.com/api/admin/organizations',
        expect.any(Object),
      );
    });

    it('should use empty baseUrl for same-origin BFF', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport({ baseUrl: '' });

      await transport.request({ method: 'GET', path: '/organizations' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/organizations',
        expect.any(Object),
      );
    });

    it('should append query params to URL', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport();

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
      const transport = createTransport();

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
      const transport = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        params: { search: 'hello world&more' },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('search=hello%20world%26more');
    });

    it('should return URL without query string when all params are null/undefined', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        params: { cursor: null, filter: undefined },
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://porta.example.com/api/admin/organizations');
    });
  });

  // ── Headers ───────────────────────────────────────────────────

  describe('headers', () => {
    it('should set Accept: application/json', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Accept']).toBe('application/json');
    });

    it('should set X-Porta-SDK-Version header', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-Porta-SDK-Version']).toBe(SDK_VERSION);
    });

    it('should set Content-Type: application/json when body is present', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const transport = createTransport();

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
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBeUndefined();
    });

    it('should omit Content-Type when contentType is null (FormData)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport();
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
      const transport = createTransport();

      await transport.request({
        method: 'POST',
        path: '/import',
        body: '<xml>data</xml>',
        contentType: 'application/xml',
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['Content-Type']).toBe('application/xml');
    });

    it('should merge custom request headers', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport();

      await transport.request({
        method: 'GET',
        path: '/organizations',
        headers: { 'X-Custom-Header': 'test-value' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-Custom-Header']).toBe('test-value');
    });

    it('should always include credentials: include', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.credentials).toBe('include');
    });
  });

  // ── CSRF Token ────────────────────────────────────────────────

  describe('CSRF token handling', () => {
    it('should include CSRF token on POST requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const transport = createTransport({
        getCsrfToken: () => 'csrf-token-123',
      });

      await transport.request({
        method: 'POST',
        path: '/organizations',
        body: { name: 'Acme' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBe('csrf-token-123');
    });

    it('should include CSRF token on PUT requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport({
        getCsrfToken: () => 'csrf-token-456',
      });

      await transport.request({
        method: 'PUT',
        path: '/organizations/123',
        body: { name: 'Updated' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBe('csrf-token-456');
    });

    it('should include CSRF token on PATCH requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const transport = createTransport({
        getCsrfToken: () => 'csrf-patch',
      });

      await transport.request({
        method: 'PATCH',
        path: '/organizations/123',
        body: { status: 'suspended' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBe('csrf-patch');
    });

    it('should include CSRF token on DELETE requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(204));
      const transport = createTransport({
        getCsrfToken: () => 'csrf-delete',
      });

      await transport.request({ method: 'DELETE', path: '/organizations/123' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBe('csrf-delete');
    });

    it('should NOT include CSRF token on GET requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport({
        getCsrfToken: () => 'csrf-token-123',
      });

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should not include CSRF header when getCsrfToken returns null', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const transport = createTransport({
        getCsrfToken: () => null,
      });

      await transport.request({
        method: 'POST',
        path: '/organizations',
        body: { name: 'Acme' },
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should call setCsrfToken when response has x-csrf-token header', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { data: {} }, { 'X-CSRF-Token': 'new-csrf-token' }),
      );
      const setCsrfToken = vi.fn();
      const transport = createTransport({ setCsrfToken });

      await transport.request({ method: 'GET', path: '/organizations' });

      expect(setCsrfToken).toHaveBeenCalledWith('new-csrf-token');
    });

    it('should not call setCsrfToken when response has no csrf header', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: {} }));
      const setCsrfToken = vi.fn();
      const transport = createTransport({ setCsrfToken });

      await transport.request({ method: 'GET', path: '/organizations' });

      expect(setCsrfToken).not.toHaveBeenCalled();
    });
  });

  // ── 401 Handling ──────────────────────────────────────────────

  describe('401 unauthorized handling', () => {
    it('should call onUnauthorized callback on 401', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(401, { error: 'Authentication required' }),
      );
      const onUnauthorized = vi.fn();
      const transport = createTransport({ onUnauthorized });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow();

      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it('should throw PortaAuthenticationError on 401', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(401, { error: 'Token expired' }),
      );
      const transport = createTransport({ onUnauthorized: vi.fn() });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaAuthenticationError);
    });

    it('should throw PortaAuthenticationError with server message', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(401, { error: 'Token expired' }),
      );
      const transport = createTransport({ onUnauthorized: vi.fn() });

      try {
        await transport.request({ method: 'GET', path: '/organizations' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PortaAuthenticationError);
        expect((err as PortaAuthenticationError).message).toBe('Token expired');
      }
    });

    it('should redirect to /auth/login by default when window exists', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(401, { error: 'Unauthorized' }),
      );
      // Mock window.location
      const mockLocation = { href: '' };
      vi.stubGlobal('window', { location: mockLocation });

      const transport = createTransport(); // no onUnauthorized

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaAuthenticationError);

      expect(mockLocation.href).toBe('/auth/login');
    });
  });

  // ── 204 Handling ──────────────────────────────────────────────

  describe('204 no content', () => {
    it('should return undefined body on 204', async () => {
      mockFetch.mockResolvedValue(createMockResponse(204));
      const transport = createTransport();

      const result = await transport.request({ method: 'DELETE', path: '/organizations/123' });

      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
    });

    it('should include response headers on 204', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(204, undefined, { 'x-request-id': 'req-123' }),
      );
      const transport = createTransport();

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
      const transport = createTransport();

      await expect(
        transport.request({ method: 'POST', path: '/organizations', body: {} }),
      ).rejects.toThrow(PortaValidationError);
    });

    it('should throw PortaForbiddenError on 403', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(403, { error: 'Insufficient permissions' }),
      );
      const transport = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaForbiddenError);
    });

    it('should throw PortaNotFoundError on 404', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(404, { error: 'Organization not found' }),
      );
      const transport = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations/unknown' }),
      ).rejects.toThrow(PortaNotFoundError);
    });

    it('should throw PortaConflictError on 409', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(409, { error: 'ETag mismatch' }),
      );
      const transport = createTransport();

      await expect(
        transport.request({ method: 'PUT', path: '/organizations/123', body: {} }),
      ).rejects.toThrow(PortaConflictError);
    });

    it('should throw PortaRateLimitError on 429', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '30' }),
      );
      const transport = createTransport();

      try {
        await transport.request({ method: 'POST', path: '/organizations', body: {} });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PortaRateLimitError);
        expect((err as PortaRateLimitError).retryAfter).toBe(30);
      }
    });

    it('should throw PortaServerError on 500', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(500, { error: 'Internal server error' }),
      );
      const transport = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaServerError);
    });

    it('should throw PortaServerError on 503', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(503, { error: 'Service unavailable' }),
      );
      const transport = createTransport();

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
      const transport = createTransport();

      const result = await transport.request({ method: 'GET', path: '/organizations/123' });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(responseBody);
    });

    it('should parse JSON body on 201', async () => {
      const responseBody = { data: { id: '456', name: 'New Org' } };
      mockFetch.mockResolvedValue(createMockResponse(201, responseBody));
      const transport = createTransport();

      const result = await transport.request({
        method: 'POST',
        path: '/organizations',
        body: { name: 'New Org' },
      });

      expect(result.status).toBe(201);
      expect(result.body).toEqual(responseBody);
    });

    it('should include response headers', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { data: {} }, { 'ETag': '"abc123"', 'X-Request-Id': 'req-456' }),
      );
      const transport = createTransport();

      const result = await transport.request({ method: 'GET', path: '/organizations/123' });

      // Headers are lowercased
      expect(result.headers['etag']).toBe('"abc123"');
      expect(result.headers['x-request-id']).toBe('req-456');
    });

    it('should serialize JSON body on POST', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, { data: {} }));
      const transport = createTransport();
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
      const transport = createTransport();

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
      const transport = createTransport();

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
      const transport = createTransport();
      const fakeFormData = { type: 'FormData' }; // Simulated FormData

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
      const transport = createTransport();

      await transport.request({ method: 'GET', path: '/organizations' });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBeUndefined();
    });
  });

  // ── AbortSignal ───────────────────────────────────────────────

  describe('AbortSignal', () => {
    it('should pass AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport();
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
      const transport = createTransport();
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
    it('should handle 401 with unparseable body gracefully', async () => {
      const response = {
        status: 401,
        ok: false,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(new Error('No JSON')),
      } as unknown as Response;
      mockFetch.mockResolvedValue(response);
      const transport = createTransport({ onUnauthorized: vi.fn() });

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaAuthenticationError);
    });

    it('should handle non-2xx with unparseable body gracefully', async () => {
      const response = {
        status: 500,
        ok: false,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(new Error('No JSON')),
      } as unknown as Response;
      mockFetch.mockResolvedValue(response);
      const transport = createTransport();

      await expect(
        transport.request({ method: 'GET', path: '/organizations' }),
      ).rejects.toThrow(PortaServerError);
    });

    it('should handle boolean and number params', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { data: [] }));
      const transport = createTransport();

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
