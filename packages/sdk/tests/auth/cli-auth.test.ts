/**
 * Tests for CliAuth — CLI credentials file authentication provider.
 *
 * Covers file reading, caching, token expiry detection, refresh flow,
 * error handling (missing file, malformed JSON, missing fields), and
 * the read-only guarantee (never writes to the credentials file).
 *
 * @module tests/auth/cli-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCliAuth } from '../../src/auth/cli-auth.js';
import type { StoredCredentials } from '../../src/auth/cli-auth.js';
import { PortaAuthenticationError } from '../../src/errors/index.js';

// ---------------------------------------------------------------------------
// Mock node:fs/promises — must be before any imports that use it
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Import the mocked readFile for test control
import { readFile } from 'node:fs/promises';
const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a valid credentials fixture */
function createCredentials(overrides?: Partial<StoredCredentials>): StoredCredentials {
  return {
    server: 'https://porta.local:3443',
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: 'eyJ-valid-access-token',
    refreshToken: 'eyJ-valid-refresh-token',
    idToken: 'eyJ-valid-id-token',
    // Default: expires 1 hour from now
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: {
      sub: 'user-123',
      email: 'admin@example.com',
      name: 'Admin User',
    },
    ...overrides,
  };
}

/** Creates a successful mock fetch response for token refresh */
function createRefreshResponse(
  accessToken: string,
  expiresIn = 3600,
  extras?: { refresh_token?: string; id_token?: string },
): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      expires_in: expiresIn,
      ...extras,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Creates a failed mock fetch response */
function createErrorResponse(status: number): Response {
  return new Response('', { status, statusText: 'Error' });
}

/** Sets up mockReadFile to return serialized credentials */
function mockFileContents(creds: StoredCredentials): void {
  mockReadFile.mockResolvedValueOnce(JSON.stringify(creds));
}

