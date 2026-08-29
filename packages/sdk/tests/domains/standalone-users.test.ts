import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createStandaloneUsersDomain } from '../../src/domains/users.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200, headers: {}, body: {}, ...response,
    }),
  };
}

// Coverage for the server's organization-less user operations.
describe('domains/standaloneUsers', () => {
  let transport: ReturnType<typeof mockTransport>;
  beforeEach(() => { transport = mockTransport(); });

  it('get calls GET /users/:userId', async () => {
    // Source: src/routes/users.ts createStandaloneUserRouter — GET /:userId.
    transport = mockTransport({ body: { data: { id: 'u1', email: 'a@b.com' } }, headers: { etag: '"v1"' } });
    const users = createStandaloneUsersDomain(transport);
    const result = await users.get('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET', path: '/users/u1',
    });
    expect(result.data).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(result.etag).toBe('"v1"');
  });

  it('update calls PUT /users/:userId', async () => {
    transport = mockTransport({ body: { data: { id: 'u1' } } });
    const users = createStandaloneUsersDomain(transport);
    await users.update('u1', { givenName: 'Bob' }, '"v1"');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', path: '/users/u1', headers: { 'If-Match': '"v1"' } }),
    );
  });

  it('activate calls POST /users/:userId/activate (SPA alias)', async () => {
    const users = createStandaloneUsersDomain(transport);
    await users.activate('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST', path: '/users/u1/activate',
    });
  });

  it('suspend calls POST /users/:userId/suspend', async () => {
    const users = createStandaloneUsersDomain(transport);
    await users.suspend('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST', path: '/users/u1/suspend',
    });
  });

  it('unsuspend calls POST /users/:userId/unsuspend', async () => {
    const users = createStandaloneUsersDomain(transport);
    await users.unsuspend('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST', path: '/users/u1/unsuspend',
    });
  });

  it('verifyEmail calls POST /users/:userId/verify-email', async () => {
    const users = createStandaloneUsersDomain(transport);
    await users.verifyEmail('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST', path: '/users/u1/verify-email',
    });
  });

  it('getHistory calls GET /users/:userId/history and unwraps data', async () => {
    transport = mockTransport({
      body: {
        data: {
          data: [
            {
              id: 'h1',
              eventType: 'user.updated',
              actorId: null,
              metadata: null,
              createdAt: 'x',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      },
    });
    const users = createStandaloneUsersDomain(transport);
    const result = await users.getHistory('u1');
    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET', path: '/users/u1/history', params: undefined,
    });
    expect(result.data[0]?.eventType).toBe('user.updated');
    expect(result.hasMore).toBe(false);
  });
});
