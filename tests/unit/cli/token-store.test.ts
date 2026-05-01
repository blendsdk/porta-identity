/**
 * Unit tests for the CLI token store.
 *
 * Tests credential read/write/clear, file permissions, token expiry
 * detection, and refresh token flow. All file system operations use
 * a temporary directory to avoid touching the real ~/.porta/ path.
 *
 * @module tests/unit/cli/token-store
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { StoredCredentials } from '../../../src/cli/token-store.js';

// ---------------------------------------------------------------------------
// Mock the homedir so tests use a temp directory, not the real home
// ---------------------------------------------------------------------------
let testHomeDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => testHomeDir,
  };
});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
const {
  getCredentialsPath,
  readCredentials,
  writeCredentials,
  clearCredentials,
  isTokenExpired,
  refreshAccessToken,
} = await import('../../../src/cli/token-store.js');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Creates a valid StoredCredentials object for testing */
function createTestCredentials(overrides: Partial<StoredCredentials> = {}): StoredCredentials {
  return {
    server: 'https://porta.local:3443',
    orgSlug: 'porta-admin',
    clientId: 'test-client-id-abc123',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    idToken: 'test-id-token',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
    userInfo: {
      sub: 'user-uuid-123',
      email: 'admin@example.com',
      name: 'Admin User',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('token-store', () => {
  beforeEach(() => {
    // Create a unique temp directory for each test to ensure isolation
    testHomeDir = mkdtempSync(join(tmpdir(), 'porta-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getCredentialsPath
  // =========================================================================

  describe('getCredentialsPath()', () => {
    it('should return path under home directory', () => {
      const path = getCredentialsPath();
      expect(path).toBe(join(testHomeDir, '.porta', 'credentials.json'));
    });
  });

  // =========================================================================
  // readCredentials / writeCredentials
  // =========================================================================

  describe('readCredentials()', () => {
    it('should return null when no credentials file exists', () => {
      const result = readCredentials();
      expect(result).toBeNull();
    });

    it('should return null when credentials file is corrupted JSON', async () => {
      // Create the directory and write invalid JSON — use dynamic import
      // to avoid ESLint's no-require-imports rule
      const { mkdirSync: mkdirSyncDirect, writeFileSync: writeFileSyncDirect } = await import('node:fs');
      const dir = join(testHomeDir, '.porta');
      mkdirSyncDirect(dir, { recursive: true });
      writeFileSyncDirect(join(dir, 'credentials.json'), 'not-valid-json{{{');

      const result = readCredentials();
      expect(result).toBeNull();
    });

    it('should return stored credentials after write', () => {
      const creds = createTestCredentials();
      writeCredentials(creds);

      const result = readCredentials();
      expect(result).toEqual(creds);
    });
  });

  describe('writeCredentials()', () => {
    it('should create the .porta directory if it does not exist', () => {
      const creds = createTestCredentials();
      writeCredentials(creds);

      const dirExists = existsSync(join(testHomeDir, '.porta'));
      expect(dirExists).toBe(true);
    });

    it('should write credentials as formatted JSON', () => {
      const creds = createTestCredentials();
      writeCredentials(creds);

      const raw = readFileSync(
        join(testHomeDir, '.porta', 'credentials.json'),
        'utf-8',
      );
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual(creds);
      // Verify it's formatted (has newlines)
      expect(raw).toContain('\n');
    });

    it('should set file permissions to 0600 (owner read/write only)', () => {
      const creds = createTestCredentials();
      writeCredentials(creds);

      const filePath = join(testHomeDir, '.porta', 'credentials.json');
      const stats = statSync(filePath);
      // File mode includes the file type bits — mask with 0o777 to get permission bits
      const perms = stats.mode & 0o777;
      expect(perms).toBe(0o600);
    });

    it('should overwrite existing credentials', () => {
      const creds1 = createTestCredentials({ accessToken: 'token-1' });
      writeCredentials(creds1);

      const creds2 = createTestCredentials({ accessToken: 'token-2' });
      writeCredentials(creds2);

      const result = readCredentials();
      expect(result?.accessToken).toBe('token-2');
    });
  });

  // =========================================================================
  // clearCredentials
  // =========================================================================

  describe('clearCredentials()', () => {
    it('should delete the credentials file', () => {
      const creds = createTestCredentials();
      writeCredentials(creds);

      // Verify file exists first
      expect(existsSync(getCredentialsPath())).toBe(true);

      clearCredentials();

      expect(existsSync(getCredentialsPath())).toBe(false);
    });

    it('should not throw when no credentials file exists', () => {
      // Should be safe to call even with no file
      expect(() => clearCredentials()).not.toThrow();
    });
  });

  // =========================================================================
  // isTokenExpired
  // =========================================================================

  describe('isTokenExpired()', () => {
    it('should return false when token is not expired', () => {
      // Token expires 1 hour from now
      const creds = createTestCredentials({
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(false);
    });

    it('should return true when token is expired', () => {
      // Token expired 1 hour ago
      const creds = createTestCredentials({
        expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(true);
    });

    it('should return true when token expires within the 60s buffer', () => {
      // Token expires in 30 seconds — within the 60s safety buffer
      const creds = createTestCredentials({
        expiresAt: new Date(Date.now() + 30 * 1000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(true);
    });

    it('should return false when token expires just outside the buffer', () => {
      // Token expires in 120 seconds — safely outside the 60s buffer
      const creds = createTestCredentials({
        expiresAt: new Date(Date.now() + 120 * 1000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(false);
    });
  });

  // =========================================================================
  // refreshAccessToken
  // =========================================================================

  describe('refreshAccessToken()', () => {
    it('should return updated credentials on successful refresh', async () => {
      const creds = createTestCredentials();

      // Mock fetch to simulate a successful token refresh response
      const mockResponse = {
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          id_token: 'new-id-token',
          expires_in: 3600,
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await refreshAccessToken(creds);

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('new-access-token');
      expect(result!.refreshToken).toBe('new-refresh-token');
      expect(result!.idToken).toBe('new-id-token');
      // Server and user info should be preserved
      expect(result!.server).toBe(creds.server);
      expect(result!.userInfo).toEqual(creds.userInfo);
    });

    it('should send correct request to the token endpoint', async () => {
      const creds = createTestCredentials();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new',
          expires_in: 3600,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await refreshAccessToken(creds);

      // Verify the fetch was called with correct URL and body
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://porta.local:3443/porta-admin/token');
      expect(options.method).toBe('POST');

      // Parse the URL-encoded body to verify parameters
      const body = new URLSearchParams(options.body);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('test-client-id-abc123');
      expect(body.get('refresh_token')).toBe('test-refresh-token');
    });

    it('should persist refreshed credentials to disk', async () => {
      const creds = createTestCredentials();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'persisted-token',
            expires_in: 3600,
          }),
        }),
      );

      await refreshAccessToken(creds);

      // Read from disk to verify persistence
      const stored = readCredentials();
      expect(stored?.accessToken).toBe('persisted-token');
    });

    it('should preserve existing refresh token when server does not rotate', async () => {
      const creds = createTestCredentials({
        refreshToken: 'original-refresh-token',
      });

      // Server response without refresh_token — keeps existing
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            expires_in: 3600,
            // No refresh_token or id_token in response
          }),
        }),
      );

      const result = await refreshAccessToken(creds);
      expect(result!.refreshToken).toBe('original-refresh-token');
    });

    it('should return null when the server responds with an error', async () => {
      const creds = createTestCredentials();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 400 }),
      );

      const result = await refreshAccessToken(creds);
      expect(result).toBeNull();
    });

    it('should return null when fetch throws a network error', async () => {
      const creds = createTestCredentials();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      );

      const result = await refreshAccessToken(creds);
      expect(result).toBeNull();
    });
  });
});
