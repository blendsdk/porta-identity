import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the token-store module — the HTTP client reads credentials from disk
// and delegates refresh logic to the token store.
// ---------------------------------------------------------------------------
vi.mock('../../../src/cli/token-store.js', () => ({
  readCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import {
  AdminHttpClient,
  createHttpClient,
  HttpClientError,
  HttpAuthError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpValidationError,
  HttpServerError,
} from '../../../src/cli/http-client.js';
import {
  readCredentials,
  isTokenExpired,
  refreshAccessToken,
} from '../../../src/cli/token-store.js';
import type { StoredCredentials } from '../../../src/cli/token-store.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Valid credentials fixture for test setup */
function makeCredentials(overrides?: Partial<StoredCredentials>): StoredCredentials {
  return {
    server: 'https://porta.local:3443',
    orgSlug: 'porta-admin',
    clientId: 'test-client-id',
    accessToken: 'valid-access-token',
    refreshToken: 'valid-refresh-token',
    idToken: 'valid-id-token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
    userInfo: { sub: 'user-123', email: 'admin@test.com', name: 'Admin' },
    ...overrides,
  };
}

/**
 * Create a mock Response object for fetch.
 * Vitest doesn't provide Response mocks, so we build one manually.
 */
function mockResponse(
  status: number,
  body?: unknown,
  options?: { statusText?: string },
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: options?.statusText ?? 'OK',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminHttpClient', () => {
  let client: AdminHttpClient;
  const creds = makeCredentials();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: token is not expired
    vi.mocked(isTokenExpired).mockReturnValue(false);
    // Create a client with test credentials
    client = new AdminHttpClient(creds.server, creds);
    // Reset global fetch mock
    vi.stubGlobal('fetch', vi.fn());
  });

  // -------------------------------------------------------------------------
  // Authorization header
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('should attach Bearer token to every request', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: [] }),
      );

      await client.get('/api/admin/organizations');

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
          }),
        }),
      );
    });

    it('should use refreshed token after auto-refresh', async () => {
      // Token is expired → trigger refresh
      vi.mocked(isTokenExpired).mockReturnValue(true);
      const refreshedCreds = makeCredentials({
        accessToken: 'refreshed-access-token',
      });
      vi.mocked(refreshAccessToken).mockResolvedValue(refreshedCreds);
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: 'ok' }),
      );

      await client.get('/api/admin/organizations');

      // Should have called refresh
      expect(refreshAccessToken).toHaveBeenCalledOnce();
      // Should use the new token
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer refreshed-access-token',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Token refresh
  // -------------------------------------------------------------------------

  describe('token auto-refresh', () => {
    it('should not refresh when token is still valid', async () => {
      vi.mocked(isTokenExpired).mockReturnValue(false);
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: [] }),
      );

      await client.get('/api/admin/organizations');

      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should throw HttpAuthError when refresh fails', async () => {
      vi.mocked(isTokenExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(null);

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpAuthError);
    });

    it('should throw HttpAuthError with re-auth message when refresh fails', async () => {
      vi.mocked(isTokenExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(null);

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow('Session expired');
    });
  });

  // -------------------------------------------------------------------------
  // HTTP methods
  // -------------------------------------------------------------------------

  describe('GET requests', () => {
    it('should send GET request to the correct URL', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: [] }),
      );

      await client.get('/api/admin/organizations');

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should append query parameters to URL', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: [] }),
      );

      await client.get('/api/admin/organizations', {
        page: '1',
        pageSize: '20',
        status: 'active',
      });

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('pageSize=20');
      expect(calledUrl).toContain('status=active');
    });

    it('should not append query string when params is empty', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: [] }),
      );

      await client.get('/api/admin/organizations', {});

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations',
        expect.any(Object),
      );
    });

    it('should return parsed response data', async () => {
      const responseBody = { data: [{ id: '1', name: 'Acme' }] };
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, responseBody),
      );

      const result = await client.get('/api/admin/organizations');

      expect(result.status).toBe(200);
      expect(result.data).toEqual(responseBody);
    });
  });

  describe('POST requests', () => {
    it('should send POST request with JSON body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(201, { data: { id: 'new-id' } }),
      );

      await client.post('/api/admin/organizations', { name: 'Acme' });

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ name: 'Acme' }),
        }),
      );
    });

    it('should send POST without body when none provided', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: 'ok' }),
      );

      await client.post('/api/admin/organizations/123/suspend');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        }),
      );
    });

    it('should return 201 status for created resources', async () => {
      const created = { data: { id: 'new-id', name: 'Acme' } };
      vi.mocked(fetch).mockResolvedValue(mockResponse(201, created));

      const result = await client.post('/api/admin/organizations', {
        name: 'Acme',
      });

      expect(result.status).toBe(201);
      expect(result.data).toEqual(created);
    });
  });

  describe('PUT requests', () => {
    it('should send PUT request with JSON body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: { id: '1', name: 'Updated' } }),
      );

      await client.put('/api/admin/organizations/1', { name: 'Updated' });

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations/1',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ name: 'Updated' }),
        }),
      );
    });
  });

  describe('DELETE requests', () => {
    it('should send DELETE request without body', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(204));

      await client.delete('/api/admin/organizations/1');

      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/organizations/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should handle 204 No Content response', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(204));

      const result = await client.delete('/api/admin/organizations/1');

      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe('error mapping', () => {
    it('should throw HttpAuthError on 401 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(401, { error: 'Unauthorized' }),
      );

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpAuthError);
    });

    it('should throw HttpForbiddenError on 403 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(403, { error: 'Forbidden' }),
      );

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpForbiddenError);
    });

    it('should throw HttpNotFoundError on 404 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(404, { error: 'Organization not found' }),
      );

      await expect(
        client.get('/api/admin/organizations/bad-id'),
      ).rejects.toThrow(HttpNotFoundError);
    });

    it('should include error message from 404 response body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(404, { error: 'Organization "acme" not found' }),
      );

      await expect(
        client.get('/api/admin/organizations/acme'),
      ).rejects.toThrow('Organization "acme" not found');
    });

    it('should throw HttpValidationError on 400 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(400, {
          error: 'Validation failed',
          details: [
            { path: ['name'], message: 'Required' },
          ],
        }),
      );

      await expect(
        client.post('/api/admin/organizations', {}),
      ).rejects.toThrow(HttpValidationError);
    });

    it('should map Zod-style details with array paths to dot-notation', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(400, {
          error: 'Validation failed',
          details: [
            { path: ['branding', 'primaryColor'], message: 'Invalid hex color' },
            { path: ['name'], message: 'Required' },
          ],
        }),
      );

      try {
        await client.post('/api/admin/organizations', {});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpValidationError);
        const validationErr = err as HttpValidationError;
        expect(validationErr.details).toHaveLength(2);
        expect(validationErr.details![0].path).toBe('branding.primaryColor');
        expect(validationErr.details![1].path).toBe('name');
      }
    });

    it('should throw HttpServerError on 500 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(500, { error: 'Internal Server Error' }),
      );

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpServerError);
    });

    it('should throw HttpServerError on 502 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(502, { error: 'Bad Gateway' }),
      );

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpServerError);
    });

    it('should throw generic HttpClientError on unexpected status', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(429, { error: 'Too Many Requests' }),
      );

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpClientError);

      try {
        await client.get('/api/admin/organizations');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpClientError);
        expect((err as HttpClientError).status).toBe(429);
      }
    });

    it('should handle non-JSON error responses gracefully', async () => {
      const nonJsonResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new Error('not JSON')),
        headers: new Headers(),
      } as unknown as Response;

      vi.mocked(fetch).mockResolvedValue(nonJsonResponse);

      await expect(
        client.get('/api/admin/organizations'),
      ).rejects.toThrow(HttpServerError);
    });
  });
});

