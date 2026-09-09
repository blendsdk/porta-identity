import { beforeEach, describe, expect, it, vi } from 'vitest';

const transaction = { query: vi.fn() };

vi.mock('../../../src/lib/database.js', () => ({
  getDatabaseTransactionClient: vi.fn(() => transaction),
}));

import { getDatabaseTransactionClient } from '../../../src/lib/database.js';
import { revokeAffectedAuthorityInTransaction } from '../../../src/lib/authority-revocation.js';

describe('authority revocation implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabaseTransactionClient).mockReturnValue(transaction as never);
  });

  it('rejects use outside the request transaction', async () => {
    vi.mocked(getDatabaseTransactionClient).mockReturnValue(null);

    await expect(revokeAffectedAuthorityInTransaction(['user-1'])).rejects.toThrow(
      'Authority revocation requires an active database transaction',
    );
    expect(transaction.query).not.toHaveBeenCalled();
  });

  it('does no database work for an empty affected-user set', async () => {
    await expect(revokeAffectedAuthorityInTransaction([])).resolves.toEqual({ grantIds: [] });
    expect(transaction.query).not.toHaveBeenCalled();
  });

  it('de-duplicates users, captures grants, and revokes all database authority in order', async () => {
    transaction.query
      .mockResolvedValueOnce({ rows: [{ id: 'grant-2' }, { id: 'grant-1' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const result = await revokeAffectedAuthorityInTransaction(['user-2', 'user-1', 'user-2']);

    expect(result).toEqual({ grantIds: ['grant-2', 'grant-1'] });
    expect(transaction.query).toHaveBeenCalledTimes(3);
    expect(transaction.query.mock.calls[0]?.[0]).toContain("type = 'Grant'");
    expect(transaction.query.mock.calls[0]?.[1]).toEqual([['user-1', 'user-2']]);
    expect(transaction.query.mock.calls[1]?.[0]).toContain('UPDATE admin_sessions');
    expect(transaction.query.mock.calls[1]?.[1]).toEqual([['user-1', 'user-2']]);
    expect(transaction.query.mock.calls[2]?.[0]).toContain('DELETE FROM oidc_payloads');
    expect(transaction.query.mock.calls[2]?.[1]).toEqual([
      ['grant-2', 'grant-1'],
      ['user-1', 'user-2'],
    ]);
  });
});
