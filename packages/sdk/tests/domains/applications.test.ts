import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createApplicationsDomain } from '../../src/domains/applications.js';

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

describe('domains/applications', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    beforeEach(() => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
    });

    it('calls GET /applications', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.list({ page: 2, pageSize: 10 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications',
        params: { page: 2, pageSize: 10 },
      });
    });

    it('returns paginated response', async () => {
      const body = { data: [{ id: '1' }], total: 1, page: 1, pageSize: 20 };
      transport = mockTransport({ body });
      const apps = createApplicationsDomain(transport);
      const result = await apps.list();
      expect(result).toEqual(body);
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /applications/:idOrSlug with etag', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'App' } }, headers: { etag: '"v1"' } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.get('my-app');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/my-app',
      });
      expect(result.data).toEqual({ id: '1', name: 'App' });
      expect(result.etag).toBe('"v1"');
    });

    it('returns null etag when not present', async () => {
      transport = mockTransport({ body: { data: { id: '1' } }, headers: {} });
      const apps = createApplicationsDomain(transport);
      const result = await apps.get('app-id');
      expect(result.etag).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications with input', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'New App' } } });
      const apps = createApplicationsDomain(transport);
      const input = { name: 'New App', orgId: 'org-1' };
      const result = await apps.create(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications', body: input,
      });
      expect(result).toEqual({ id: '1', name: 'New App' });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /applications/:id with input', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'Updated' } } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.update('app-1', { name: 'Updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1', body: { name: 'Updated' }, headers: {},
      });
      expect(result).toEqual({ id: '1', name: 'Updated' });
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: { id: '1' } } });
      const apps = createApplicationsDomain(transport);
      await apps.update('app-1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  // ── status transitions ──────────────────────────────────────
  describe('status transitions', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('archive calls POST /applications/:id/archive', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.archive('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/archive',
      });
    });

    it('restore calls POST /applications/:id/restore', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.restore('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/restore',
      });
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('calls GET /applications/:id/history', async () => {
      transport = mockTransport({ body: { data: [{ id: 'h1', action: 'created' }] } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.getHistory('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/history', params: undefined,
      });
      expect(result).toEqual([{ id: 'h1', action: 'created' }]);
    });
  });

  // ── modules ─────────────────────────────────────────────────
  describe('modules', () => {
    it('listModules calls GET /applications/:appId/modules', async () => {
      transport = mockTransport({ body: { data: [{ id: 'm1', name: 'core' }] } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.listModules('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/applications/app-1/modules',
      });
      expect(result).toEqual([{ id: 'm1', name: 'core' }]);
    });

    it('addModule calls POST /applications/:appId/modules', async () => {
      const input = { name: 'payments' };
      transport = mockTransport({ body: { data: { id: 'm2', name: 'payments' } } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.addModule('app-1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/applications/app-1/modules', body: input,
      });
      expect(result).toEqual({ id: 'm2', name: 'payments' });
    });

    it('updateModule calls PUT /applications/:appId/modules/:moduleId', async () => {
      const input = { name: 'payments-v2' };
      transport = mockTransport({ body: { data: { id: 'm2', name: 'payments-v2' } } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.updateModule('app-1', 'm2', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/applications/app-1/modules/m2', body: input,
      });
      expect(result).toEqual({ id: 'm2', name: 'payments-v2' });
    });

    it('removeModule calls DELETE /applications/:appId/modules/:moduleId', async () => {
      transport = mockTransport();
      const apps = createApplicationsDomain(transport);
      await apps.removeModule('app-1', 'm2');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/applications/app-1/modules/m2',
      });
    });
  });
});
