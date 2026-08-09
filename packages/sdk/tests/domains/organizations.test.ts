import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createOrganizationsDomain } from '../../src/domains/organizations.js';

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

describe('domains/organizations', () => {
  let transport: ReturnType<typeof mockTransport>;

  // ── list ────────────────────────────────────────────────────
  describe('list', () => {
    beforeEach(() => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
    });

    it('calls GET /organizations', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.list();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations', params: undefined,
      });
    });

    it('passes pagination params', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.list({ page: 2, pageSize: 10, search: 'test' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations',
        params: { page: 2, pageSize: 10, search: 'test' },
      });
    });

    it('returns paginated response as-is', async () => {
      const body = { data: [{ id: '1' }], total: 1, page: 1, pageSize: 20 };
      transport = mockTransport({ body });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.list();
      expect(result).toEqual(body);
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /organizations/:idOrSlug', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'Org' } }, headers: { etag: '"v1"' } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.get('my-org');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/my-org',
      });
      expect(result.data).toEqual({ id: '1', name: 'Org' });
      expect(result.etag).toBe('"v1"');
    });

    it('returns null etag when not present', async () => {
      transport = mockTransport({ body: { data: { id: '1' } }, headers: {} });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.get('org-id');
      expect(result.etag).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /organizations with input', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'New Org', slug: 'new-org' } } });
      const orgs = createOrganizationsDomain(transport);
      const input = { name: 'New Org' };
      const result = await orgs.create(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations', body: input,
      });
      expect(result).toEqual({ id: '1', name: 'New Org', slug: 'new-org' });
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /organizations/:id with input', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'Updated' } } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.update('org-1', { name: 'Updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1', body: { name: 'Updated' }, headers: {},
      });
      expect(result).toEqual({ id: '1', name: 'Updated' });
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: { id: '1' } } });
      const orgs = createOrganizationsDomain(transport);
      await orgs.update('org-1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  // ── status transitions ──────────────────────────────────────
  describe('status transitions', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('suspend calls POST /organizations/:id/suspend', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.suspend('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/suspend',
      });
    });

    it('activate calls POST /organizations/:id/activate', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.activate('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/activate',
      });
    });

    it('archive calls POST /organizations/:id/archive', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.archive('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/archive',
      });
    });

    it('restore calls POST /organizations/:id/restore', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.restore('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/restore',
      });
    });
  });

  // ── destroy ─────────────────────────────────────────────────
  describe('destroy', () => {
    it('calls DELETE /organizations/:id', async () => {
      transport = mockTransport({ body: { deleted: true, counts: { users: 5 } } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.destroy('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1', params: undefined,
      });
      expect(result).toEqual({ deleted: true, counts: { users: 5 } });
    });

    it('passes dryRun param', async () => {
      transport = mockTransport({ body: { deleted: false, counts: { users: 5 } } });
      const orgs = createOrganizationsDomain(transport);
      await orgs.destroy('org-1', { dryRun: true });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1', params: { dryRun: true },
      });
    });
  });

  // ── validateSlug ────────────────────────────────────────────
  describe('validateSlug', () => {
    it('calls GET /organizations/validate-slug with slug param', async () => {
      transport = mockTransport({ body: { available: true, slug: 'my-org' } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.validateSlug('my-org');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/validate-slug', params: { slug: 'my-org' },
      });
      expect(result).toEqual({ available: true, slug: 'my-org' });
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('calls GET /organizations/:id/history', async () => {
      transport = mockTransport({ body: { data: [{ id: 'h1', action: 'created' }] } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.getHistory('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/history', params: undefined,
      });
      expect(result).toEqual([{ id: 'h1', action: 'created' }]);
    });
  });
});
