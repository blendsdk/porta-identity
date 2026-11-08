import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  findServiceAccountByClientId,
  getServiceAccount,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { generateAndStore, verify } from '../../../src/clients/secret-service.js';
import {
  createLifecycleFixture,
  LIFECYCLE_BINDING_KEYS,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
  readLifecycleAudits,
  readLifecycleSecrets,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Policy replacement changes authority, never ownership; only explicit restoration reactivates it.
describe('service-account lifecycle transitions', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(['omitted', 'same normalized'])(
    'should preserve ownership and secrets when replacement uses an %s email',
    async (emailCase) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const priorStored = await findServiceAccountByClientId(fixture.client.id);
      const priorSecrets = await readLifecycleSecrets(fixture.client.id);
      const priorAccount = await readLifecycleAccount(created.serviceAccountId);
      const priorAudits = await readLifecycleAudits();
      const emailInput = emailCase === 'omitted'
        ? {}
        : { accountEmail: ` ${fixture.accountEmail.toUpperCase()} ` };
      const replaced = await setServiceAccount(fixture.client.id, {
        ...emailInput, targets: [fixture.otherTarget],
      }, fixture.actor);

      expect(Object.keys(replaced).sort()).toEqual(LIFECYCLE_BINDING_KEYS);
      expect(replaced.updatedAt).toBeInstanceOf(Date);
      expect(replaced).toMatchObject({
        id: created.id,
        clientId: created.clientId,
        serviceAccountId: created.serviceAccountId,
        accountEmail: fixture.accountEmail,
        status: 'active',
        createdAt: created.createdAt,
        targets: [fixture.otherTarget],
      });
      const stored = await findServiceAccountByClientId(fixture.client.id);
      expect(stored?.authorizationVersion).toEqual(expect.any(String));
      expect(stored?.authorizationVersion).not.toBe(priorStored?.authorizationVersion);
      expect(await readLifecycleSecrets(fixture.client.id)).toEqual(priorSecrets);
      expect(await readLifecycleAccount(created.serviceAccountId)).toEqual(priorAccount);
      const audits = (await readLifecycleAudits()).filter(
        (entry) => !priorAudits.some((prior) => prior.id === entry.id),
      );
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe(fixture.actor.id);
      for (const id of [created.id, created.clientId, created.serviceAccountId, fixture.otherOrganization.id]) {
        expect(audits[0].details.includes(id)).toBe(true);
      }
      expect(audits[0].details.includes(secret.plaintext)).toBe(false);
      expect(await verify(fixture.client.id, secret.plaintext)).toBe(true);
    },
  );

  it.each(['active', 'revoked'])(
    'should preserve every security row when a different email is supplied for an %s binding',
    async (state) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: 'different-automation@test.example.com', targets: [fixture.otherTarget],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it('should deactivate the same permanent account and change version when revoked first', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const before = await findServiceAccountByClientId(fixture.client.id);
    const priorAudits = await readLifecycleAudits();
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    const revoked = await findServiceAccountByClientId(fixture.client.id);
    expect(revoked).toMatchObject({ id: created.id, accountId: created.serviceAccountId, status: 'revoked' });
    expect(revoked?.authorizationVersion).not.toBe(before?.authorizationVersion);
    expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
      status: 'inactive', isServiceAccount: true, passwordAbsent: true,
    });
    const audits = (await readLifecycleAudits()).filter(
      (entry) => !priorAudits.some((prior) => prior.id === entry.id),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(fixture.actor.id);
  });

  it('should preserve version, timestamps and audit when an already revoked binding is revoked again', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    const before = await lifecycleSecurityFingerprint();
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should reject a read but make revoke a complete no-op when the eligible client has no binding', async () => {
    const before = await lifecycleSecurityFingerprint();
    await expect(getServiceAccount(fixture.client.id, fixture.actor)).rejects.toThrow();
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should reject all lifecycle operations without writes when the client does not exist', async () => {
    const missingClientId = randomUUID();
    const before = await lifecycleSecurityFingerprint();
    await expect(getServiceAccount(missingClientId, fixture.actor)).rejects.toThrow();
    await expect(revokeServiceAccount(missingClientId, fixture.actor)).rejects.toThrow();
    await expect(setServiceAccount(missingClientId, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });
});
