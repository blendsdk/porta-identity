import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createOrganizationsDomain } from '../../src/domains/organizations.js';
import { PortaServerError, PortaValidationError } from '../../src/errors/index.js';

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

function mockRejectedTransport(error: unknown): HttpTransport {
  return { request: vi.fn().mockRejectedValue(error) };
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

    it('should forward the renamed sort parameters to the transport', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.list({ sortBy: 'name', sortOrder: 'asc' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations',
        params: expect.objectContaining({ sortBy: 'name', sortOrder: 'asc' }),
      });
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
    it('should send the update body and resolve the envelope with a null etag', async () => {
      transport = mockTransport({ body: { data: { id: '1', name: 'Updated' } } });
      const orgs = createOrganizationsDomain(transport);
      const input = { name: 'Updated' };
      const result = await orgs.update('org-1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1', body: input, headers: {},
      });
      expect(result).toEqual({ data: { id: '1', name: 'Updated' }, etag: null });
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: { id: '1' } } });
      const orgs = createOrganizationsDomain(transport);
      await orgs.update('org-1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });

    it('should resolve the response etag alongside the updated organization', async () => {
      transport = mockTransport({
        body: { data: { id: '1', name: 'Updated' } },
        headers: { etag: 'W/"abc"' },
      });
      const orgs = createOrganizationsDomain(transport);
      const input = { name: 'Updated' };
      const result = await orgs.update('org-1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1', body: input, headers: {},
      });
      expect(result).toEqual({ data: { id: '1', name: 'Updated' }, etag: 'W/"abc"' });
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

    it('delete calls DELETE /organizations/:id', async () => {
      const orgs = createOrganizationsDomain(transport);
      await orgs.delete('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1',
      });
    });
  });

  // ── validateSlug ────────────────────────────────────────────
  describe('validateSlug', () => {
    it('should validate a slug through the validation endpoint', async () => {
      transport = mockTransport({ body: { isValid: true } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.validateSlug('my-org');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/validate-slug', params: { slug: 'my-org' },
      });
      expect(result).toEqual({ isValid: true });
    });

    it('should resolve a taken slug exactly as the server reports it', async () => {
      transport = mockTransport({ body: { isValid: false, error: 'Slug already in use' } });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.validateSlug('taken-slug');
      expect(result).toEqual({ isValid: false, error: 'Slug already in use' });
      expect(result).not.toHaveProperty('available');
    });

    it('should surface a malformed or reserved slug as a validation error', async () => {
      const failure = new PortaValidationError({ error: 'Slug is reserved' });
      transport = mockRejectedTransport(failure);
      const orgs = createOrganizationsDomain(transport);
      await expect(orgs.validateSlug('new')).rejects.toBeInstanceOf(PortaValidationError);
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('should request the history page without an event type filter', async () => {
      const body = { data: [{ id: 'h1', action: 'created' }], hasMore: false, nextCursor: null };
      const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, body });
      transport = { request };
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.getHistory('org-1');
      expect(request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET', path: '/organizations/org-1/history',
      }));
      const params = request.mock.calls[0]?.[0]?.params;
      expect(params ?? {}).not.toHaveProperty('event_type');
      expect(result).toEqual(body);
    });

    it('should map history parameters to server names and resolve the page envelope', async () => {
      const body = { data: [{ id: 'h1', action: 'updated' }], hasMore: true, nextCursor: 'n2' };
      transport = mockTransport({ body });
      const orgs = createOrganizationsDomain(transport);
      const result = await orgs.getHistory('org-1', { limit: 50, after: 'cur', eventType: 'org.' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/history',
        params: { limit: 50, after: 'cur', event_type: 'org.' },
      });
      expect(result).toEqual(body);
      expect(result.nextCursor).toBe('n2');
    });

    it('should surface a malformed history cursor as a server error', async () => {
      const failure = new PortaServerError(500, { error: 'Invalid history cursor' });
      transport = mockRejectedTransport(failure);
      const orgs = createOrganizationsDomain(transport);
      await expect(
        orgs.getHistory('org-1', { after: 'not-a-cursor' }),
      ).rejects.toBeInstanceOf(PortaServerError);
    });
  });
});
