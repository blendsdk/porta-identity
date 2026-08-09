/**
 * Tests for the credential store module.
 *
 * Verifies credential CRUD operations, token expiry checking,
 * and file path resolution. Uses a temporary directory to avoid
 * interfering with real credentials.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock homedir() to use a temp directory for tests
const TEST_HOME = join(tmpdir(), `porta-cli-test-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => TEST_HOME };
});

// Import after mock setup
const { loadCredentials, saveCredentials, clearCredentials, hasCredentials, getCredentialsPath, isTokenExpired } =
  await import('../src/credential-store.js');

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** Creates a valid StoredCredentials fixture */
function makeCredentials(overrides: Record<string, unknown> = {}) {
  return {
    server: 'https://porta.example.com',
    orgSlug: 'admin',
    clientId: 'cli-client-id',
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    idToken: 'id-token-789',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
    userInfo: { sub: 'user-1', email: 'admin@example.com', name: 'Admin' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('credential-store', () => {
  beforeEach(() => {
    // Create fresh test home directory
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  describe('getCredentialsPath', () => {
    it('returns path under home directory', () => {
      const path = getCredentialsPath();
      expect(path).toBe(join(TEST_HOME, '.porta', 'credentials.json'));
    });
  });

  describe('loadCredentials', () => {
    it('returns null when no credentials file exists', () => {
      expect(loadCredentials()).toBeNull();
    });

    it('returns null when credentials file contains invalid JSON', () => {
      const portaDir = join(TEST_HOME, '.porta');
      mkdirSync(portaDir, { recursive: true });
      writeFileSync(join(portaDir, 'credentials.json'), 'not json', 'utf-8');
      expect(loadCredentials()).toBeNull();
    });

    it('loads valid credentials from disk', () => {
      const creds = makeCredentials();
      const portaDir = join(TEST_HOME, '.porta');
      mkdirSync(portaDir, { recursive: true });
      writeFileSync(join(portaDir, 'credentials.json'), JSON.stringify(creds), 'utf-8');

      const loaded = loadCredentials();
      expect(loaded).toEqual(creds);
    });
  });

  describe('saveCredentials', () => {
    it('creates the .porta directory and writes credentials', () => {
      const creds = makeCredentials();
      saveCredentials(creds);

      const path = getCredentialsPath();
      expect(existsSync(path)).toBe(true);

      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.server).toBe('https://porta.example.com');
      expect(parsed.accessToken).toBe('access-token-123');
    });

    it('overwrites existing credentials', () => {
      saveCredentials(makeCredentials());
      saveCredentials(makeCredentials({ accessToken: 'new-token' }));

      const loaded = loadCredentials();
      expect(loaded?.accessToken).toBe('new-token');
    });
  });

  describe('clearCredentials', () => {
    it('deletes the credentials file', () => {
      saveCredentials(makeCredentials());
      expect(hasCredentials()).toBe(true);

      clearCredentials();
      expect(hasCredentials()).toBe(false);
    });

    it('does nothing when no credentials exist', () => {
      // Should not throw
      clearCredentials();
      expect(hasCredentials()).toBe(false);
    });
  });

  describe('hasCredentials', () => {
    it('returns false when no credentials exist', () => {
      expect(hasCredentials()).toBe(false);
    });

    it('returns true when credentials exist', () => {
      saveCredentials(makeCredentials());
      expect(hasCredentials()).toBe(true);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for a token expiring in 1 hour', () => {
      const creds = makeCredentials({
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(false);
    });

    it('returns true for an expired token', () => {
      const creds = makeCredentials({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(isTokenExpired(creds)).toBe(true);
    });

    it('returns true for a token expiring within 60s buffer', () => {
      const creds = makeCredentials({
        expiresAt: new Date(Date.now() + 30_000).toISOString(), // 30s from now
      });
      expect(isTokenExpired(creds)).toBe(true);
    });

    it('returns false for a token expiring just outside the 60s buffer', () => {
      const creds = makeCredentials({
        expiresAt: new Date(Date.now() + 120_000).toISOString(), // 2 min from now
      });
      expect(isTokenExpired(creds)).toBe(false);
    });
  });
});
