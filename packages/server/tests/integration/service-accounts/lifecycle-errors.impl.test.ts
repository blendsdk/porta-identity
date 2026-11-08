import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { deleteClient } from '../../../src/clients/index.js';
import { deleteUser } from '../../../src/users/service.js';
import {
  findServiceAccountByClientId,
  getServiceAccount,
  ServiceAccountManagementError,
  ServiceAccountStorageError,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import {
  eraseServiceAccountOwner,
  provisionServiceAccount,
  replaceServiceAccountAuthority,
  retireServiceAccountSecrets,
  revokeStoredServiceAccount,
  rotateServiceAccountVersion,
} from '../../../src/service-accounts/writes.js';
import { prepareServiceAccountDeletion } from '../../../src/service-accounts/account-deletion.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

describe('service-account lifecycle failure boundaries', () => {
  let fixture: LifecycleFixture;
  beforeEach(async () => { fixture = await createLifecycleFixture(); });

  it('should reject every durable write when no owning transaction exists', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const binding = await findServiceAccountByClientId(fixture.client.id);
    if (!binding) throw new Error('Expected a real owned binding');
    const before = await lifecycleSecurityFingerprint();
    const writes = [
      () => retireServiceAccountSecrets(fixture.client.id),
      () => provisionServiceAccount(fixture.client.id, fixture.adminOrganization.id,
        'another-automation@test.example.com', [fixture.target], fixture.serviceRole.id),
      () => replaceServiceAccountAuthority(binding, [fixture.otherTarget], fixture.serviceRole.id),
      () => revokeStoredServiceAccount(binding),
      () => eraseServiceAccountOwner(binding),
      () => rotateServiceAccountVersion(binding),
      () => prepareServiceAccountDeletion(fixture.adminOrganization.id,
        binding.accountId ?? '', fixture.actor.id),
    ];
    for (const write of writes) {
      await expect(write()).rejects.toThrow(/requir(?:e|es) an active database transaction/);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    }
  });

  it('should roll back account erasure and its marker when the durable deletion audit fails', async () => {
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(deleteUser(fixture.adminOrganization.id, binding.serviceAccountId,
        { kind: 'user', userId: fixture.actor.id })).rejects.toThrow();
    });
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(await getServiceAccount(fixture.client.id, fixture.actor)).toEqual(binding);
  });

  it('should retain live human authorization for a permanent orphan after its client is deleted', async () => {
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await runDatabaseTransaction(() => deleteClient(fixture.client.id, fixture.actor.id));
    const before = await lifecycleSecurityFingerprint();
    await expect(deleteUser(fixture.adminOrganization.id, binding.serviceAccountId))
      .rejects.toBeInstanceOf(ServiceAccountManagementError);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    await deleteUser(fixture.adminOrganization.id, binding.serviceAccountId,
      { kind: 'user', userId: fixture.actor.id });
    const account = await getPool().query('SELECT id FROM users WHERE id = $1', [binding.serviceAccountId]);
    expect(account.rows).toHaveLength(0);
  });

  it('should reject corrupt unclassified ownership instead of projecting it as a human binding', async () => {
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    // Deliberately corrupt owned storage; no supported lifecycle operation removes classification.
    await getPool().query('UPDATE users SET is_service_account = FALSE WHERE id = $1',
      [binding.serviceAccountId]);
    const before = await lifecycleSecurityFingerprint();
    await expect(getServiceAccount(fixture.client.id, fixture.actor))
      .rejects.toBeInstanceOf(ServiceAccountStorageError);
    await expect(setServiceAccount(fixture.client.id, { targets: [fixture.otherTarget] }, fixture.actor))
      .rejects.toBeInstanceOf(ServiceAccountStorageError);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });
});
