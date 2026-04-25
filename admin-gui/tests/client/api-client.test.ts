/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  apiRequestWithEtag,
  api,
  ApiError,
  setCsrfToken,
} from '../../src/client/api/client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock window.location
const mockLocation = { href: '' };
vi.stubGlobal('window', { location: mockLocation });

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  const headersObj = new Map(Object.entries(headers ?? {}));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (k: string) => headersObj.get(k) ?? null },
  };
}

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocation.href = '';
    setCsrfToken(null);
  });

  describe('apiRequest', () => {
    it('should send GET with Accept header', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await apiRequest('/test');
      expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }));
    });

    it('should include CSRF token for POST', async () => {
      setCsrfToken('test-csrf-token');
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await apiRequest('/test', { method: 'POST' });
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-CSRF-Token']).toBe('test-csrf-token');
    });

    it('should not include CSRF token for GET', async () => {
      setCsrfToken('test-csrf-token');
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await apiRequest('/test');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: 'Not found' }, 404));
      await expect(apiRequest('/test')).rejects.toThrow(ApiError);
      await expect(apiRequest('/test')).rejects.toMatchObject({ status: 404 });
    });

    it('should redirect to login on 401', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 401));
      await expect(apiRequest('/test')).rejects.toThrow('Session expired');
      expect(mockLocation.href).toBe('/auth/login');
    });
  });

  describe('apiRequestWithEtag', () => {
    it('should return data and etag', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }, 200, { ETag: '"abc123"' }));
      const result = await apiRequestWithEtag('/test');
      expect(result.data).toEqual({ id: '1' });
      expect(result.etag).toBe('"abc123"');
    });

    it('should return undefined etag when not present', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
      const result = await apiRequestWithEtag('/test');
      expect(result.etag).toBeUndefined();
    });
  });

  describe('api convenience methods', () => {
    it('api.get builds correct URL with query params', async () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      await api.get('/organizations', { search: 'test', page: 1 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('/api/organizations?search=test&page=1');
    });

    it('api.get skips null/undefined params', async () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      await api.get('/organizations', { search: 'test', filter: undefined, extra: null });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('/api/organizations?search=test');
    });

    it('api.post sends JSON body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
      await api.post('/organizations', { name: 'Test' });
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe('{"name":"Test"}');
    });

    it('api.patch includes If-Match header when etag provided', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
      await api.patch('/organizations/1', { name: 'Updated' }, '"etag123"');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['If-Match']).toBe('"etag123"');
    });

    it('api.del sends DELETE method', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await api.del('/organizations/1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });
});
