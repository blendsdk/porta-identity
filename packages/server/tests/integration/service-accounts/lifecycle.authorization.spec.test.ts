import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  getServiceAccount,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { createTestClient } from '../helpers/factories.js';
import {
  createDeniedLifecycleActor,
  createLifecycleActor,
  createLifecycleFixture,
  LIFECYCLE_DENIED_ACTORS,
  lifecycleSecurityFingerprint,
} from './lifecycle-fixtures.js';
import type { LifecycleActor, LifecycleFixture } from './lifecycle-fixtures.js';

/** Management operations share the same authoritative human-only boundary. */
const MANAGEMENT_OPERATIONS = [
  {
    name: 'read',
    run: (f: LifecycleFixture, actor: LifecycleActor) => getServiceAccount(f.client.id, actor),
  },
  {
    name: 'replace',
    run: (f: LifecycleFixture, actor: LifecycleActor) => setServiceAccount(
      f.client.id, { targets: [f.otherTarget] }, actor,
    ),
  },
  {
    name: 'revoke',
    run: (f: LifecycleFixture, actor: LifecycleActor) => revokeServiceAccount(f.client.id, actor),
  },
] as const;

// Claimed roles, generic permissions and tenant placement cannot replace live human authority.
describe('service-account lifecycle management authorization', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
  });

  it.each(LIFECYCLE_DENIED_ACTORS)(
    'should reject first binding without writes when the actor is an %s',
    async (actorCase) => {
      const actor = await createDeniedLifecycleActor(fixture, actorCase);
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it.each(LIFECYCLE_DENIED_ACTORS.flatMap((actorCase) => MANAGEMENT_OPERATIONS.map(
    (operation) => ({ actorCase, ...operation }),
  )))(
    'should reject $name without writes when the actor is an $actorCase',
    async ({ actorCase, run }) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor);
      const actor = await createDeniedLifecycleActor(fixture, actorCase);
      const before = await lifecycleSecurityFingerprint();
      await expect(run(fixture, actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it('should reject a stale human identity without writes when its database role was removed', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    await getServiceAccount(fixture.client.id, fixture.actor);
    await getPool().query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [
      fixture.actor.id, fixture.superRole.id,
    ]);
    const before = await lifecycleSecurityFingerprint();
    for (const operation of MANAGEMENT_OPERATIONS) {
      await expect(operation.run(fixture, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    }
  });

  it('should allow the legacy canonical role when its human owner is live in the administrative organization', async () => {
    const actor = await createLifecycleActor(fixture.adminOrganization.id, fixture.legacyRole);
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, actor);
    expect(await getServiceAccount(fixture.client.id, actor)).toEqual(created);
    await expect(revokeServiceAccount(fixture.client.id, actor)).resolves.toBeUndefined();
    const restored = await setServiceAccount(fixture.client.id, { targets: [fixture.otherTarget] }, actor);
    expect(restored.serviceAccountId).toBe(created.serviceAccountId);
    expect(restored.status).toBe('active');
  });

  it.each(['tenant organization', 'noncanonical application', 'public client', 'inactive client', 'missing grant', 'no secret authentication'])(
    'should reject provisioning without writes when an otherwise valid policy targets a client with %s',
    async (caseName) => {
      const client = await createTestClient(
        caseName === 'tenant organization' ? fixture.organization.id : fixture.adminOrganization.id,
        caseName === 'noncanonical application' ? fixture.application.id : fixture.adminApplication.id,
        {
          clientType: caseName === 'public client' ? 'public' : 'confidential',
          tokenEndpointAuthMethod: caseName === 'public client' || caseName === 'no secret authentication'
            ? 'none'
            : 'client_secret_basic',
          grantTypes: caseName === 'missing grant'
            ? ['authorization_code', 'refresh_token']
            : ['authorization_code', 'refresh_token', 'client_credentials'],
          scope: 'openid admin:user:invite',
        },
      );
      if (caseName === 'inactive client') {
        await getPool().query("UPDATE clients SET status = 'inactive' WHERE id = $1", [client.id]);
      }
      const before = await lifecycleSecurityFingerprint();
      await expect(setServiceAccount(client.id, {
        accountEmail: fixture.accountEmail, targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    },
  );

  it('should provision through client_secret_post when all other client eligibility checks pass', async () => {
    const client = await createTestClient(fixture.adminOrganization.id, fixture.adminApplication.id, {
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      scope: 'openid admin:user:invite',
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    const binding = await setServiceAccount(client.id, {
      accountEmail: fixture.accountEmail, targets: [fixture.target],
    }, fixture.actor);
    expect(binding).toMatchObject({ clientId: client.id, status: 'active' });
  });
});
