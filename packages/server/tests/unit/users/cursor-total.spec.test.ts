import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { listUsersCursor } from '../../../src/users/repository.js';

describe('cursor user-list total', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({ query } as ReturnType<typeof getPool>);
    query.mockResolvedValue({ rows: [] });
  });

  // A cursor page must retain the total matching count used by SDK callers for pagination UI.
  it('should return the total number of matching users', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: '4' }] });

    const result = await listUsersCursor({ organizationId: 'org-1', limit: 2, search: 'alpha' });

    expect(result.total).toBe(4);
    const countSql = String(query.mock.calls[1]?.[0]);
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).toContain('organization_id = $1');
    expect(countSql).toContain('ILIKE $2');
  });
});
