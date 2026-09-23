import { describe, expect, it, vi } from 'vitest';
import { createPermissionsDomain } from '../../src/domains/permissions.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const appId = 'app-1';
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

describe('domains/permissions request serialization', () => {
  it.each([
    [undefined, undefined],
    [{ moduleId: 'module-1' }, { moduleId: 'module-1' }],
  ])('serializes the complete collection with filter %o', async (params, expectedParams) => {
    const transport = mockTransport({ body: { data: [] } });

    await createPermissionsDomain(transport).list(appId, params);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/app-1/permissions',
      params: expectedParams,
    });
  });

  it('serializes permission lookup', async () => {
    const transport = mockTransport({ body: { data: permission } });

    await expect(createPermissionsDomain(transport).get(appId, permission.id)).resolves.toEqual(
      permission,
    );
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/app-1/permissions/permission-1',
    });
  });

  it('serializes creation without repeating the parent application', async () => {
    const transport = mockTransport({ body: { data: permission } });
    const input = { name: permission.name, slug: permission.slug };

    await createPermissionsDomain(transport).create(appId, input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/applications/app-1/permissions',
      body: input,
    });
  });

  it('serializes mutable permission metadata', async () => {
    const transport = mockTransport({ body: { data: permission } });
    const input = { name: 'Invoice reader', description: null };

    await createPermissionsDomain(transport).update(appId, permission.id, input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/applications/app-1/permissions/permission-1',
      body: input,
    });
  });

  it('returns the committed deletion result', async () => {
    const result = { reauthenticationRequired: true };
    const transport = mockTransport({ body: { data: result } });

    await expect(createPermissionsDomain(transport).delete(appId, permission.id)).resolves.toEqual(
      result,
    );
    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/applications/app-1/permissions/permission-1',
    });
  });
});

describe('domains/permissions response validation', () => {
  it.each([
    [
      'lookup',
      () =>
        createPermissionsDomain(
          mockTransport({ body: { data: { ...permission, description: 5 } } }),
        ).get(appId, permission.id),
    ],
    [
      'creation',
      () =>
        createPermissionsDomain(mockTransport({ body: permission })).create(appId, {
          name: permission.name,
          slug: permission.slug,
        }),
    ],
    [
      'update',
      () =>
        createPermissionsDomain(
          mockTransport({ body: { data: { ...permission, createdAt: null } } }),
        ).update(appId, permission.id, { name: 'Renamed' }),
    ],
    [
      'deletion',
      () =>
        createPermissionsDomain(
          mockTransport({ body: { data: { reauthenticationRequired: 'yes' } } }),
        ).delete(appId, permission.id),
    ],
  ])('rejects an invalid %s response', async (_name, request) => {
    await expect(request()).rejects.toThrow('Porta API returned an invalid response.');
  });
});
