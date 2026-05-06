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
    it('calls GET /applications/:appId/roles/:roleId', async () => {
      transport = mockTransport({ body: { data: { id: 'r1', name: 'admin', permissions: [] } } });
      const roles = createRolesDomain(transport);
      const result = await roles.get(appId, 'r1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/roles/r1',
      });
      expect(result).toEqual({ id: 'r1', name: 'admin', permissions: [] });
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

  // ── permission management ───────────────────────────────────
  describe('permission management', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('assignPermission calls POST /applications/:appId/roles/:roleId/permissions', async () => {
      const roles = createRolesDomain(transport);
      await roles.assignPermission(appId, 'r1', 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/roles/r1/permissions',
        body: { permissionId: 'p1' },
      });
    });

    it('removePermission calls DELETE /applications/:appId/roles/:roleId/permissions/:permId', async () => {
      const roles = createRolesDomain(transport);
      await roles.removePermission(appId, 'r1', 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/roles/r1/permissions/p1',
      });
    });
  });
});
