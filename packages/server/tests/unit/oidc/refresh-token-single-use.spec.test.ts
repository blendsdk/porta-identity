import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';

describe('refresh-token single-use persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  // A single-use credential must be claimed by one atomic durable write so two readers cannot
  // both turn the same predecessor into valid replacements.
  it('should reject a second consume when another request already claimed the artifact', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(getPool).mockReturnValue({ query } as never);

    await expect(new PostgresAdapter('RefreshToken').consume('predecessor')).rejects.toMatchObject({
      error: 'invalid_grant',
      status: 400,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('consumed_at IS NULL');
  });

  it('should accept the one request that atomically claims an unused artifact', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    vi.mocked(getPool).mockReturnValue({ query } as never);

    await expect(
      new PostgresAdapter('RefreshToken').consume('predecessor'),
    ).resolves.toBeUndefined();
  });
});
