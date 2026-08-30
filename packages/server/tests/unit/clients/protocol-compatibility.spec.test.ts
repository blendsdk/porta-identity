import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/clients/types.js';

vi.mock('../../../src/clients/service.js', () => ({
  createClient: vi.fn(),
  getClientById: vi.fn(),
  getClientByClientId: vi.fn(),
  updateClient: vi.fn(),
  listClientsByOrganization: vi.fn(),
  listClientsByApplication: vi.fn(),
  deactivateClient: vi.fn(),
  activateClient: vi.fn(),
  revokeClient: vi.fn(),
  findForOidc: vi.fn(),
}));

vi.mock('../../../src/clients/secret-service.js', () => ({
  generateAndStore: vi.fn(),
  verify: vi.fn(),
  revoke: vi.fn(),
  listByClient: vi.fn(),
  cleanupExpired: vi.fn(),
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: vi.fn().mockResolvedValue({
    defaultLoginMethods: ['password', 'magic_link'],
  }),
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/etag.js', () => ({
  setETagHeader: vi.fn(),
  checkIfMatch: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/lib/entity-history.js', () => ({
  getEntityHistory: vi.fn().mockResolvedValue({ data: [], hasMore: false, nextCursor: null }),
}));

import * as clientService from '../../../src/clients/service.js';
import { importManifestSchema } from '../../../src/lib/data-import.js';
import { createClientRouter } from '../../../src/routes/clients.js';

const ORGANIZATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APPLICATION_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

interface ProtocolInput {
  readonly clientType: 'confidential' | 'public';
  readonly redirectUris: readonly string[];
  readonly grantTypes: readonly string[];
  readonly tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  readonly requirePkce: boolean;
  readonly allowedOrigins?: readonly string[];
}

/** Build a complete client returned by the mocked persistence boundary. */
function clientFor(input: ProtocolInput): Client {
  return {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    organizationId: ORGANIZATION_ID,
    applicationId: APPLICATION_ID,
    clientId: 'porta_spec_client',
    clientName: 'Protocol specification client',
    clientType: input.clientType,
    applicationType: 'spa',
    redirectUris: [...input.redirectUris],
    postLogoutRedirectUris: [],
    grantTypes: [...input.grantTypes],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    allowedOrigins: [...(input.allowedOrigins ?? [])],
    requirePkce: input.requirePkce,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Exercise the Admin create validation boundary without persisting data. */
async function adminAccepts(input: ProtocolInput): Promise<boolean> {
  vi.mocked(clientService.createClient).mockResolvedValue({
    client: clientFor(input),
    secret: null,
  });

  const router = createClientRouter();
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes('POST') && candidate.path === '/api/admin/clients',
  );
  expect(layer).toBeDefined();
  const handler = layer!.stack.at(-1);
  expect(handler).toBeDefined();

  const ctx = {
    params: {},
    query: {},
    request: {
      body: {
        organizationId: ORGANIZATION_ID,
        applicationId: APPLICATION_ID,
        clientName: 'Protocol specification client',
        applicationType: 'spa',
        ...input,
      },
    },
    state: { organization: { isSuperAdmin: true } },
    status: 200,
    body: undefined,
    throw(status: number, message: string): never {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };

  try {
    await Reflect.apply(handler!, undefined, [ctx, vi.fn()]);
  } catch {
    return false;
  }
  return vi.mocked(clientService.createClient).mock.calls.length === 1;
}

/** Exercise the data-import validation boundary with the same protocol values. */
function importAccepts(input: ProtocolInput): boolean {
  return importManifestSchema.safeParse({
    version: '1.0',
    clients: [
      {
        client_name: 'Protocol specification client',
        application_slug: 'app',
        organization_slug: 'org',
        application_type: 'spa',
        client_type: input.clientType,
        redirect_uris: input.redirectUris,
        grant_types: input.grantTypes,
        response_types: ['code'],
        scope: 'openid',
        token_endpoint_auth_method: input.tokenEndpointAuthMethod,
        require_pkce: input.requirePkce,
        allowed_origins: input.allowedOrigins,
      },
    ],
  }).success;
}

const validPublicClient: ProtocolInput = {
  clientType: 'public',
  redirectUris: ['https://client.example.test/callback'],
  grantTypes: ['authorization_code'],
  tokenEndpointAuthMethod: 'none',
  requirePkce: true,
  allowedOrigins: ['https://client.example.test'],
};

describe('OIDC client protocol compatibility specification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ST-01 accepts a public authorization-code client using none and PKCE', async () => {
    await expect(adminAccepts(validPublicClient)).resolves.toBe(true);
    expect(importAccepts(validPublicClient)).toBe(true);
  });

  it.each([
    ['secret basic authentication', { tokenEndpointAuthMethod: 'client_secret_basic' }],
    ['client credentials', { grantTypes: ['client_credentials'] }],
    ['disabled PKCE', { requirePkce: false }],
  ] as const)('ST-02 rejects a public client using %s', async (_label, override) => {
    const input = { ...validPublicClient, ...override } as ProtocolInput;
    await expect(adminAccepts(input)).resolves.toBe(false);
    expect(importAccepts(input)).toBe(false);
  });

  it('ST-03 rejects a confidential client using no token endpoint authentication', async () => {
    const input: ProtocolInput = {
      ...validPublicClient,
      clientType: 'confidential',
      tokenEndpointAuthMethod: 'none',
    };
    await expect(adminAccepts(input)).resolves.toBe(false);
    expect(importAccepts(input)).toBe(false);
  });

  it.each([
    ['fragment redirect', { redirectUris: ['https://client.example.test/callback#fragment'] }],
    ['wildcard redirect', { redirectUris: ['https://client.example.test/*'] }],
    ['origin path', { allowedOrigins: ['https://client.example.test/path'] }],
    ['origin query', { allowedOrigins: ['https://client.example.test?mode=test'] }],
    ['origin fragment', { allowedOrigins: ['https://client.example.test#fragment'] }],
    ['origin credentials', { allowedOrigins: ['https://user:pass@client.example.test'] }],
  ] as const)('ST-04 rejects a %s', async (_label, override) => {
    const input = { ...validPublicClient, ...override } as ProtocolInput;
    await expect(adminAccepts(input)).resolves.toBe(false);
    expect(importAccepts(input)).toBe(false);
  });

  it.each([
    ['valid public client', validPublicClient],
    [
      'invalid public authentication',
      { ...validPublicClient, tokenEndpointAuthMethod: 'client_secret_post' },
    ],
    [
      'valid confidential client',
      {
        ...validPublicClient,
        clientType: 'confidential',
        tokenEndpointAuthMethod: 'client_secret_post',
        requirePkce: false,
      },
    ],
    ['invalid redirect', { ...validPublicClient, redirectUris: ['https://example.test/*'] }],
  ] as const)(
    'ST-05 keeps Admin and import compatibility identical for %s',
    async (_label, input) => {
      await expect(adminAccepts(input)).resolves.toBe(importAccepts(input));
    },
  );
});
