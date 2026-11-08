import { beforeEach, describe, expect, it } from 'vitest';
import {
  findServiceAccountByClientId,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { generateAndStore, verify } from '../../../src/clients/secret-service.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Durable audit is part of the same transaction as account, role, policy and credential changes.
describe('service-account lifecycle audit rollback', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it('should roll back provisioning and credential retirement when the real audit insert fails', async () => {
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(true);
  });

  it('should preserve the complete original policy and authority when replacement audit insertion fails', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.otherTarget],
      }, fixture.actor)).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should preserve the active account and binding when revocation audit insertion fails', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should preserve revoked ownership and all current credentials when restoration audit insertion fails', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.otherTarget],
      }, fixture.actor)).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await verify(fixture.client.id, secret.plaintext)).toBe(true);
  });
});
