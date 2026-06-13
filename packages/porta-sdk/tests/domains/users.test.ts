import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createUsersDomain } from '../../src/domains/users.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200, headers: {}, body: {}, ...response,
    }),
  };
}

describe('domains/users', () => {
  let transport: ReturnType<typeof mockTransport>;

  describe('list', () => {
    it('calls GET /organizations/:orgId/users', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const users = createUsersDomain(transport);
      await users.list('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users', params: undefined,
      });
    });

    it('passes search and status params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const users = createUsersDomain(transport);
      await users.list('org-1', { search: 'alice', status: 'active' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users',
        params: { search: 'alice', status: 'active' },
      });
    });
  });

  describe('get', () => {
    it('calls GET /organizations/:orgId/users/:userId and returns ETag', async () => {
      transport = mockTransport({ body: { data: { id: 'u1', email: 'a@b.com' } }, headers: { etag: '"v2"' } });
      const users = createUsersDomain(transport);
      const result = await users.get('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/u1',
      });
      expect(result.data).toEqual({ id: 'u1', email: 'a@b.com' });
      expect(result.etag).toBe('"v2"');
    });
  });

  describe('create', () => {
    it('calls POST /organizations/:orgId/users with input', async () => {
      transport = mockTransport({ body: { data: { id: 'u1', email: 'a@b.com' } } });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'a@b.com', givenName: 'Alice' };
      const result = await users.create(input);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users', body: input,
      });
      expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
    });
  });

  describe('invite', () => {
    it('calls POST /organizations/:orgId/users/invite', async () => {
      transport = mockTransport({ body: { data: { id: 'u2', email: 'b@c.com' } } });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'b@c.com' };
      await users.invite(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/invite', body: input,
      });
    });
  });

  describe('update', () => {
    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: { id: 'u1' } } });
      const users = createUsersDomain(transport);
      await users.update('org-1', 'u1', { givenName: 'Bob' }, '"v1"');

      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  describe('status transitions', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('suspend calls POST .../suspend', async () => {
      const users = createUsersDomain(transport);
      await users.suspend('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/suspend',
      });
    });

    it('unsuspend calls POST .../unsuspend (ST-11)', async () => {
      // Source: src/routes/users.ts — POST /organizations/:orgId/users/:userId/unsuspend
      const users = createUsersDomain(transport);
      await users.unsuspend('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/unsuspend',
      });
    });

    it('reactivate calls POST .../reactivate', async () => {
      const users = createUsersDomain(transport);
      await users.reactivate('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/reactivate',
      });
    });

    it('does not expose an org-scoped activate() (ST-10)', () => {
      // Source: org-scoped router has no /activate route — removed (AR-9/PF-006).
      const users = createUsersDomain(transport) as Record<string, unknown>;
      expect(users.activate).toBeUndefined();
    });

    it('lock calls POST .../lock', async () => {

      const users = createUsersDomain(transport);
      await users.lock('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/lock',
      });
    });

    it('deactivate calls POST .../deactivate', async () => {
      const users = createUsersDomain(transport);
      await users.deactivate('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/deactivate',
      });
    });
  });

  describe('setPassword', () => {
    it('calls POST .../password with input', async () => {
      transport = mockTransport();
      const users = createUsersDomain(transport);
      await users.setPassword('org-1', 'u1', { password: 'NewP@ss1' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/password',
        body: { password: 'NewP@ss1' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Newly added methods (ST-10) — each must map to a real server route under
  // /organizations/:orgId/users (src/routes/users.ts).
  // ---------------------------------------------------------------------------
  describe('added user methods', () => {
    beforeEach(() => { transport = mockTransport(); });

    it('clearPassword calls DELETE .../password', async () => {
      const users = createUsersDomain(transport);
      await users.clearPassword('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1/users/u1/password',
      });
    });

    it('verifyEmail calls POST .../verify-email', async () => {
      const users = createUsersDomain(transport);
      await users.verifyEmail('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/verify-email',
      });
    });

    it('exportData calls GET .../export and unwraps data', async () => {
      transport = mockTransport({ body: { data: { user: { id: 'u1' } } } });
      const users = createUsersDomain(transport);
      const result = await users.exportData('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/users/u1/export',
      });
      expect(result).toEqual({ user: { id: 'u1' } });
    });

    it('purge calls POST .../purge with X-Confirm-Purge header', async () => {
      transport = mockTransport({ body: { data: { purged: true } } });
      const users = createUsersDomain(transport);
      await users.purge('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/u1/purge',
        headers: { 'X-Confirm-Purge': 'true' },
      });
    });

    it('invitePreview calls POST .../invite/preview and unwraps data', async () => {
      transport = mockTransport({ body: { data: { html: '<html></html>', subject: 'Invite' } } });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'b@c.com', displayName: 'Bob' };
      const result = await users.invitePreview(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/organizations/org-1/users/invite/preview', body: input,
      });
      expect(result).toEqual({ html: '<html></html>', subject: 'Invite' });
    });
  });
});

