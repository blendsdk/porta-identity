import { describe, expect, it, vi } from 'vitest';
import { createPermissionsDomain } from '../../src/domains/permissions.js';
import { createRolesDomain } from '../../src/domains/roles.js';
import { createUserRolesDomain } from '../../src/domains/user-roles.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';
const PERMISSION_ID = '55555555-5555-4555-8555-555555555555';

const role = {
  id: ROLE_ID,
  applicationId: APPLICATION_ID,
  name: 'Billing Reader',
  slug: 'billing-reader',
  description: null,
  createdAt: '2026-09-09T10:00:00.000Z',
  updatedAt: '2026-09-09T10:00:00.000Z',
};

const permission = {
  id: PERMISSION_ID,
  applicationId: APPLICATION_ID,
  moduleId: null,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: null,
  createdAt: '2026-09-09T10:00:00.000Z',
};

/** Build one deterministic transport response for an SDK contract case. */
function transportWith(body: unknown): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body,
    } satisfies TransportResponse),
  };
}

/** Invoke a planned domain method without weakening its compile-time contract specification. */
async function invoke(domain: object, methodName: string, arguments_: readonly unknown[]) {
  const method = Reflect.get(domain, methodName);
  expect(method, methodName).toBeTypeOf('function');
  if (typeof method !== 'function') throw new Error(`Missing SDK method: ${methodName}`);
  return Reflect.apply(method, domain, arguments_);
}

describe('RBAC SDK collection contracts', () => {
  it('returns complete validated role and permission arrays without pagination', async () => {
    const roleTransport = transportWith({ data: [role] });
    const permissionTransport = transportWith({ data: [permission] });

    await expect(createRolesDomain(roleTransport).list(APPLICATION_ID)).resolves.toEqual([role]);
    await expect(
      createPermissionsDomain(permissionTransport).list(APPLICATION_ID, {
        moduleId: PERMISSION_ID,
      }),
    ).resolves.toEqual([permission]);
    expect(roleTransport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/applications/${APPLICATION_ID}/roles`,
    });
    expect(permissionTransport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/applications/${APPLICATION_ID}/permissions`,
      params: { moduleId: PERMISSION_ID },
    });
  });

  it.each([
    [
      'roles',
      () => createRolesDomain(transportWith({ data: [{ ...role, id: 7 }] })).list(APPLICATION_ID),
    ],
    [
      'permissions',
      () =>
        createPermissionsDomain(transportWith({ data: [{ ...permission, createdAt: null }] })).list(
          APPLICATION_ID,
        ),
    ],
  ])('rejects an invalid %s collection as one fixed SDK error', async (_name, request) => {
    await expect(request()).rejects.toThrow('Porta API returned an invalid response.');
  });

  it('returns assigned user roles from the organization and user collection', async () => {
    const transport = transportWith({ data: [role] });

    await expect(createUserRolesDomain(transport).list(ORGANIZATION_ID, USER_ID)).resolves.toEqual([
      role,
    ]);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/organizations/${ORGANIZATION_ID}/users/${USER_ID}/roles`,
    });
  });
});

describe('RBAC SDK mutation contracts', () => {
  it('updates permission metadata through its parent-qualified route', async () => {
    const transport = transportWith({ data: permission });
    const domain = createPermissionsDomain(transport);

    await expect(
      invoke(domain, 'update', [
        APPLICATION_ID,
        PERMISSION_ID,
        { name: 'Read billing invoices', description: null },
      ]),
    ).resolves.toEqual(permission);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/applications/${APPLICATION_ID}/permissions/${PERMISSION_ID}`,
      body: { name: 'Read billing invoices', description: null },
    });
  });

  it('uses collection PUT and DELETE requests for user-role arrays', async () => {
    const assignTransport = transportWith({ data: {} });
    const removeTransport = transportWith({ data: { reauthenticationRequired: true } });

    await expect(
      invoke(createUserRolesDomain(assignTransport), 'assign', [
        ORGANIZATION_ID,
        USER_ID,
        [ROLE_ID],
      ]),
    ).resolves.toBeUndefined();
    await expect(
      invoke(createUserRolesDomain(removeTransport), 'remove', [
        ORGANIZATION_ID,
        USER_ID,
        [ROLE_ID],
      ]),
    ).resolves.toEqual({ reauthenticationRequired: true });
    expect(assignTransport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/organizations/${ORGANIZATION_ID}/users/${USER_ID}/roles`,
      body: { roleIds: [ROLE_ID] },
    });
    expect(removeTransport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: `/organizations/${ORGANIZATION_ID}/users/${USER_ID}/roles`,
      body: { roleIds: [ROLE_ID] },
    });
  });

  it('validates the role update result containing the authoritative role', async () => {
    const transport = transportWith({
      data: { role, reauthenticationRequired: true },
    });

    await expect(
      invoke(createRolesDomain(transport), 'update', [
        APPLICATION_ID,
        ROLE_ID,
        { name: 'Renamed' },
      ]),
    ).resolves.toEqual({ role, reauthenticationRequired: true });
  });

  it.each([
    ['role delete', 'delete', [APPLICATION_ID, ROLE_ID]],
    ['role-permission removal', 'removePermissions', [APPLICATION_ID, ROLE_ID, [PERMISSION_ID]]],
  ])('validates the committed reduction result for %s', async (_name, method, arguments_) => {
    const transport = transportWith({ data: { reauthenticationRequired: true } });

    await expect(invoke(createRolesDomain(transport), method, arguments_)).resolves.toEqual({
      reauthenticationRequired: true,
    });
  });

  it('rejects an invalid reduction result instead of inventing a committed outcome', async () => {
    const transport = transportWith({ data: { reauthenticationRequired: 'yes' } });

    await expect(
      invoke(createRolesDomain(transport), 'delete', [APPLICATION_ID, ROLE_ID]),
    ).rejects.toThrow('Porta API returned an invalid response.');
  });
});
