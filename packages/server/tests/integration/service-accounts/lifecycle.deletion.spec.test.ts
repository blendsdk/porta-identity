import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { deleteClient } from '../../../src/clients/index.js';
import { deleteUser } from '../../../src/users/service.js';
import {
  findServiceAccountByClientId,
  getServiceAccount,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { createTestUser } from '../helpers/factories.js';
import {
  createDeniedLifecycleActor,
  createLifecycleFixture,
  LIFECYCLE_DENIED_ACTORS,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

/** Capture only a domain error's message, without printing its cause or other internal fields. */
async function rejectionMessage(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw new Error('Expected an Error for lost service-account ownership', { cause: error });
  }
  throw new Error('Expected lost service-account ownership to reject');
}

// Physical deletion never converts a surviving service identity into an interactive human.
describe('service-account lifecycle physical deletion', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(['active', 'revoked'])(
    'should remove the binding but retain a permanently inactive service user when its %s client is deleted',
    async (state) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      await runDatabaseTransaction(() => deleteClient(fixture.client.id, fixture.actor.id));
      expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
      expect(await readLifecycleAccount(created.serviceAccountId)).toMatchObject({
        id: created.serviceAccountId, status: 'inactive', isServiceAccount: true, passwordAbsent: true,
      });
      const clients = await getPool().query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM clients WHERE id = $1', [fixture.client.id],
      );
      expect(clients.rows[0].count).toBe(0);
      const before = await lifecycleSecurityFingerprint();
      await expect(getServiceAccount(fixture.client.id, fixture.actor)).rejects.toThrow();
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
      await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it.each(['active', 'revoked'])(
    'should retain the same ownerless marker without deleted-user data when its %s account is deleted',
    async (state) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      const previous = await findServiceAccountByClientId(fixture.client.id);
      await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
        kind: 'user', userId: fixture.actor.id,
      });
      expect(await readLifecycleAccount(created.serviceAccountId)).toBeNull();
      const marker = await findServiceAccountByClientId(fixture.client.id);
      expect(marker).toMatchObject({
        id: created.id, clientId: fixture.client.id, accountId: null,
        status: 'revoked', targets: [], createdAt: created.createdAt,
      });
      expect(marker?.authorizationVersion).toEqual(expect.any(String));
      expect(marker?.authorizationVersion).not.toBe(previous?.authorizationVersion);
      const rawMarker = await getPool().query<{ document: string }>(`
        SELECT to_jsonb(b)::text AS document FROM client_service_accounts b WHERE client_id = $1
      `, [fixture.client.id]);
      expect(rawMarker.rows).toHaveLength(1);
      expect(rawMarker.rows[0].document.includes(fixture.accountEmail)).toBe(false);
      expect(rawMarker.rows[0].document.includes(created.serviceAccountId)).toBe(false);
    },
  );

  it('should reject reads and all email variants with the same conflict when ownership is physically lost', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
      kind: 'user', userId: fixture.actor.id,
    });
    const before = await lifecycleSecurityFingerprint();
    const messages = [await rejectionMessage(getServiceAccount(fixture.client.id, fixture.actor))];
    for (const emailInput of [
      {},
      { accountEmail: fixture.accountEmail },
      { accountEmail: 'another-automation@test.example.com' },
    ]) {
      messages.push(await rejectionMessage(setServiceAccount(fixture.client.id, {
        ...emailInput, targets: [fixture.otherTarget],
      }, fixture.actor)));
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    }
    expect(new Set(messages).size).toBe(1);
    for (const message of messages) {
      expect(message.includes(fixture.accountEmail)).toBe(false);
      expect(message.includes(created.serviceAccountId)).toBe(false);
      expect(message.includes(fixture.oldSecret)).toBe(false);
    }
  });

  it('should retain the identical marker and audit when an ownerless binding is revoked repeatedly', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
      kind: 'user', userId: fixture.actor.id,
    });
    const before = await lifecycleSecurityFingerprint();
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should never adopt a replacement human when the deleted owner email is reused', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
      kind: 'user', userId: fixture.actor.id,
    });
    const human = await createTestUser(fixture.adminOrganization.id, { email: fixture.accountEmail });
    const before = await lifecycleSecurityFingerprint();
    await expect(setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor)).rejects.toThrow();
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect((await readLifecycleAccount(human.id))?.isServiceAccount).toBe(false);
    expect(await findServiceAccountByClientId(fixture.client.id)).toMatchObject({
      id: created.id, accountId: null, status: 'revoked', targets: [],
    });
  });

  it('should remove the ownerless marker without recreating any user when the surviving client is deleted', async () => {
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
      kind: 'user', userId: fixture.actor.id,
    });
    const usersBefore = await getPool().query<{ id: string }>('SELECT id FROM users ORDER BY id');
    await runDatabaseTransaction(() => deleteClient(fixture.client.id, fixture.actor.id));
    expect(await findServiceAccountByClientId(fixture.client.id)).toBeNull();
    const usersAfter = await getPool().query<{ id: string }>('SELECT id FROM users ORDER BY id');
    expect(usersAfter.rows).toEqual(usersBefore.rows);
  });

  it.each([...LIFECYCLE_DENIED_ACTORS, 'omitted actor' as const])(
    'should reject physical account deletion without writes when called by an %s',
    async (actorCase) => {
      const created = await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const actor = actorCase === 'omitted actor'
        ? undefined
        : { kind: 'user' as const, userId: (await createDeniedLifecycleActor(fixture, actorCase)).id };
      const before = await lifecycleSecurityFingerprint();
      await expect(deleteUser(fixture.adminOrganization.id, created.serviceAccountId, actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );
});
