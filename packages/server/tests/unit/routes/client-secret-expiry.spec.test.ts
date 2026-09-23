import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const SECRET_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const REQUEST_TIME = new Date('2026-09-08T10:00:00.000Z');
const FUTURE_EXPIRY = '2027-03-31T00:00:00.000Z';

/** Build a confidential client returned by the mocked client service. */
function confidentialClient(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    organizationId: ORGANIZATION_ID,
    applicationId: APPLICATION_ID,
    clientId: 'porta_expiry_spec',
    clientName: 'Expiry specification client',
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
    ...overrides,
  };
}

/** Build the one-time secret shape returned only by a successful mutation. */
function generatedSecret(overrides: Partial<SecretWithPlaintext> = {}): SecretWithPlaintext {
  return {
    id: SECRET_ID,
    clientId: CLIENT_ID,
    label: 'initial',
    plaintext: 'porta_secret_one_time_value',
    expiresAt: null,
    createdAt: REQUEST_TIME,
    ...overrides,
  };
}

/** Create a minimal Koa context for one directly invoked route handler. */
function routeContext(options: {
  readonly body?: object;
  readonly params?: Record<string, string>;
}) {
  return {
    params: options.params ?? {},
    query: {},
    request: { body: options.body ?? {} },
    state: { organization: { isSuperAdmin: true } },
    status: 200,
    body: undefined,
    throw(status: number, message: string): never {
      this.status = status;
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };
}

/** Invoke the final handler registered for an administrative client route. */
async function invokeRoute(
  method: string,
  path: string,
  options: { readonly body?: object; readonly params?: Record<string, string> },
) {
  const router = createClientRouter();
  const layer = router.stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path === path,
  );
  expect(layer).toBeDefined();

  const handler = layer!.stack[layer!.stack.length - 1];
  const context = routeContext(options);
  try {
    await Reflect.apply(handler!, undefined, [context, vi.fn()]);
  } catch {
    // Invalid requests are observed through the sanitized status and message on the context.
  }
  return context;
}

const validCreateBody = {
  organizationId: ORGANIZATION_ID,
  applicationId: APPLICATION_ID,
  clientName: 'Expiry specification client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://client.example.test/callback'],
};