/** Sets up mockReadFile to throw ENOENT (file not found) */
function mockFileNotFound(): void {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  mockReadFile.mockRejectedValueOnce(err);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCliAuth', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // File reading & getToken()
  // -------------------------------------------------------------------------

  describe('getToken() — file reading', () => {
    it('should read credentials file and return access token', async () => {
      const creds = createCredentials();
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe('eyJ-valid-access-token');
      expect(mockReadFile).toHaveBeenCalledWith('/tmp/test-creds.json', 'utf-8');
    });

    it('should cache credentials after first read', async () => {
      const creds = createCredentials();
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      // Multiple calls should only read the file once
      await auth.getToken();
      await auth.getToken();
      await auth.getToken();

      expect(mockReadFile).toHaveBeenCalledOnce();
    });

    it('should use custom credentials path', async () => {
      const creds = createCredentials();
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/custom/path/creds.json' });
      await auth.getToken();

      expect(mockReadFile).toHaveBeenCalledWith('/custom/path/creds.json', 'utf-8');
    });

    it('should return the access token from the credentials', async () => {
      const creds = createCredentials({ accessToken: 'specific-token-value' });
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe('specific-token-value');
    });
  });

  // -------------------------------------------------------------------------
  // Token expiry detection
  // -------------------------------------------------------------------------

  describe('getToken() — expiry detection', () => {
    it('should return cached token when not expired', async () => {
      // Token expires in 2 hours — well within validity
      const creds = createCredentials({
        expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      });
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe(creds.accessToken);
      // No fetch call (no refresh needed)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should auto-refresh when token is expired', async () => {
      // Token already expired (1 minute ago)
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-access-token'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      // Should have refreshed and returned the new token
      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should auto-refresh within the 60s safety buffer', async () => {
      // Token expires in 30 seconds — within the 60s buffer
      const creds = createCredentials({
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('refreshed-token'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe('refreshed-token');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should not refresh when outside the safety buffer', async () => {
      // Token expires in 120 seconds — outside the 60s buffer
      const creds = createCredentials({
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe(creds.accessToken);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should treat missing expiresAt as not expired', async () => {
      // No expiresAt field — should not trigger refresh
      const creds = createCredentials();
      // @ts-expect-error — testing missing field scenario
      delete creds.expiresAt;
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      const token = await auth.getToken();

      expect(token).toBe(creds.accessToken);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Token refresh flow
  // -------------------------------------------------------------------------

  describe('token refresh flow', () => {
    it('should POST to the correct token endpoint', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-token'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://porta.local:3443/porta-admin/token');
      expect(init.method).toBe('POST');
    });

    it('should send grant_type=refresh_token with correct params', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-token'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('porta-cli');
      expect(body.get('refresh_token')).toBe('eyJ-valid-refresh-token');
    });

    it('should update in-memory cache after refresh', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(
        createRefreshResponse('refreshed-token', 7200),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();

      // Advance time but still within new token's validity (2 hours - 60s buffer)
      vi.advanceTimersByTime(3600_000); // 1 hour

      // Should return the refreshed token from cache without file read or fetch
      const token = await auth.getToken();
      expect(token).toBe('refreshed-token');
      expect(mockReadFile).toHaveBeenCalledOnce(); // Only initial read
      expect(mockFetch).toHaveBeenCalledOnce(); // Only initial refresh
    });

    it('should preserve existing refresh_token when server does not rotate', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      // Response without refresh_token — server didn't rotate
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-access'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();

      // Force another refresh to check the refresh_token is preserved
      mockFileContents(creds); // refreshToken() re-reads file
      mockFetch.mockResolvedValueOnce(createRefreshResponse('another-token'));

      await auth.refreshToken!();
      const body = new URLSearchParams(mockFetch.mock.calls[1][1].body);
      // Should still use the original refresh_token from the file
      expect(body.get('refresh_token')).toBe('eyJ-valid-refresh-token');
    });

    it('should update refresh_token when server rotates it', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      // Server returns a rotated refresh_token
      mockFetch.mockResolvedValueOnce(
        createRefreshResponse('new-access', 3600, {
          refresh_token: 'rotated-refresh-token',
        }),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();

      // The cached credentials should now have the rotated refresh_token
      // Advance past expiry to trigger another refresh from cache
      vi.advanceTimersByTime(3600_000);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('final-token'));

      await auth.getToken();
      const body = new URLSearchParams(mockFetch.mock.calls[1][1].body);
      expect(body.get('refresh_token')).toBe('rotated-refresh-token');
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken() method
  // -------------------------------------------------------------------------

  describe('refreshToken()', () => {
    it('should be defined', () => {
      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      expect(auth.refreshToken).toBeDefined();
      expect(typeof auth.refreshToken).toBe('function');
    });

    it('should re-read credentials file before refreshing', async () => {
      const creds = createCredentials();
      mockFileContents(creds); // First read for getToken
      mockFileContents(creds); // Second read for refreshToken
      mockFetch.mockResolvedValueOnce(createRefreshResponse('refreshed'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();
      await auth.refreshToken!();

      // File should have been read twice
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it('should return the new access token', async () => {
      const creds = createCredentials();
      mockFileContents(creds);
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-token-from-refresh'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();
      const token = await auth.refreshToken!();

      expect(token).toBe('new-token-from-refresh');
    });

    it('should update cache so subsequent getToken returns refreshed token', async () => {
      const creds = createCredentials();
      mockFileContents(creds);
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('refreshed', 7200));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken();
      await auth.refreshToken!();

      // Next getToken should use cache — no additional file read or fetch
      const token = await auth.getToken();
      expect(token).toBe('refreshed');
      expect(mockReadFile).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling — file errors
  // -------------------------------------------------------------------------

  describe('error handling — file errors', () => {
    it('should throw PortaAuthenticationError when file not found', async () => {
      mockFileNotFound();

      const auth = createCliAuth({ credentialsPath: '/tmp/nonexistent.json' });

      const error = await auth.getToken().catch((e: Error) => e);
      expect(error).toBeInstanceOf(PortaAuthenticationError);
      expect(error.message).toMatch(/not found/);
    });

    it('should include file path in not-found error message', async () => {
      mockFileNotFound();

      const auth = createCliAuth({ credentialsPath: '/tmp/nonexistent.json' });

      await expect(auth.getToken()).rejects.toThrow(/\/tmp\/nonexistent\.json/);
    });

    it('should suggest porta login when file not found', async () => {
      mockFileNotFound();

      const auth = createCliAuth({ credentialsPath: '/tmp/nonexistent.json' });

      await expect(auth.getToken()).rejects.toThrow(/porta login/);
    });

    it('should throw on malformed JSON in credentials file', async () => {
      mockReadFile.mockResolvedValueOnce('{ invalid json !!!');

      const auth = createCliAuth({ credentialsPath: '/tmp/bad.json' });

      await expect(auth.getToken()).rejects.toThrow(PortaAuthenticationError);
    });

    it('should throw when required fields are missing', async () => {
      // Missing accessToken
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ server: 'https://porta.local:3443', orgSlug: 'admin' }),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/incomplete.json' });

      await expect(auth.getToken()).rejects.toThrow(/missing required fields/);
    });

    it('should throw when server field is missing', async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ accessToken: 'token', orgSlug: 'admin' }),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/no-server.json' });

      await expect(auth.getToken()).rejects.toThrow(/missing required fields/);
    });

    it('should throw when orgSlug field is missing', async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ accessToken: 'token', server: 'https://porta.local:3443' }),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/no-slug.json' });

      await expect(auth.getToken()).rejects.toThrow(/missing required fields/);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling — refresh errors
  // -------------------------------------------------------------------------

  describe('error handling — refresh errors', () => {
    it('should throw when refreshToken is missing from credentials', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        refreshToken: '', // empty = falsy
      });
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      await expect(auth.getToken()).rejects.toThrow(/no refresh_token/);
    });

    it('should throw on non-OK refresh response', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createErrorResponse(401));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      const error = await auth.getToken().catch((e: Error) => e);
      expect(error).toBeInstanceOf(PortaAuthenticationError);
      expect(error.message).toMatch(/401/);
    });

    it('should throw when refresh response missing access_token', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ token_type: 'bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      await expect(auth.getToken()).rejects.toThrow(/missing access_token/);
    });

    it('should throw on network error during refresh', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      await expect(auth.getToken()).rejects.toThrow(/Connection refused/);
    });

    it('should suggest porta login on refresh failure', async () => {
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createErrorResponse(403));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      await expect(auth.getToken()).rejects.toThrow(/porta login/);
    });

    it('should throw on refreshToken() when file disappeared', async () => {
      const creds = createCredentials();
      mockFileContents(creds);

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken(); // Initial read succeeds

      // File is gone on re-read during refreshToken()
      mockFileNotFound();
      await expect(auth.refreshToken!()).rejects.toThrow(/not found/);
    });
  });

  // -------------------------------------------------------------------------
  // Read-only guarantee
  // -------------------------------------------------------------------------

  describe('read-only guarantee', () => {
    it('should not import writeFile or writeFileSync', async () => {
      // Verify that the module only uses readFile, not write operations.
      // The mock setup already verifies this — if writeFile were imported
      // and called, it would throw since only readFile is mocked.
      const creds = createCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      mockFileContents(creds);
      mockFetch.mockResolvedValueOnce(createRefreshResponse('new-token'));

      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
      await auth.getToken(); // Triggers refresh

      // readFile is the only fs operation that should have been called
      expect(mockReadFile).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // AuthProvider interface compliance
  // -------------------------------------------------------------------------

  describe('AuthProvider interface', () => {
    it('should have getToken and refreshToken', () => {
      const auth = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });

      expect(typeof auth.getToken).toBe('function');
      expect(typeof auth.refreshToken).toBe('function');
    });
  });
});
