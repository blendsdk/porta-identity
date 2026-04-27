import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';

function createMockPool() {
  return { query: vi.fn() };
}

describe('bulk-operations', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  it('should return empty result for empty IDs', async () => {
    const result = await bulkStatusChange({
      entityType: 'organization',
      entityIds: [],
      action: 'suspend',
    });
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('should reject more than 100 IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await expect(bulkStatusChange({
      entityType: 'organization',
      entityIds: ids,
      action: 'suspend',
    })).rejects.toThrow('limited to 100');
  });

  it('should reject invalid action for entity type', async () => {
    await expect(bulkStatusChange({
      entityType: 'organization',
      entityIds: ['id-1'],
      action: 'lock', // orgs can't be locked
    })).rejects.toThrow("Invalid action 'lock'");
  });

  it('should successfully change status of organizations', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE

    const result = await bulkStatusChange({
      entityType: 'organization',
      entityIds: ['org-1'],
      action: 'suspend',
    });

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.results[0]).toEqual({
      id: 'org-1',
      success: true,
      previousStatus: 'active',
      newStatus: 'suspended',
    });
  });

  it('should report not found entities', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // SELECT returns empty

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-missing'],
      action: 'suspend',
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain('not found');
  });

  it('should report invalid transition', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ status: 'locked' }] });

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-1'],
      action: 'suspend', // can't suspend from locked
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("Cannot suspend from status 'locked'");
  });

  it('should handle mixed success/failure in bulk', async () => {
    // First entity: success
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    // Second entity: not found
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // Third entity: success
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['u1', 'u2', 'u3'],
      action: 'suspend',
    });

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('should use parameterized queries (SQL injection safe)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await bulkStatusChange({
      entityType: 'organization',
      entityIds: ['org-1'],
      action: 'suspend',
    });

    // SELECT query uses parameterized $1
    const selectCall = mockPool.query.mock.calls[0];
    expect(selectCall[0]).toContain('$1');
    expect(selectCall[1]).toEqual(['org-1']);
  });

  it('should handle database errors gracefully', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('connection lost'));

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['u1'],
      action: 'deactivate',
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe('connection lost');
  });
});
