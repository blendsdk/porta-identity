import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client, ClientSecret, SecretWithPlaintext, ClientWithSecret } from '../../../src/clients/types.js';
import type { Organization } from '../../../src/organizations/types.js';
import { ClientNotFoundError, ClientValidationError } from '../../../src/clients/errors.js';

// Mock all dependencies before importing the module under test
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

// The client routes resolve `effectiveLoginMethods` by calling the
// organization service — we mock that here so the helper works end-to-end.
vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

// Mock ETag helpers (route tests don't exercise HTTP headers)
vi.mock('../../../src/lib/etag.js', () => ({
  setETagHeader: vi.fn(),
  checkIfMatch: vi.fn().mockReturnValue(true),
}));

import * as clientService from '../../../src/clients/service.js';
import * as secretService from '../../../src/clients/secret-service.js';
import * as organizationService from '../../../src/organizations/service.js';
import { createClientRouter } from '../../../src/routes/clients.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Standard test client */
function createTestClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-db-uuid-1',
    organizationId: 'org-uuid-1',
    applicationId: 'app-uuid-1',
    clientId: 'porta_abc123def456',
    clientName: 'Test Web App',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://example.com/callback'],
    postLogoutRedirectUris: ['https://example.com'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: ['https://example.com'],
    requirePkce: true,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Standard test organization used as the parent of the test client — only
 * the fields read by `resolveLoginMethods()` really matter, but we keep the
 * shape complete so the mock satisfies the full `Organization` type.
 */
function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard test secret (metadata only) */
function createTestSecret(overrides: Partial<ClientSecret> = {}): ClientSecret {
  return {
    id: 'secret-uuid-1',
    clientId: 'client-db-uuid-1',
    label: 'production',
    expiresAt: null,
    status: 'active',
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Secret with plaintext (returned at generation) */
function createTestSecretWithPlaintext(overrides: Partial<SecretWithPlaintext> = {}): SecretWithPlaintext {
  return {
    id: 'secret-uuid-1',
    clientId: 'client-db-uuid-1',
    label: 'production',
    plaintext: 'porta_secret_abc123def456ghi789',
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a minimal mock Koa context for route testing.
 * Follows the same pattern as the organization/application route tests.
 */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  const ctx = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: { organization: { isSuperAdmin: true } },
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
  return ctx;
}

/**
 * Helper to find a route handler by method and path.
 * Extracts the last middleware in the stack (the actual handler),
 * skipping any router-level middleware (like requireSuperAdmin).
 */
function findHandler(router: ReturnType<typeof createClientRouter>, method: string, path: string) {
  const layer = router.stack.find(
    (l) => l.methods.includes(method) && l.path === path,
  );
  expect(layer).toBeDefined();
  return layer!.stack[layer!.stack.length - 1];
}

describe('client routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: every call to getOrganizationById returns a fully-featured org
    // so the `effectiveLoginMethods` decorator always has something to
    // resolve against. Individual tests override as needed.
    (organizationService.getOrganizationById as ReturnType<typeof vi.fn>)
      .mockResolvedValue(createTestOrg());
  });

  // -------------------------------------------------------------------------
  // POST / — Create client
  // -------------------------------------------------------------------------

  describe('POST / — Create client', () => {
    const validBody = {
      organizationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      applicationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      clientName: 'Test Web App',
      clientType: 'confidential' as const,
      applicationType: 'web' as const,
      redirectUris: ['https://example.com/callback'],
    };

    it('should return 201 with client and secret for confidential client', async () => {
      const client = createTestClient();
      const secret = createTestSecretWithPlaintext();
      const createResult: ClientWithSecret = { client, secret: null };

      (clientService.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(createResult);
      (secretService.generateAndStore as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients');
      const ctx = createMockCtx({ body: validBody });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
      const body = ctx.body as {
        data: { client: Client & { effectiveLoginMethods: readonly string[] }; secret: SecretWithPlaintext };
        warning: string;
      };
      // Client body contains all original fields + decorator
      expect(body.data.client).toMatchObject(client);
      expect(body.data.client.effectiveLoginMethods).toEqual(['password', 'magic_link']);
      expect(body.data.secret).toEqual(secret);
      expect(body.warning).toBe('Store the secret securely. It will not be shown again.');
    });

    it('should return 201 without secret for public client', async () => {
      const client = createTestClient({ clientType: 'public' });
      const createResult: ClientWithSecret = { client, secret: null };

      (clientService.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(createResult);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients');
      const ctx = createMockCtx({
        body: { ...validBody, clientType: 'public' },
      });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
      const body = ctx.body as {
        data: { client: Client & { effectiveLoginMethods: readonly string[] }; secret: null };
        warning?: string;
      };
      expect(body.data.client).toMatchObject(client);
      expect(body.data.client.effectiveLoginMethods).toEqual(['password', 'magic_link']);
      expect(body.data.secret).toBeNull();
      // No warning for public clients (no secret)
      expect(body.warning).toBeUndefined();
      // Secret service should NOT be called for public clients
      expect(secretService.generateAndStore).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid input (missing required fields)', async () => {
      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients');
      const ctx = createMockCtx({ body: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 when organization is invalid', async () => {
      (clientService.createClient as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ClientValidationError('Organization not found'));

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients');
      const ctx = createMockCtx({ body: validBody });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Organization not found');
    });

    // -----------------------------------------------------------------------
    // loginMethods — Zod validation + three-state semantics
    // -----------------------------------------------------------------------
    describe('loginMethods', () => {
      it('should accept loginMethods: null (inherit) and pass it to the service', async () => {
        const client = createTestClient({ loginMethods: null });
        const createResult: ClientWithSecret = { client, secret: null };
        (clientService.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(createResult);

        const router = createClientRouter();
        const handler = findHandler(router, 'POST', '/api/admin/clients');
        const ctx = createMockCtx({
          body: { ...validBody, clientType: 'public', loginMethods: null },
        });

        await handler(ctx as never, vi.fn());

        expect(ctx.status).toBe(201);
        expect(clientService.createClient).toHaveBeenCalledWith(
          expect.objectContaining({ loginMethods: null }),
        );
      });

      it('should accept a valid array override', async () => {
        const client = createTestClient({ loginMethods: ['password'] });
        const createResult: ClientWithSecret = { client, secret: null };
        (clientService.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(createResult);

        const router = createClientRouter();
        const handler = findHandler(router, 'POST', '/api/admin/clients');
        const ctx = createMockCtx({
          body: { ...validBody, clientType: 'public', loginMethods: ['password'] },
        });

        await handler(ctx as never, vi.fn());

        expect(ctx.status).toBe(201);
        expect(clientService.createClient).toHaveBeenCalledWith(
          expect.objectContaining({ loginMethods: ['password'] }),
        );
        const body = ctx.body as { data: { client: Client & { effectiveLoginMethods: readonly string[] } } };
        // With explicit override, the effective value reflects the override
        expect(body.data.client.effectiveLoginMethods).toEqual(['password']);
      });

      it('should return 400 for an empty loginMethods array', async () => {
        const router = createClientRouter();
        const handler = findHandler(router, 'POST', '/api/admin/clients');
        const ctx = createMockCtx({
          body: { ...validBody, loginMethods: [] },
        });

        await handler(ctx as never, vi.fn());

        expect(ctx.status).toBe(400);
        expect((ctx.body as { error: string }).error).toBe('Validation failed');
        expect(clientService.createClient).not.toHaveBeenCalled();
      });

      it('should return 400 for an unknown login method', async () => {
        const router = createClientRouter();
        const handler = findHandler(router, 'POST', '/api/admin/clients');
        const ctx = createMockCtx({
          body: { ...validBody, loginMethods: ['sms'] },
        });

        await handler(ctx as never, vi.fn());

        expect(ctx.status).toBe(400);
        expect((ctx.body as { error: string }).error).toBe('Validation failed');
        expect(clientService.createClient).not.toHaveBeenCalled();
      });

      it('should omit loginMethods when not provided', async () => {
        const client = createTestClient();
        const createResult: ClientWithSecret = { client, secret: null };
        (clientService.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(createResult);

        const router = createClientRouter();
        const handler = findHandler(router, 'POST', '/api/admin/clients');
        const ctx = createMockCtx({ body: { ...validBody, clientType: 'public' } });

        await handler(ctx as never, vi.fn());

        expect(ctx.status).toBe(201);
        const calledWith = (clientService.createClient as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(calledWith.loginMethods).toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List clients
  // -------------------------------------------------------------------------

  describe('GET / — List clients', () => {
    it('should return paginated list with defaults', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (clientService.listClientsByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients');
      const ctx = createMockCtx({ query: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual(result);
      expect(clientService.listClientsByOrganization).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get client by ID
  // -------------------------------------------------------------------------

  describe('GET /:id — Get client by ID', () => {
    it('should return client with effectiveLoginMethods when found', async () => {
      const client = createTestClient();
      (clientService.getClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients/:id');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data).toMatchObject(client);
      // loginMethods=null + org default [password, magic_link] → effective inherits
      expect(body.data.effectiveLoginMethods).toEqual(['password', 'magic_link']);
    });

    it('should return effectiveLoginMethods reflecting a client override', async () => {
      const client = createTestClient({ loginMethods: ['magic_link'] });
      (clientService.getClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients/:id');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data.loginMethods).toEqual(['magic_link']);
      expect(body.data.effectiveLoginMethods).toEqual(['magic_link']);
    });

    it('should return effectiveLoginMethods using the org default when client has no override', async () => {
      // Org with password-only default
      (organizationService.getOrganizationById as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createTestOrg({ defaultLoginMethods: ['password'] }));

      const client = createTestClient({ loginMethods: null });
      (clientService.getClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients/:id');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data.loginMethods).toBeNull();
      expect(body.data.effectiveLoginMethods).toEqual(['password']);
    });

    it('should throw 404 when not found', async () => {
      (clientService.getClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients/:id');
      const ctx = createMockCtx({ params: { id: 'nonexistent' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Client not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update client
  // -------------------------------------------------------------------------

  describe('PUT /:id — Update client', () => {
    it('should return updated client with effectiveLoginMethods', async () => {
      const client = createTestClient({ clientName: 'Updated' });
      (clientService.updateClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/clients/:id');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1' },
        body: { clientName: 'Updated' },
      });

      await handler(ctx as never, vi.fn());

      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data).toMatchObject(client);
      expect(body.data.effectiveLoginMethods).toEqual(['password', 'magic_link']);
    });

    it('should throw 404 when client not found', async () => {
      (clientService.updateClient as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ClientNotFoundError('nonexistent'));

      const router = createClientRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/clients/:id');
      const ctx = createMockCtx({
        params: { id: 'nonexistent' },
        body: { clientName: 'Test' },
      });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Client not found');
    });

    it('should accept loginMethods: null to reset to inherit', async () => {
      const client = createTestClient({ loginMethods: null });
      (clientService.updateClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/clients/:id');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1' },
        body: { loginMethods: null },
      });

      await handler(ctx as never, vi.fn());

      expect(clientService.updateClient).toHaveBeenCalledWith(
        'client-db-uuid-1',
        expect.objectContaining({ loginMethods: null }),
      );
      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data.effectiveLoginMethods).toEqual(['password', 'magic_link']);
    });

    it('should accept a loginMethods array override', async () => {
      const client = createTestClient({ loginMethods: ['magic_link'] });
      (clientService.updateClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const router = createClientRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/clients/:id');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1' },
        body: { loginMethods: ['magic_link'] },
      });

      await handler(ctx as never, vi.fn());

      const body = ctx.body as { data: Client & { effectiveLoginMethods: readonly string[] } };
      expect(body.data.effectiveLoginMethods).toEqual(['magic_link']);
    });

    it('should return 400 when update payload has empty loginMethods', async () => {
      const router = createClientRouter();
      const handler = findHandler(router, 'PUT', '/api/admin/clients/:id');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1' },
        body: { loginMethods: [] },
      });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
      expect(clientService.updateClient).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Status actions
  // -------------------------------------------------------------------------

  describe('POST /:id/revoke', () => {
    it('should return 204 on success', async () => {
      (clientService.revokeClient as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/revoke');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });

    it('should throw 400 when already revoked', async () => {
      (clientService.revokeClient as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ClientValidationError('Client is already revoked'));

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/revoke');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Client is already revoked');
    });
  });

  describe('POST /:id/activate', () => {
    it('should return 204 on success', async () => {
      (clientService.activateClient as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/activate');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });
  });

  describe('POST /:id/deactivate', () => {
    it('should return 204 on success', async () => {
      (clientService.deactivateClient as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/deactivate');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Secret routes
  // -------------------------------------------------------------------------

  describe('POST /:id/secrets — Generate secret', () => {
    it('should return 201 with secret and warning', async () => {
      const secret = createTestSecretWithPlaintext();
      (secretService.generateAndStore as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/secrets');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1' },
        body: { label: 'production' },
      });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
      const body = ctx.body as { data: SecretWithPlaintext; warning: string };
      expect(body.data).toEqual(secret);
      expect(body.warning).toBe('Store the secret securely. It will not be shown again.');
      expect(secretService.generateAndStore).toHaveBeenCalledWith('client-db-uuid-1', { label: 'production' });
    });

    it('should accept empty body for secret generation', async () => {
      const secret = createTestSecretWithPlaintext({ label: null });
      (secretService.generateAndStore as ReturnType<typeof vi.fn>).mockResolvedValue(secret);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/secrets');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' }, body: {} });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(201);
    });
  });

  describe('GET /:id/secrets — List secrets', () => {
    it('should return secrets array without hashes', async () => {
      const secrets = [createTestSecret()];
      (secretService.listByClient as ReturnType<typeof vi.fn>).mockResolvedValue(secrets);

      const router = createClientRouter();
      const handler = findHandler(router, 'GET', '/api/admin/clients/:id/secrets');
      const ctx = createMockCtx({ params: { id: 'client-db-uuid-1' } });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: secrets });
      // Verify no secret_hash in response
      const data = (ctx.body as { data: ClientSecret[] }).data;
      data.forEach((s) => {
        expect(s).not.toHaveProperty('secretHash');
        expect(s).not.toHaveProperty('secret_hash');
      });
    });
  });

  describe('POST /:id/secrets/:secretId/revoke — Revoke secret', () => {
    it('should return 204 on success', async () => {
      (secretService.revoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/secrets/:secretId/revoke');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1', secretId: 'secret-uuid-1' },
      });

      await handler(ctx as never, vi.fn());

      expect(ctx.status).toBe(204);
      // Verify secretId is used (not the client id)
      expect(secretService.revoke).toHaveBeenCalledWith('secret-uuid-1');
    });

    it('should throw 400 when secret already revoked', async () => {
      (secretService.revoke as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new ClientValidationError('Secret is already revoked'));

      const router = createClientRouter();
      const handler = findHandler(router, 'POST', '/api/admin/clients/:id/secrets/:secretId/revoke');
      const ctx = createMockCtx({
        params: { id: 'client-db-uuid-1', secretId: 'secret-uuid-1' },
      });

      await expect(handler(ctx as never, vi.fn())).rejects.toThrow('Secret is already revoked');
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createClientRouter();
      expect(router.opts.prefix).toBe('/api/admin/clients');
    });

    it('should register all expected routes', () => {
      const router = createClientRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain('POST /api/admin/clients');
      expect(paths).toContain('GET /api/admin/clients');
      expect(paths).toContain('GET /api/admin/clients/:id');
      expect(paths).toContain('PUT /api/admin/clients/:id');
      expect(paths).toContain('POST /api/admin/clients/:id/revoke');
      expect(paths).toContain('POST /api/admin/clients/:id/activate');
      expect(paths).toContain('POST /api/admin/clients/:id/deactivate');
      expect(paths).toContain('POST /api/admin/clients/:id/secrets');
      expect(paths).toContain('GET /api/admin/clients/:id/secrets');
      expect(paths).toContain('POST /api/admin/clients/:id/secrets/:secretId/revoke');
    });
  });
});
