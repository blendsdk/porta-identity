import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { generateAndStore, revoke, verify } from '../../../src/clients/secret-service.js';
import { deleteUser } from '../../../src/users/service.js';
import {
  findServiceAccountByClientId,
  ServiceAccountManagementError,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { lockServiceAccountParent } from '../../../src/service-accounts/repository.js';
import { createLifecycleFixture } from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';
import { holdLifecycleWork, waitForLifecycleParentBlock } from './lifecycle-concurrency-fixtures.js';

describe('service-account lifecycle transaction interleavings', () => {
  let fixture: LifecycleFixture;
  beforeEach(async () => { fixture = await createLifecycleFixture(); });

  it('should retire a concurrently generated credential when generation commits before first binding', async () => {
    const generation = holdLifecycleWork(() => generateAndStore(fixture.client.id));
    const held = await generation.ready;
    const binding = setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const outcome = binding.then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForLifecycleParentBlock(held.pid);
    } finally {
      generation.release();
      await Promise.allSettled([generation.result, binding]);
    }
    const result = await outcome;
    expect(result).toHaveProperty('value');
    expect(await verify(fixture.client.id, held.value.plaintext)).toBe(false);
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(false);
  });

  it('should keep a new credential live when generation waits for first binding to commit', async () => {
    const binding = holdLifecycleWork(() => setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor));
    const held = await binding.ready;
    const generation = generateAndStore(fixture.client.id, {}, fixture.actor.id);
    const outcome = generation.then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForLifecycleParentBlock(held.pid);
    } finally {
      binding.release();
      await Promise.allSettled([binding.result, generation]);
    }
    const result = await outcome;
    if (!('value' in result)) throw new Error('Post-binding credential generation failed');
    expect(await verify(fixture.client.id, result.value.plaintext)).toBe(true);
    expect((await findServiceAccountByClientId(fixture.client.id))?.accountId)
      .toBe(held.value.serviceAccountId);
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(false);
  });

  it('should deny stale human authority when its role is revoked during the parent-lock wait', async () => {
    const blocker = holdLifecycleWork(() => lockServiceAccountParent(fixture.client.id));
    const held = await blocker.ready;
    const binding = setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const denial = expect(binding).rejects.toBeInstanceOf(ServiceAccountManagementError);
    try {
      await waitForLifecycleParentBlock(held.pid);
      await getPool().query('DELETE FROM user_roles WHERE user_id = $1', [fixture.actor.id]);
    } finally {
      blocker.release();
      await Promise.allSettled([blocker.result, binding]);
    }
    await denial;
    expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
    expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(true);
  });

  it('should preserve a newly generated overlap when live revocation waits on the same parent', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const first = await generateAndStore(fixture.client.id, {}, fixture.actor.id);
    const previous = await findServiceAccountByClientId(fixture.client.id);
    const overlap = holdLifecycleWork(() => generateAndStore(fixture.client.id, {}, fixture.actor.id));
    const held = await overlap.ready;
    const revocation = revoke(fixture.client.id, first.id, fixture.actor.id);
    const outcome = revocation.then(() => true, () => false);
    try {
      await waitForLifecycleParentBlock(held.pid);
    } finally {
      overlap.release();
      await Promise.allSettled([overlap.result, revocation]);
    }
    expect(await outcome).toBe(true);
    expect(await verify(fixture.client.id, first.plaintext)).toBe(false);
    expect(await verify(fixture.client.id, held.value.plaintext)).toBe(true);
    expect((await findServiceAccountByClientId(fixture.client.id))?.authorizationVersion)
      .not.toBe(previous?.authorizationVersion);
  });

  it.each(['REPEATABLE READ', 'SERIALIZABLE'])(
    'should fail closed when a lifecycle caller inherits %s isolation', async (isolation) => {
      await expect(runDatabaseTransaction(async () => {
        // These statements are the closed test catalog, never caller-controlled SQL fragments.
        if (isolation === 'SERIALIZABLE') await getPool().query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        else await getPool().query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        return setServiceAccount(fixture.client.id, {
          accountEmail: fixture.accountEmail, targets: [fixture.target],
        }, fixture.actor);
      })).rejects.toBeInstanceOf(ServiceAccountManagementError);
      expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
      expect(await verify(fixture.client.id, fixture.oldSecret)).toBe(true);
    },
  );

  it('should leave a permanent orphan safely deletable when client deletion wins the parent lock', async () => {
    const owner = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    const deletion = holdLifecycleWork(async () => {
      await lockServiceAccountParent(fixture.client.id);
      // Model the committed client cascade while holding the production parent-lock order.
      await getPool().query('DELETE FROM clients WHERE id = $1', [fixture.client.id]);
    });
    const held = await deletion.ready;
    const accountDeletion = deleteUser(fixture.adminOrganization.id, owner.serviceAccountId,
      { kind: 'user', userId: fixture.actor.id });
    const outcome = accountDeletion.then(() => true, () => false);
    try {
      await waitForLifecycleParentBlock(held.pid);
    } finally {
      deletion.release();
      await Promise.allSettled([deletion.result, accountDeletion]);
    }
    expect(await outcome).toBe(true);
    const account = await getPool().query('SELECT id FROM users WHERE id = $1', [owner.serviceAccountId]);
    expect(account.rows).toHaveLength(0);
    expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
  });
});
