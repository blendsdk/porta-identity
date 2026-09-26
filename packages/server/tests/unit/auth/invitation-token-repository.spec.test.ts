/**
 * Token-repository specification for deferred invitation storage (ST-2, ST-3, ST-4).
 *
 * An invitation is stored as an email/organization-keyed token that does not reference a user.
 * Issuing a new invitation for the same address invalidates the previous live one, and tenant
 * authority is enforced by the stored organization rather than by joining the user account.
 *
 * These expectations derive from the feature requirements and the invitation data-model design; the
 * database is mocked so the assertions target the repository's storage contract, not PostgreSQL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getPool } from '../../../src/lib/database.js';
import {
  replaceInvitation,
  findDeferredInvitationToken,
} from '../../../src/auth/token-repository.js';

/** One captured query call from the mocked database boundary. */
interface CapturedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Install a database mock that behaves like a single transaction connection.
 *
 * The mock dispatches on the leading SQL keyword so the test does not depend on the exact statement
 * order chosen by the implementation.
 */
function installDatabaseMock(options: {
  insertedId?: string;
  selectRows?: Record<string, unknown>[];
} = {}): { calls: CapturedQuery[] } {
  const calls: CapturedQuery[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const text = sql.trim();
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (/^UPDATE/i.test(text)) return { rows: [], rowCount: 0 };
    if (/^INSERT/i.test(text)) {
      return { rows: [{ id: options.insertedId ?? 'invitation-uuid-1' }], rowCount: 1 };
    }
    if (/^SELECT/i.test(text)) {
      const rows = options.selectRows ?? [];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  };
  const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ connect, query: vi.fn(query) });
  return { calls };
}

/** A stored deferred invitation row as returned by PostgreSQL (snake_case). */
function deferredInvitationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'invitation-uuid-2',
    user_id: null,
    token_hash: 'hash-3',
    expires_at: new Date('2026-10-03T00:00:00Z'),
    used_at: null,
    created_at: new Date('2026-09-26T00:00:00Z'),
    details: null,
    invited_by: null,
    organization_id: 'org-1',
    email: 'invitee@test.com',
    given_name: null,
    family_name: null,
    locale: null,
    ...overrides,
  };
}

describe('invitation token repository — deferred storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should store a new invitation keyed by organization and email without a user', async () => {
    const { calls } = installDatabaseMock({ insertedId: 'invitation-uuid-1' });
    const expiresAt = new Date('2026-10-03T00:00:00Z');

    const result = await replaceInvitation({
      organizationId: 'org-1',
      email: 'invitee@test.com',
      tokenHash: 'hash-1',
      expiresAt,
      givenName: 'Bob',
      familyName: 'Jones',
      locale: 'en',
      details: { personalMessage: 'Welcome' },
      invitedBy: 'admin-1',
    });

    expect(result).toEqual({ id: 'invitation-uuid-1' });
    const insert = calls.find((call) => /^INSERT INTO invitation_tokens/i.test(call.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('organization_id');
    expect(insert!.sql).toContain('email');
    expect(insert!.params).toEqual(
      expect.arrayContaining(['org-1', 'invitee@test.com', 'hash-1', expiresAt, 'Bob', 'Jones', 'en']),
    );
  });

  it('should invalidate the previous live invitation for the same organization and email', async () => {
    const { calls } = installDatabaseMock();

    await replaceInvitation({
      organizationId: 'org-1',
      email: 'invitee@test.com',
      tokenHash: 'hash-2',
      expiresAt: new Date('2026-10-03T00:00:00Z'),
    });

    const update = calls.find((call) => /^UPDATE invitation_tokens/i.test(call.sql));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('used_at = NOW()');
    expect(update!.sql).toMatch(/organization_id\s*=\s*\$1/);
    expect(update!.sql).toMatch(/email\s*=\s*\$2/);
    expect(update!.sql).toContain('used_at IS NULL');
  });

  it('should resolve a deferred token by its stored organization without joining users', async () => {
    installDatabaseMock({ selectRows: [deferredInvitationRow()] });

    const result = await findDeferredInvitationToken('hash-3', 'org-1');

    expect(result).toMatchObject({
      id: 'invitation-uuid-2',
      userId: null,
      organizationId: 'org-1',
      email: 'invitee@test.com',
    });
  });

  it('should reject a token presented under a different organization', async () => {
    const { calls } = installDatabaseMock({ selectRows: [] });

    await expect(findDeferredInvitationToken('hash-3', 'foreign-org')).resolves.toBeNull();

    const select = calls.find((call) => /^SELECT/i.test(call.sql));
    expect(select).toBeDefined();
    expect(select!.sql).toContain('organization_id');
    expect(select!.sql).not.toMatch(/JOIN\s+users/i);
    expect(select!.params).toEqual(['hash-3', 'foreign-org']);
  });
});