// ---------------------------------------------------------------------------
// createHttpClient factory
// ---------------------------------------------------------------------------

describe('createHttpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create client from stored credentials', () => {
    const creds = makeCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);

    const client = createHttpClient();

    expect(client).toBeInstanceOf(AdminHttpClient);
  });

  it('should throw HttpAuthError when not logged in', () => {
    vi.mocked(readCredentials).mockReturnValue(null);

    expect(() => createHttpClient()).toThrow(HttpAuthError);
    expect(() => createHttpClient()).toThrow('Not logged in');
  });

  it('should use server override from options', () => {
    const creds = makeCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);

    // The server override is stored internally — we verify by making a request
    // This test just ensures the factory doesn't throw with the override
    const client = createHttpClient({ server: 'http://custom:9000' });
    expect(client).toBeInstanceOf(AdminHttpClient);
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('HTTP error classes', () => {
  it('HttpClientError should have status and name', () => {
    const err = new HttpClientError('test', 418);
    expect(err.status).toBe(418);
    expect(err.name).toBe('HttpClientError');
    expect(err.message).toBe('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('HttpAuthError should default to 401 and auth message', () => {
    const err = new HttpAuthError();
    expect(err.status).toBe(401);
    expect(err.name).toBe('HttpAuthError');
    expect(err.message).toContain('Authentication required');
  });

  it('HttpForbiddenError should default to 403', () => {
    const err = new HttpForbiddenError();
    expect(err.status).toBe(403);
    expect(err.name).toBe('HttpForbiddenError');
  });

  it('HttpNotFoundError should default to 404', () => {
    const err = new HttpNotFoundError();
    expect(err.status).toBe(404);
    expect(err.name).toBe('HttpNotFoundError');
  });

  it('HttpValidationError should carry details', () => {
    const details = [{ path: 'name', message: 'Required' }];
    const err = new HttpValidationError('Validation failed', details);
    expect(err.status).toBe(400);
    expect(err.details).toEqual(details);
  });

  it('HttpServerError should default to 500', () => {
    const err = new HttpServerError();
    expect(err.status).toBe(500);
    expect(err.message).toContain('Server error');
  });

  it('all HTTP errors should extend HttpClientError', () => {
    expect(new HttpAuthError()).toBeInstanceOf(HttpClientError);
    expect(new HttpForbiddenError()).toBeInstanceOf(HttpClientError);
    expect(new HttpNotFoundError()).toBeInstanceOf(HttpClientError);
    expect(new HttpValidationError('test')).toBeInstanceOf(HttpClientError);
    expect(new HttpServerError()).toBeInstanceOf(HttpClientError);
  });

  it('all HTTP errors should extend Error', () => {
    expect(new HttpAuthError()).toBeInstanceOf(Error);
    expect(new HttpForbiddenError()).toBeInstanceOf(Error);
    expect(new HttpNotFoundError()).toBeInstanceOf(Error);
    expect(new HttpValidationError('test')).toBeInstanceOf(Error);
    expect(new HttpServerError()).toBeInstanceOf(Error);
  });
});
