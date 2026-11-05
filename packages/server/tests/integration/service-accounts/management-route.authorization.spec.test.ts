import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { findServiceAccountByClientId } from '../../../src/service-accounts/index.js';
import { createTestClient } from '../helpers/factories.js';
import { createLifecycleActor, lifecycleSecurityFingerprint } from './lifecycle-fixtures.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineRequest,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';
import {
  MANAGEMENT_METHODS, expectManagementError, managementPath,
  requireManagementBinding, requireManagementFixture,
} from './management-route-fixtures.js';

// Binding management is human Super Admin only, not an extension of generic client permissions.
describe.sequential('service-account management HTTP authorization', () => {
  let fixture: MachineHttpFixture | undefined;
  beforeEach(async () => { fixture = await createMachineHttpFixture(); });
  afterEach(async () => {
    const current = fixture;
    fixture = undefined;
    await current?.close();
  });

  it('should reach an existing protected client route with the real human Super Admin fixture', async () => {
    const f = requireManagementFixture(fixture);
    const response = await machineRequest(f, {
      method: 'GET', path: `/api/admin/clients/${f.lifecycle.client.id}`,
      token: f.humanToken(f.lifecycle.actor),
    });
    expect(response.status).toBe(200);
  });

  it.each(MANAGEMENT_METHODS)('should return 401 for unauthenticated %s without mutations', async (method) => {
    const f = requireManagementFixture(fixture);
    const before = await lifecycleSecurityFingerprint();
    const response = await machineRequest(f, {
      method, path: managementPath(f.lifecycle.client.id),
      body: method === 'PUT' ? { targets: [f.lifecycle.target] } : undefined,
    });
    expectManagementError(f, response, 401, [f.lifecycle.client.id, f.lifecycle.accountEmail]);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it.each(MANAGEMENT_METHODS)('should return 401 for an unknown bearer on %s without mutations', async (method) => {
    const f = requireManagementFixture(fixture);
    const unknownToken = randomUUID();
    const before = await lifecycleSecurityFingerprint();
    const response = await machineRequest(f, {
      method, path: managementPath(f.lifecycle.client.id), token: unknownToken,
      body: method === 'PUT' ? { targets: [f.lifecycle.target] } : undefined,
    });
    expectManagementError(f, response, 401, [unknownToken, f.lifecycle.client.id]);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  describe.each(['application administrator', 'user administrator', 'tenant identity'] as const)(
    '%s', (actorKind) => {
      it.each(MANAGEMENT_METHODS)('should return 403 on %s despite a real stored human identity', async (method) => {
        const f = requireManagementFixture(fixture);
        const role = actorKind === 'application administrator' ? f.lifecycle.appAdminRole
          : actorKind === 'user administrator' ? f.lifecycle.userAdminRole : f.lifecycle.superRole;
        const organizationId = actorKind === 'tenant identity'
          ? f.lifecycle.organization.id : f.lifecycle.adminOrganization.id;
        const actor = await createLifecycleActor(organizationId, role);
        const token = f.humanToken(actor);
        if (actorKind === 'application administrator') {
          const ordinary = await createTestClient(f.lifecycle.adminOrganization.id, f.lifecycle.application.id);
          const control = await machineRequest(f, {
            method: 'GET', path: `/api/admin/clients/${ordinary.id}`, token,
          });
          expect(control.status, 'App Admin must retain generic ordinary-client read authority').toBe(200);
        }
        const before = await lifecycleSecurityFingerprint();
        const response = await machineRequest(f, {
          method, path: managementPath(f.lifecycle.client.id), token,
          body: method === 'PUT' ? { targets: [f.lifecycle.target] } : undefined,
        });
        expectManagementError(f, response, 403, [actor.id, actor.email, token, f.lifecycle.client.id]);
        expect(await lifecycleSecurityFingerprint()).toBe(before);
      });
    },
  );

  it.each(MANAGEMENT_METHODS)('should recheck live Super Admin membership on %s after token creation', async (method) => {
    const f = requireManagementFixture(fixture);
    const token = f.humanToken(f.lifecycle.actor);
    // This token still resolves to a real active user; its old role is no longer authoritative.
    await getPool().query('DELETE FROM user_roles WHERE user_id = $1', [f.lifecycle.actor.id]);
    const before = await lifecycleSecurityFingerprint();
    const response = await machineRequest(f, {
      method, path: managementPath(f.lifecycle.client.id), token,
      body: method === 'PUT' ? { targets: [f.lifecycle.target] } : undefined,
    });
    expectManagementError(f, response, 403, [token, f.lifecycle.actor.id, f.lifecycle.client.id]);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it.each(MANAGEMENT_METHODS)('should reject a genuine invitation-capable native machine token with 401 on %s', async (method) => {
    const f = requireManagementFixture(fixture);
    const binding = requireManagementBinding(f);
    const issued = await issueMachineToken(f);
    expect(issued.status).toBe(200);
    expect(issued.body.token_type).toBe('Bearer');
    expect(issued.body.expires_in).toBe(300);
    const token = issued.body.access_token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('The machine-management scenario requires a real issued token');
    }
    const native = await f.provider.ClientCredentials.find(token);
    expect(Boolean(native), 'The bearer must exist in the native ClientCredentials model').toBe(true);
    expect(native?.clientId === f.lifecycle.client.clientId).toBe(true);
    expect(typeof native?.scope === 'string' && native.scope.split(' ').includes('admin:user:invite')).toBe(true);
    const extra = native?.extra;
    const metadata = isRecord(extra) ? extra['urn:porta:service-account'] : undefined;
    if (!isRecord(metadata)) throw new Error('The native bearer must have server-owned service authority');
    expect(Object.keys(metadata).sort()).toEqual(['accountId', 'bindingId', 'version']);
    expect(metadata.accountId === binding.serviceAccountId).toBe(true);
    expect(metadata.bindingId === binding.id).toBe(true);
    const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
    expect(typeof metadata.version).toBe('string');
    expect(metadata.version === stored?.authorizationVersion).toBe(true);
    const before = await lifecycleSecurityFingerprint();
    const response = await machineRequest(f, {
      method, path: managementPath(f.lifecycle.client.id), token,
      body: method === 'PUT' ? { targets: [f.lifecycle.target] } : undefined,
    });
    expectManagementError(f, response, 401, [
      token, f.credential.plaintext, binding.id, binding.serviceAccountId, f.lifecycle.client.id,
    ]);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });
});
