import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createUsersDomain } from '../../src/domains/users.js';

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

describe('domains/users', () => {
  let transport: ReturnType<typeof mockTransport>;

  describe('list', () => {
    it('calls GET /organizations/:orgId/users', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const users = createUsersDomain(transport);
      await users.list('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users',
        params: undefined,
      });
    });

    it('passes search and status params', async () => {
      transport = mockTransport({ body: { data: [], total: 0, page: 1, pageSize: 20 } });
      const users = createUsersDomain(transport);
      await users.list('org-1', { search: 'alice', status: 'active' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users',
        params: { search: 'alice', status: 'active' },
      });
    });
  });

  describe('get', () => {
    it('calls GET /organizations/:orgId/users/:userId and returns ETag', async () => {
      transport = mockTransport({
        body: { data: { id: 'u1', email: 'a@b.com' } },
        headers: { etag: '"v2"' },
      });
      const users = createUsersDomain(transport);
      const result = await users.get('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users/u1',
      });
      expect(result.data).toEqual({ id: 'u1', email: 'a@b.com' });
      expect(result.etag).toBe('"v2"');
    });
  });

  describe('create', () => {
    it('should POST /organizations/:orgId/users and resolve the user with the response ETag', async () => {
      transport = mockTransport({
        body: { data: { id: 'u1', email: 'a@b.com' } },
        headers: { etag: '"v1"' },
      });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'a@b.com', givenName: 'Alice' };
      const result = await users.create(input);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users',
        body: input,
      });
      expect(result).toEqual({ data: { id: 'u1', email: 'a@b.com' }, etag: '"v1"' });
    });

    it('should resolve a null ETag when the create response omits the ETag header', async () => {
      transport = mockTransport({ body: { data: { id: 'u1', email: 'a@b.com' } } });
      const users = createUsersDomain(transport);
      const result = await users.create({ organizationId: 'org-1', email: 'a@b.com' });

      expect(result).toEqual({ data: { id: 'u1', email: 'a@b.com' }, etag: null });
    });
  });

  describe('invite', () => {
    it('calls POST /organizations/:orgId/users/invite', async () => {
      transport = mockTransport({ body: { data: { id: 'u2', email: 'b@c.com' } } });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'b@c.com' };
      await users.invite(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/invite',
        body: input,
      });
    });
  });

  describe('update', () => {
    it('should send the If-Match header when an ETag argument is provided', async () => {
      transport = mockTransport({ body: { data: { id: 'u1' } } });
      const users = createUsersDomain(transport);
      await users.update('org-1', 'u1', { givenName: 'Bob' }, '"v1"');

      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });

    it('should resolve the updated user with the response ETag', async () => {
      transport = mockTransport({
        body: { data: { id: 'u1', email: 'a@b.com' } },
        headers: { etag: '"v2"' },
      });
      const users = createUsersDomain(transport);
      const result = await users.update('org-1', 'u1', { givenName: 'Bob' });

      expect(result).toEqual({ data: { id: 'u1', email: 'a@b.com' }, etag: '"v2"' });
    });
  });

  describe('getHistory', () => {
    it('should map history params to server query names and resolve the history envelope', async () => {
      const history = {
        data: [
          {
            id: 'h1',
            eventType: 'user.login',
            actorId: null,
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        hasMore: true,
        nextCursor: 'n1',
      };
      transport = mockTransport({ body: { data: history } });
      const users = createUsersDomain(transport);
      const result = await users.getHistory('org-1', 'u1', {
        limit: 10,
        after: 'c',
        eventType: 'user.login',
      });

      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users/u1/history',
        params: { limit: 10, after: 'c', event_type: 'user.login' },
      });
      expect(result).toEqual(history);
    });

    it('should omit the history event type when no params are given', async () => {
      transport = mockTransport({ body: { data: { data: [], hasMore: false, nextCursor: null } } });
      const users = createUsersDomain(transport);
      await users.getHistory('org-1', 'u1');

      const request = vi.mocked(transport.request).mock.calls[0]?.[0];
      expect(request?.params?.event_type).toBeUndefined();
    });
  });

  describe('status transitions', () => {
    beforeEach(() => {
      transport = mockTransport();
    });

    it('activate calls POST .../activate', async () => {
      const users = createUsersDomain(transport);
      await users.activate('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/u1/activate',
      });
    });

    it('does not expose an org-scoped reactivate alias', () => {
      const users = createUsersDomain(transport) as Record<string, unknown>;
      expect(users.reactivate).toBeUndefined();
    });

    it('deactivate calls POST .../deactivate', async () => {
      const users = createUsersDomain(transport);
      await users.deactivate('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/u1/deactivate',
      });
    });
  });

  describe('setPassword', () => {
    it('calls POST .../password with input', async () => {
      transport = mockTransport();
      const users = createUsersDomain(transport);
      await users.setPassword('org-1', 'u1', { password: 'NewP@ss1' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/u1/password',
        body: { password: 'NewP@ss1' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Each method below maps to an existing organization-scoped server route.
  // ---------------------------------------------------------------------------
  describe('added user methods', () => {
    beforeEach(() => {
      transport = mockTransport();
    });

    it('clearPassword calls DELETE .../password', async () => {
      const users = createUsersDomain(transport);
      await users.clearPassword('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/organizations/org-1/users/u1/password',
      });
    });

    it('verifyEmail calls POST .../verify-email', async () => {
      const users = createUsersDomain(transport);
      await users.verifyEmail('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/u1/verify-email',
      });
    });

    it('should call GET .../export and resolve the export document as-is', async () => {
      const exportDocument = {
        exportedAt: '2026-01-01T00:00:00.000Z',
        user: {
          id: 'u1',
          email: 'a@b.com',
          givenName: 'Alice',
          familyName: null,
          middleName: null,
          nickname: null,
          preferredUsername: null,
          locale: null,
          phoneNumber: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastLoginAt: null,
        },
        organization: { id: 'org-1', name: 'Acme', slug: 'acme' },
        roles: [
          {
            roleId: 'role-1',
            roleName: 'Administrator',
            roleSlug: 'administrator',
            applicationId: 'app-1',
            assignedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        customClaims: [{ claimName: 'department', value: 'sales', applicationId: 'app-1' }],
        auditLog: [
          {
            id: 'audit-1',
            eventType: 'user.created',
            eventCategory: 'user',
            description: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        twoFactor: { enabled: true, method: 'totp' },
        oidcSessions: 2,
      };
      transport = mockTransport({ body: exportDocument });
      const users = createUsersDomain(transport);
      const result = await users.exportData('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users/u1/export',
      });
      expect(result).toEqual(exportDocument);
    });

    it('delete calls DELETE /organizations/:orgId/users/:userId', async () => {
      transport = mockTransport();
      const users = createUsersDomain(transport);
      await users.delete('org-1', 'u1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/organizations/org-1/users/u1',
      });
    });

    it('invitePreview calls POST .../invite/preview and unwraps data', async () => {
      transport = mockTransport({ body: { data: { html: '<html></html>', subject: 'Invite' } } });
      const users = createUsersDomain(transport);
      const input = { organizationId: 'org-1', email: 'b@c.com', givenName: 'Bob' };
      const result = await users.invitePreview(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/organizations/org-1/users/invite/preview',
        body: input,
      });
      expect(result).toEqual({ html: '<html></html>', subject: 'Invite' });
    });
  });
});