describe('client secret expiry and label specification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REQUEST_TIME);
    vi.clearAllMocks();
    vi.mocked(clientService.createClient).mockResolvedValue({
      client: confidentialClient(),
      secret: null,
    });
    vi.mocked(clientService.getClientById).mockResolvedValue(confidentialClient());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the exact future expiry and one-time plaintext for confidential creation', async () => {
    const secret = generatedSecret({ expiresAt: new Date(FUTURE_EXPIRY) });
    vi.mocked(secretService.generateAndStore).mockResolvedValue(secret);

    const context = await invokeRoute('POST', '/api/admin/clients', {
      body: {
        ...validCreateBody,
        secretLabel: 'initial',
        secretExpiresAt: FUTURE_EXPIRY,
      },
    });

    expect(context.status).toBe(201);
    expect(context.body).toMatchObject({
      data: { secret },
      warning: 'Store the secret securely. It will not be shown again.',
    });
    expect(secretService.generateAndStore).toHaveBeenCalledWith(CLIENT_ID, {
      label: 'initial',
      expiresAt: new Date(FUTURE_EXPIRY),
    });
    const serviceInput = vi.mocked(clientService.createClient).mock.calls[0]?.[0];
    expect(serviceInput).not.toHaveProperty('secretLabel');
    expect(serviceInput).not.toHaveProperty('secretExpiresAt');
  });

  it('should create an initial secret with no expiry when expiry is omitted', async () => {
    const secret = generatedSecret({ expiresAt: null });
    vi.mocked(secretService.generateAndStore).mockResolvedValue(secret);

    const context = await invokeRoute('POST', '/api/admin/clients', {
      body: { ...validCreateBody, secretLabel: 'initial' },
    });

    expect(context.status).toBe(201);
    expect(context.body).toMatchObject({ data: { secret: { expiresAt: null } } });
    expect(secretService.generateAndStore).toHaveBeenCalledWith(CLIENT_ID, {
      label: 'initial',
    });
  });

  it('should create no secret for a public client even when valid secret fields are included', async () => {
    const publicClient = confidentialClient({
      clientType: 'public',
      applicationType: 'spa',
      tokenEndpointAuthMethod: 'none',
    });
    vi.mocked(clientService.createClient).mockResolvedValue({ client: publicClient, secret: null });

    const context = await invokeRoute('POST', '/api/admin/clients', {
      body: {
        ...validCreateBody,
        clientType: 'public',
        applicationType: 'spa',
        tokenEndpointAuthMethod: 'none',
        secretLabel: 'unused but valid',
        secretExpiresAt: FUTURE_EXPIRY,
      },
    });

    expect(context.status).toBe(201);
    expect(context.body).toMatchObject({ data: { secret: null } });
    expect(secretService.generateAndStore).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable expiry', 'secretExpiresAt', 'not-a-date'],
    ['date-only expiry', 'secretExpiresAt', '2027-03-31'],
    ['datetime without timezone', 'secretExpiresAt', '2027-03-31T00:00:00'],
    ['C0 label', 'secretLabel', 'initial\u0000secret'],
    ['DEL label', 'secretLabel', 'initial\u007fsecret'],
    ['C1 label', 'secretLabel', 'initial\u0085secret'],
    ['overlong label', 'secretLabel', 'a'.repeat(256)],
  ])('should reject invalid initial secret input: %s', async (_case, field, value) => {
    const context = await invokeRoute('POST', '/api/admin/clients', {
      body: { ...validCreateBody, [field]: value },
    });

    expect(context.status).toBe(400);
    expect(context.body).toEqual({ error: 'Client request is invalid' });
    expect(clientService.createClient).not.toHaveBeenCalled();
    expect(secretService.generateAndStore).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable expiry', 'expiresAt', 'not-a-date'],
    ['date-only expiry', 'expiresAt', '2027-03-31'],
    ['datetime without timezone', 'expiresAt', '2027-03-31T00:00:00'],
    ['C0 label', 'label', 'rotation\u0000secret'],
    ['DEL label', 'label', 'rotation\u007fsecret'],
    ['C1 label', 'label', 'rotation\u0085secret'],
    ['overlong label', 'label', 'a'.repeat(256)],
  ])('should reject invalid rotated secret input: %s', async (_case, field, value) => {
    const context = await invokeRoute('POST', '/api/admin/clients/:id/secrets', {
      params: { id: CLIENT_ID },
      body: { [field]: value },
    });

    expect(context.status).toBe(400);
    expect(context.body).toEqual({ error: 'Client request is invalid' });
    expect(secretService.generateAndStore).not.toHaveBeenCalled();
  });

  it.each([
    ['equal to request time', REQUEST_TIME.toISOString()],
    ['before request time', '2026-09-08T09:59:59.999Z'],
  ])(
    'should reject initial expiry %s without creating a client or secret',
    async (_case, expiresAt) => {
      const context = await invokeRoute('POST', '/api/admin/clients', {
        body: { ...validCreateBody, secretExpiresAt: expiresAt },
      });

      expect(context.status).toBe(400);
      expect(context.body).toEqual({ error: 'Client request is invalid' });
      expect(clientService.createClient).not.toHaveBeenCalled();
      expect(secretService.generateAndStore).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['equal to request time', REQUEST_TIME.toISOString()],
    ['before request time', '2026-09-08T09:59:59.999Z'],
  ])('should reject rotated expiry %s without creating a secret', async (_case, expiresAt) => {
    const context = await invokeRoute('POST', '/api/admin/clients/:id/secrets', {
      params: { id: CLIENT_ID },
      body: { expiresAt },
    });

    expect(context.status).toBe(400);
    expect(context.body).toEqual({ error: 'Client request is invalid' });
    expect(secretService.generateAndStore).not.toHaveBeenCalled();
  });

  it('should return null expiry once and keep later secret metadata free of plaintext', async () => {
    const secret = generatedSecret({ label: 'rotation', expiresAt: null });
    vi.mocked(secretService.generateAndStore).mockResolvedValue(secret);
    vi.mocked(secretService.listByClient).mockResolvedValue([
      {
        id: SECRET_ID,
        clientId: CLIENT_ID,
        label: 'rotation',
        status: 'active',
        lastUsedAt: null,
        expiresAt: null,
        createdAt: REQUEST_TIME,
      },
    ]);

    const created = await invokeRoute('POST', '/api/admin/clients/:id/secrets', {
      params: { id: CLIENT_ID },
      body: { label: 'rotation' },
    });
    const listed = await invokeRoute('GET', '/api/admin/clients/:id/secrets', {
      params: { id: CLIENT_ID },
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ data: { plaintext: secret.plaintext, expiresAt: null } });
    expect(listed.body).toEqual({
      data: [expect.not.objectContaining({ plaintext: expect.anything() })],
    });
    expect(listed.body).toMatchObject({ data: [{ expiresAt: null }] });
  });
});
