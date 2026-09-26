/**
 * Transactional acceptance specification (ST-16, ST-17, ST-21–ST-23, ST-25, ST-26).
 *
 * Accepting an invitation must create exactly one verified user and consume the token atomically.
 * Every invalid, expired, conflicting, or repeated acceptance must create no user, and an
 * unaccepted invitation must leave no user row at all.
 *
 * These expectations derive from the feature requirements and the acceptance design; they exercise
 * the real PostgreSQL transaction.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { replaceInvitation } from '../../../src/auth/token-repository.js';
import { acceptInvitation } from '../../../src/users/invitation-service.js';
import { getPool } from '../../../src/lib/database.js';

/** Strong password that satisfies the project's password policy. */
const STRONG_PASSWORD = 'Correct-Horse-Battery-Staple-9!';

/** Overrides accepted by the invitation helper. */
interface InvitationOverrides {
  email?: string;
  expiresAt?: Date;
}

/** Count the user rows that exist for one organization. */
async function countUsers(organizationId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM users WHERE organization_id = $1',
    [organizationId],
  );
  return Number(result.rows[0].count);
}

/**
 * Store a live invitation for an organization and return its identifiers.
 *
 * @param organizationId - Owning organization.
 * @param overrides - Optional email or expiry overrides.
 * @returns The invitation id, token hash, and invited email.
 */
async function inviteFor(
  organizationId: string,
  overrides: InvitationOverrides = {},
): Promise<{ id: string; tokenHash: string; email: string }> {
  const plaintext = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(plaintext).digest('hex');
  const email = overrides.email ?? `invitee-${randomBytes(4).toString('hex')}@test.example.com`;
  const { id } = await replaceInvitation({
    organizationId,
    email,
    tokenHash,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 604800_000),
    givenName: 'Invited',
    familyName: 'Person',
    locale: 'en',
  });
  return { id, tokenHash, email };
}

describe('deferred invitation acceptance', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  it('should create exactly one verified user with the invitation profile when accepted', async () => {
    const org = await createTestOrganization();
    const invitation = await inviteFor(org.id);

    const result = await acceptInvitation({
      tokenHash: invitation.tokenHash,
      organizationId: org.id,
      password: STRONG_PASSWORD,
    });

    expect(result).toEqual({ userId: expect.any(String), email: invitation.email });

    const users = await getPool().query<{
      email_verified: boolean;
      password_hash: string | null;
      given_name: string | null;
      family_name: string | null;
      locale: string | null;
    }>(
      `SELECT email_verified, password_hash, given_name, family_name, locale
         FROM users WHERE organization_id = $1 AND email = $2`,
      [org.id, invitation.email],
    );
    expect(users.rowCount).toBe(1);
    expect(users.rows[0]).toMatchObject({
      email_verified: true,
      given_name: 'Invited',
      family_name: 'Person',
      locale: 'en',
    });
    expect(users.rows[0].password_hash).toBeTruthy();

    const token = await getPool().query<{ user_id: string | null; used_at: Date | null }>(
      'SELECT user_id, used_at FROM invitation_tokens WHERE id = $1',
      [invitation.id],
    );
    expect(token.rows[0].user_id).toBe(result!.userId);
    expect(token.rows[0].used_at).not.toBeNull();
  });

  it('should reject a second acceptance with the same token and keep exactly one user', async () => {
    const org = await createTestOrganization();
    const invitation = await inviteFor(org.id);
    const input = {
      tokenHash: invitation.tokenHash,
      organizationId: org.id,
      password: STRONG_PASSWORD,
    };

    expect(await acceptInvitation(input)).not.toBeNull();
    expect(await acceptInvitation(input)).toBeNull();
    expect(await countUsers(org.id)).toBe(1);
  });

  it('should create exactly one user when two acceptances run concurrently', async () => {
    const org = await createTestOrganization();
    const invitation = await inviteFor(org.id);
    const input = {
      tokenHash: invitation.tokenHash,
      organizationId: org.id,
      password: STRONG_PASSWORD,
    };

    const results = await Promise.all([acceptInvitation(input), acceptInvitation(input)]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await countUsers(org.id)).toBe(1);
  });

  it('should reject acceptance when a user already exists for the invited email', async () => {
    const org = await createTestOrganization();
    const existing = await createTestUser(org.id, { email: 'conflict@test.example.com' });
    const invitation = await inviteFor(org.id, { email: 'conflict@test.example.com' });

    const result = await acceptInvitation({
      tokenHash: invitation.tokenHash,
      organizationId: org.id,
      password: STRONG_PASSWORD,
    });

    expect(result).toBeNull();
    const users = await getPool().query<{ id: string }>(
      'SELECT id FROM users WHERE organization_id = $1 AND email = $2',
      [org.id, 'conflict@test.example.com'],
    );
    expect(users.rowCount).toBe(1);
    expect(users.rows[0].id).toBe(existing.id);
  });

  it('should reject an expired invitation and create no user', async () => {
    const org = await createTestOrganization();
    const invitation = await inviteFor(org.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await acceptInvitation({
      tokenHash: invitation.tokenHash,
      organizationId: org.id,
      password: STRONG_PASSWORD,
    });

    expect(result).toBeNull();
    expect(await countUsers(org.id)).toBe(0);
  });

  it('should leave no user row for an invitation that is never accepted', async () => {
    const org = await createTestOrganization();
    const invitation = await inviteFor(org.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await countUsers(org.id)).toBe(0);
    const token = await getPool().query<{ used_at: Date | null }>(
      'SELECT used_at FROM invitation_tokens WHERE id = $1',
      [invitation.id],
    );
    expect(token.rowCount).toBe(1);
    expect(token.rows[0].used_at).toBeNull();
  });

  it('should keep exactly one live invitation after re-inviting the same email', async () => {
    const org = await createTestOrganization();
    const first = await inviteFor(org.id, { email: 'repeat@test.example.com' });
    const second = await inviteFor(org.id, { email: 'repeat@test.example.com' });

    const live = await getPool().query<{ id: string }>(
      `SELECT id FROM invitation_tokens
        WHERE organization_id = $1 AND email = $2 AND used_at IS NULL`,
      [org.id, 'repeat@test.example.com'],
    );
    expect(live.rowCount).toBe(1);
    expect(live.rows[0].id).toBe(second.id);

    const firstRow = await getPool().query<{ used_at: Date | null }>(
      'SELECT used_at FROM invitation_tokens WHERE id = $1',
      [first.id],
    );
    expect(firstRow.rows[0].used_at).not.toBeNull();
    expect(await countUsers(org.id)).toBe(0);
  });
});
