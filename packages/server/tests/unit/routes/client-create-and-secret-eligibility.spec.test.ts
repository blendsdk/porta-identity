import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, SecretWithPlaintext } from '../../../src/clients/types.js';

vi.mock('../../../src/clients/service.js', () => ({
  createClient: vi.fn(),
  getClientById: vi.fn(),
  getClientByClientId: vi.fn(),
  updateClient: vi.fn(),
  listClientsByOrganization: vi.fn(),
  listClientsByApplication: vi.fn(),
  listClientsCursor: vi.fn(),
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
import * as secretService from '../../../src/clients/secret-service.js';
import { createClientRouter } from '../../../src/routes/clients.js';

const ORGANIZATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APPLICATION_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CLIENT_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

/** Build a client in the requested secret-eligibility state. */
function client(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    organizationId: ORGANIZATION_ID,
    applicationId: APPLICATION_ID,
    clientId: 'porta_spec_client',
    clientName: 'Specification client',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://client.example.test/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: [],
    requirePkce: true,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Create a minimal context and execute every middleware registered on one route. */
async function executeRoute(
  method: string,
  path: string,
  permissions: readonly string[],
  options: { readonly body?: object; readonly params?: Record<string, string> } = {},
) {
  const router = createClientRouter();
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path === path,
  );
  expect(layer).toBeDefined();

  const ctx = {
    params: options.params ?? {},
    query: {},
    request: { body: options.body ?? {} },
    state: {
      adminUser: {
        id: 'admin-id',
        email: 'admin@example.test',
        organizationId: ORGANIZATION_ID,
        roles: ['spec-role'],
        permissions,
      },
    },
    status: 200,
    body: undefined,
    throw(status: number, message: string): never {
      this.status = status;
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };

  const dispatch = async (index: number): Promise<void> => {
    const middleware = layer!.stack[index];
    if (!middleware) return;
    await Reflect.apply(middleware, undefined, [ctx, () => dispatch(index + 1)]);
  };

  try {
    await dispatch(0);
  } catch {
    // The public response status on the context is the observable under test.
  }
  return ctx;
}

const validCreateBody = {
  organizationId: ORGANIZATION_ID,
  applicationId: APPLICATION_ID,
  clientName: 'Specification client',
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: ['https://client.example.test/callback'],
  grantTypes: ['authorization_code'],
  tokenEndpointAuthMethod: 'none',
  requirePkce: true,
};

describe('client-create authorization specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientService.createClient).mockResolvedValue({
      client: client({ clientType: 'public', tokenEndpointAuthMethod: 'none' }),
      secret: null,
    });
  });

  it.each([
    ['only client-create', ['admin:client:create']],
    ['only app-read', ['admin:app:read']],
  ] as const)('ST-07A returns 403 before dispatch with %s', async (_label, permissions) => {
    const ctx = await executeRoute('POST', '/api/admin/clients', permissions, {
      body: validCreateBody,
    });

    expect(ctx.status).toBe(403);
    expect(clientService.createClient).not.toHaveBeenCalled();
  });

  it('ST-07A permits validated dispatch with both permissions', async () => {
    const ctx = await executeRoute(
      'POST',
      '/api/admin/clients',
      ['admin:client:create', 'admin:app:read'],
      { body: validCreateBody },
    );

    expect(ctx.status).toBe(201);
    expect(clientService.createClient).toHaveBeenCalledOnce();
  });
});

describe('secret parent eligibility specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const generated: SecretWithPlaintext = {
      id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      clientId: CLIENT_ID,
      label: null,
      plaintext: 'one-time-secret',
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    vi.mocked(secretService.generateAndStore).mockResolvedValue(generated);
    vi.mocked(secretService.listByClient).mockResolvedValue([]);
  });

  it.each([
    ['public', client({ clientType: 'public', tokenEndpointAuthMethod: 'none' })],
    ['revoked', client({ status: 'revoked' })],
  ] as const)(
    'ST-07B rejects generation for a %s client as an absent eligible parent',
    async (_label, value) => {
      vi.mocked(clientService.getClientById).mockResolvedValue(value);

      const ctx = await executeRoute(
        'POST',
        '/api/admin/clients/:id/secrets',
        ['admin:client:update'],
        { params: { id: CLIENT_ID } },
      );

      expect(ctx.status).toBe(404);
      expect(secretService.generateAndStore).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['public', client({ clientType: 'public', tokenEndpointAuthMethod: 'none' })],
    ['revoked', client({ status: 'revoked' })],
  ] as const)(
    'ST-07B rejects listing for a %s client as an absent eligible parent',
    async (_label, value) => {
      vi.mocked(clientService.getClientById).mockResolvedValue(value);

      const ctx = await executeRoute(
        'GET',
        '/api/admin/clients/:id/secrets',
        ['admin:client:read'],
        { params: { id: CLIENT_ID } },
      );

      expect(ctx.status).toBe(404);
      expect(secretService.listByClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['public', client({ clientType: 'public', tokenEndpointAuthMethod: 'none' })],
    ['revoked', client({ status: 'revoked' })],
  ] as const)(
    'ST-07B rejects revocation for a %s client as an absent eligible parent',
    async (_label, value) => {
      vi.mocked(clientService.getClientById).mockResolvedValue(value);

      const ctx = await executeRoute(
        'POST',
        '/api/admin/clients/:id/secrets/:secretId/revoke',
        ['admin:client:revoke'],
        {
          params: {
            id: CLIENT_ID,
            secretId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          },
        },
      );

      expect(ctx.status).toBe(404);
      expect(secretService.revoke).not.toHaveBeenCalled();
    },
  );
});
