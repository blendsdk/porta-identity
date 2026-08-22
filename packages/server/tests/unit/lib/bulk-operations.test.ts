import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function createMockClient() {
  return { query: vi.fn(), release: vi.fn() };
}

describe('bulk-operations', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let connect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    connect = vi.fn().mockResolvedValue(mockClient);
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ connect });
  });

  it('should return an empty result for empty IDs', async () => {
    await expect(
      bulkStatusChange({ entityType: 'organization', entityIds: [], action: 'suspend' }),
    ).resolves.toStrictEqual({ total: 0, succeeded: 0, failed: 0, results: [] });
    expect(connect).not.toHaveBeenCalled();
  });

  it('should reject request-level violations before database access', async () => {
    await expect(
      bulkStatusChange({
        entityType: 'organization',
        entityIds: Array.from({ length: 101 }, (_, index) => `id-${index}`),
        action: 'suspend',
      }),
    ).rejects.toThrow('limited to 100');
    await expect(
      bulkStatusChange({
        entityType: 'organization',
        entityIds: ['duplicate', 'duplicate'],
        action: 'suspend',
      }),
    ).rejects.toThrow('unique');
    await expect(
      bulkStatusChange({ entityType: 'user', entityIds: ['user'], action: 'suspend' }),
    ).rejects.toThrow('Organization scope');
    expect(connect).not.toHaveBeenCalled();
  });

  it('should reject an action outside the entity catalog', async () => {
    await expect(
      bulkStatusChange({
        entityType: 'organization',
        entityIds: ['id-1'],
        action: 'lock',
      }),
    ).rejects.toThrow("Invalid action 'lock'");
    expect(connect).not.toHaveBeenCalled();
  });

  it('should commit an organization transition and its audit together', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'organization',
      entityIds: ['org-1'],
      action: 'suspend',
      actorId: 'actor-1',
    });

    expect(result).toStrictEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          id: 'org-1',
          success: true,
          outcome: 'succeeded',
          code: null,
          previousStatus: 'active',
          newStatus: 'suspended',
        },
      ],
    });
    expect(mockClient.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'SELECT',
      'UPDATE',
      'INSERT',
      'COMMIT',
    ]);
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should conceal missing and foreign users behind one result code', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-missing'],
      action: 'suspend',
      organizationId: ORGANIZATION_ID,
    });

    expect(result.results[0]).toMatchObject({
      success: false,
      outcome: 'failed',
      code: 'not_found_or_not_authorized',
    });
    expect(mockClient.query.mock.calls[1][0]).toContain('organization_id = $2');
    expect(mockClient.query.mock.calls[1][1]).toEqual(['user-missing', ORGANIZATION_ID]);
  });

  it('should return a closed invalid-transition result', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'locked' }] })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-1'],
      action: 'suspend',
      organizationId: ORGANIZATION_ID,
    });

    expect(result.results[0]).toMatchObject({
      success: false,
      outcome: 'failed',
      code: 'invalid_transition',
      previousStatus: 'locked',
    });
  });

  it('should preserve mixed item ordering across isolated transactions', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['u1', 'u2', 'u3'],
      action: 'suspend',
      organizationId: ORGANIZATION_ID,
    });

    expect(result).toMatchObject({ total: 3, succeeded: 2, failed: 1 });
    expect(result.results.map(({ id, code }) => ({ id, code }))).toStrictEqual([
      { id: 'u1', code: null },
      { id: 'u2', code: 'not_found_or_not_authorized' },
      { id: 'u3', code: null },
    ]);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(mockClient.release).toHaveBeenCalledTimes(3);
  });

  it('should use parameterized queries for identifier and scope values', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-1'],
      action: 'suspend',
      organizationId: ORGANIZATION_ID,
    });

    expect(mockClient.query.mock.calls[1][0]).toContain('id = $1 AND organization_id = $2');
    expect(mockClient.query.mock.calls[1][1]).toEqual(['user-1', ORGANIZATION_ID]);
  });

  it('should stop after a dependency error without returning the raw error', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('connection details must not escape'))
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['u1', 'u2'],
      action: 'deactivate',
      organizationId: ORGANIZATION_ID,
    });

    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.results.map((item) => item.code)).toStrictEqual([
      'not_attempted',
      'not_attempted',
    ]);
    expect(JSON.stringify(result)).not.toContain('connection details');
    expect(connect).toHaveBeenCalledOnce();
  });
});
