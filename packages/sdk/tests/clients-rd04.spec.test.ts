import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createClientsDomain, type ClientsDomain } from '../src/domains/clients.js';
import type { HttpTransport, TransportResponse } from '../src/transport/types.js';
import type {
  Client,
  ClientSecret,
  CreateClientInput,
  GeneratedSecret,
  UpdateClientInput,
} from '../src/types/index.js';

const CLIENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ORGANIZATION_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const APPLICATION_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const SECRET_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

/** Build a transport whose ordered responses make every HTTP request observable. */
function transportWith(...responses: Array<Partial<TransportResponse>>): HttpTransport {
  const request = vi.fn();
  for (const response of responses) {
    request.mockResolvedValueOnce({ status: 200, headers: {}, body: {}, ...response });
  }
  return { request };
}

const client = {
  id: CLIENT_ID,
  organizationId: ORGANIZATION_ID,
  applicationId: APPLICATION_ID,
  clientId: 'porta_generated_client_id',
  clientName: 'Portal web client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: ['https://portal.example.test/signed-out'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password', 'magic_link'],
  status: 'active',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
};

type ExpectedClient = {
  id: string;
  organizationId: string;
  applicationId: string;
  clientId: string;
  clientName: string;
  clientType: 'confidential' | 'public';
  applicationType: 'web' | 'native' | 'spa';
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: Array<'authorization_code' | 'client_credentials' | 'refresh_token'>;
  responseTypes: Array<'code'>;
  scope: string;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  allowedOrigins: string[];
  requirePkce: boolean;
  loginMethods: Array<'password' | 'magic_link'> | null;
  effectiveLoginMethods: Array<'password' | 'magic_link'>;
  status: 'active' | 'inactive' | 'revoked';
  createdAt: string;
  updatedAt: string;
};

