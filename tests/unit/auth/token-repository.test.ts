import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database module before importing repository
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

// Mock logger to suppress output and enable spy assertions
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertToken,
  findValidToken,
  markTokenUsed,
  deleteExpiredTokens,
  invalidateUserTokens,
} from '../../../src/auth/token-repository.js';
import type { TokenTable } from '../../../src/auth/token-repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock pool with a configurable query function */
function mockPool(rows: Record<string, unknown>[] = [], rowCount?: number) {
  const mockQuery = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard test token row as returned from the database */
function createTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-uuid-1',
    user_id: 'user-uuid-1',
    token_hash: 'abc123def456',
    expires_at: new Date('2026-12-31T00:00:00Z'),
    used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** All three valid token table names for parameterized tests */
const VALID_TABLES: TokenTable[] = [
  'magic_link_tokens',
  'password_reset_tokens',
  'invitation_tokens',
];

describe('token-repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Table name validation
  // -------------------------------------------------------------------------

  describe('table name validation', () => {
    it('should throw for invalid table name on insertToken', async () => {
      mockPool();
      await expect(
        insertToken('invalid_table' as TokenTable, 'user-1', 'hash', new Date()),
      ).rejects.toThrow('Invalid token table');
    });

    it('should throw for invalid table name on findValidToken', async () => {
      mockPool();
      await expect(
        findValidToken('bad_table' as TokenTable, 'hash'),
      ).rejects.toThrow('Invalid token table');
    });

    it('should throw for invalid table name on markTokenUsed', async () => {
      mockPool();
      await expect(
        markTokenUsed('hackers_table' as TokenTable, 'id'),
      ).rejects.toThrow('Invalid token table');
    });

    it('should throw for invalid table name on deleteExpiredTokens', async () => {
      mockPool();
      await expect(
        deleteExpiredTokens('drop_table' as TokenTable, new Date()),
      ).rejects.toThrow('Invalid token table');
    });

    it('should throw for invalid table name on invalidateUserTokens', async () => {
      mockPool();
      await expect(
        invalidateUserTokens('bobby_tables' as TokenTable, 'user-1'),
      ).rejects.toThrow('Invalid token table');
    });
  });

  // -------------------------------------------------------------------------
  // insertToken
  // -------------------------------------------------------------------------

  describe('insertToken', () => {
    it.each(VALID_TABLES)(
      'should insert into %s with correct parameters',
      async (table) => {
        const mockQuery = mockPool();
        const expiresAt = new Date('2026-06-01T00:00:00Z');

        await insertToken(table, 'user-uuid-1', 'hash-abc', expiresAt);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain(`INSERT INTO ${table}`);
        expect(params).toEqual(['user-uuid-1', 'hash-abc', expiresAt]);
      },
    );
  });

  // -------------------------------------------------------------------------
  // findValidToken
  // -------------------------------------------------------------------------

  describe('findValidToken', () => {
    it.each(VALID_TABLES)(
      'should return mapped token record from %s when found',
      async (table) => {
        const row = createTokenRow();
        mockPool([row]);

        const result = await findValidToken(table, 'abc123def456');

        expect(result).not.toBeNull();
        expect(result!.id).toBe('token-uuid-1');
        expect(result!.userId).toBe('user-uuid-1');
        expect(result!.tokenHash).toBe('abc123def456');
        expect(result!.expiresAt).toEqual(new Date('2026-12-31T00:00:00Z'));
        expect(result!.usedAt).toBeNull();
        expect(result!.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      },
    );

    it('should return null when no valid token is found', async () => {
      mockPool([]);
      const result = await findValidToken('magic_link_tokens', 'nonexistent-hash');
      expect(result).toBeNull();
    });

    it('should query with used_at IS NULL and expires_at > NOW() conditions', async () => {
      const mockQuery = mockPool([]);
      await findValidToken('password_reset_tokens', 'some-hash');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('used_at IS NULL');
      expect(sql).toContain('expires_at > NOW()');
    });

    it('should pass token hash as parameterized query value', async () => {
      const mockQuery = mockPool([]);
      await findValidToken('invitation_tokens', 'the-hash-value');

      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual(['the-hash-value']);
    });
  });

  // -------------------------------------------------------------------------
  // markTokenUsed
  // -------------------------------------------------------------------------

  describe('markTokenUsed', () => {
    it.each(VALID_TABLES)(
      'should update used_at in %s for the given token ID',
      async (table) => {
        const mockQuery = mockPool();

        await markTokenUsed(table, 'token-uuid-99');

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain(`UPDATE ${table}`);
        expect(sql).toContain('used_at = NOW()');
        expect(params).toEqual(['token-uuid-99']);
      },
    );
  });

  // -------------------------------------------------------------------------
  // deleteExpiredTokens
  // -------------------------------------------------------------------------

  describe('deleteExpiredTokens', () => {
    it('should delete tokens older than cutoff and return count', async () => {
      const mockQuery = mockPool([], 5);
      const cutoff = new Date('2026-01-01T00:00:00Z');

      const count = await deleteExpiredTokens('magic_link_tokens', cutoff);

      expect(count).toBe(5);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM magic_link_tokens');
      expect(params).toEqual([cutoff]);
    });

    it('should return 0 when no tokens are deleted', async () => {
      mockPool([], 0);
      const count = await deleteExpiredTokens('password_reset_tokens', new Date());
      expect(count).toBe(0);
    });

    it('should handle null rowCount gracefully', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: null });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      const count = await deleteExpiredTokens('invitation_tokens', new Date());
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // invalidateUserTokens
  // -------------------------------------------------------------------------

  describe('invalidateUserTokens', () => {
    it.each(VALID_TABLES)(
      'should set used_at on all active tokens for user in %s',
      async (table) => {
        const mockQuery = mockPool([], 3);

        await invalidateUserTokens(table, 'user-uuid-42');

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain(`UPDATE ${table}`);
        expect(sql).toContain('used_at = NOW()');
        expect(sql).toContain('user_id = $1');
        expect(sql).toContain('used_at IS NULL');
        expect(params).toEqual(['user-uuid-42']);
      },
    );

    it('should not throw when no tokens exist for user', async () => {
      mockPool([], 0);
      await expect(
        invalidateUserTokens('magic_link_tokens', 'user-no-tokens'),
      ).resolves.toBeUndefined();
    });
  });
});
