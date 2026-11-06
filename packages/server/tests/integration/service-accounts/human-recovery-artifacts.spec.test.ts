/** Old human recovery artifacts cannot outlive permanent service classification. */
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../src/auth/index.js';
import {
  consumeAuthorizedMagicLink,
  findValidToken,
  findValidTokenForOrganization,
  insertToken,
} from '../../../src/auth/token-repository.js';
import { getPool } from '../../../src/lib/database.js';
import {
  getUserByEmail,
  getUserById,
  setUserPassword,
  verifyUserPassword,
} from '../../../src/users/index.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestUserWithPassword } from '../helpers/factories.js';
import {
  classifyFixtureUser,
  controlPlaneOrganizationId,
  humanFixturePassword,
  humanSessionCounts,
  humanUserFingerprint,
  resetHumanFixtures,
} from './human-fixtures.js';

/**
 * Create an unused, authority-bound artifact before the account is classified.
 * Explicit organization and interaction columns avoid legacy unbound-token fixtures.
 */
async function insertPriorMagicArtifact(userId: string, organizationId: string): Promise<string> {
  const tokenHash = hashToken(randomBytes(32).toString('base64url'));
  await getPool().query(
    `INSERT INTO magic_link_tokens
       (user_id, token_hash, expires_at, organization_id, interaction_uid, authority_bound)
     VALUES ($1, $2, $3, $4, NULL, TRUE)`,
    [userId, tokenHash, new Date(Date.now() + 15 * 60_000), organizationId],
  );
  return tokenHash;
}

describe('Previously issued human artifacts', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  it('should reject an old magic link without consuming it or changing login state when classification follows issuance', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user } = await createTestUserWithPassword(
      organizationId,
      humanFixturePassword(),
      { emailVerified: false },
    );
    const tokenHash = await insertPriorMagicArtifact(user.id, organizationId);
    expect((await findValidToken('magic_link_tokens', tokenHash))?.userId).toBe(user.id);
    expect(
      (await findValidTokenForOrganization('magic_link_tokens', tokenHash, organizationId))?.userId,
    ).toBe(user.id);
    await getUserById(user.id);
    await getUserByEmail(organizationId, user.email);
    await classifyFixtureUser(user.id);
    const before = await humanUserFingerprint(user.id);

    expect(
      await consumeAuthorizedMagicLink({
        tokenHash,
        organizationId,
        interactionUid: null,
        clientId: null,
      }),
    ).toBeNull();

    expect(Boolean(await findValidToken('magic_link_tokens', tokenHash))).toBe(false);
    expect(
      Boolean(await findValidTokenForOrganization('magic_link_tokens', tokenHash, organizationId)),
    ).toBe(false);
    const artifact = await getPool().query<{ used: boolean }>(
      'SELECT used_at IS NOT NULL AS used FROM magic_link_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    expect(artifact.rows[0]?.used).toBe(false);
    expect(await humanUserFingerprint(user.id)).toBe(before);
    expect(await humanSessionCounts(user.id)).toEqual({ oidc: 0, admin: 0 });
  });

  it('should reject an old reset lookup and password write when classification follows issuance', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user } = await createTestUserWithPassword(organizationId, humanFixturePassword());
    const tokenHash = hashToken(randomBytes(32).toString('base64url'));
    await insertToken('password_reset_tokens', user.id, tokenHash, new Date(Date.now() + 900_000));
    expect((await findValidToken('password_reset_tokens', tokenHash))?.userId).toBe(user.id);
    expect(
      (await findValidTokenForOrganization('password_reset_tokens', tokenHash, organizationId))
        ?.userId,
    ).toBe(user.id);
    await getUserById(user.id);
    await getUserByEmail(organizationId, user.email);
    await classifyFixtureUser(user.id);
    const before = await humanUserFingerprint(user.id);

    expect(Boolean(await findValidToken('password_reset_tokens', tokenHash))).toBe(false);
    expect(
      Boolean(
        await findValidTokenForOrganization('password_reset_tokens', tokenHash, organizationId),
      ),
    ).toBe(false);
    await expect(setUserPassword(user.id, humanFixturePassword())).rejects.toThrow();

    expect(await humanUserFingerprint(user.id)).toBe(before);
    expect(await humanSessionCounts(user.id)).toEqual({ oidc: 0, admin: 0 });
  });

  it('should retain authorized single-use magic consumption when the account remains human', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user } = await createTestUserWithPassword(organizationId, humanFixturePassword());
    const tokenHash = await insertPriorMagicArtifact(user.id, organizationId);

    expect(
      await consumeAuthorizedMagicLink({
        tokenHash,
        organizationId,
        interactionUid: null,
        clientId: null,
      }),
    ).toEqual({ userId: user.id, interactionUid: null });
    expect(
      await consumeAuthorizedMagicLink({
        tokenHash,
        organizationId,
        interactionUid: null,
        clientId: null,
      }),
    ).toBeNull();
  });

  it('should retain reset lookup and password replacement when the account remains human', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user, password } = await createTestUserWithPassword(
      organizationId,
      humanFixturePassword(),
    );
    const tokenHash = hashToken(randomBytes(32).toString('base64url'));
    await insertToken('password_reset_tokens', user.id, tokenHash, new Date(Date.now() + 900_000));
    const replacement = humanFixturePassword();

    expect(
      (await findValidTokenForOrganization('password_reset_tokens', tokenHash, organizationId))
        ?.userId,
    ).toBe(user.id);
    await setUserPassword(user.id, replacement);

    expect(await verifyUserPassword(user.id, replacement)).toBe(true);
    expect(await verifyUserPassword(user.id, password)).toBe(false);
  });
});
