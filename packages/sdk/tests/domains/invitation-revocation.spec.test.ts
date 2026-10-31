/** Invitation revocation is a bodyless tenant-relative DELETE with no domain-level retry. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUsersDomain } from '../../src/domains/users.js';
import { PortaError } from '../../src/errors/index.js';
import { createNodeTransport } from '../../src/node.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const input = {
  organizationId: '8ca40477-c516-4cfa-bc14-c112aa2b9ca5',
  invitationId: 'b520414b-a3ca-4c02-a743-9f35baeb1cde',
};
const path = `/organizations/${input.organizationId}/invitations/${input.invitationId}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SDK invitation revocation', () => {
  it('should send exactly one bodyless DELETE and resolve undefined for an empty 204', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined }),
    };

    await expect(createUsersDomain(transport).revokeInvitation(input)).resolves.toBeUndefined();

    expect(transport.request).toHaveBeenCalledExactlyOnceWith({ method: 'DELETE', path });
  });

  it('should not inspect or unwrap the body of a 204 response', async () => {
    const response: TransportResponse = {
      status: 204,
      headers: {},
      get body() {
        throw new Error('An empty revocation response must not be unwrapped');
      },
    };
    const transport: HttpTransport = { request: vi.fn().mockResolvedValue(response) };

    await expect(createUsersDomain(transport).revokeInvitation(input)).resolves.toBeUndefined();
  });

  it('should remain pending until the transport request completes', async () => {
    let finishRequest: (response: TransportResponse) => void = () => {
      throw new Error('The pending transport fixture has not been initialized');
    };
    const response = new Promise<TransportResponse>((resolve) => { finishRequest = resolve; });
    const transport: HttpTransport = { request: vi.fn().mockReturnValue(response) };
    let settled = false;
    const completion = createUsersDomain(transport).revokeInvitation(input);
    const observed = completion.then(() => { settled = true; });

    try {
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      finishRequest({ status: 204, headers: {}, body: undefined });
      await observed;
    }
    await expect(completion).resolves.toBeUndefined();
  });

  it('should escape each complete path segment and propagate the same rejection without retry', async () => {
    const failure = new Error('Transport rejected the request');
    const transport: HttpTransport = { request: vi.fn().mockRejectedValue(failure) };

    await expect(createUsersDomain(transport).revokeInvitation({
      organizationId: 'org/one?scope=all#fragment',
      invitationId: 'invite/two?accept=yes#fragment',
    })).rejects.toBe(failure);

    expect(transport.request).toHaveBeenCalledExactlyOnceWith({
      method: 'DELETE',
      path: '/organizations/org%2Fone%3Fscope%3Dall%23fragment/invitations/invite%2Ftwo%3Faccept%3Dyes%23fragment',
    });
  });

  it.each(['Unauthorized', 'Forbidden', 'Rate limited', 'Server unavailable'])(
    'should preserve a %s transport error without retrying', async (message) => {
      const failure = new Error(message);
      const transport: HttpTransport = { request: vi.fn().mockRejectedValue(failure) };

      await expect(createUsersDomain(transport).revokeInvitation(input)).rejects.toBe(failure);
      expect(transport.request).toHaveBeenCalledExactlyOnceWith({ method: 'DELETE', path });
    },
  );

  it('should use the explicitly configured tenant prefix and never parse 204 JSON', async () => {
    const response = new Response(null, { status: 204 });
    const parseJson = vi.spyOn(response, 'json');
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://example.test',
      apiPrefix: '/api',
      auth: { getToken: async () => 'test-only-placeholder' },
    });

    await expect(createUsersDomain(transport).revokeInvitation(input)).resolves.toBeUndefined();

    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(fetchRequest.mock.calls[0]?.[0]).toBe(`https://example.test/api${path}`);
    expect(fetchRequest.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(fetchRequest.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(parseJson).not.toHaveBeenCalled();
  });

  it('should retain the default admin prefix instead of silently acquiring tenant authority', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://example.test',
      auth: { getToken: async () => 'test-only-placeholder' },
    });

    await expect(createUsersDomain(transport).revokeInvitation(input)).rejects.toThrow();

    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(fetchRequest.mock.calls[0]?.[0]).toBe(`https://example.test/api/admin${path}`);
  });

  it.each([
    { organizationId: '..', invitationId: input.invitationId },
    { organizationId: '.', invitationId: input.invitationId },
    { organizationId: input.organizationId, invitationId: '..' },
    { organizationId: input.organizationId, invitationId: '.' },
  ])('should reject dot-segment identifiers before any request (%j)', async (unsafe) => {
    const transport: HttpTransport = { request: vi.fn() };

    await expect(createUsersDomain(transport).revokeInvitation(unsafe)).rejects.toBeInstanceOf(
      PortaError,
    );

    expect(transport.request).not.toHaveBeenCalled();
  });

  it('should refuse a dot-segment escape through the default admin prefix without fetching', async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://example.test',
      auth: { getToken: async () => 'test-only-placeholder' },
    });

    await expect(createUsersDomain(transport).revokeInvitation({
      organizationId: input.organizationId,
      invitationId: '..',
    })).rejects.toThrow('Invitation identifiers are invalid.');

    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
