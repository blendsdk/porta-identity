import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRolesDomain } from '../../src/domains/roles.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const appId = 'app-1';
const role = {
  id: 'role-1',
  applicationId: appId,
  name: 'Billing Reader',
  slug: 'billing-reader',
  description: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};
const permission = {
  id: 'permission-1',
  applicationId: appId,
  moduleId: null,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: null,
  createdAt: '2026-09-10T00:00:00.000Z',
};

/** Build a deterministic transport for one domain implementation case. */
function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

describe('domains/roles request serialization', () => {
  let transport: HttpTransport;

  beforeEach(() => {
    transport = mockTransport();
  });

  it('sends the complete collection request without query parameters', async () => {
    transport = mockTransport({ body: { data: [] } });

    await createRolesDomain(transport).list(appId);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/app-1/roles',
    });
  });

  it.each([
    ['get', 'GET', '/applications/app-1/roles/role-1', undefined],
    ['create', 'POST', '/applications/app-1/roles', { name: role.name, slug: role.slug }],
  ])('serializes %s requests', async (methodName, method, path, body) => {
    transport = mockTransport({ body: { data: role } });
    const roles = createRolesDomain(transport);

    if (methodName === 'get') await roles.get(appId, role.id);
    else await roles.create(appId, body ?? { name: role.name });

    expect(transport.request).toHaveBeenCalledWith({
      method,
      path,
      ...(body === undefined ? {} : { body }),
    });
  });

  it('serializes updates and returns the authoritative result', async () => {
    const result = { role, reauthenticationRequired: true };
    transport = mockTransport({ body: { data: result } });

    await expect(
      createRolesDomain(transport).update(appId, role.id, { name: 'Renamed' }),
    ).resolves.toEqual(result);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/applications/app-1/roles/role-1',
      body: { name: 'Renamed' },
    });
  });

  it('returns the committed role deletion result', async () => {
    const result = { reauthenticationRequired: false };
    transport = mockTransport({ body: { data: result } });

    await expect(createRolesDomain(transport).delete(appId, role.id)).resolves.toEqual(result);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/applications/app-1/roles/role-1',
    });
  });

  it('serializes permission collection requests', async () => {
    transport = mockTransport({ body: { data: [permission] } });
    await createRolesDomain(transport).listPermissions(appId, role.id);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/app-1/roles/role-1/permissions',
    });

    transport = mockTransport();
    await createRolesDomain(transport).assignPermissions(appId, role.id, [permission.id]);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/applications/app-1/roles/role-1/permissions',
      body: { permissionIds: [permission.id] },
    });
  });

  it('serializes permission removal and returns its committed result', async () => {
    const result = { reauthenticationRequired: true };
    transport = mockTransport({ body: { data: result } });

    await expect(
      createRolesDomain(transport).removePermissions(appId, role.id, [permission.id]),
    ).resolves.toEqual(result);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/applications/app-1/roles/role-1/permissions',
      body: { permissionIds: [permission.id] },
    });
  });
});

describe('domains/roles response validation', () => {
  it.each([
    [
      'role lookup',
      () =>
        createRolesDomain(mockTransport({ body: { data: { ...role, id: 4 } } })).get(
          appId,
          role.id,
        ),
    ],
    [
      'role creation',
      () => createRolesDomain(mockTransport({ body: role })).create(appId, { name: role.name }),
    ],
    [
      'role update',
      () =>
        createRolesDomain(
          mockTransport({ body: { data: { role, reauthenticationRequired: 'yes' } } }),
        ).update(appId, role.id, { name: 'Renamed' }),
    ],
    [
      'permission collection',
      () =>
        createRolesDomain(
          mockTransport({ body: { data: [{ ...permission, moduleId: 5 }] } }),
        ).listPermissions(appId, role.id),
    ],
  ])('rejects an invalid %s response', async (_name, request) => {
    await expect(request()).rejects.toThrow('Porta API returned an invalid response.');
  });
});
