import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import {
  upsertSession,
  revokeSession,
  revokeUserSessions,
  getSession,
  listSessions,
  purgeExpiredSessions,
} from '../../../src/lib/session-tracking.js';

function createMockPool() {
  return { query: vi.fn() };
}

describe('session-tracking', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  describe('upsertSession', () => {
    it('should insert a session tracking record with parameterized query', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      await upsertSession({
        sessionId: 'sess-123',
        userId: 'user-1',
        expiresAt: new Date('2026-01-01'),
      });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO admin_sessions');
      expect(sql).toContain('ON CONFLICT (session_id) DO UPDATE');
      expect(params[0]).toBe('sess-123');
      expect(params[1]).toBe('user-1');
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));
      await expect(upsertSession({
        sessionId: 'sess-fail',
        expiresAt: new Date(),
      })).resolves.toBeUndefined();
    });
  });

  describe('revokeSession', () => {
    it('should mark session as revoked', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });
      await revokeSession('sess-123');
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('revoked_at = NOW()');
      expect(params[0]).toBe('sess-123');
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValue(new Error('timeout'));
      await expect(revokeSession('sess-fail')).resolves.toBeUndefined();
    });
  });

  describe('revokeUserSessions', () => {
    it('should revoke all sessions for a user and return count', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 3 });
      const count = await revokeUserSessions('user-1');
      expect(count).toBe(3);
      expect(mockPool.query.mock.calls[0][1]).toEqual(['user-1']);
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', async () => {
      const now = new Date();
      mockPool.query.mockResolvedValue({
        rows: [{
          sessionId: 'sess-1',
          userId: 'u1',
          clientId: 'c1',
          organizationId: 'org1',
          grantId: 'g1',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla',
          createdAt: now,
          expiresAt: new Date(now.getTime() + 3600000),
          lastActivityAt: now,
          revokedAt: null,
        }],
      });

      const session = await getSession('sess-1');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('sess-1');
      expect(session!.userId).toBe('u1');
    });

    it('should return null for non-existent session', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const session = await getSession('nonexistent');
      expect(session).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return paginated sessions with total count', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { sessionId: 'sess-1', userId: 'u1', clientId: null, organizationId: null, grantId: null, ipAddress: null, userAgent: null, createdAt: new Date(), expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null },
          ],
        });

      const result = await listSessions({ page: 1, pageSize: 10 });
      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should filter by userId when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listSessions({ userId: 'user-abc' });
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('user_id = $1');
    });

    it('should default to active-only sessions', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listSessions({});
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('revoked_at IS NULL');
      expect(sql).toContain('expires_at > NOW()');
    });
  });

  describe('purgeExpiredSessions', () => {
    it('should delete expired sessions older than 7 days', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 10 });
      const count = await purgeExpiredSessions();
      expect(count).toBe(10);
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain("INTERVAL '7 days'");
    });

    it('should return 0 on error (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValue(new Error('fail'));
      const count = await purgeExpiredSessions();
      expect(count).toBe(0);
    });
  });
});
