/**
 * Client `requireConsent` contract specification.
 *
 * DEF-21 makes OIDC consent trust-driven: an administrator can mark a client as
 * `requireConsent`, after which that client always shows the consent page unless
 * every requested scope has already been granted. These are immutable oracles
 * for the administrative contract:
 *
 *   - `POST /api/admin/clients` accepts and forwards `requireConsent`.
 *   - `PUT  /api/admin/clients/:id` accepts and forwards `requireConsent`.
 *   - `GET` and list responses return the persisted `requireConsent` value.
 *
 * The flag is a plain boolean on the client and never crosses organization
 * boundaries. These tests exercise the route in isolation with the service layer
 * mocked, so they describe the wire contract rather than persistence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/clients/types.js';

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
  deleteClient: vi.fn(),
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
import { createClientRouter } from '../../../src/routes/clients.js';

const ORGANIZATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APPLICATION_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CLIENT_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

/** Build a complete client fixture with safe defaults. */
function client(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    organizationId: ORGANIZATION_ID,
    applicationId: APPLICATION_ID,
    clientId: 'porta_spec_require_consent',
    clientName: 'Require-consent specification client',
    clientType: 'public',
    applicationType: 'spa',
    redirectUris: ['https://client.example.test/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'none',
    allowedOrigins: [],
    requirePkce: true,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Return a client fixture that already carries the persisted consent flag.
 *
 * `Object.assign` models a service-layer row that includes the new column
 * without naming a not-yet-existing field on the shared `Client` type.
 */
function clientWithRequireConsent(requireConsent: boolean, overrides: Partial<Client> = {}) {
  return Object.assign(client(overrides), { requireConsent });
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

  const ctx: Record<string, unknown> = {
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
  clientName: 'Require-consent specification client',
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: ['https://client.example.test/callback'],
  grantTypes: ['authorization_code'],
  tokenEndpointAuthMethod: 'none',
  requirePkce: true,
};

describe('client requireConsent administrative specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientService.createClient).mockResolvedValue({
      client: clientWithRequireConsent(false),
      secret: null,
    });
    vi.mocked(clientService.getClientById).mockResolvedValue(clientWithRequireConsent(false));
    vi.mocked(clientService.updateClient).mockResolvedValue(clientWithRequireConsent(false));
  });

  it('forwards an explicit requireConsent=true on create', async () => {
    vi.mocked(clientService.createClient).mockResolvedValue({
      client: clientWithRequireConsent(true),
      secret: null,
    });

    const ctx = await executeRoute(
      'POST',
      '/api/admin/clients',
      ['admin:client:create', 'admin:app:read'],
      { body: { ...validCreateBody, requireConsent: true } },
    );

    expect(clientService.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ requireConsent: true }),
    );
    expect(ctx.body).toMatchObject({ data: { client: { requireConsent: true } } });
  });

  it('forwards an explicit requireConsent=false on create', async () => {
    const ctx = await executeRoute(
      'POST',
      '/api/admin/clients',
      ['admin:client:create', 'admin:app:read'],
      { body: { ...validCreateBody, requireConsent: false } },
    );

    expect(clientService.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ requireConsent: false }),
    );
    expect(ctx.body).toMatchObject({ data: { client: { requireConsent: false } } });
  });

  it('forwards requireConsent on update', async () => {
    vi.mocked(clientService.updateClient).mockResolvedValue(clientWithRequireConsent(true));

    const ctx = await executeRoute('PUT', '/api/admin/clients/:id', ['admin:client:update'], {
      params: { id: CLIENT_ID },
      body: { requireConsent: true },
    });

    expect(clientService.updateClient).toHaveBeenCalledWith(
      CLIENT_ID,
      expect.objectContaining({ requireConsent: true }),
    );
    expect(ctx.body).toMatchObject({ data: { requireConsent: true } });
  });

  it('returns requireConsent from a single-client response', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue(clientWithRequireConsent(true));

    const ctx = await executeRoute('GET', '/api/admin/clients/:id', ['admin:client:read'], {
      params: { id: CLIENT_ID },
    });

    expect(ctx.body).toMatchObject({ data: { requireConsent: true } });
  });

  it('returns requireConsent from a paginated list response', async () => {
    vi.mocked(clientService.listClientsByOrganization).mockResolvedValue({
      data: [clientWithRequireConsent(true)],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const ctx = await executeRoute('GET', '/api/admin/clients', ['admin:client:read'], {});

    expect(ctx.body).toMatchObject({ data: [{ requireConsent: true }] });
  });
});
