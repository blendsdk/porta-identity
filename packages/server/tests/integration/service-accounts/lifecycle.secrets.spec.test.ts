import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  findServiceAccountByClientId,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { generateAndStore, revoke, verify } from '../../../src/clients/secret-service.js';
import { createTestClientWithSecret } from '../helpers/factories.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  readLifecycleAudits,
  readLifecycleSecrets,
  withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Credential tests establish generation boundaries only, not native-token usability.
describe('service-account lifecycle secret promotion', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it('should retire every prior secret when promotion follows overlapping ordinary-client secrets', async () => {
    await getPool().query(
      "UPDATE client_secrets SET expires_at = NOW() - INTERVAL '1 day' WHERE client_id = $1",
      [fixture.client.id],
    );
    const priorOne = await generateAndStore(fixture.client.id, { label: 'Synthetic prior one' }, fixture.actor.id);
    const priorTwo = await generateAndStore(fixture.client.id, { label: 'Synthetic prior two' }, fixture.actor.id);
    const previous = await readLifecycleSecrets(fixture.client.id);
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const retired = await readLifecycleSecrets(fixture.client.id);
    expect(retired.map((secret) => secret.id)).toEqual(previous.map((secret) => secret.id));
    expect(retired.every((secret) => secret.status === 'revoked')).toBe(true);
    for (const plaintext of [fixture.oldSecret, priorOne.plaintext, priorTwo.plaintext]) {
      expect(await verify(fixture.client.id, plaintext)).toBe(false);
      expect(JSON.stringify(binding).includes(plaintext)).toBe(false);
    }
    const after = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    expect(await verify(fixture.client.id, after.plaintext)).toBe(true);
  });

  it.each(['first binding', 'restoration'])(
    'should preserve an unrelated tenant client secret when retirement occurs during %s',
    async (transition) => {
      const unrelated = await createTestClientWithSecret(fixture.organization.id, fixture.application.id);
      if (transition === 'restoration') {
        await setServiceAccount(fixture.client.id, {
          accountEmail: fixture.accountEmail, targets: [fixture.target],
        }, fixture.actor);
        await revokeServiceAccount(fixture.client.id, fixture.actor);
        await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      }
      const before = await readLifecycleSecrets(unrelated.client.id);
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      expect(await readLifecycleSecrets(unrelated.client.id)).toEqual(before);
      expect(await verify(unrelated.client.id, unrelated.clientSecret)).toBe(true);
    },
  );

  it('should preserve binding version and existing secrets when a human generates an overlapping secret', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const first = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await findServiceAccountByClientId(fixture.client.id);
    const priorSecrets = await readLifecycleSecrets(fixture.client.id);
    const second = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    expect(await findServiceAccountByClientId(fixture.client.id)).toMatchObject({
      id: before?.id, accountId: before?.accountId, status: 'active',
      targets: [fixture.target], authorizationVersion: before?.authorizationVersion,
    });
    const secrets = await readLifecycleSecrets(fixture.client.id);
    expect(secrets.filter((secret) => secret.id !== second.id)).toEqual(priorSecrets);
    expect(secrets.find((secret) => secret.id === second.id)?.status).toBe('active');
    expect(await verify(fixture.client.id, first.plaintext)).toBe(true);
    expect(await verify(fixture.client.id, second.plaintext)).toBe(true);
  });

  it('should atomically change binding version when a live overlapping secret is explicitly revoked', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const first = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const remaining = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await findServiceAccountByClientId(fixture.client.id);
    await revoke(fixture.client.id, first.id, fixture.actor.id);
    const after = await findServiceAccountByClientId(fixture.client.id);
    expect(after).toMatchObject({
      id: created.id, accountId: created.serviceAccountId, status: 'active', targets: [fixture.target],
    });
    expect(after?.authorizationVersion).toEqual(expect.any(String));
    expect(after?.authorizationVersion).not.toBe(before?.authorizationVersion);
    expect(await verify(fixture.client.id, first.plaintext)).toBe(false);
    expect(await verify(fixture.client.id, remaining.plaintext)).toBe(true);
  });

  it('should preserve the credential and binding version when live-secret audit persistence fails', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(revoke(fixture.client.id, secret.id, fixture.actor.id)).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await verify(fixture.client.id, secret.plaintext)).toBe(true);
  });

  it('should retire secrets created during revocation when explicit restoration commits', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const active = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    const whileRevoked = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await readLifecycleSecrets(fixture.client.id);
    const priorAudits = await readLifecycleAudits();
    await setServiceAccount(fixture.client.id, { targets: [fixture.target] }, fixture.actor);
    const after = await readLifecycleSecrets(fixture.client.id);
    expect(after.map((secret) => secret.id)).toEqual(before.map((secret) => secret.id));
    expect(after.every((secret) => secret.status === 'revoked')).toBe(true);
    expect(await verify(fixture.client.id, active.plaintext)).toBe(false);
    expect(await verify(fixture.client.id, whileRevoked.plaintext)).toBe(false);
    const audits = (await readLifecycleAudits()).filter(
      (entry) => !priorAudits.some((prior) => prior.id === entry.id),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].details.includes(active.plaintext)).toBe(false);
    expect(audits[0].details.includes(whileRevoked.plaintext)).toBe(false);
  });
});
