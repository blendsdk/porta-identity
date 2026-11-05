import { beforeEach, describe, expect, it } from 'vitest';
import { activateClient, deactivateClient, updateClient } from '../../../src/clients/index.js';
import { generateAndStore, verify } from '../../../src/clients/secret-service.js';
import {
  findServiceAccountByClientId,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
  readLifecycleSecrets,
  withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

/** Both mutations use valid existing client inputs, not protocol-invalid substitutes. */
const ELIGIBILITY_TRANSITIONS = [
  {
    name: 'deactivation',
    lose: (f: LifecycleFixture) => deactivateClient(f.client.id, f.actor.id),
    repair: (f: LifecycleFixture) => activateClient(f.client.id, f.actor.id),
  },
  {
    name: 'removal of client_credentials',
    lose: (f: LifecycleFixture) => updateClient(f.client.id, {
      grantTypes: ['authorization_code', 'refresh_token'],
    }, f.actor.id),
    repair: (f: LifecycleFixture) => updateClient(f.client.id, {
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
    }, f.actor.id),
  },
] as const;

// Repairing a client is not permission to silently restore its dedicated account's authority.
describe('service-account lifecycle client eligibility', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(ELIGIBILITY_TRANSITIONS)(
    'should revoke atomically and require explicit same-owner restoration when eligibility is lost by $name',
    async ({ lose, repair }) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const initial = await findServiceAccountByClientId(fixture.client.id);
      await lose(fixture);
      const lost = await findServiceAccountByClientId(fixture.client.id);
      expect(lost).toMatchObject({
        id: created.id, accountId: created.serviceAccountId, status: 'revoked',
      });
      expect(lost?.authorizationVersion).toEqual(expect.any(String));
      expect(lost?.authorizationVersion).not.toBe(initial?.authorizationVersion);
      expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
        status: 'inactive', isServiceAccount: true,
      });
      const beforeRejectedRestore = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(beforeRejectedRestore);

      await repair(fixture);
      expect(await findServiceAccountByClientId(fixture.client.id)).toMatchObject({
        id: created.id, accountId: created.serviceAccountId, status: 'revoked',
      });
      expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
        status: 'inactive', isServiceAccount: true,
      });
      const repaired = await findServiceAccountByClientId(fixture.client.id);
      const priorSecrets = await readLifecycleSecrets(fixture.client.id);
      const restored = await setServiceAccount(fixture.client.id, {
        targets: [fixture.otherTarget],
      }, fixture.actor);
      expect(restored).toMatchObject({
        id: created.id, serviceAccountId: created.serviceAccountId,
        accountEmail: fixture.accountEmail, status: 'active', targets: [fixture.otherTarget],
      });
      expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
        status: 'active', isServiceAccount: true,
      });
      const restoredState = await findServiceAccountByClientId(fixture.client.id);
      expect(restoredState?.authorizationVersion).not.toBe(repaired?.authorizationVersion);
      const secrets = await readLifecycleSecrets(fixture.client.id);
      expect(secrets.map((entry) => entry.id)).toEqual(priorSecrets.map((entry) => entry.id));
      expect(secrets.every((entry) => entry.status === 'revoked')).toBe(true);
      expect(await verify(fixture.client.id, secret.plaintext)).toBe(false);
    },
  );

  it.each(ELIGIBILITY_TRANSITIONS)(
    'should preserve the complete eligible client and active authority when $name cannot persist its audit',
    async ({ lose }) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const before = await lifecycleSecurityFingerprint();
      await withRejectedLifecycleAudit(async () => {
        await expect(lose(fixture)).rejects.toThrow();
      });
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it('should preserve active ownership when an eligible client switches between supported secret methods', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await updateClient(fixture.client.id, {
      tokenEndpointAuthMethod: 'client_secret_post',
    }, fixture.actor.id);
    expect(await findServiceAccountByClientId(fixture.client.id)).toMatchObject({
      id: created.id, accountId: created.serviceAccountId,
      status: 'active',
    });
    expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
      status: 'active', isServiceAccount: true,
    });
  });
});
