import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database module before importing the module under test
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import {
  getSystemConfigNumber,
  getSystemConfigString,
  getSystemConfigBoolean,
  loadOidcTtlConfig,
  clearSystemConfigCache,
} from '../../../src/lib/system-config.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

describe('system-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSystemConfigCache();
  });

  describe('getSystemConfigNumber', () => {
    it('returns DB value when key exists as number', async () => {
      mockPool([{ value: 7200 }]);
      const result = await getSystemConfigNumber('access_token_ttl', 3600);
      expect(result).toBe(7200);
    });

    it('parses JSONB string value as number', async () => {
      mockPool([{ value: '3600' }]);
      const result = await getSystemConfigNumber('access_token_ttl', 1800);
      expect(result).toBe(3600);
    });

    it('returns fallback when key is missing', async () => {
      mockPool([]);
      const result = await getSystemConfigNumber('missing_key', 42);
      expect(result).toBe(42);
    });

    it('returns fallback for invalid non-numeric value', async () => {
      mockPool([{ value: 'not-a-number' }]);
      const result = await getSystemConfigNumber('bad_key', 99);
      expect(result).toBe(99);
    });

    it('returns fallback on DB error', async () => {
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('connection lost')),
      });
      const result = await getSystemConfigNumber('any_key', 500);
      expect(result).toBe(500);
    });
  });

  describe('getSystemConfigString', () => {
    it('returns DB value as string', async () => {
      mockPool([{ value: 'hello' }]);
      const result = await getSystemConfigString('some_key', 'default');
      expect(result).toBe('hello');
    });

    it('coerces number value to string', async () => {
      mockPool([{ value: 42 }]);
      const result = await getSystemConfigString('num_key', 'default');
      expect(result).toBe('42');
    });

    it('returns fallback when key is missing', async () => {
      mockPool([]);
      const result = await getSystemConfigString('missing', 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('getSystemConfigBoolean', () => {
    it('returns native JSONB boolean true', async () => {
      mockPool([{ value: true }]);
      const result = await getSystemConfigBoolean('cookie_secure', false);
      expect(result).toBe(true);
    });

    it('returns native JSONB boolean false', async () => {
      mockPool([{ value: false }]);
      const result = await getSystemConfigBoolean('cookie_secure', true);
      expect(result).toBe(false);
    });

    it('parses string "true"', async () => {
      mockPool([{ value: 'true' }]);
      const result = await getSystemConfigBoolean('flag', false);
      expect(result).toBe(true);
    });

    it('parses string "false"', async () => {
      mockPool([{ value: 'false' }]);
      const result = await getSystemConfigBoolean('flag', true);
      expect(result).toBe(false);
    });

    it('returns fallback for invalid value', async () => {
      mockPool([{ value: 'yes' }]);
      const result = await getSystemConfigBoolean('flag', true);
      expect(result).toBe(true);
    });

    it('returns fallback when key is missing', async () => {
      mockPool([]);
      const result = await getSystemConfigBoolean('missing', true);
      expect(result).toBe(true);
    });
  });

  describe('cache behavior', () => {
    it('returns cached value on second call without querying DB', async () => {
      const mockQuery = mockPool([{ value: 100 }]);
      await getSystemConfigNumber('cached_key', 0);
      await getSystemConfigNumber('cached_key', 0);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('clearSystemConfigCache forces fresh DB query', async () => {
      const mockQuery = mockPool([{ value: 100 }]);
      await getSystemConfigNumber('cached_key', 0);
      clearSystemConfigCache();
      await getSystemConfigNumber('cached_key', 0);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadOidcTtlConfig', () => {
    it('returns all TTL values from DB', async () => {
      let callCount = 0;
      const values = [7200, 3600, 5184000, 300, 43200];
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
        query: vi.fn().mockImplementation(() => {
          const val = values[callCount++] ?? 0;
          return Promise.resolve({ rows: [{ value: val }] });
        }),
      });

      const result = await loadOidcTtlConfig();
      expect(result.accessToken).toBe(7200);
      expect(result.idToken).toBe(3600);
      expect(result.refreshToken).toBe(5184000);
      expect(result.authorizationCode).toBe(300);
      expect(result.session).toBe(43200);
      expect(result.interaction).toBe(3600); // Hardcoded
      expect(result.grant).toBe(5184000); // Same as refreshToken
    });

    it('uses fallback defaults when keys are missing', async () => {
      mockPool([]);
      const result = await loadOidcTtlConfig();
      expect(result.accessToken).toBe(3600);
      expect(result.idToken).toBe(3600);
      expect(result.refreshToken).toBe(2592000);
      expect(result.authorizationCode).toBe(600);
      expect(result.session).toBe(86400);
      expect(result.interaction).toBe(3600);
      expect(result.grant).toBe(2592000);
    });
  });
});
