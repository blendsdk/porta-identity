import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createPermissionsDomain } from '../../src/domains/permissions.js';

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

describe('domains/permissions', () => {
  let transport: ReturnType<typeof mockTransport>;
  const appId = 'app-1';

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    it('calls GET /applications/:appId/permissions', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const perms = createPermissionsDomain(transport);
      await perms.list(appId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/permissions', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 2, pageSize: 5 } });
      const perms = createPermissionsDomain(transport);
      await perms.list(appId, { page: 2, pageSize: 5 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/permissions',
        params: { page: 2, pageSize: 5 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /applications/:appId/permissions/:id', async () => {
      transport = mockTransport({ body: { data: { id: 'p1', name: 'read' } } });
      const perms = createPermissionsDomain(transport);
      const result = await perms.get(appId, 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/permissions/p1',
      });
      expect(result).toEqual({ id: 'p1', name: 'read' });
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications/:appId/permissions', async () => {
      const input = { name: 'write', slug: 'write' };
      transport = mockTransport({ body: { data: { id: 'p2', ...input } } });
      const perms = createPermissionsDomain(transport);
      const result = await perms.create(appId, input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/permissions', body: input,
      });
      expect(result).toEqual({ id: 'p2', ...input });
    });
  });

  // ── archive ─────────────────────────────────────────────────
  describe('archive', () => {
    it('calls POST /applications/:appId/permissions/:id/archive', async () => {
      transport = mockTransport();
      const perms = createPermissionsDomain(transport);
      await perms.archive(appId, 'p1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/permissions/p1/archive',
      });
    });
  });
});
