import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { listSessions } from '../../../src/lib/session-tracking.js';

describe('public session identifiers', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({ query } as ReturnType<typeof getPool>);
    query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
  });

  // Administrative reads must never expose the Redis session key because it is a bearer credential.
  it('should expose a separate public identifier when listing sessions', async () => {
    await listSessions();

    const listSql = String(query.mock.calls[1]?.[0]);
    expect(listSql).toContain('public_id AS "sessionId"');
    expect(listSql).not.toContain('session_id AS "sessionId"');
  });
});
