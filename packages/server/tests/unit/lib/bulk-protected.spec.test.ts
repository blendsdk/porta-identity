import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../src/users/cache.js', () => ({
  invalidateUserCache: vi.fn(),
}));

vi.mock('../../../src/organizations/cache.js', () => ({
  invalidateOrganizationCache: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';
import { invalidateOrganizationCache } from '../../../src/organizations/cache.js';
import { invalidateUserCache } from '../../../src/users/cache.js';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

// Protected bootstrap identities are never ordinary lifecycle targets. Bulk operations must reject
// them inside the same locked transaction as the write, and must not reveal that they exist.
describe('bulk protected target policy', () => {
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    client = { query: vi.fn(), release: vi.fn() };
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
      connect: vi.fn().mockResolvedValue(client),
    });
  });

  it('should reject the protected bootstrap user without writing or revealing its status', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active', protected: true }] })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['protected-user'],
      action: 'deactivate',
      organizationId: ORGANIZATION_ID,
    });

    expect(result.results[0]).toEqual({
      id: 'protected-user',
      success: false,
      outcome: 'failed',
      code: 'not_found_or_not_authorized',
      error: 'Entity not found or not authorized',
    });
    expect(client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'SELECT',
      'ROLLBACK',
    ]);
    expect(invalidateUserCache).not.toHaveBeenCalled();
  });

  it('should reject the control-plane organization without writing or revealing its status', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active', protected: true, slug: 'porta' }] })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'organization',
      entityIds: ['super-admin-org'],
      action: 'suspend',
    });

    expect(result.results[0]).toMatchObject({
      success: false,
      code: 'not_found_or_not_authorized',
    });
    expect(result.results[0]).not.toHaveProperty('previousStatus');
    expect(invalidateOrganizationCache).not.toHaveBeenCalled();
  });

  it('should continue with ordinary targets after a protected item and use concealed codes', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active', protected: true }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active', protected: false }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['protected-user', 'ordinary-user'],
      action: 'deactivate',
      organizationId: ORGANIZATION_ID,
    });

    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(result.results.map(({ id, code }) => ({ id, code }))).toEqual([
      { id: 'protected-user', code: 'not_found_or_not_authorized' },
      { id: 'ordinary-user', code: null },
    ]);
    expect(invalidateUserCache).toHaveBeenCalledTimes(1);
    expect(invalidateUserCache).toHaveBeenCalledWith('ordinary-user');
  });

  it('should invalidate organization cache only after a committed ordinary suspension', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active', protected: false, slug: 'ordinary' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    await bulkStatusChange({
      entityType: 'organization',
      entityIds: ['ordinary-org'],
      action: 'suspend',
    });

    expect(invalidateOrganizationCache).toHaveBeenCalledWith('ordinary', 'ordinary-org');
  });
});
