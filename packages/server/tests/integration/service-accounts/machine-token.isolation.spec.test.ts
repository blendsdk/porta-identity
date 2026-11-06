/** A genuinely usable invitation token never enters ordinary human Admin operation lanes. */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { findServiceAccountByClientId, setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestClient } from '../helpers/factories.js';
import { readLifecycleSecrets } from './lifecycle-fixtures.js';
import {
  createMachineHttpFixture, issueMachineToken, machineInvitationRequest, machineRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture, MachineRequestOptions } from './machine-http-fixtures.js';

let fixture: MachineHttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

/** Every operation has a separate successful human control on an existing resource. */
const operations = [
  ['client read', 'GET', 200], ['client update', 'PUT', 200], ['client delete', 'DELETE', 204],
  ['secret generation', 'POST', 201], ['configuration read', 'GET', 200], ['user list', 'GET', 200],
  ['user create', 'POST', 201],
  ['invitation preview', 'POST', 200], ['binding read', 'GET', 200],
  ['binding replace', 'PUT', 200], ['binding revoke', 'DELETE', 204],
] as const;

/** Names of confirmed existing operations, not guessed paths accepted as authentication evidence. */
type ProtectedOperation = typeof operations[number][0];

/** Build only the confirmed route corresponding to the selected human operation. */
function protectedPath(f: MachineHttpFixture, operation: ProtectedOperation, clientId: string): string {
  switch (operation) {
    case 'client read': case 'client update': case 'client delete':
      return `/api/admin/clients/${clientId}`;
    case 'secret generation': return `/api/admin/clients/${clientId}/secrets`;
    case 'configuration read': return '/api/admin/config';
    case 'user list': case 'user create': return `/api/admin/organizations/${f.lifecycle.organization.id}/users`;
    case 'invitation preview': return `/api/admin/organizations/${f.lifecycle.organization.id}/users/invite/preview`;
    case 'binding read': case 'binding replace': case 'binding revoke':
      return `/api/admin/clients/${clientId}/service-account`;
  }
}

/** Minimal valid mutation bodies make denial meaningful rather than a validation failure. */
function operationBody(f: MachineHttpFixture, operation: ProtectedOperation, email: string): unknown {
  switch (operation) {
    case 'client update': return { clientName: 'Fixture human control' };
    case 'secret generation': return {};
    case 'invitation preview': return { email };
    case 'user create': return { email, givenName: 'Fixture', familyName: 'Human' };
    case 'binding replace': return { targets: [f.lifecycle.target] };
    default: return undefined;
  }
}

