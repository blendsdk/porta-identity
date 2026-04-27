import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { getEntityHistory } from '../../../src/lib/entity-history.js';

function createMockPool() {
  return { query: vi.fn() };
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

      await getEntityHistory('organization', 'org-123', { after: '50' });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('id < $2');
      expect(params[1]).toBe('50');
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
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: String(100 - i),
        event_type: 'org.updated',
        actor_id: null,
        metadata: null,
        created_at: new Date(),
      }));
      mockPool.query.mockResolvedValue({ rows });

      const result = await getEntityHistory('organization', 'org-123');

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('81'); // last item's id
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

      await getEntityHistory('organization', 'org-123', {
        after: '42',
        eventTypePrefix: 'org.',
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('id < $2');
      expect(sql).toContain('event_type LIKE $3');
      expect(params[1]).toBe('42');
      expect(params[2]).toBe('org.%');
    });

    it('should throw for unsupported entity types', async () => {
      await expect(getEntityHistory('unknown', 'id-1')).rejects.toThrow(
        'Unsupported entity type for history: unknown',
      );
    });
  });
});
