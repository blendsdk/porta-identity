/** Machine invitations require live issuer, client, account, scope and exact reserved membership. */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { deactivateClient, deleteClient, updateClient } from '../../../src/clients/index.js';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { deleteUser } from '../../../src/users/service.js';
import { createTestClient, createTestClientWithSecret, createTestRole } from '../helpers/factories.js';
import {
  createMachineHttpFixture, issueMachineToken, machineInvitationRequest, machineRequest, machineTokenValue,
  readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture, MachineTokenOptions, MachineTokenResponse } from './machine-http-fixtures.js';

let fixture: MachineHttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

/** Each successful control observes actual invitation persistence, not just token acceptance. */
async function successfulInvitation(f: MachineHttpFixture, token: string): Promise<void> {
  const email = `authority-control-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
  expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
}

/** Preserve native live-reference invalidation when selecting authentication versus authorization denial. */
async function deniedLiveInvitation(f: MachineHttpFixture, token: string): Promise<void> {
  const stillNative = await f.provider.ClientCredentials.find(token);
  const email = `authority-denied-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(stillNative ? 403 : 401);
  expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
}

describe('native machine authority', () => {
  it.each([
    'unbound client', 'tenant client', 'public client', 'noncanonical application', 'wrong issuer',
    'missing feature scope', 'incompatible resource',
  ] as const)('should never grant invitation authority to %s', async (reason) => {
    const f = fixture = await createMachineHttpFixture({ bound: reason !== 'unbound client' });
    let options: MachineTokenOptions = {};
    let publicResponse: MachineTokenResponse | undefined;
    if (reason === 'public client') {
      const client = await createTestClient(f.lifecycle.adminOrganization.id, f.lifecycle.adminApplication.id, {
        clientType: 'public', tokenEndpointAuthMethod: 'none', grantTypes: ['client_credentials'],
        responseTypes: [], scope: 'admin:user:invite',
      });
      const form = new URLSearchParams({
        client_id: client.clientId, grant_type: 'client_credentials', scope: 'admin:user:invite',
      });
      const response = await machineRequest(f, {
        method: 'POST', path: `/${encodeURIComponent(f.adminSlug)}/token`, rawBody: form.toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      publicResponse = { status: response.status, body: response.body };
    } else if (reason === 'tenant client' || reason === 'noncanonical application') {
      const tenant = reason === 'tenant client';
      const created = await createTestClientWithSecret(
        tenant ? f.lifecycle.organization.id : f.lifecycle.adminOrganization.id,
        reason === 'noncanonical application' || tenant ? f.lifecycle.application.id : f.lifecycle.adminApplication.id,
        {
          grantTypes: ['client_credentials'], responseTypes: [], scope: 'admin:user:invite',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_basic',
        },
      );
      options = { clientId: created.client.clientId, secret: created.clientSecret,
        issuerSlug: tenant ? f.lifecycle.organization.slug : f.adminSlug };
    } else if (reason === 'wrong issuer') {
      options = { issuerSlug: f.lifecycle.organization.slug };
    } else if (reason === 'missing feature scope') {
      await updateClient(f.lifecycle.client.id, { scope: 'profile admin:user:invite' }, f.lifecycle.actor.id);
      options = { scope: 'profile' };
    } else if (reason === 'incompatible resource') {
      options = { fields: { resource: 'https://unregistered-resource.example.test' } };
    }
    const issued = publicResponse ?? await issueMachineToken(f, options);
    if (issued.status !== 200) {
      expect(issued.status >= 400 && issued.status < 500).toBe(true);
      expect(typeof issued.body.access_token === 'string').toBe(false);
      return;
    }
    const token = machineTokenValue(issued);
    const native = await f.provider.ClientCredentials.find(token);
    expect(native?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    const email = `ineligible-${randomUUID()}@example.test`;
    expect((await machineInvitationRequest(f, token, email)).status).toBe(401);
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it.each(['client_secret_basic', 'client_secret_post'] as const)(
    'should require the actual secret with %s', async (method) => {
      const f = fixture = await createMachineHttpFixture({ method });
      const valid = await issueMachineToken(f);
      expect(valid.status).toBe(200);
      await successfulInvitation(f, machineTokenValue(valid));
      const rejected = await issueMachineToken(f, { secret: randomUUID() });
      expect(rejected.status >= 400 && rejected.status < 500).toBe(true);
      expect(typeof rejected.body.access_token === 'string').toBe(false);
    },
  );

  it.each([
    'disabled client', 'disabled account', 'missing reserved role', 'missing reserved permission',
    'extra canonical human role', 'extra ordinary application role', 'extra same-slug foreign role',
    'deleted client', 'deleted account',
  ] as const)('should deny a previously usable token after %s', async (change) => {
    const f = fixture = await createMachineHttpFixture();
    const issued = await issueMachineToken(f);
    expect(issued.status).toBe(200);
    const token = machineTokenValue(issued);
    await successfulInvitation(f, token);
    if (!f.binding) throw new Error('Fixture binding is missing');
    const accountId = f.binding.serviceAccountId;
    switch (change) {
      case 'disabled client':
        await deactivateClient(f.lifecycle.client.id, f.lifecycle.actor.id);
        break;
      case 'disabled account':
        await getPool().query('UPDATE users SET status = $1 WHERE id = $2', ['inactive', accountId]);
        break;
      case 'missing reserved role':
        await getPool().query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
          [accountId, f.lifecycle.serviceRole.id]);
        break;
      case 'missing reserved permission':
        await getPool().query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
          [f.lifecycle.serviceRole.id, f.lifecycle.invitePermission.id]);
        break;
      case 'extra canonical human role':
      case 'extra ordinary application role': {
        const role = change === 'extra canonical human role' ? f.lifecycle.superRole : f.lifecycle.role;
        await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [accountId, role.id]);
        break;
      }
      case 'extra same-slug foreign role': {
        const role = await createTestRole(f.lifecycle.otherApplication.id, { slug: 'porta-invite-service' });
        await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [accountId, role.id]);
        break;
      }
      case 'deleted client':
        await runDatabaseTransaction(() => deleteClient(f.lifecycle.client.id, f.lifecycle.actor.id));
        break;
      case 'deleted account':
        await deleteUser(f.lifecycle.adminOrganization.id, accountId, { kind: 'user', userId: f.lifecycle.actor.id });
        break;
    }
    await deniedLiveInvitation(f, token);
    if (change === 'missing reserved permission') {
      // Restoring the permission mapping does not invent a human role or change the account's membership.
      await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [f.lifecycle.serviceRole.id, f.lifecycle.invitePermission.id]);
      const fresh = await issueMachineToken(f);
      expect(fresh.status).toBe(200);
      await successfulInvitation(f, machineTokenValue(fresh));
    }
  });
});
