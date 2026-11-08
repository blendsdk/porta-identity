/**
 * Regression oracle for the existing client SDK surface.
 *
 * Adding service-account management must not alter the method, path, body,
 * or result of any existing client operation. These tests pin the complete
 * existing request list and a representative result from each response type.
 */

import { describe, expect, it, vi } from 'vitest';
import { createClientsDomain } from '../../src/domains/clients.js';
import type { TransportRequest, TransportResponse } from '../../src/transport/types.js';
import type { CreateClientInput } from '../../src/types/index.js';

type RequestMock = (request: TransportRequest) => Promise<TransportResponse>;

const client = {
  id: 'c1',
  organizationId: 'org-1',
  applicationId: 'app-1',
  clientId: 'client-abc',
  clientName: 'My Client',
  clientType: 'public' as const,
  applicationType: 'spa' as const,
  redirectUris: ['https://client.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code' as const],
  responseTypes: ['code' as const],
  scope: 'openid',
  tokenEndpointAuthMethod: 'none' as const,
  allowedOrigins: ['https://client.example.test'],
  requirePkce: true,
  requireConsent: false,
  loginMethods: null,
  effectiveLoginMethods: ['password' as const],
  status: 'active' as const,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
};

const createInput: CreateClientInput = {
  organizationId: client.organizationId,
  applicationId: client.applicationId,
  clientName: client.clientName,
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: client.redirectUris,
};

const historyEntry = {
  id: 'history-1',
  eventType: 'client.updated',
  actorId: 'admin-1',
  metadata: null,
  createdAt: client.createdAt,
};

const secretMetadata = {
  id: 'secret-1',
  clientId: client.id,
  label: 'prod',
  status: 'active' as const,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: client.createdAt,
};

const generatedSecret = {
  id: 'secret-2',
  clientId: client.id,
  label: 'staging',
  plaintext: 'test-only-placeholder',
  expiresAt: null,
  createdAt: client.createdAt,
};

describe('existing client behavior', () => {
  it('should retain existing client CRUD and lifecycle request shapes', async () => {
    const request = vi
      .fn<RequestMock>()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { data: [client], total: 1, page: 1, pageSize: 20 },
      })
      .mockResolvedValueOnce({ status: 200, headers: { etag: '"v1"' }, body: { data: client } })
      .mockResolvedValueOnce({
        status: 201,
        headers: {},
        body: { data: { client, secret: null } },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: { data: client } })
      .mockResolvedValueOnce({ status: 204, headers: {}, body: undefined })
      .mockResolvedValueOnce({ status: 204, headers: {}, body: undefined })
      .mockResolvedValueOnce({ status: 204, headers: {}, body: undefined });
    const clients = createClientsDomain({ request });

    const page = await clients.list({ page: 1, pageSize: 20 });
    const read = await clients.get(client.id);
    const created = await clients.create(createInput);
    await clients.update(client.id, { clientName: 'Updated' }, '"v1"');
    await clients.activate(client.id);
    await clients.deactivate(client.id);
    await clients.delete(client.id);

    expect(page.data).toEqual([client]);
    expect(read).toEqual({ data: client, etag: '"v1"' });
    expect(created).toEqual({ client });

    expect(request.mock.calls.map(([sent]) => sent)).toStrictEqual([
      { method: 'GET', path: '/clients', params: { page: 1, pageSize: 20 } },
      { method: 'GET', path: `/clients/${client.id}` },
      { method: 'POST', path: '/clients', body: createInput },
      {
        method: 'PUT',
        path: `/clients/${client.id}`,
        body: { clientName: 'Updated' },
        headers: { 'If-Match': '"v1"' },
      },
      { method: 'POST', path: `/clients/${client.id}/activate` },
      { method: 'POST', path: `/clients/${client.id}/deactivate` },
      { method: 'DELETE', path: `/clients/${client.id}` },
    ]);
  });

  it('should retain existing pagination, history, and secret requests', async () => {
    const request = vi
      .fn<RequestMock>()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { data: [client], total: 1, page: 1, pageSize: 20, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { data: [historyEntry], hasMore: false, nextCursor: null },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: { data: [secretMetadata] } })
      .mockResolvedValueOnce({ status: 201, headers: {}, body: { data: generatedSecret } })
      .mockResolvedValueOnce({ status: 204, headers: {}, body: undefined });
    const clients = createClientsDomain({ request });

    const all = await clients.listAll();
    const history = await clients.getHistory(client.id);
    const secrets = await clients.listSecrets(client.id);
    const generated = await clients.generateSecret(client.id, { label: 'staging' });
    await clients.revokeSecret(client.id, secretMetadata.id);

    expect(all).toEqual([client]);
    expect(history).toEqual({ data: [historyEntry], hasMore: false, nextCursor: null });
    expect(secrets).toEqual([secretMetadata]);
    expect(generated).toEqual(generatedSecret);

    expect(request.mock.calls.map(([sent]) => sent)).toStrictEqual([
      { method: 'GET', path: '/clients', params: { page: 1 } },
      { method: 'GET', path: `/clients/${client.id}/history`, params: undefined },
      { method: 'GET', path: `/clients/${client.id}/secrets` },
      { method: 'POST', path: `/clients/${client.id}/secrets`, body: { label: 'staging' } },
      { method: 'POST', path: `/clients/${client.id}/secrets/${secretMetadata.id}/revoke` },
    ]);
  });
});
