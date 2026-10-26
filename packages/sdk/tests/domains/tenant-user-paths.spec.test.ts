/**
 * Tenant SDK path specification.
 *
 * The same users and userRoles domains target the tenant API when the
 * transport is configured with `apiPrefix: '/api'`. These tests pin the
 * resource paths the domains send; the transport tests pin the prefix.
 */

import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createUsersDomain } from '../../src/domains/users.js';
import { createUserRolesDomain } from '../../src/domains/user-roles.js';

function transport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: { data: [] },
      ...response,
    }),
  };
}

describe('tenant SDK paths', () => {
  it('maps user CRUD and lifecycle operations to the shared organization paths', async () => {
    const http = transport({
      body: { data: { id: 'user-1', email: 'user@example.test' } },
    });
    const users = createUsersDomain(http);

    await users.create({ organizationId: 'org-1', email: 'user@example.test' });
    await users.list('org-1');
    await users.get('org-1', 'user-1');
    await users.update('org-1', 'user-1', { nickname: 'newbie' }, 'W/"v1"');
    await users.deactivate('org-1', 'user-1');
    await users.activate('org-1', 'user-1');
    await users.delete('org-1', 'user-1');

    expect(vi.mocked(http.request).mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ method: 'POST', path: '/organizations/org-1/users' }),
      expect.objectContaining({ method: 'GET', path: '/organizations/org-1/users' }),
      expect.objectContaining({ method: 'GET', path: '/organizations/org-1/users/user-1' }),
      expect.objectContaining({
        method: 'PUT',
        path: '/organizations/org-1/users/user-1',
        headers: { 'If-Match': 'W/"v1"' },
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/organizations/org-1/users/user-1/deactivate',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/organizations/org-1/users/user-1/activate',
      }),
      expect.objectContaining({ method: 'DELETE', path: '/organizations/org-1/users/user-1' }),
    ]);
  });

  it('maps user-role reads, assignment, and effective permissions to the tenant role collection', async () => {
    const http = transport();
    const roles = createUserRolesDomain(http);

    await roles.list('org-1', 'user-1');
    await roles.assign('org-1', 'user-1', ['role-1']);
    await roles.getEffectivePermissions('org-1', 'user-1');

    expect(vi.mocked(http.request).mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ method: 'GET', path: '/organizations/org-1/users/user-1/roles' }),
      expect.objectContaining({
        method: 'PUT',
        path: '/organizations/org-1/users/user-1/roles',
        body: { roleIds: ['role-1'] },
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/organizations/org-1/users/user-1/roles/permissions',
      }),
    ]);
  });

  it('maps user-role removal to the tenant role collection', async () => {
    const http = transport({ body: { data: { reauthenticationRequired: false } } });
    const roles = createUserRolesDomain(http);

    await roles.remove('org-1', 'user-1', ['role-1']);

    expect(http.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/organizations/org-1/users/user-1/roles',
      body: { roleIds: ['role-1'] },
    });
  });
});
