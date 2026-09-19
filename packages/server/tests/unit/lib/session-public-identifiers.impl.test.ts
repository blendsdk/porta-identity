import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import {
  getSessionByPublicId,
  revokeSessionByPublicId,
} from '../../../src/lib/session-tracking.js';

describe('public session identifier persistence', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({ query } as ReturnType<typeof getPool>);
  });

  it('should resolve public session details without querying by the bearer key', async () => {
    query.mockResolvedValue({ rows: [] });

    await getSessionByPublicId('4fe44437-333f-4a7e-837b-0cfcf288da3f');

    const [sql, params] = query.mock.calls[0] ?? [];
    expect(String(sql)).toContain('WHERE public_id = $1');
    expect(String(sql)).toContain('public_id AS "sessionId"');
    expect(params).toEqual(['4fe44437-333f-4a7e-837b-0cfcf288da3f']);
  });

  it('should return the private Redis key only after revoking by public identifier', async () => {
    query.mockResolvedValue({ rows: [{ sessionId: 'private-redis-session-key' }] });

    const sessionId = await revokeSessionByPublicId('4fe44437-333f-4a7e-837b-0cfcf288da3f');

    expect(sessionId).toBe('private-redis-session-key');
    const [sql] = query.mock.calls[0] ?? [];
    expect(String(sql)).toContain('WHERE public_id = $1');
    expect(String(sql)).toContain('RETURNING session_id AS "sessionId"');
  });

  it('should return null when no active public session matches', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      revokeSessionByPublicId('4fe44437-333f-4a7e-837b-0cfcf288da3f'),
    ).resolves.toBeNull();
  });
});
