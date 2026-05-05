import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createUserRolesDomain } from '../../src/domains/user-roles.js';

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

describe('domains/user-roles', () => {
  let transport: ReturnType<typeof mockTransport>;
  const orgId = 'org-1';
  const userId = 'user-1';

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /organizations/:orgId/users/:userId/roles', async () => {
      transport = mockTransport({ body: { data: [{ id: 'r1', name: 'admin' }] } });
      const userRoles = createUserRolesDomain(transport);
      const result = await userRoles.list(orgId, userId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/user-1/roles',
      });
      expect(result).toEqual([{ id: 'r1', name: 'admin' }]);
    });
  });

  // ── assign ──────────────────────────────────────────────────
  describe('assign', () => {
    it('calls POST /organizations/:orgId/users/:userId/roles with roleId', async () => {
      transport = mockTransport();
      const userRoles = createUserRolesDomain(transport);
      await userRoles.assign(orgId, userId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/user-1/roles',
        body: { roleId: 'r1' },
      });
    });
  });

  // ── remove ──────────────────────────────────────────────────
  describe('remove', () => {
    it('calls DELETE /organizations/:orgId/users/:userId/roles/:roleId', async () => {
      transport = mockTransport();
      const userRoles = createUserRolesDomain(transport);
      await userRoles.remove(orgId, userId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1/users/user-1/roles/r1',
      });
    });
  });
});