type ExpectedClientSecret = {
  id: string;
  clientId: string;
  label: string | null;
  status: 'active' | 'revoked';
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ExpectedGeneratedSecret = {
  id: string;
  clientId: string;
  label: string | null;
  plaintext: string;
  expiresAt: string | null;
  createdAt: string;
};

describe('RD-04 OIDC client SDK contract', () => {
  it('ST-19 preserves clientName, complete client fields, and one-time plaintext on create', async () => {
    const secret = {
      id: SECRET_ID,
      clientId: CLIENT_ID,
      label: 'initial',
      plaintext: 'porta_secret_plaintext',
      expiresAt: null,
      createdAt: '2026-08-30T11:00:00.000Z',
    };
    const input = {
      organizationId: ORGANIZATION_ID,
      applicationId: APPLICATION_ID,
      clientName: client.clientName,
      clientType: 'confidential' as const,
      applicationType: 'web' as const,
      redirectUris: client.redirectUris,
    };
    const transport = transportWith({ body: { data: { client, secret } } });
    const clients = createClientsDomain(transport);

    await expect(clients.create(input)).resolves.toEqual({ client, secret });
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients',
      body: input,
    });
  });

  it('ST-19 represents a public-client create response without secret plaintext', async () => {
    const publicClient = {
      ...client,
      clientType: 'public',
      applicationType: 'spa',
      tokenEndpointAuthMethod: 'none',
    };
    const transport = transportWith({ body: { data: { client: publicClient } } });
    const clients = createClientsDomain(transport);

    await expect(
      clients.create({
        organizationId: ORGANIZATION_ID,
        applicationId: APPLICATION_ID,
        clientName: publicClient.clientName,
        clientType: 'public',
        applicationType: 'spa',
        redirectUris: publicClient.redirectUris,
      }),
    ).resolves.toEqual({ client: publicClient });
  });

  it('sends only editable client configuration through the internal UUID', async () => {
    const input = {
      clientName: 'Renamed portal client',
      redirectUris: ['https://portal.example.test/new-callback'],
      requirePkce: false,
    };
    const transport = transportWith({ body: { data: { ...client, ...input } } });
    const clients = createClientsDomain(transport);

    await expect(clients.update(CLIENT_ID, input)).resolves.toEqual({ ...client, ...input });
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/clients/${CLIENT_ID}`,
      body: input,
      headers: {},
    });
  });

  it.each([
    ['activate', 'activate'],
    ['deactivate', 'deactivate'],
    ['revoke', 'revoke'],
  ] as const)(
    'ST-20 sends %s through the internal client UUID POST route',
    async (method, path) => {
      const transport = transportWith();
      const clients = createClientsDomain(transport);

      expect(typeof clients[method]).toBe('function');
      await clients[method](CLIENT_ID);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: `/clients/${CLIENT_ID}/${path}`,
      });
    },
  );

  it('ST-20 exposes no restore operation', () => {
    const clients = createClientsDomain(transportWith());
    expect('restore' in clients).toBe(false);
  });

  it('maps secret metadata and one-time plaintext without renaming either shape', async () => {
    const metadata = {
      id: SECRET_ID,
      clientId: CLIENT_ID,
      label: 'rotation',
      status: 'active',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-08-30T11:00:00.000Z',
    };
    const generated = {
      id: SECRET_ID,
      clientId: CLIENT_ID,
      label: 'rotation',
      plaintext: 'porta_secret_plaintext',
      expiresAt: null,
      createdAt: '2026-08-30T11:00:00.000Z',
    };
    const transport = transportWith({ body: { data: [metadata] } }, { body: { data: generated } });
    const clients = createClientsDomain(transport);

    await expect(clients.listSecrets(CLIENT_ID)).resolves.toEqual([metadata]);
    await expect(clients.generateSecret(CLIENT_ID, { label: 'rotation' })).resolves.toEqual(
      generated,
    );
    expect(transport.request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: `/clients/${CLIENT_ID}/secrets`,
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: `/clients/${CLIENT_ID}/secrets`,
      body: { label: 'rotation' },
    });
  });

  it('ST-21 revokes a secret by both internal UUIDs through the nested POST route', async () => {
    const transport = transportWith();
    const clients = createClientsDomain(transport);

    await clients.revokeSecret(CLIENT_ID, SECRET_ID);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: `/clients/${CLIENT_ID}/secrets/${SECRET_ID}/revoke`,
    });
  });

  it('ST-22 rejects listAll when a later client page fails', async () => {
    const transport = transportWith({
      body: { data: [client], total: 2, page: 1, totalPages: 2 },
    });
    vi.mocked(transport.request).mockRejectedValueOnce(new Error('second page unavailable'));
    const clients = createClientsDomain(transport);

    await expect(clients.listAll()).rejects.toThrow('second page unavailable');
    expect(transport.request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/clients',
      params: { page: 1 },
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/clients',
      params: { page: 2 },
    });
  });

  it('keeps public client, input, secret, and domain types exact', () => {
    expectTypeOf<Client>().toEqualTypeOf<ExpectedClient>();
    expectTypeOf<CreateClientInput>().toEqualTypeOf<{
      organizationId: string;
      applicationId: string;
      clientName: string;
      clientType: 'confidential' | 'public';
      applicationType: 'web' | 'native' | 'spa';
      redirectUris: string[];
      postLogoutRedirectUris?: string[];
      grantTypes?: Array<'authorization_code' | 'client_credentials' | 'refresh_token'>;
      responseTypes?: Array<'code'>;
      scope?: string;
      tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
      allowedOrigins?: string[];
      requirePkce?: boolean;
      secretLabel?: string;
      loginMethods?: Array<'password' | 'magic_link'> | null;
    }>();
    expectTypeOf<UpdateClientInput>().toEqualTypeOf<{
      clientName?: string;
      redirectUris?: string[];
      postLogoutRedirectUris?: string[];
      grantTypes?: Array<'authorization_code' | 'client_credentials' | 'refresh_token'>;
      responseTypes?: Array<'code'>;
      scope?: string;
      tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
      allowedOrigins?: string[];
      requirePkce?: boolean;
      loginMethods?: Array<'password' | 'magic_link'> | null;
    }>();
    expectTypeOf<ClientSecret>().toEqualTypeOf<ExpectedClientSecret>();
    expectTypeOf<GeneratedSecret>().toEqualTypeOf<ExpectedGeneratedSecret>();
    expectTypeOf<ClientsDomain['create']>().toEqualTypeOf<
      (input: CreateClientInput) => Promise<{ client: Client; secret?: GeneratedSecret }>
    >();
    expectTypeOf<Extract<keyof ClientsDomain, 'restore'>>().toEqualTypeOf<never>();
  });
});
