import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PostgresAdapter('AccessToken');
  });

  it('constructor sets model name', () => {
    expect((adapter as unknown as { name: string }).name).toBe('AccessToken');
  });

  describe('upsert', () => {
    it('inserts payload with correct parameters', async () => {
      const mockQuery = mockPool();
      const payload = { accountId: 'user-1', grantId: 'grant-1', uid: 'uid-1', userCode: 'uc-1' };
      await adapter.upsert('token-id', payload, 3600);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO oidc_payloads');
      expect(sql).toContain('ON CONFLICT (id, type)');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('token-id');
      expect(params[1]).toBe('AccessToken');
      expect(params[3]).toBe('grant-1'); // grant_id
      expect(params[4]).toBe('uc-1');    // user_code
      expect(params[5]).toBe('uid-1');   // uid
    });

    it('calculates expires_at from expiresIn', async () => {
      const mockQuery = mockPool();
      const before = Date.now();
      await adapter.upsert('id', {}, 3600);
      const after = Date.now();

      const expiresAt = mockQuery.mock.calls[0][1][6] as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it('sets null grant_id/user_code/uid when absent from payload', async () => {
      const mockQuery = mockPool();
      await adapter.upsert('id', { accountId: 'user-1' }, 300);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[3]).toBeNull(); // grant_id
      expect(params[4]).toBeNull(); // user_code
      expect(params[5]).toBeNull(); // uid
    });
  });

  describe('find', () => {
    it('returns payload for existing record', async () => {
      mockPool([{ payload: { accountId: 'user-1', kind: 'AccessToken' }, consumed_at: null }]);
      const result = await adapter.find('token-id');
      expect(result).toBeDefined();
      expect(result!.accountId).toBe('user-1');
    });

    it('returns undefined for missing record', async () => {
      mockPool([]);
      const result = await adapter.find('missing-id');
      expect(result).toBeUndefined();
    });

    it('merges consumed_at into payload as epoch seconds', async () => {
      const consumedDate = new Date('2025-06-15T12:00:00Z');
      mockPool([{ payload: { accountId: 'user-1' }, consumed_at: consumedDate }]);
      const result = await adapter.find('token-id');
      expect(result!.consumed).toBe(Math.floor(consumedDate.getTime() / 1000));
    });

    it('filters by type in WHERE clause', async () => {
      const mockQuery = mockPool([]);
      await adapter.find('some-id');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('AccessToken');
    });
  });

  describe('findByUserCode', () => {
    it('queries by user_code column', async () => {
      const mockQuery = mockPool([{ payload: { kind: 'DeviceCode' }, consumed_at: null }]);
      await adapter.findByUserCode('UC-123');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('user_code = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('UC-123');
    });
  });

  describe('findByUid', () => {
    it('queries by uid column', async () => {
      const mockQuery = mockPool([{ payload: { kind: 'Session' }, consumed_at: null }]);
      await adapter.findByUid('uid-456');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('uid = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('uid-456');
    });
  });

  describe('consume', () => {
    it('updates consumed_at to NOW()', async () => {
      const mockQuery = mockPool();
      await adapter.consume('token-id');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE oidc_payloads SET consumed_at = NOW()');
      expect(mockQuery.mock.calls[0][1]).toEqual(['token-id', 'AccessToken']);
    });
  });

  describe('destroy', () => {
    it('deletes by id and type', async () => {
      const mockQuery = mockPool();
      await adapter.destroy('token-id');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM oidc_payloads');
      expect(mockQuery.mock.calls[0][1]).toEqual(['token-id', 'AccessToken']);
    });
  });

  describe('revokeByGrantId', () => {
    it('deletes by grant_id and type', async () => {
      const mockQuery = mockPool();
      await adapter.revokeByGrantId('grant-123');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM oidc_payloads WHERE grant_id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['grant-123', 'AccessToken']);
    });
  });
});
