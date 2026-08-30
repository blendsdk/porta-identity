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

const client = {
  id: 'c1',
  organizationId: 'org-1',
  applicationId: 'app-1',
  clientId: 'client-abc',
  clientName: 'My Client',
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: ['https://client.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scope: 'openid',
  tokenEndpointAuthMethod: 'none',
  allowedOrigins: ['https://client.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password'],
  status: 'active',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
};

const historyEntry = {
  id: 'h1',
  eventType: 'client.created',
  actorId: null,
  metadata: null,
  createdAt: client.createdAt,
};

const secretMetadata = {
  id: 's1',
  clientId: client.id,
  label: 'prod',
  status: 'active',
  lastUsedAt: null,
  expiresAt: null,
  createdAt: client.createdAt,
};

const generatedSecret = {
  id: 's2',
  clientId: client.id,
  label: 'staging',
  plaintext: 'abc123',
  expiresAt: null,
  createdAt: client.createdAt,
};

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
        method: 'GET',
        path: '/clients',
        params: undefined,
      });
    });

    it('passes pagination params', async () => {
      const clients = createClientsDomain(transport);
      await clients.list({ page: 2, pageSize: 5 });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/clients',
        params: { page: 2, pageSize: 5 },
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────
  describe('get', () => {
    it('calls GET /clients/:idOrClientId with etag', async () => {
      transport = mockTransport({
        body: { data: client },
        headers: { etag: '"v2"' },
      });
      const clients = createClientsDomain(transport);
      const result = await clients.get('client-abc');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/clients/client-abc',
      });
      expect(result.data).toEqual(client);
      expect(result.etag).toBe('"v2"');
    });
  });

  // ── create ──────────────────────────────────────────────────
  describe('create', () => {
    it('calls POST /clients with input', async () => {
      const input = {
        organizationId: 'org-1',
        applicationId: 'app-1',
        clientName: 'My Client',
        clientType: 'public' as const,
        applicationType: 'spa' as const,
        redirectUris: ['https://client.example.test/callback'],
      };
      transport = mockTransport({ body: { data: { client, secret: null } } });
      const clients = createClientsDomain(transport);
      const result = await clients.create(input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients',
        body: input,
      });
      expect(result).toEqual({ client });
    });

    it('rejects a confidential client response without its one-time secret', async () => {
      const confidential = {
        ...client,
        clientType: 'confidential',
        tokenEndpointAuthMethod: 'client_secret_basic',
      };
      transport = mockTransport({ body: { data: { client: confidential, secret: null } } });
      const clients = createClientsDomain(transport);

      await expect(
        clients.create({
          organizationId: confidential.organizationId,
          applicationId: confidential.applicationId,
          clientName: confidential.clientName,
          clientType: 'confidential',
          applicationType: 'spa',
          redirectUris: confidential.redirectUris,
        }),
      ).rejects.toThrow('Porta API returned an invalid response.');
    });

    it('rejects a public client response that unexpectedly contains a secret', async () => {
      transport = mockTransport({
        body: { data: { client, secret: generatedSecret } },
      });
      const clients = createClientsDomain(transport);

      await expect(
        clients.create({
          organizationId: client.organizationId,
          applicationId: client.applicationId,
          clientName: client.clientName,
          clientType: 'public',
          applicationType: 'spa',
          redirectUris: client.redirectUris,
        }),
      ).rejects.toThrow('Porta API returned an invalid response.');
    });

    it('rejects a successful response with a malformed data envelope', async () => {
      transport = mockTransport({ body: { client } });
      const clients = createClientsDomain(transport);

      await expect(
        clients.create({
          organizationId: client.organizationId,
          applicationId: client.applicationId,
          clientName: client.clientName,
          clientType: 'public',
          applicationType: 'spa',
          redirectUris: client.redirectUris,
        }),
      ).rejects.toThrow('Porta API returned an invalid response.');
    });
  });

  // ── update ──────────────────────────────────────────────────
  describe('update', () => {
    it('calls PUT /clients/:id with input', async () => {
      const updated = { ...client, clientName: 'Updated' };
      transport = mockTransport({ body: { data: updated } });
      const clients = createClientsDomain(transport);
      const result = await clients.update('c1', { name: 'Updated' });
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/clients/c1',
        body: { name: 'Updated' },
        headers: {},
      });
      expect(result).toEqual(updated);
    });

    it('sends If-Match header when etag provided', async () => {
      transport = mockTransport({ body: { data: client } });
      const clients = createClientsDomain(transport);
      await clients.update('c1', { name: 'X' }, '"v1"');
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { 'If-Match': '"v1"' } }),
      );
    });
  });

  // ── status transitions ──────────────────────────────────────
  describe('status transitions', () => {
    beforeEach(() => {
      transport = mockTransport();
    });

    it('revoke calls POST /clients/:id/revoke', async () => {
      const clients = createClientsDomain(transport);
      await clients.revoke('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients/c1/revoke',
      });
    });

    it('activate calls POST /clients/:id/activate', async () => {
      const clients = createClientsDomain(transport);
      await clients.activate('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients/c1/activate',
      });
    });

    it('deactivate calls POST /clients/:id/deactivate', async () => {
      const clients = createClientsDomain(transport);
      await clients.deactivate('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients/c1/deactivate',
      });
    });
  });

  // ── getHistory ──────────────────────────────────────────────
  describe('getHistory', () => {
    it('calls GET /clients/:id/history', async () => {
      transport = mockTransport({ body: { data: [historyEntry] } });
      const clients = createClientsDomain(transport);
      const result = await clients.getHistory('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/clients/c1/history',
        params: undefined,
      });
      expect(result).toEqual([historyEntry]);
    });
  });

  // ── secrets ─────────────────────────────────────────────────
  describe('secrets', () => {
    it('listSecrets calls GET /clients/:id/secrets', async () => {
      transport = mockTransport({ body: { data: [secretMetadata] } });
      const clients = createClientsDomain(transport);
      const result = await clients.listSecrets('c1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/clients/c1/secrets',
      });
      expect(result).toEqual([secretMetadata]);
    });

    it('generateSecret calls POST /clients/:id/secrets', async () => {
      transport = mockTransport({ body: { data: generatedSecret } });
      const clients = createClientsDomain(transport);
      const input = { label: 'staging' };
      const result = await clients.generateSecret('c1', input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients/c1/secrets',
        body: input,
      });
      expect(result).toEqual(generatedSecret);
    });

    it('revokeSecret calls the nested POST route', async () => {
      transport = mockTransport();
      const clients = createClientsDomain(transport);
      await clients.revokeSecret('c1', 's1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/clients/c1/secrets/s1/revoke',
      });
    });
  });
});
