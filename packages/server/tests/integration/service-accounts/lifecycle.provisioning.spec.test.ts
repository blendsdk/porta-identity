import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  findServiceAccountByClientId,
  getServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { verify } from '../../../src/clients/secret-service.js';
import { createTestClient, createTestUser } from '../helpers/factories.js';
import {
  createLifecycleFixture,
  LIFECYCLE_BINDING_KEYS,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
  readLifecycleAudits,
  readLifecycleSecrets,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Provisioning creates a dedicated permanent identity and never adopts an existing human.
describe('service-account lifecycle provisioning', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it('should create a new permanent account with only invitation authority when first bound', async () => {
    const priorUsers = await getPool().query<{ id: string }>('SELECT id FROM users ORDER BY id');
    const priorAudits = await readLifecycleAudits();
    const result = await setServiceAccount(fixture.client.id, {
      accountEmail: `  ${fixture.accountEmail.toUpperCase()}  `,
      targets: [fixture.target],
    }, fixture.actor);

    expect(priorUsers.rows.some((user) => user.id === result.serviceAccountId)).toBe(false);
    expect(Object.keys(result).sort()).toEqual(LIFECYCLE_BINDING_KEYS);
    expect(result).toMatchObject({
      clientId: fixture.client.id,
      accountEmail: fixture.accountEmail,
      status: 'active',
      targets: [fixture.target],
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(await readLifecycleAccount(result.serviceAccountId)).toEqual({
      id: result.serviceAccountId,
      organizationId: fixture.adminOrganization.id,
      email: fixture.accountEmail,
      status: 'active',
      isServiceAccount: true,
      passwordAbsent: true,
      roles: [{
        id: fixture.serviceRole.id,
        applicationId: fixture.adminApplication.id,
        slug: 'porta-invite-service',
        permissions: ['admin:user:invite'],
      }],
    });
    expect(await findServiceAccountByClientId(fixture.client.id)).toMatchObject({
      id: result.id,
      accountId: result.serviceAccountId,
      status: 'active',
      targets: [fixture.target],
      authorizationVersion: expect.any(String),
    });
    const users = await getPool().query<{ count: number }>('SELECT count(*)::integer AS count FROM users');
    expect(users.rows[0].count).toBe(priorUsers.rows.length + 1);
    const audits = (await readLifecycleAudits()).filter(
      (entry) => !priorAudits.some((prior) => prior.id === entry.id),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(fixture.actor.id);
    expect(audits[0].actorType).toBe('user');
    for (const identifier of [
      result.id, result.clientId, result.serviceAccountId, fixture.organization.id,
      fixture.application.id, fixture.role.id, fixture.claim.id,
    ]) {
      expect(audits[0].details.includes(identifier)).toBe(true);
    }
    expect(audits[0].details.includes(fixture.oldSecret)).toBe(false);
  });

  it('should return the exact secret-free binding without mutation when a human reads it', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const before = await lifecycleSecurityFingerprint();
    expect(await getServiceAccount(fixture.client.id, fixture.actor)).toEqual(created);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should retire existing secrets without generating one when initial provisioning commits', async () => {
    const previousSecrets = await readLifecycleSecrets(fixture.client.id);
    const result = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const secrets = await readLifecycleSecrets(fixture.client.id);
    expect(secrets.map((secret) => secret.id)).toEqual(previousSecrets.map((secret) => secret.id));
    expect(secrets.every((secret) => secret.status === 'revoked')).toBe(true);
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(false);
    expect(JSON.stringify(result).includes(fixture.oldSecret)).toBe(false);
  });

  it('should create no recovery or welcome artifact when provisioning a noninteractive account', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const artifacts = await getPool().query<{ count: number }>(`
      SELECT (
        (SELECT count(*) FROM magic_link_tokens) +
        (SELECT count(*) FROM password_reset_tokens) +
        (SELECT count(*) FROM invitation_tokens) +
        (SELECT count(*) FROM auth_recovery_jobs)
      )::integer AS count
    `);
    expect(artifacts.rows[0].count).toBe(0);
  });

  it('should preserve every security row when the normalized email belongs to a human', async () => {
    const human = await createTestUser(fixture.adminOrganization.id, {
      email: fixture.accountEmail,
    });
    const before = await lifecycleSecurityFingerprint();
    await expect(setServiceAccount(fixture.client.id, {
      accountEmail: ` ${human.email.toUpperCase()} `, targets: [fixture.target],
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
    expect((await readLifecycleAccount(human.id))?.isServiceAccount).toBe(false);
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(true);
  });

  it('should reject adoption before writes when a valid request also supplies an existing user ID', async () => {
    const before = await lifecycleSecurityFingerprint();
    await expect(setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
      userId: fixture.actor.id,
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should reject shared ownership without writes when another service account already owns the email', async () => {
    const first = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const anotherClient = await createTestClient(fixture.adminOrganization.id, fixture.adminApplication.id, {
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      scope: 'openid admin:user:invite',
      tokenEndpointAuthMethod: 'client_secret_basic',
    });
    const before = await lifecycleSecurityFingerprint();
    await expect(setServiceAccount(anotherClient.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.otherTarget],
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await findServiceAccountByClientId(anotherClient.id)).toBeNull();
    expect((await findServiceAccountByClientId(fixture.client.id))?.accountId).toBe(first.serviceAccountId);
  });

  it.each([undefined, '', 'not-an-email'])(
    'should reject first provisioning without writes when the account email is %s',
    async (accountEmail) => {
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail, targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );
});
