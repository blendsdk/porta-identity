import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createRolesDomain } from '../../src/domains/roles.js';

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

describe('domains/roles', () => {
  let transport: ReturnType<typeof mockTransport>;
  const appId = 'app-1';

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /applications/:appId/roles', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const roles = createRolesDomain(transport);
      await roles.list(appId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/roles', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 2, pageSize: 10 } });
      const roles = createRolesDomain(transport);
      await roles.list(appId, { page: 2, pageSize: 10 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/roles',
        params: { page: 2, pageSize: 10 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET and returns plain Role (no embedded permissions)', async () => {
      const roleData = { id: 'r1', name: 'admin', slug: 'admin', applicationId: appId };
      transport = mockTransport({ body: { data: roleData } });
      const roles = createRolesDomain(transport);
      const result = await roles.get(appId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/roles/r1',
      });
      expect(result).toEqual(roleData);
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications/:appId/roles with input', async () => {
      const input = { name: 'editor', slug: 'editor' };
      transport = mockTransport({ body: { data: { id: 'r2', ...input } } });
      const roles = createRolesDomain(transport);
      const result = await roles.create(appId, input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/roles', body: input,
      });
      expect(result).toEqual({ id: 'r2', ...input });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /applications/:appId/roles/:roleId', async () => {
      transport = mockTransport({ body: { data: { id: 'r1', name: 'super-admin' } } });
      const roles = createRolesDomain(transport);
      const result = await roles.update(appId, 'r1', { name: 'super-admin' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1/roles/r1', body: { name: 'super-admin' },
      });
      expect(result).toEqual({ id: 'r1', name: 'super-admin' });
    });
  });

  // ── archive ─────────────────────────────────────────────────
  describe('archive', () => {
    it('calls POST /applications/:appId/roles/:roleId/archive', async () => {
      transport = mockTransport();
      const roles = createRolesDomain(transport);
      await roles.archive(appId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/roles/r1/archive',
      });
    });
  });

  // ── remove ──────────────────────────────────────────────────
  describe('remove', () => {
    it('calls DELETE /applications/:appId/roles/:roleId', async () => {
      transport = mockTransport();
      const roles = createRolesDomain(transport);
      await roles.remove(appId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/roles/r1', params: undefined,
      });
    });

    it('passes ?force=true', async () => {
      transport = mockTransport();
      const roles = createRolesDomain(transport);
      await roles.remove(appId, 'r1', true);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/roles/r1', params: { force: 'true' },
      });
    });
  });

  // ── permission management ───────────────────────────────────
  describe('permission management', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('listPermissions calls GET /:roleId/permissions', async () => {
      const perms = [{ id: 'p1', name: 'read' }];
      transport = mockTransport({ body: { data: perms } });
      const roles = createRolesDomain(transport);
      const result = await roles.listPermissions(appId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/roles/r1/permissions',
      });
      expect(result).toEqual(perms);
    });

    it('assignPermissions calls PUT with permissionIds array', async () => {
      const roles = createRolesDomain(transport);
      await roles.assignPermissions(appId, 'r1', ['p1', 'p2']);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1/roles/r1/permissions',
        body: { permissionIds: ['p1', 'p2'] },
      });
    });

    it('removePermissions calls DELETE with permissionIds array', async () => {
      const roles = createRolesDomain(transport);
      await roles.removePermissions(appId, 'r1', ['p1']);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/roles/r1/permissions',
        body: { permissionIds: ['p1'] },
      });
    });

    it('assignPermission (singular) wraps to bulk PUT', async () => {
      const roles = createRolesDomain(transport);
      await roles.assignPermission(appId, 'r1', 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1/roles/r1/permissions',
        body: { permissionIds: ['p1'] },
      });
    });

    it('removePermission (singular) wraps to bulk DELETE', async () => {
      const roles = createRolesDomain(transport);
      await roles.removePermission(appId, 'r1', 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/roles/r1/permissions',
        body: { permissionIds: ['p1'] },
      });
    });
  });
});
