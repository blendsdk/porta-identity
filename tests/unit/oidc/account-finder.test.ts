import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { findAccount } from '../../../src/oidc/account-finder.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

const sampleUser = {
  id: 'user-uuid-123',
  email: 'john@example.com',
  email_verified: true,
  given_name: 'John',
  family_name: 'Doe',
  phone_number: '+31612345678',
  phone_number_verified: false,
};

describe('account-finder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns account for active user', async () => {
    mockPool([sampleUser]);
    const result = await findAccount(null, 'user-uuid-123');
    expect(result).toBeDefined();
    expect(result!.accountId).toBe('user-uuid-123');
  });

  it('returns undefined for missing user', async () => {
    mockPool([]);
    const result = await findAccount(null, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('claims() returns correct standard claims', async () => {
    mockPool([sampleUser]);
    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid profile email');
    expect(claims.sub).toBe('user-uuid-123');
    expect(claims.email).toBe('john@example.com');
    expect(claims.email_verified).toBe(true);
    expect(claims.name).toBe('John Doe');
    expect(claims.given_name).toBe('John');
    expect(claims.family_name).toBe('Doe');
    expect(claims.phone_number).toBe('+31612345678');
  });

  it('claims() handles null name fields gracefully', async () => {
    mockPool([{ ...sampleUser, given_name: null, family_name: null }]);
    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid profile');
    expect(claims.name).toBeUndefined();
    expect(claims.given_name).toBeUndefined();
    expect(claims.family_name).toBeUndefined();
  });

  it('returns undefined on DB error', async () => {
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const result = await findAccount(null, 'user-uuid-123');
    expect(result).toBeUndefined();
  });
});
