import { beforeEach, describe, expect, it } from 'vitest';
import { runDatabaseTransaction } from '../../../src/lib/database.js';
import {
  activateClient,
  deactivateClient,
  deleteClient,
  updateClient,
} from '../../../src/clients/index.js';
import { generateAndStore, revoke } from '../../../src/clients/secret-service.js';
import { revokeServiceAccount, setServiceAccount } from '../../../src/service-accounts/index.js';
import {
  createDeniedLifecycleActor,
  createLifecycleActor,
  createLifecycleFixture,
  LIFECYCLE_DENIED_ACTORS,
  lifecycleSecurityFingerprint,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

/** Existing public mutators must authorize their actor while holding the bound client's lock. */
const BOUND_MUTATIONS = [
  {
    name: 'configuration update',
    run: (f: LifecycleFixture, _secretId: string, actorId?: string) => updateClient(
      f.client.id, { clientName: 'Changed synthetic client' }, actorId,
    ),
  },
  {
    name: 'deactivation',
    run: (f: LifecycleFixture, _secretId: string, actorId?: string) => deactivateClient(f.client.id, actorId),
  },
  {
    name: 'activation',
    run: (f: LifecycleFixture, _secretId: string, actorId?: string) => activateClient(f.client.id, actorId),
  },
  {
    name: 'physical deletion',
    run: (f: LifecycleFixture, _secretId: string, actorId?: string) => runDatabaseTransaction(
      () => deleteClient(f.client.id, actorId),
    ),
  },
  {
    name: 'secret generation',
    run: (f: LifecycleFixture, _secretId: string, actorId?: string) => generateAndStore(
      f.client.id, undefined, actorId,
    ),
  },
  {
    name: 'secret revocation',
    run: (f: LifecycleFixture, secretId: string, actorId?: string) => revoke(f.client.id, secretId, actorId),
  },
] as const;

// Generic client permissions do not grant control over a client that owns a service identity.
describe('service-account bound-client mutation authorization', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each([...LIFECYCLE_DENIED_ACTORS, 'omitted actor' as const].flatMap(
    (actorCase) => BOUND_MUTATIONS.map((operation) => ({ actorCase, ...operation })),
  ))(
    'should reject $name without changing security rows when called by an $actorCase',
    async ({ actorCase, run }) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const actorId = actorCase === 'omitted actor'
        ? undefined
        : (await createDeniedLifecycleActor(fixture, actorCase)).id;
      const before = await lifecycleSecurityFingerprint();
      await expect(run(fixture, secret.id, actorId)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it.each(BOUND_MUTATIONS)(
    'should reject $name without writes when an App Admin mutates an already revoked binding',
    async ({ run }) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      await revokeServiceAccount(fixture.client.id, fixture.actor);
      const secret = await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
      const actor = await createLifecycleActor(fixture.adminOrganization.id, fixture.appAdminRole);
      const before = await lifecycleSecurityFingerprint();
      await expect(run(fixture, secret.id, actor.id)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it.each(['canonical', 'legacy'])(
    'should retain bound-client mutations when a live human has the %s Super Admin role',
    async (roleCase) => {
      const actor = roleCase === 'canonical'
        ? fixture.actor
        : await createLifecycleActor(fixture.adminOrganization.id, fixture.legacyRole);
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, actor);
      await expect(updateClient(fixture.client.id, {
        clientName: 'Allowed synthetic update',
      }, actor.id)).resolves.toMatchObject({ clientName: 'Allowed synthetic update' });
      const secret = await generateAndStore(fixture.client.id, undefined, actor.id);
      await expect(revoke(fixture.client.id, secret.id, actor.id)).resolves.toBeUndefined();
      await deactivateClient(fixture.client.id, actor.id);
      await activateClient(fixture.client.id, actor.id);
      await runDatabaseTransaction(() => deleteClient(fixture.client.id, actor.id));
    },
  );
});
