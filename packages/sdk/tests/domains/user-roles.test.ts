import { describe, expect, it, vi } from 'vitest';
import { createUserRolesDomain } from '../../src/domains/user-roles.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const orgId = 'org-1';
const userId = 'user-1';
const role = {
  id: 'role-1',
  applicationId: 'app-1',
  name: 'Billing Reader',
  slug: 'billing-reader',
  description: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
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

describe('domains/user-roles request serialization', () => {
  it('lists roles through the organization and user collection', async () => {
    const transport = mockTransport({ body: { data: [role] } });

    await expect(createUserRolesDomain(transport).list(orgId, userId)).resolves.toEqual([role]);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/org-1/users/user-1/roles',
    });
  });

  it('assigns every selected role in one collection request', async () => {
    const transport = mockTransport();

    await createUserRolesDomain(transport).assign(orgId, userId, ['role-1', 'role-2']);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/organizations/org-1/users/user-1/roles',
      body: { roleIds: ['role-1', 'role-2'] },
    });
  });

  it('removes every selected role and returns the committed result', async () => {
    const result = { reauthenticationRequired: false };
    const transport = mockTransport({ body: { data: result } });

    await expect(
      createUserRolesDomain(transport).remove(orgId, userId, ['role-1', 'role-2']),
    ).resolves.toEqual(result);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/organizations/org-1/users/user-1/roles',
      body: { roleIds: ['role-1', 'role-2'] },
    });
  });
});

describe('domains/user-roles response validation', () => {
  it('rejects a role collection with an invalid member', async () => {
    const transport = mockTransport({ body: { data: [{ ...role, updatedAt: 7 }] } });

    await expect(createUserRolesDomain(transport).list(orgId, userId)).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });

  it('rejects a removal response without a boolean outcome', async () => {
    const transport = mockTransport({ body: { data: {} } });

    await expect(createUserRolesDomain(transport).remove(orgId, userId, [role.id])).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });
});
