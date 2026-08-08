/**
 * Tests for ClientCredentialsAuth — OIDC client_credentials flow provider.
 *
 * Covers token fetching, caching, expiry, concurrent dedup, refresh,
 * error handling, and custom scope configuration.
 *
 * @module tests/auth/client-credentials-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClientCredentialsAuth } from '../../src/auth/client-credentials-auth.js';
import { PortaAuthenticationError } from '../../src/errors/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Standard options for tests */
const BASE_OPTIONS = {
  tokenEndpoint: 'https://porta.example.com/super-admin/token',
  clientId: 'test-client',
  clientSecret: 'test-secret',
};

/** Creates a successful mock fetch response with a token */
function createTokenResponse(
  accessToken: string,
  expiresIn = 3600,
): Response {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/** Creates a failed mock fetch response */
function createErrorResponse(status: number, body = ''): Response {
  return new Response(body, { status, statusText: 'Error' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createClientCredentialsAuth', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Token fetching
  // -------------------------------------------------------------------------

  describe('token fetching', () => {
    it('should fetch a token from the endpoint on first getToken()', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      const token = await auth.getToken();

      expect(token).toBe('token-abc');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should POST with grant_type=client_credentials', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(BASE_OPTIONS.tokenEndpoint);
      expect(init.method).toBe('POST');

      // Verify form body contains the correct fields
      const body = new URLSearchParams(init.body);
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('test-client');
      expect(body.get('client_secret')).toBe('test-secret');
    });

    it('should send Content-Type application/x-www-form-urlencoded', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      );
    });

    it('should use default scope "openid" when not specified', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('scope')).toBe('openid');
    });

    it('should use custom scope when specified', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth({
        ...BASE_OPTIONS,
        scope: 'openid profile admin',
      });
      await auth.getToken();

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('scope')).toBe('openid profile admin');
    });
  });

  // -------------------------------------------------------------------------
  // Token caching
  // -------------------------------------------------------------------------

  describe('token caching', () => {
    it('should return cached token on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      const token1 = await auth.getToken();
      const token2 = await auth.getToken();
      const token3 = await auth.getToken();

      expect(token1).toBe('token-abc');
      expect(token2).toBe('token-abc');
      expect(token3).toBe('token-abc');
      // Only one HTTP request should have been made
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should refetch token after cache expiry', async () => {
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1', 60))
        .mockResolvedValueOnce(createTokenResponse('token-2', 60));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // First call fetches the token
      const token1 = await auth.getToken();
      expect(token1).toBe('token-1');

      // Advance time past expiry (60s expires_in minus 30s safety = 30s valid)
      vi.advanceTimersByTime(31_000);

      // Second call should fetch a new token
      const token2 = await auth.getToken();
      expect(token2).toBe('token-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should serve from cache within the safety margin window', async () => {
      // Token expires in 120s → valid until 90s (120 - 30 safety margin)
      mockFetch.mockResolvedValueOnce(createTokenResponse('token-abc', 120));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      // Advance 60 seconds — still within the valid window (90s)
      vi.advanceTimersByTime(60_000);
      const token = await auth.getToken();

      expect(token).toBe('token-abc');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should refetch when in the safety margin window', async () => {
      // Token expires in 60s → valid until 30s (60 - 30 safety margin)
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1', 60))
        .mockResolvedValueOnce(createTokenResponse('token-2', 60));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      // Advance to within the safety margin (35s > 30s valid window)
      vi.advanceTimersByTime(35_000);
      const token = await auth.getToken();

      expect(token).toBe('token-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use 1 hour default when expires_in is missing', async () => {
      // No expires_in in response → default 3600s → valid 3570s
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-abc' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      // Advance 3500 seconds — should still be valid
      vi.advanceTimersByTime(3500_000);
      const token = await auth.getToken();

      expect(token).toBe('token-abc');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent deduplication
  // -------------------------------------------------------------------------

  describe('concurrent deduplication', () => {
    it('should deduplicate concurrent getToken() calls', async () => {
      // Use a deferred promise to control timing
      let resolveToken: (value: Response) => void;
      const deferredResponse = new Promise<Response>((resolve) => {
        resolveToken = resolve;
      });
      mockFetch.mockReturnValueOnce(deferredResponse);

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // Fire 5 concurrent calls before the first resolves
      const promises = [
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
      ];

      // Only 1 fetch should have been made
      expect(mockFetch).toHaveBeenCalledOnce();

      // Resolve the token request
      resolveToken!(createTokenResponse('shared-token'));
      const results = await Promise.all(promises);

      // All should get the same token
      expect(results).toEqual([
        'shared-token',
        'shared-token',
        'shared-token',
        'shared-token',
        'shared-token',
      ]);
    });

    it('should clear in-flight after resolve and allow new fetch', async () => {
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1', 1))
        .mockResolvedValueOnce(createTokenResponse('token-2', 3600));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // First call
      await auth.getToken();

      // Advance past expiry (1s - 30s safety = already expired, needs refetch)
      vi.advanceTimersByTime(2_000);

      // Second call should trigger a new fetch
      const token = await auth.getToken();
      expect(token).toBe('token-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear in-flight on error and allow retry', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(500, 'Server Error'))
        .mockResolvedValueOnce(createTokenResponse('token-after-error'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // First call fails
      await expect(auth.getToken()).rejects.toThrow(
        PortaAuthenticationError,
      );

      // Second call should try again (not reuse the failed promise)
      const token = await auth.getToken();
      expect(token).toBe('token-after-error');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken()
  // -------------------------------------------------------------------------

  describe('refreshToken()', () => {
    it('should be defined', () => {
      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      expect(auth.refreshToken).toBeDefined();
      expect(typeof auth.refreshToken).toBe('function');
    });

    it('should clear cache and fetch a new token', async () => {
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1'))
        .mockResolvedValueOnce(createTokenResponse('token-refreshed'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // Initial fetch
      const token1 = await auth.getToken();
      expect(token1).toBe('token-1');

      // Force refresh — should ignore cache even though it's still valid
      const token2 = await auth.refreshToken!();
      expect(token2).toBe('token-refreshed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update cache after refresh', async () => {
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1'))
        .mockResolvedValueOnce(createTokenResponse('token-refreshed'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();
      await auth.refreshToken!();

      // Subsequent getToken should return the refreshed token from cache
      const token = await auth.getToken();
      expect(token).toBe('token-refreshed');
      // No additional fetch call
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on refresh failure', async () => {
      mockFetch
        .mockResolvedValueOnce(createTokenResponse('token-1'))
        .mockResolvedValueOnce(createErrorResponse(401, 'invalid_client'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);
      await auth.getToken();

      await expect(auth.refreshToken!()).rejects.toThrow(
        PortaAuthenticationError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw PortaAuthenticationError on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(401, 'invalid_client'),
      );

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      await expect(auth.getToken()).rejects.toThrow(
        PortaAuthenticationError,
      );
    });

    it('should include status code in error message', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(403, 'access_denied'),
      );

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      await expect(auth.getToken()).rejects.toThrow(/403/);
    });

    it('should include response body in error message', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(400, 'invalid_grant'),
      );

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      await expect(auth.getToken()).rejects.toThrow(/invalid_grant/);
    });

    it('should throw when access_token is missing from response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ token_type: 'bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      await expect(auth.getToken()).rejects.toThrow(
        /missing access_token/,
      );
    });

    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      await expect(auth.getToken()).rejects.toThrow('Network failure');
    });

    it('should handle response.text() failure gracefully', async () => {
      // Create a response where .text() throws
      const badResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.reject(new Error('body read error')),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(badResponse);

      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      // Should still throw with status info, using statusText as fallback
      await expect(auth.getToken()).rejects.toThrow(/500/);
    });
  });

  // -------------------------------------------------------------------------
  // AuthProvider interface compliance
  // -------------------------------------------------------------------------

  describe('AuthProvider interface', () => {
    it('should have getToken and refreshToken', () => {
      const auth = createClientCredentialsAuth(BASE_OPTIONS);

      expect(typeof auth.getToken).toBe('function');
      expect(typeof auth.refreshToken).toBe('function');
    });
  });
});
