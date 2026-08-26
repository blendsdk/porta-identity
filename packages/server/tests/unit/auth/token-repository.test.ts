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
  consumeLockedMagicLinkToken,
  consumeAuthorizedMagicLink,
  findAndLockMagicLinkToken,
  invalidateUserTokens,
} from '../../../src/auth/token-repository.js';
import type { GenericInsertTokenTable, TokenTable } from '../../../src/auth/token-repository.js';

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

/** Create a typed transaction-client boundary backed by the mocked database pool. */
async function mockTransactionClient(rows: Record<string, unknown>[] = [], rowCount?: number) {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rowCount ?? rows.length });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ connect });
  return { client: await getPool().connect(), query };
}

/** Create a transaction client that returns one declared result for every ordered query. */
function mockScriptedTransaction(
  results: ReadonlyArray<{ rows?: Record<string, unknown>[]; rowCount?: number }>,
) {
  const remaining = [...results];
  const query = vi.fn().mockImplementation(async () => {
    const result = remaining.shift();
    if (!result) throw new Error('Unexpected transaction query');
    return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 };
  });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ connect });
  return { query, release };
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

/** Tables that can be inserted without magic-link authority metadata. */
const GENERIC_INSERT_TABLES: GenericInsertTokenTable[] = [
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
        insertToken('invalid_table' as GenericInsertTokenTable, 'user-1', 'hash', new Date()),
      ).rejects.toThrow('Invalid token table');
    });

    it('should throw for invalid table name on findValidToken', async () => {
      mockPool();
      await expect(findValidToken('bad_table' as TokenTable, 'hash')).rejects.toThrow(
        'Invalid token table',
      );
    });

    it('should throw for invalid table name on markTokenUsed', async () => {
      mockPool();
      await expect(markTokenUsed('hackers_table' as TokenTable, 'id')).rejects.toThrow(
        'Invalid token table',
      );
    });

    it('should throw for invalid table name on deleteExpiredTokens', async () => {
      mockPool();
      await expect(deleteExpiredTokens('drop_table' as TokenTable, new Date())).rejects.toThrow(
        'Invalid token table',
      );
    });

    it('should throw for invalid table name on invalidateUserTokens', async () => {
      mockPool();
      await expect(invalidateUserTokens('bobby_tables' as TokenTable, 'user-1')).rejects.toThrow(
        'Invalid token table',
      );
    });
  });

  // -------------------------------------------------------------------------
  // insertToken
  // -------------------------------------------------------------------------

  describe('insertToken', () => {
    it.each(GENERIC_INSERT_TABLES)(
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
    it.each(VALID_TABLES)('should return mapped token record from %s when found', async (table) => {
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
    });

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

  describe('magic-link authority transaction helpers', () => {
    it('should lock only a current tenant-owned authority-bound artifact', async () => {
      const row = createTokenRow({
        organization_id: 'organization-alpha',
        interaction_uid: 'interaction-alpha',
        account_status: 'active',
      });
      const { client, query } = await mockTransactionClient([row], 1);

      const result = await findAndLockMagicLinkToken(
        client,
        'presented-token-hash',
        'organization-alpha',
      );

      expect(result).toMatchObject({
        id: 'token-uuid-1',
        organizationId: 'organization-alpha',
        interactionUid: 'interaction-alpha',
        accountStatus: 'active',
      });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF token, account'), [
        'presented-token-hash',
        'organization-alpha',
      ]);
      expect(query.mock.calls[0][0]).toContain('token.authority_bound = TRUE');
    });

    it('should return null when no tenant-owned magic-link authority matches', async () => {
      const { client } = await mockTransactionClient([], 0);

      await expect(
        findAndLockMagicLinkToken(client, 'unknown-token-hash', 'organization-alpha'),
      ).resolves.toBeNull();
    });

    it.each([
      [1, true],
      [0, false],
    ] as const)('should map conditional consume row count %s to %s', async (rowCount, expected) => {
      const { client, query } = await mockTransactionClient([], rowCount);

      await expect(consumeLockedMagicLinkToken(client, 'token-uuid-1')).resolves.toBe(expected);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('RETURNING id'), ['token-uuid-1']);
    });

    it('should commit consumption, account mutation, and audit only after exact authority matches', async () => {
      const row = createTokenRow({
        organization_id: 'organization-alpha',
        interaction_uid: 'interaction-alpha',
        account_status: 'active',
      });
      const { query, release } = mockScriptedTransaction([
        {},
        { rows: [{ id: 'client-row-id' }], rowCount: 1 },
        { rows: [row], rowCount: 1 },
        { rowCount: 1 },
        { rows: [{ id: 'user-uuid-1' }], rowCount: 1 },
        { rowCount: 1 },
        {},
      ]);

      await expect(
        consumeAuthorizedMagicLink({
          tokenHash: 'presented-token-hash',
          organizationId: 'organization-alpha',
          interactionUid: 'interaction-alpha',
          clientId: 'client-alpha',
          ipAddress: '127.0.0.1',
        }),
      ).resolves.toStrictEqual({
        userId: 'user-uuid-1',
        interactionUid: 'interaction-alpha',
      });

      expect(
        query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/).slice(0, 2).join(' ')),
      ).toStrictEqual([
        'BEGIN',
        'SELECT id',
        'SELECT token.id,',
        'UPDATE magic_link_tokens',
        'UPDATE users',
        'INSERT INTO',
        'COMMIT',
      ]);
      expect(release).toHaveBeenCalledOnce();
    });

    it('should roll back before mutation when the presented interaction differs', async () => {
      const row = createTokenRow({
        organization_id: 'organization-alpha',
        interaction_uid: 'interaction-authoritative',
        account_status: 'active',
      });
      const { query, release } = mockScriptedTransaction([
        {},
        { rows: [{ id: 'client-row-id' }], rowCount: 1 },
        { rows: [row], rowCount: 1 },
        {},
      ]);

      await expect(
        consumeAuthorizedMagicLink({
          tokenHash: 'presented-token-hash',
          organizationId: 'organization-alpha',
          interactionUid: 'interaction-changed',
          clientId: 'client-alpha',
        }),
      ).resolves.toBeNull();

      expect(query).toHaveBeenCalledTimes(4);
      expect(query.mock.calls[3][0]).toBe('ROLLBACK');
      expect(release).toHaveBeenCalledOnce();
    });

    it('should roll back token consumption when the locked account cannot be updated', async () => {
      const row = createTokenRow({
        organization_id: 'organization-alpha',
        interaction_uid: null,
        account_status: 'active',
      });
      const { query, release } = mockScriptedTransaction([
        {},
        { rows: [row], rowCount: 1 },
        { rowCount: 1 },
        { rowCount: 0 },
        {},
      ]);

      await expect(
        consumeAuthorizedMagicLink({
          tokenHash: 'presented-token-hash',
          organizationId: 'organization-alpha',
          interactionUid: null,
          clientId: null,
        }),
      ).resolves.toBeNull();

      expect(query).toHaveBeenCalledTimes(5);
      expect(query.mock.calls[4][0]).toBe('ROLLBACK');
      expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_log'))).toBe(
        false,
      );
      expect(release).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // markTokenUsed
  // -------------------------------------------------------------------------

  describe('markTokenUsed', () => {
    it.each(VALID_TABLES)('should update used_at in %s for the given token ID', async (table) => {
      const mockQuery = mockPool();

      await markTokenUsed(table, 'token-uuid-99');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain(`UPDATE ${table}`);
      expect(sql).toContain('used_at = NOW()');
      expect(params).toEqual(['token-uuid-99']);
    });
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
