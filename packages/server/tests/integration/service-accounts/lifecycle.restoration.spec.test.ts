import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  findServiceAccountByClientId,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { generateAndStore, verify } from '../../../src/clients/secret-service.js';
import {
  createLifecycleFixture,
  LIFECYCLE_BINDING_KEYS,
  readLifecycleAccount,
  readLifecycleAudits,
  readLifecycleSecrets,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Restoration reactivates only the permanent owner and retires every current credential.
describe('service-account lifecycle restoration', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(['omitted', 'same normalized'])(
    'should reactivate the same account and reserved role when restoration uses an %s email',
    async (emailCase) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const firstVersion = (await findServiceAccountByClientId(fixture.client.id))?.authorizationVersion;
      const activeSecret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      await revokeServiceAccount(fixture.client.id, fixture.actor);
      const revokedVersion = (await findServiceAccountByClientId(fixture.client.id))?.authorizationVersion;
      const secondSecret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const priorSecrets = await readLifecycleSecrets(fixture.client.id);
      const priorAudits = await readLifecycleAudits();
      const priorUsers = await getPool().query<{ id: string }>('SELECT id FROM users ORDER BY id');
      const emailInput = emailCase === 'omitted'
        ? {}
        : { accountEmail: ` ${fixture.accountEmail.toUpperCase()} ` };
      const restored = await setServiceAccount(fixture.client.id, {
        ...emailInput, targets: [fixture.otherTarget],
      }, fixture.actor);
      expect(Object.keys(restored).sort()).toEqual(LIFECYCLE_BINDING_KEYS);
      expect(restored.updatedAt).toBeInstanceOf(Date);
      expect(restored).toMatchObject({
        id: created.id, serviceAccountId: created.serviceAccountId,
        accountEmail: fixture.accountEmail, createdAt: created.createdAt,
        status: 'active', targets: [fixture.otherTarget],
      });
      expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
        status: 'active', isServiceAccount: true, passwordAbsent: true,
        roles: [{
          id: fixture.serviceRole.id, applicationId: fixture.adminApplication.id,
          slug: 'porta-invite-service', permissions: ['admin:user:invite'],
        }],
      });
      const restoredVersion = (await findServiceAccountByClientId(fixture.client.id))?.authorizationVersion;
      expect(restoredVersion).toEqual(expect.any(String));
      expect(new Set([firstVersion, revokedVersion, restoredVersion]).size).toBe(3);
      const secrets = await readLifecycleSecrets(fixture.client.id);
      expect(secrets.map((secret) => secret.id)).toEqual(priorSecrets.map((secret) => secret.id));
      expect(secrets.every((secret) => secret.status === 'revoked')).toBe(true);
      expect(await verify(fixture.client.id, activeSecret.plaintext)).toBe(false);
      expect(await verify(fixture.client.id, secondSecret.plaintext)).toBe(false);
      const audits = (await readLifecycleAudits()).filter(
        (entry) => !priorAudits.some((prior) => prior.id === entry.id),
      );
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe(fixture.actor.id);
      const users = await getPool().query<{ id: string }>('SELECT id FROM users ORDER BY id');
      expect(users.rows).toEqual(priorUsers.rows);
    },
  );

  it('should restore only the reserved role when a revoked owner has lost its membership', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    await getPool().query('DELETE FROM user_roles WHERE user_id = $1', [created.serviceAccountId]);
    const restored = await setServiceAccount(fixture.client.id, { targets: [fixture.target] }, fixture.actor);
    expect(restored.serviceAccountId).toBe(created.serviceAccountId);
    expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
      isServiceAccount: true, status: 'active', passwordAbsent: true,
      roles: [{
        id: fixture.serviceRole.id, applicationId: fixture.adminApplication.id,
        slug: 'porta-invite-service', permissions: ['admin:user:invite'],
      }],
    });
  });
});
