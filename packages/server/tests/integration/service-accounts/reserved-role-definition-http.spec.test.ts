import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestPermission, createTestRole } from '../helpers/factories.js';
import {
  createLifecycleActor,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';
import {
  captureReservedRoleMail,
  createReservedRoleFixture,
  resetReservedRoleRuntime,
  startReservedRoleApp,
} from './reserved-role-fixtures.js';
import type { ReservedRoleApp, ReservedRoleMail } from './reserved-role-fixtures.js';

describe('reserved invitation-only role definition through the full application', () => {
  let fixture: LifecycleFixture;
  let app: ReservedRoleApp | undefined;
  let mail: ReservedRoleMail;

  beforeEach(async () => {
    fixture = await createReservedRoleFixture();
    mail = captureReservedRoleMail();
    const actor = await createLifecycleActor(fixture.adminOrganization.id, fixture.appAdminRole);
    app = await startReservedRoleApp(actor.id);
  });

  afterEach(async () => {
    await resetReservedRoleRuntime(app);
    app = undefined;
  });

  /** Exercise the actual route, authentication, authorization and outer audit transaction. */
  function requestRole(
    applicationId: string,
    roleId: string | undefined,
    method: string,
    body?: object,
    suffix = '',
  ): Promise<Response> {
    if (!app) throw new Error('Missing owned application listener');
    const rolePath = roleId ? `/${roleId}` : '';
    return fetch(`${app.baseUrl}/api/admin/applications/${applicationId}/roles${rolePath}${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${app.adminToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });
  }

  // Reserved definitions use the same fixed safe rejection as existing canonical built-in roles.
  it.each(['name', 'slug', 'description', 'delete', 'grant permission', 'remove permission'] as const)(
    'should return the canonical 400 policy without durable changes for %s',
    async (operation) => {
      await setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail,
        targets: [fixture.target],
      }, fixture.actor);
      const extraPermission = await createTestPermission(fixture.adminApplication.id, {
        name: 'Synthetic broader administration permission',
        slug: 'admin:user:update',
      });
      let method = 'PUT';
      let suffix = '';
      let body: object | undefined;
      if (operation === 'name') body = { name: 'Synthetic forbidden changed name' };
      else if (operation === 'slug') body = { slug: 'synthetic-forbidden-renamed-service' };
      else if (operation === 'description') body = { description: 'Synthetic forbidden description' };
      else if (operation === 'delete') method = 'DELETE';
      else {
        suffix = '/permissions';
        method = operation === 'grant permission' ? 'PUT' : 'DELETE';
        body = {
          permissionIds: [operation === 'grant permission' ? extraPermission.id : fixture.invitePermission.id],
        };
      }
      const before = await lifecycleSecurityFingerprint();

      const reference = await requestRole(
        fixture.adminApplication.id, fixture.superRole.id, method, body, suffix,
      );
      const response = await requestRole(
        fixture.adminApplication.id, fixture.serviceRole.id, method, body, suffix,
      );
      const referenceError = await reference.text();
      const reservedError = await response.text();

      expect(reference.status).toBe(400);
      expect(response.status).toBe(400);
      expect(reservedError).toBe(referenceError);
      expect(reservedError.length).toBeGreaterThan(0);
      expect(reservedError).not.toMatch(/SQLSTATE|stack|node_modules|password_hash|client_secret/i);
      expect(reservedError).not.toContain(fixture.serviceRole.id);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
      expect(mail.attempts).toBe(0);
    },
  );

  // Absence must not turn reserved-name admission into an ordinary successful role creation.
  it('should reject HTTP creation of an absent canonical reserved definition without effects', async () => {
    await getPool().query('DELETE FROM roles WHERE id = $1', [fixture.serviceRole.id]);
    const before = await lifecycleSecurityFingerprint();

    const response = await requestRole(fixture.adminApplication.id, undefined, 'POST', {
      name: 'Synthetic forbidden service definition',
      slug: 'porta-invite-service',
    });

    expect(response.status).toBe(400);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
    expect(mail.attempts).toBe(0);
  });

  // Application identity, not a global slug blacklist, determines whether a role is reserved.
  it.each([
    { field: 'name', input: { name: 'Synthetic changed ordinary name' } },
    { field: 'slug', input: { slug: 'synthetic-renamed-ordinary-role' } },
    { field: 'description', input: { description: 'Synthetic ordinary role description' } },
  ])('should let an App Admin update $field and delete an ordinary same-slug role', async ({ input }) => {
    const binding = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    const accountBefore = await readLifecycleAccount(binding.serviceAccountId);
    const ordinary = await createTestRole(fixture.application.id, {
      name: 'Synthetic ordinary same-slug role',
      slug: 'porta-invite-service',
    });

    const updated = await requestRole(fixture.application.id, ordinary.id, 'PUT', input);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toHaveProperty('data');
    const deleted = await requestRole(fixture.application.id, ordinary.id, 'DELETE');
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toHaveProperty('data');

    const remaining = await getPool().query<{ id: string }>(
      'SELECT id FROM roles WHERE id = $1', [ordinary.id],
    );
    expect(remaining.rows).toEqual([]);
    expect(await readLifecycleAccount(binding.serviceAccountId)).toEqual(accountBefore);
    expect(mail.attempts).toBe(0);
  });
});
