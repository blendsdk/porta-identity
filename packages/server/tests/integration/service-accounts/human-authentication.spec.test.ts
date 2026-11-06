/** Permanent account classification must defeat passwords, stale caches and ordinary OIDC. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  findUserForOidc,
  getUserByEmail,
  getUserById,
  verifyUserPassword,
} from '../../../src/users/index.js';
import {
  prepareUserForPasswordLogin,
  verifyLoginPassword,
} from '../../../src/users/service.js';
import { findAccount } from '../../../src/oidc/account-finder.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestOrganization, createTestUserWithPassword } from '../helpers/factories.js';
import {
  addFixtureMemberships,
  classifyFixtureUser,
  controlPlaneOrganizationId,
  createClassifiedBindingFixture,
  createHumanAdminFixtures,
  humanFixturePassword,
  humanSessionCounts,
  resetHumanFixtures,
} from './human-fixtures.js';

/** Successful-login metadata must not change merely because a classified user presents a password. */
async function successfulLoginState(userId: string) {
  const result = await getPool().query<{
    login_count: number;
    last_login_at: Date | null;
    email_verified: boolean;
  }>(
    'SELECT login_count, last_login_at, email_verified FROM users WHERE id = $1',
    [userId],
  );
  return result.rows[0];
}

describe('Human authentication excludes permanently classified accounts', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  it('should retain password and ordinary OIDC access when the active account is human', async () => {
    const organization = await createTestOrganization();
    const { user, password } = await createTestUserWithPassword(
      organization.id,
      humanFixturePassword(),
    );

    expect(await verifyUserPassword(user.id, password)).toBe(true);
    expect(await verifyLoginPassword(user.id, password)).toBe(true);
    expect((await findUserForOidc(user.id))?.id).toBe(user.id);
    expect(await findAccount({}, user.id)).toBeDefined();
    for (const projection of [
      await getUserById(user.id),
      await getUserByEmail(organization.id, user.email),
      await findUserForOidc(user.id),
    ]) {
      expect(projection).not.toBeNull();
      expect(projection).not.toHaveProperty('isServiceAccount');
      expect(projection).not.toHaveProperty('is_service_account');
    }
  });

  it('should reject a correct password and OIDC lookup when cached human data predates classification', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user, password } = await createTestUserWithPassword(
      organizationId,
      humanFixturePassword(),
    );
    expect((await getUserById(user.id))?.id).toBe(user.id);
    expect((await getUserByEmail(organizationId, user.email))?.id).toBe(user.id);
    expect((await prepareUserForPasswordLogin(organizationId, user.email))?.id).toBe(user.id);
    expect((await findUserForOidc(user.id))?.id).toBe(user.id);
    await classifyFixtureUser(user.id);
    const before = await successfulLoginState(user.id);

    expect(await verifyUserPassword(user.id, password)).toBe(false);
    expect(await verifyLoginPassword(user.id, password)).toBe(false);
    expect(await findUserForOidc(user.id)).toBeNull();
    expect(await findAccount({}, user.id)).toBeUndefined();
    expect(await successfulLoginState(user.id)).toEqual(before);
    expect(await humanSessionCounts(user.id)).toEqual({ oidc: 0, admin: 0 });
  });

  it('should preserve generic password rejection when the account is classified, missing or unknown', async () => {
    const organizationId = await controlPlaneOrganizationId();
    const { user, password } = await createTestUserWithPassword(
      organizationId,
      humanFixturePassword(),
    );
    await classifyFixtureUser(user.id);

    const rejected = await Promise.all([
      verifyLoginPassword(user.id, password),
      verifyLoginPassword(null, password),
      verifyLoginPassword(randomUUID(), password),
      verifyUserPassword(user.id, password),
      verifyUserPassword(randomUUID(), password),
    ]);
    expect(rejected).toEqual([false, false, false, false, false]);
    expect(await findAccount({}, randomUUID())).toBeUndefined();
  });

  it('should keep denying human authority when the binding disappears and a broader role remains', async () => {
    const admin = await createHumanAdminFixtures();
    const target = await createTestOrganization();
    const account = await createClassifiedBindingFixture(
      admin.organizationId,
      admin.application.id,
      target.id,
      'active',
    );
    await addFixtureMemberships(account.user.id, [admin.reservedRole.id, admin.superAdminRole.id]);
    await getUserById(account.user.id);
    await getPool().query('DELETE FROM client_service_accounts WHERE id = $1', [account.bindingId]);
    await getPool().query('DELETE FROM clients WHERE id = $1', [account.client.id]);

    expect(await verifyUserPassword(account.user.id, account.password)).toBe(false);
    expect(await verifyLoginPassword(account.user.id, account.password)).toBe(false);
    expect(await findUserForOidc(account.user.id)).toBeNull();
    expect(await findAccount({}, account.user.id)).toBeUndefined();
    expect(await humanSessionCounts(account.user.id)).toEqual({ oidc: 0, admin: 0 });
    const stored = await getPool().query<{ classified: boolean }>(
      'SELECT is_service_account AS classified FROM users WHERE id = $1',
      [account.user.id],
    );
    expect(stored.rows[0]?.classified).toBe(true);
  });
});
