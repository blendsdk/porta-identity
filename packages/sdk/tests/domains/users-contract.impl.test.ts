import { describe, expect, it, vi } from 'vitest';
import { createStandaloneUsersDomain, createUsersDomain } from '../../src/domains/users.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {}, ...response }),
  };
}

describe('user domain contract implementation', () => {
  it('omits every undefined list query value', async () => {
    const transport = mockTransport({ body: { data: [], total: 0 } });
    const users = createUsersDomain(transport);

    await users.list('org-1', {
      page: undefined,
      pageSize: undefined,
      search: undefined,
      status: undefined,
      sortBy: undefined,
      sortOrder: undefined,
    });

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/organizations/org-1/users',
      params: undefined,
    });
  });

  it('keeps update ETags and purge confirmation headers unchanged', async () => {
    const transport = mockTransport({ body: { data: { id: 'user-1' } } });
    const users = createUsersDomain(transport);

    await users.update('org-1', 'user-1', { givenName: 'Ada' }, '"version-2"');
    await users.purge('org-1', 'user-1');

    expect(transport.request).toHaveBeenNthCalledWith(1, {
      method: 'PUT',
      path: '/organizations/org-1/users/user-1',
      body: { givenName: 'Ada' },
      headers: { 'If-Match': '"version-2"' },
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/organizations/org-1/users/user-1/purge',
      headers: { 'X-Confirm-Purge': 'true' },
    });
  });

  it('keeps standalone reason requests equivalent to organization-scoped requests', async () => {
    const transport = mockTransport();
    const users = createStandaloneUsersDomain(transport);

    await users.suspend('user-1');
    await users.suspend('user-1', 'Policy review');
    await users.lock('user-1', 'Repeated failures');

    expect(transport.request).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/users/user-1/suspend',
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/users/user-1/suspend',
      body: { reason: 'Policy review' },
    });
    expect(transport.request).toHaveBeenNthCalledWith(3, {
      method: 'POST',
      path: '/users/user-1/lock',
      body: { reason: 'Repeated failures' },
    });
  });
});
