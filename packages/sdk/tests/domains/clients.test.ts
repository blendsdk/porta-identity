import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createClientsDomain } from '../../src/domains/clients.js';

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

describe('domains/clients', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    beforeEach(() => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
    });

    it('calls GET /clients', async () => {
      const clients = createClientsDomain(transport);
      await clients.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/clients', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      const clients = createClientsDomain(transport);
      await clients.list({ page: 2, pageSize: 5 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/clients',
        params: { page: 2, pageSize: 5 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /clients/:idOrClientId with etag', async () => {
      transport = mockTransport({
        body: { data: { id: '1', clientId: 'client-abc' } },
        headers: { etag: '"v2"' },
      });
      const clients = createClientsDomain(transport);
      const result = await clients.get('client-abc');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/clients/client-abc',
      });
      expect(result.data).toEqual({ id: '1', clientId: 'client-abc' });
      expect(result.etag).toBe('"v2"');
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /clients with input', async () => {
      const input = { applicationId: 'app-1', name: 'My Client' };
      transport = mockTransport({ body: { data: { id: '1', ...input } } });
      const clients = createClientsDomain(transport);
      const result = await clients.create(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/clients', body: input,
      });
      expect(result).toEqual({ id: '1', ...input });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /clients/:id with input', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'Updated' } } });
      const clients = createClientsDomain(transport);
      const result = await clients.update('c1', { name: 'Updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/clients/c1', body: { name: 'Updated' }, headers: {},
      });
      expect(result).toEqual({ id: '1', name: 'Updated' });
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: { id: '1' } } });
      const clients = createClientsDomain(transport);
      await clients.update('c1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  // ── status transitions ──────────────────────────────────────
  describe('status transitions', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('revoke calls POST /clients/:id/revoke', async () => {
      const clients = createClientsDomain(transport);
      await clients.revoke('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/clients/c1/revoke',
      });
    });

    it('restore calls POST /clients/:id/restore', async () => {
      const clients = createClientsDomain(transport);
      await clients.restore('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/clients/c1/restore',
      });
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('calls GET /clients/:id/history', async () => {
      transport = mockTransport({ body: { data: [{ id: 'h1', action: 'created' }] } });
      const clients = createClientsDomain(transport);
      const result = await clients.getHistory('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/clients/c1/history', params: undefined,
      });
      expect(result).toEqual([{ id: 'h1', action: 'created' }]);
    });
  });

  // ── secrets ─────────────────────────────────────────────────
  describe('secrets', () => {
    it('listSecrets calls GET /clients/:id/secrets', async () => {
      transport = mockTransport({ body: { data: [{ id: 's1', label: 'prod' }] } });
      const clients = createClientsDomain(transport);
      const result = await clients.listSecrets('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/clients/c1/secrets',
      });
      expect(result).toEqual([{ id: 's1', label: 'prod' }]);
    });

    it('generateSecret calls POST /clients/:id/secrets', async () => {
      transport = mockTransport({ body: { data: { id: 's2', secret: 'abc123' } } });
      const clients = createClientsDomain(transport);
      const input = { label: 'staging' };
      const result = await clients.generateSecret('c1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/clients/c1/secrets', body: input,
      });
      expect(result).toEqual({ id: 's2', secret: 'abc123' });
    });

    it('revokeSecret calls DELETE /clients/:id/secrets/:secretId', async () => {
      transport = mockTransport();
      const clients = createClientsDomain(transport);
      await clients.revokeSecret('c1', 's1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/clients/c1/secrets/s1',
      });
    });
  });
});
