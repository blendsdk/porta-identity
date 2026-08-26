import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { getEntityHistory } from '../../../src/lib/entity-history.js';

function createMockPool() {
  return { query: vi.fn() };
}

/** Create a base64url-encoded composite cursor matching the production format */
function testCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt, i: id })).toString('base64url');
}

/** Decode a base64url-encoded composite cursor for assertions */
function decodeCursor(cursor: string): { c: string; i: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

describe('entity-history', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  describe('getEntityHistory', () => {
    it('should return history entries for an entity', async () => {
      const now = new Date();
      mockPool.query.mockResolvedValue({
        rows: [
          { id: '10', event_type: 'org.updated', actor_id: 'u1', metadata: { field: 'name' }, created_at: now },
          { id: '5', event_type: 'org.created', actor_id: 'u1', metadata: null, created_at: new Date(now.getTime() - 1000) },
        ],
      });

      const result = await getEntityHistory('organization', 'org-123');

      expect(result.data).toHaveLength(2);
      expect(result.data[0].eventType).toBe('org.updated');
      expect(result.data[0].actorId).toBe('u1');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should use parameterized queries with FK column for the entity type', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await getEntityHistory('user', 'user-456');

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('user_id = $1');
      expect(params[0]).toBe('user-456');
    });

    it('should apply cursor-based pagination (after parameter)', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const cursor = testCursor('2026-01-15T10:00:00.000Z', 'some-uuid-50');
      await getEntityHistory('organization', 'org-123', { after: cursor });

      const [sql, params] = mockPool.query.mock.calls[0];
      // Composite cursor uses row-value comparison on (created_at, id)
      expect(sql).toContain('(created_at, id) < ($2, $3)');
      expect(params[1]).toBe('2026-01-15T10:00:00.000Z');
      expect(params[2]).toBe('some-uuid-50');
    });

    it('should throw on malformed cursor', async () => {
      await expect(
        getEntityHistory('organization', 'org-123', { after: 'not-valid' }),
      ).rejects.toThrow('Invalid pagination cursor');
    });

    it('should apply event type prefix filter', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await getEntityHistory('organization', 'org-123', { eventTypePrefix: 'org.status' });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('event_type LIKE');
      expect(params).toContain('org.status%');
    });

    it('should indicate hasMore when results exceed limit', async () => {
      // Default limit is 20, so 21 results means hasMore
      const now = new Date('2026-03-01T12:00:00.000Z');
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: String(100 - i),
        event_type: 'org.updated',
        actor_id: null,
        metadata: null,
        created_at: now,
      }));
      mockPool.query.mockResolvedValue({ rows });

      const result = await getEntityHistory('organization', 'org-123');

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      // nextCursor is now a composite cursor encoding (created_at, id)
      expect(result.nextCursor).not.toBeNull();
      const cursor = decodeCursor(result.nextCursor!);
      expect(cursor.i).toBe('81'); // last item's id
      expect(cursor.c).toBe(now.toISOString()); // last item's created_at
    });

    it('should clamp limit to max 100', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await getEntityHistory('organization', 'org-123', { limit: 500 });

      const params = mockPool.query.mock.calls[0][1] as unknown[];
      // Last param is fetchLimit = limit + 1 = 101
      expect(params[params.length - 1]).toBe(101);
    });

    it('should clamp limit to min 1', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await getEntityHistory('organization', 'org-123', { limit: -5 });

      const params = mockPool.query.mock.calls[0][1] as unknown[];
      // Last param is fetchLimit = 1 + 1 = 2
      expect(params[params.length - 1]).toBe(2);
    });

    it('should order by created_at DESC, id DESC', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await getEntityHistory('organization', 'org-123');

      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    });

    it('should combine after and eventTypePrefix filters', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const cursor = testCursor('2026-02-01T08:30:00.000Z', 'uuid-42');
      await getEntityHistory('organization', 'org-123', {
        after: cursor,
        eventTypePrefix: 'org.',
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      // Composite cursor uses 2 params ($2, $3), so event_type LIKE is $4
      expect(sql).toContain('(created_at, id) < ($2, $3)');
      expect(sql).toContain('event_type LIKE $4');
      expect(params[1]).toBe('2026-02-01T08:30:00.000Z');
      expect(params[2]).toBe('uuid-42');
      expect(params[3]).toBe('org.%');
    });

    it('should throw for unsupported entity types', async () => {
      await expect(getEntityHistory('unknown', 'id-1')).rejects.toThrow(
        'Unsupported entity type for history: unknown',
      );
    });
  });
});
