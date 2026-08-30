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

const application = {
  id: 'app-1',
  name: 'App',
  slug: 'app',
  description: null,
  status: 'active',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
};

const module = {
  id: 'm1',
  applicationId: application.id,
  name: 'Core',
  slug: 'core',
  description: null,
  status: 'active',
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
};

const historyEntry = {
  id: 'h1',
  eventType: 'application.created',
  actorId: null,
  metadata: null,
  createdAt: application.createdAt,
};

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
        method: 'GET',
        path: '/applications',
        params: undefined,
      });
    });

    it('passes pagination params', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.list({ page: 2, pageSize: 10 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications',
        params: { page: 2, pageSize: 10 },
      });
    });

    it('returns paginated response', async () => {
      const body = { data: [application], total: 1, page: 1, pageSize: 20 };
      transport = mockTransport({ body });
      const apps = createApplicationsDomain(transport);
      const result = await apps.list();
      expect(result).toEqual(body);
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /applications/:idOrSlug with etag', async () => {
      transport = mockTransport({ body: { data: application }, headers: { etag: '"v1"' } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.get('my-app');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/my-app',
      });
      expect(result.data).toEqual(application);
      expect(result.etag).toBe('"v1"');
    });

    it('returns null etag when not present', async () => {
      transport = mockTransport({ body: { data: application }, headers: {} });
      const apps = createApplicationsDomain(transport);
      const result = await apps.get('app-id');
      expect(result.etag).toBeNull();
    });

    it('rejects a successful response with a malformed data envelope', async () => {
      transport = mockTransport({ body: { application } });
      const apps = createApplicationsDomain(transport);

      await expect(apps.get(application.id)).rejects.toThrow(
        'Porta API returned an invalid response.',
      );
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /applications with input', async () => {
      const created = { ...application, name: 'New App', slug: 'new-app' };
      transport = mockTransport({ body: { data: created } });
      const apps = createApplicationsDomain(transport);
      const input = { name: 'New App' };
      const result = await apps.create(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications',
        body: input,
      });
      expect(result).toEqual(created);
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /applications/:id with input', async () => {
      const updated = { ...application, name: 'Updated' };
      transport = mockTransport({ body: { data: updated } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.update('app-1', { name: 'Updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/applications/app-1',
        body: { name: 'Updated' },
        headers: {},
      });
      expect(result).toEqual(updated);
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: application } });
      const apps = createApplicationsDomain(transport);
      await apps.update('app-1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  // ── status transitions ──────────────────────────────────────
  describe('status transitions', () => {
    beforeEach(() => {
      transport = mockTransport();
    });

    it('archive calls POST /applications/:id/archive', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.archive('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/archive',
      });
    });

    it('activate calls POST /applications/:id/activate', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.activate('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/activate',
      });
    });

    it('deactivate calls POST /applications/:id/deactivate', async () => {
      const apps = createApplicationsDomain(transport);
      await apps.deactivate('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/deactivate',
      });
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('calls GET /applications/:id/history', async () => {
      transport = mockTransport({ body: { data: [historyEntry] } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.getHistory('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/history',
        params: undefined,
      });
      expect(result).toEqual([historyEntry]);
    });
  });

  // ── modules ─────────────────────────────────────────────────
  describe('modules', () => {
    it('listModules calls GET /applications/:appId/modules', async () => {
      transport = mockTransport({ body: { data: [module] } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.listModules('app-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/applications/app-1/modules',
      });
      expect(result).toEqual([module]);
    });

    it('addModule calls POST /applications/:appId/modules', async () => {
      const input = { name: 'payments' };
      const added = { ...module, id: 'm2', name: 'payments', slug: 'payments' };
      transport = mockTransport({ body: { data: added } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.addModule('app-1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/modules',
        body: input,
      });
      expect(result).toEqual(added);
    });

    it('updateModule calls PUT /applications/:appId/modules/:moduleId', async () => {
      const input = { name: 'payments-v2' };
      const updated = { ...module, id: 'm2', name: 'payments-v2', slug: 'payments' };
      transport = mockTransport({ body: { data: updated } });
      const apps = createApplicationsDomain(transport);
      const result = await apps.updateModule('app-1', 'm2', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/applications/app-1/modules/m2',
        body: input,
      });
      expect(result).toEqual(updated);
    });

    it('deactivateModule calls the nested POST route', async () => {
      transport = mockTransport();
      const apps = createApplicationsDomain(transport);
      await apps.deactivateModule('app-1', 'm2');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/applications/app-1/modules/m2/deactivate',
      });
    });
  });
});
