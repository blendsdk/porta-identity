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
import * as secretService from '../../../src/clients/secret-service.js';
import { createClientRouter } from '../../../src/routes/clients.js';

const ORGANIZATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APPLICATION_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CLIENT_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

/** Build the confidential client returned by the mocked persistence service. */
function client(): Client {
  return {
    id: CLIENT_ID,
    organizationId: ORGANIZATION_ID,
    applicationId: APPLICATION_ID,
    clientId: 'porta_expiry_impl',
    clientName: 'Expiry implementation client',
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
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

/** Build a one-time secret result for a successful route mutation. */
function secret(expiresAt: Date | null, label: string | null): SecretWithPlaintext {
  return {
    id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    clientId: CLIENT_ID,
    label,
    plaintext: 'porta_secret_one_time_value',
    expiresAt,
    createdAt: new Date('2026-09-08T10:00:00.000Z'),
  };
}

/** Create the minimal mutable Koa context needed by one client route handler. */
function context(body: object, params: Record<string, string> = {}) {
  return {
    params,
    query: {},
    request: { body },
    state: { organization: { isSuperAdmin: true } },
    status: 200,
    body: undefined,
    throw(status: number, message: string): never {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };
}

/** Resolve the final business handler registered for one administrative route. */
function routeHandler(method: string, path: string) {
  const layer = createClientRouter().stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path === path,
  );
  expect(layer).toBeDefined();
  return layer!.stack[layer!.stack.length - 1]!;
}

const createBody = {
  organizationId: ORGANIZATION_ID,
  applicationId: APPLICATION_ID,
  clientName: 'Expiry implementation client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://client.example.test/callback'],
};

describe('client secret expiry route implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientService.createClient).mockResolvedValue({ client: client(), secret: null });
    vi.mocked(clientService.getClientById).mockResolvedValue(client());
  });

  it('normalizes an explicit ISO offset and strips secret fields from client persistence', async () => {
    const expiresAt = '2027-03-31T02:30:00+02:30';
    vi.mocked(secretService.generateAndStore).mockResolvedValue(
      secret(new Date('2027-03-31T00:00:00.000Z'), ''),
    );
    const ctx = context({ ...createBody, secretLabel: '', secretExpiresAt: expiresAt });

    await Reflect.apply(routeHandler('POST', '/api/admin/clients'), undefined, [ctx, vi.fn()]);

    expect(clientService.createClient).toHaveBeenCalledWith(createBody);
    expect(secretService.generateAndStore).toHaveBeenCalledWith(CLIENT_ID, {
      label: '',
      expiresAt: new Date('2027-03-31T00:00:00.000Z'),
    });
  });

  it('accepts the maximum-length control-free label for secret rotation', async () => {
    const label = 'a'.repeat(255);
    vi.mocked(secretService.generateAndStore).mockResolvedValue(secret(null, label));
    const ctx = context({ label }, { id: CLIENT_ID });

    await Reflect.apply(routeHandler('POST', '/api/admin/clients/:id/secrets'), undefined, [
      ctx,
      vi.fn(),
    ]);

    expect(secretService.generateAndStore).toHaveBeenCalledWith(CLIENT_ID, { label });
  });
});