/** Token possession is not a positive control until the real invitation has committed. */
async function usableInvitationToken(f: MachineHttpFixture): Promise<string> {
  const issued = await issueMachineToken(f);
  expect(issued.status).toBe(200);
  const token = machineTokenValue(issued);
  const email = `isolation-control-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
  expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  return token;
}

/** Read business state through real HTTP/storage without fingerprinting permitted security logging. */
async function protectedState(f: MachineHttpFixture, human: string) {
  const client = await machineRequest(f, {
    method: 'GET', path: `/api/admin/clients/${f.lifecycle.client.id}`, token: human,
  });
  expect(client.status).toBe(200);
  const binding = await findServiceAccountByClientId(f.lifecycle.client.id);
  if (!binding) throw new Error('Fixture binding is missing');
  return {
    client: JSON.stringify(client.body.data), version: binding.authorizationVersion,
    status: binding.status, secrets: await readLifecycleSecrets(f.lifecycle.client.id),
  };
}

describe('human-only Admin operation isolation', () => {
  it.each(operations)('should deny machine access to %s after its human control succeeds', async (operation, method, status) => {
    const f = fixture = await createMachineHttpFixture();
    const human = f.humanToken(f.lifecycle.actor);
    const needsClient = operation.startsWith('client') || operation.startsWith('binding') || operation === 'secret generation';
    const controlClient = needsClient ? await createTestClient(
      f.lifecycle.adminOrganization.id, f.lifecycle.adminApplication.id,
      { grantTypes: ['client_credentials'], responseTypes: [], scope: 'admin:user:invite' },
    ) : f.lifecycle.client;
    if (operation.startsWith('binding')) {
      await setServiceAccount(controlClient.id, {
        accountEmail: `human-binding-${randomUUID()}@example.test`, targets: [f.lifecycle.target],
      }, f.lifecycle.actor);
    }
    const controlEmail = `human-operation-${randomUUID()}@example.test`;
    const control = await machineRequest(f, {
      method, path: protectedPath(f, operation, controlClient.id), token: human,
      body: operationBody(f, operation, controlEmail),
    });
    expect(control.status).toBe(status);

    const token = await usableInvitationToken(f);
    const before = await protectedState(f, human);
    const email = `machine-operation-${randomUUID()}@example.test`;
    const denied = await machineRequest(f, {
      method, path: protectedPath(f, operation, f.lifecycle.client.id), token,
      body: operationBody(f, operation, email),
    });
    expect(denied.status).toBe(401);
    const after = await protectedState(f, human);
    expect(after.client === before.client).toBe(true);
    expect(after.version === before.version).toBe(true);
    expect(after.status).toBe(before.status);
    expect(after.secrets).toEqual(before.secrets);
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it.each([
    'query-only bearer', 'body-only bearer', 'alternate token header', 'mixed-case authorization header',
    'forwarded tenant headers', 'permission-looking parameters', 'method override',
    'unregistered method', 'duplicate path separator', 'invitation-looking suffix',
  ] as const)('should not bypass protected operations with %s', async (variant) => {
    const f = fixture = await createMachineHttpFixture();
    const human = f.humanToken(f.lifecycle.actor);
    const clientPath = `/api/admin/clients/${f.lifecycle.client.id}`;
    expect((await machineRequest(f, { method: 'GET', path: clientPath, token: human })).status).toBe(200);
    const token = await usableInvitationToken(f);
    expect((await machineRequest(f, { method: 'GET', path: clientPath, token })).status).toBe(401);
    const before = await protectedState(f, human);
    let request: MachineRequestOptions = { method: 'GET', path: clientPath, token };
    switch (variant) {
      case 'query-only bearer':
        request = { method: 'GET', path: `${clientPath}?access_token=${encodeURIComponent(token)}` };
        break;
      case 'body-only bearer':
        request = { method: 'POST', path: `${clientPath}/secrets`, body: { access_token: token } };
        break;
      case 'alternate token header':
        request = { method: 'GET', path: clientPath, headers: { 'x-access-token': token } };
        break;
      case 'mixed-case authorization header':
        request = { method: 'GET', path: clientPath, headers: { aUtHoRiZaTiOn: `Bearer ${token}` } };
        break;
      case 'forwarded tenant headers':
        request.headers = { 'x-organization-id': f.lifecycle.organization.id, 'x-forwarded-host': 'tenant.example.test' };
        break;
      case 'permission-looking parameters':
        request.path += '?permission=admin%3Auser%3Ainvite&operation=invite&scope=admin%3Auser%3Ainvite';
        break;
      case 'method override': request.headers = { 'x-http-method-override': 'POST' }; break;
      case 'unregistered method': request.method = 'PATCH'; request.body = { clientName: 'Denied' }; break;
      case 'duplicate path separator': request.path = `/api/admin//clients/${f.lifecycle.client.id}`; break;
      case 'invitation-looking suffix': request.method = 'POST'; request.path += '/invite'; request.body = {}; break;
    }
    const denied = await machineRequest(f, request);
    if (variant === 'unregistered method' || variant === 'duplicate path separator' || variant === 'invitation-looking suffix') {
      // Unregistered routes may be absent; the successful controls above, not a 404, prove the protected route exists.
      expect([401, 404, 405]).toContain(denied.status);
    } else {
      expect(denied.status).toBe(401);
    }
    const after = await protectedState(f, human);
    expect(after.client === before.client).toBe(true);
    expect(after.version === before.version).toBe(true);
    expect(after.status).toBe(before.status);
    expect(after.secrets).toEqual(before.secrets);
  });
});
