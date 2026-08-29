import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStandaloneUsersDomain, createUsersDomain } from '../../src/domains/users.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

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

const historyEntry = {
  id: 'history-1',
  eventType: 'user.updated',
  actorId: 'admin-1',
  metadata: { field: 'givenName' },
  createdAt: '2026-08-30T10:00:00.000Z',
};

describe('user domain contracts', () => {
  let transport: ReturnType<typeof mockTransport>;

  beforeEach(() => {
    transport = mockTransport();
  });

  describe('list pagination', () => {
    it('sends offset pagination without cursor parameters', async () => {
      transport = mockTransport({
        body: { data: [], total: 0, page: 3, pageSize: 25 },
      });
      const users = createUsersDomain(transport);

      await users.list('org-1', {
        page: 3,
        pageSize: 25,
        search: 'alice',
        sortBy: 'email',
        sortOrder: 'asc',
      });

      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users',
        params: {
          page: 3,
          pageSize: 25,
          search: 'alice',
          sortBy: 'email',
          sortOrder: 'asc',
        },
      });
    });

    it('maps page size to limit when a cursor is supplied', async () => {
      transport = mockTransport({
        body: { data: [], hasMore: false, nextCursor: null },
      });
      const users = createUsersDomain(transport);

      await users.list('org-1', {
        page: 7,
        pageSize: 25,
        cursor: 'cursor-2',
        status: 'active',
      });

      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users',
        params: {
          cursor: 'cursor-2',
          limit: 25,
          status: 'active',
        },
      });
    });
  });

  it('preserves the invitation result returned by the API', async () => {
    const invitation = {
      userId: 'user-2',
      email: 'invitee@example.com',
      created: true,
      invitationSent: true,
      expiresAt: '2026-08-31T10:00:00.000Z',
    };
    transport = mockTransport({ body: { data: invitation } });
    const users = createUsersDomain(transport);

    const result = await users.invite({
      organizationId: 'org-1',
      email: invitation.email,
    });

    expect(result).toEqual(invitation);
  });

  describe('status transition reasons', () => {
    it('sends an optional suspension reason for both user domains', async () => {
      const orgUsers = createUsersDomain(transport);
      const standaloneUsers = createStandaloneUsersDomain(transport);

      await orgUsers.suspend('org-1', 'user-1', 'Policy review');
      await standaloneUsers.suspend('user-1', 'Policy review');

      expect(transport.request).toHaveBeenNthCalledWith(1, {
        method: 'POST',
        path: '/organizations/org-1/users/user-1/suspend',
        body: { reason: 'Policy review' },
      });
      expect(transport.request).toHaveBeenNthCalledWith(2, {
        method: 'POST',
        path: '/users/user-1/suspend',
        body: { reason: 'Policy review' },
      });
    });

    it('sends the required lock reason for both user domains', async () => {
      const orgUsers = createUsersDomain(transport);
      const standaloneUsers = createStandaloneUsersDomain(transport);

      await orgUsers.lock('org-1', 'user-1', 'Repeated failed authentication');
      await standaloneUsers.lock('user-1', 'Repeated failed authentication');

      expect(transport.request).toHaveBeenNthCalledWith(1, {
        method: 'POST',
        path: '/organizations/org-1/users/user-1/lock',
        body: { reason: 'Repeated failed authentication' },
      });
      expect(transport.request).toHaveBeenNthCalledWith(2, {
        method: 'POST',
        path: '/users/user-1/lock',
        body: { reason: 'Repeated failed authentication' },
      });
    });
  });

  describe('history envelopes', () => {
    it('retains the organization-scoped history result', async () => {
      const history = {
        data: [historyEntry],
        hasMore: true,
        nextCursor: 'history-cursor-2',
      };
      transport = mockTransport({ body: history });
      const users = createUsersDomain(transport);

      const result = await users.getHistory('org-1', 'user-1');

      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/organizations/org-1/users/user-1/history',
        params: undefined,
      });
      expect(result).toEqual(history);
    });

    it('unwraps only the outer standalone history envelope', async () => {
      const history = {
        data: [historyEntry],
        hasMore: false,
        nextCursor: null,
      };
      transport = mockTransport({ body: { data: history } });
      const users = createStandaloneUsersDomain(transport);

      const result = await users.getHistory('user-1');

      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/users/user-1/history',
        params: undefined,
      });
      expect(result).toEqual(history);
    });
  });
});
