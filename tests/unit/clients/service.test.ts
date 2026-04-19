import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client, CreateClientInput } from '../../../src/clients/types.js';

// Mock all dependencies the service uses
vi.mock('../../../src/clients/repository.js', () => ({
  insertClient: vi.fn(),
  findClientById: vi.fn(),
  findClientByClientId: vi.fn(),
  updateClient: vi.fn(),
  listClients: vi.fn(),
}));

vi.mock('../../../src/clients/cache.js', () => ({
  getCachedClientByClientId: vi.fn(),
  getCachedClientById: vi.fn(),
  cacheClient: vi.fn(),
  invalidateClientCache: vi.fn(),
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  generateClientId: vi.fn().mockReturnValue('generated-client-id-abc123'),
}));

vi.mock('../../../src/clients/validators.js', () => ({
  validateRedirectUris: vi.fn().mockReturnValue({ isValid: true }),
  getDefaultGrantTypes: vi.fn().mockReturnValue(['authorization_code', 'refresh_token']),
  getDefaultTokenEndpointAuthMethod: vi.fn().mockReturnValue('client_secret_basic'),
  getDefaultResponseTypes: vi.fn().mockReturnValue(['code']),
  getDefaultScope: vi.fn().mockReturnValue('openid profile email'),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationById: vi.fn(),
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: vi.fn(),
}));

vi.mock('../../../src/clients/secret-service.js', () => ({
  verify: vi.fn(),
}));

vi.mock('../../../src/clients/secret-repository.js', () => ({
  getLatestActiveSha256: vi.fn().mockResolvedValue(null),
}));

import {
  insertClient,
  findClientById,
  findClientByClientId,
  updateClient as repoUpdateClient,
  listClients as repoListClients,
} from '../../../src/clients/repository.js';
import {
  getCachedClientByClientId,
  getCachedClientById,
  cacheClient,
  invalidateClientCache,
} from '../../../src/clients/cache.js';
import { generateClientId } from '../../../src/clients/crypto.js';
import { validateRedirectUris } from '../../../src/clients/validators.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { getApplicationById } from '../../../src/applications/service.js';
import { getOrganizationById } from '../../../src/organizations/service.js';
import { verify } from '../../../src/clients/secret-service.js';
import {
  createClient,
  getClientById,
  getClientByClientId,
  updateClient,
  listClientsByOrganization,
  listClientsByApplication,
  deactivateClient,
  activateClient,
  revokeClient,
  findForOidc,
  verifyClientSecret,
} from '../../../src/clients/service.js';
import { ClientNotFoundError, ClientValidationError } from '../../../src/clients/errors.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Standard test client */
function createTestClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-db-uuid-1',
    organizationId: 'org-uuid-1',
    applicationId: 'app-uuid-1',
    clientId: 'generated-client-id-abc123',
    clientName: 'My Web App',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://example.com/callback'],
    postLogoutRedirectUris: ['https://example.com/logout'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: ['https://example.com'],
    requirePkce: true,
    // Default to null = inherit org default. Service-level tests that
    // target login-method validation pass an explicit override via overrides.
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}


/** Standard create input */
function createTestInput(overrides: Partial<CreateClientInput> = {}): CreateClientInput {
  return {
    organizationId: 'org-uuid-1',
    applicationId: 'app-uuid-1',
    clientName: 'My Web App',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://example.com/callback'],
    ...overrides,
  };
}

/** Mock organization (active) */
const activeOrg = { id: 'org-uuid-1', status: 'active', name: 'Test Org' };

/** Mock application (active) */
const activeApp = { id: 'app-uuid-1', status: 'active', name: 'Test App', slug: 'test-app' };

describe('client service', () => {
  beforeEach(() => vi.clearAllMocks());

  // =========================================================================
  // createClient
  // =========================================================================

  describe('createClient', () => {
    it('should create a client with all defaults applied', async () => {
      const client = createTestClient();
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeApp);
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await createClient(createTestInput(), 'actor-1');

      expect(result.client).toEqual(client);
      expect(result.secret).toBeNull();
      expect(generateClientId).toHaveBeenCalled();
      expect(insertClient).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-uuid-1',
          applicationId: 'app-uuid-1',
          clientId: 'generated-client-id-abc123',
          clientName: 'My Web App',
        }),
      );
      expect(cacheClient).toHaveBeenCalledWith(client);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'client.created' }),
      );
    });

    it('should throw when organization not found', async () => {
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(createClient(createTestInput())).rejects.toThrow(ClientValidationError);
      await expect(createClient(createTestInput())).rejects.toThrow('Organization not found');
    });

    it('should throw when organization is not active', async () => {
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeOrg,
        status: 'suspended',
      });

      await expect(createClient(createTestInput())).rejects.toThrow('Organization is not active');
    });

    it('should throw when application not found', async () => {
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(createClient(createTestInput())).rejects.toThrow('Application not found');
    });

    it('should throw when application is not active', async () => {
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeApp,
        status: 'inactive',
      });

      await expect(createClient(createTestInput())).rejects.toThrow('Application is not active');
    });

    it('should throw when redirect URIs are invalid', async () => {
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeApp);
      (validateRedirectUris as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errors: ['Invalid URI: bad-uri'],
      });

      await expect(createClient(createTestInput())).rejects.toThrow('Invalid redirect URIs');
    });

    it('should use provided grant types instead of defaults', async () => {
      const client = createTestClient({
        grantTypes: ['authorization_code'],
      });
      (validateRedirectUris as ReturnType<typeof vi.fn>).mockReturnValue({ isValid: true });
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeApp);
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await createClient(createTestInput({ grantTypes: ['authorization_code'] }));

      expect(insertClient).toHaveBeenCalledWith(
        expect.objectContaining({ grantTypes: ['authorization_code'] }),
      );
    });

    it('should apply empty arrays for optional array fields', async () => {
      const client = createTestClient();
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeApp);
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await createClient(createTestInput());

      // postLogoutRedirectUris and allowedOrigins default to empty arrays
      expect(insertClient).toHaveBeenCalledWith(
        expect.objectContaining({
          postLogoutRedirectUris: [],
          allowedOrigins: [],
        }),
      );
    });
  });

  // =========================================================================
  // getClientById
  // =========================================================================

  describe('getClientById', () => {
    it('should return cached client on cache hit', async () => {
      const client = createTestClient();
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await getClientById('client-db-uuid-1');

      expect(result).toEqual(client);
      expect(findClientById).not.toHaveBeenCalled();
    });

    it('should fall back to DB on cache miss and re-cache', async () => {
      const client = createTestClient();
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await getClientById('client-db-uuid-1');

      expect(result).toEqual(client);
      expect(cacheClient).toHaveBeenCalledWith(client);
    });

    it('should return null when not in cache and not in DB', async () => {
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getClientById('nonexistent');

      expect(result).toBeNull();
      expect(cacheClient).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getClientByClientId
  // =========================================================================

  describe('getClientByClientId', () => {
    it('should return cached client on cache hit', async () => {
      const client = createTestClient();
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await getClientByClientId('generated-client-id-abc123');

      expect(result).toEqual(client);
      expect(findClientByClientId).not.toHaveBeenCalled();
    });

    it('should fall back to DB on cache miss and re-cache', async () => {
      const client = createTestClient();
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await getClientByClientId('generated-client-id-abc123');

      expect(result).toEqual(client);
      expect(cacheClient).toHaveBeenCalledWith(client);
    });

    it('should return null when not found', async () => {
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getClientByClientId('nonexistent');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // updateClient
  // =========================================================================

  describe('updateClient', () => {
    it('should update and invalidate+re-cache', async () => {
      const updated = createTestClient({ clientName: 'Renamed App' });
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const result = await updateClient('client-db-uuid-1', { clientName: 'Renamed App' }, 'actor-1');

      expect(result.clientName).toBe('Renamed App');
      expect(invalidateClientCache).toHaveBeenCalledWith(updated.clientId, updated.id);
      expect(cacheClient).toHaveBeenCalledWith(updated);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'client.updated' }),
      );
    });

    it('should validate redirect URIs when provided', async () => {
      (validateRedirectUris as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errors: ['Must use HTTPS'],
      });

      await expect(
        updateClient('id', { redirectUris: ['http://insecure.com'] }),
      ).rejects.toThrow('Invalid redirect URIs');
    });

    it('should throw ClientNotFoundError when client not found', async () => {
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Client not found'),
      );

      await expect(
        updateClient('nonexistent', { clientName: 'X' }),
      ).rejects.toThrow(ClientNotFoundError);
    });

    it('should re-throw unexpected errors', async () => {
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        updateClient('id', { clientName: 'X' }),
      ).rejects.toThrow('DB connection lost');
    });
  });

  // =========================================================================
  // listClientsByOrganization / listClientsByApplication
  // =========================================================================

  describe('listClientsByOrganization', () => {
    it('should delegate to repository with org filter', async () => {
      const expected = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (repoListClients as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await listClientsByOrganization('org-uuid-1', { page: 1, pageSize: 20 });

      expect(result).toEqual(expected);
      expect(repoListClients).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-uuid-1', page: 1, pageSize: 20 }),
      );
    });
  });

  describe('listClientsByApplication', () => {
    it('should delegate to repository with app filter', async () => {
      const expected = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (repoListClients as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await listClientsByApplication('app-uuid-1', { page: 1, pageSize: 20 });

      expect(result).toEqual(expected);
      expect(repoListClients).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 'app-uuid-1', page: 1, pageSize: 20 }),
      );
    });
  });

  // =========================================================================
  // Status lifecycle
  // =========================================================================

  describe('deactivateClient', () => {
    it('should deactivate an active client', async () => {
      const client = createTestClient({ status: 'active' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...client,
        status: 'inactive',
      });

      await deactivateClient('client-db-uuid-1', 'actor-1');

      expect(repoUpdateClient).toHaveBeenCalledWith('client-db-uuid-1', { status: 'inactive' });
      expect(invalidateClientCache).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'client.deactivated' }),
      );
    });

    it('should throw ClientNotFoundError when client not found', async () => {
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(deactivateClient('nonexistent')).rejects.toThrow(ClientNotFoundError);
    });

    it('should throw ClientValidationError when not active', async () => {
      const client = createTestClient({ status: 'revoked' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await expect(deactivateClient('client-db-uuid-1')).rejects.toThrow(
        'Cannot deactivate client from status: revoked',
      );
    });
  });

  describe('activateClient', () => {
    it('should activate an inactive client', async () => {
      const client = createTestClient({ status: 'inactive' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...client,
        status: 'active',
      });

      await activateClient('client-db-uuid-1', 'actor-1');

      expect(repoUpdateClient).toHaveBeenCalledWith('client-db-uuid-1', { status: 'active' });
      expect(invalidateClientCache).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'client.activated' }),
      );
    });

    it('should throw ClientNotFoundError when client not found', async () => {
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(activateClient('nonexistent')).rejects.toThrow(ClientNotFoundError);
    });

    it('should throw ClientValidationError when not inactive', async () => {
      const client = createTestClient({ status: 'active' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await expect(activateClient('client-db-uuid-1')).rejects.toThrow(
        'Cannot activate client from status: active',
      );
    });
  });

  describe('revokeClient', () => {
    it('should revoke an active client', async () => {
      const client = createTestClient({ status: 'active' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...client,
        status: 'revoked',
      });

      await revokeClient('client-db-uuid-1', 'actor-1');

      expect(repoUpdateClient).toHaveBeenCalledWith('client-db-uuid-1', { status: 'revoked' });
      expect(invalidateClientCache).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.revoked',
          metadata: expect.objectContaining({ previousStatus: 'active' }),
        }),
      );
    });

    it('should revoke an inactive client', async () => {
      const client = createTestClient({ status: 'inactive' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...client,
        status: 'revoked',
      });

      await revokeClient('client-db-uuid-1');

      expect(repoUpdateClient).toHaveBeenCalledWith('client-db-uuid-1', { status: 'revoked' });
    });

    it('should throw ClientNotFoundError when client not found', async () => {
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(revokeClient('nonexistent')).rejects.toThrow(ClientNotFoundError);
    });

    it('should throw ClientValidationError when already revoked', async () => {
      const client = createTestClient({ status: 'revoked' });
      (findClientById as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await expect(revokeClient('client-db-uuid-1')).rejects.toThrow(
        'Client is already revoked',
      );
    });
  });

  // =========================================================================
  // findForOidc
  // =========================================================================

  describe('findForOidc', () => {
    it('should return OIDC metadata for an active client', async () => {
      const client = createTestClient();
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result).toBeDefined();
      expect(result!.client_id).toBe('generated-client-id-abc123');
      expect(result!.client_name).toBe('My Web App');
      expect(result!.redirect_uris).toEqual(['https://example.com/callback']);
      expect(result!.grant_types).toEqual(['authorization_code', 'refresh_token']);
      expect(result!.response_types).toEqual(['code']);
      expect(result!.scope).toBe('openid profile email');
      expect(result!.token_endpoint_auth_method).toBe('client_secret_basic');
    });

    it('should return undefined for non-existent client', async () => {
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await findForOidc('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined for inactive client', async () => {
      const client = createTestClient({ status: 'inactive' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result).toBeUndefined();
    });

    it('should return undefined for revoked client', async () => {
      const client = createTestClient({ status: 'revoked' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result).toBeUndefined();
    });

    it('should use "none" as auth method for public clients', async () => {
      const client = createTestClient({
        clientType: 'public',
        tokenEndpointAuthMethod: 'client_secret_basic',
      });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result!.token_endpoint_auth_method).toBe('none');
    });

    it('should include allowed_origins under custom URN', async () => {
      const client = createTestClient({
        allowedOrigins: ['https://a.com', 'https://b.com'],
      });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result!['urn:porta:allowed_origins']).toEqual(['https://a.com', 'https://b.com']);
    });

    it('should include client_type under custom URN', async () => {
      const client = createTestClient({ clientType: 'confidential' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result!['urn:porta:client_type']).toBe('confidential');
    });
  });

  // =========================================================================
  // verifyClientSecret
  // =========================================================================

  describe('verifyClientSecret', () => {
    it('should return true for valid secret on active confidential client', async () => {
      const client = createTestClient({ clientType: 'confidential', status: 'active' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await verifyClientSecret('generated-client-id-abc123', 'valid-secret');

      expect(result).toBe(true);
      expect(verify).toHaveBeenCalledWith('client-db-uuid-1', 'valid-secret');
    });

    it('should return false for invalid secret', async () => {
      const client = createTestClient({ clientType: 'confidential', status: 'active' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);
      (verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await verifyClientSecret('generated-client-id-abc123', 'wrong-secret');

      expect(result).toBe(false);
    });

    it('should return false for public client (no secrets allowed)', async () => {
      const client = createTestClient({ clientType: 'public', status: 'active' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await verifyClientSecret('generated-client-id-abc123', 'any-secret');

      expect(result).toBe(false);
      // Should NOT call verify for public clients
      expect(verify).not.toHaveBeenCalled();
    });

    it('should return false for inactive client', async () => {
      const client = createTestClient({ clientType: 'confidential', status: 'inactive' });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await verifyClientSecret('generated-client-id-abc123', 'valid-secret');

      expect(result).toBe(false);
      expect(verify).not.toHaveBeenCalled();
    });

    it('should return false for unknown client', async () => {
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyClientSecret('nonexistent', 'any-secret');

      expect(result).toBe(false);
      expect(verify).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // loginMethods — validation, persistence, audit, OIDC exposure
  //
  // These tests exercise the three-state contract (undefined / null / array)
  // and the audit-log diff behaviour added to createClient / updateClient.
  // =========================================================================

  describe('createClient — loginMethods', () => {
    beforeEach(() => {
      // Common active-org + active-app arrangement for this group.
      // vi.clearAllMocks() in the outer beforeEach resets call history but
      // NOT mockReturnValue() implementations — earlier tests flip
      // validateRedirectUris to isValid:false, so we must restore it here
      // or the URI validator will short-circuit every create in this group.
      (getOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeOrg);
      (getApplicationById as ReturnType<typeof vi.fn>).mockResolvedValue(activeApp);
      (validateRedirectUris as ReturnType<typeof vi.fn>).mockReturnValue({ isValid: true });
    });


    it('omits the loginMethods key entirely when input is undefined (DB default applies)', async () => {
      const client = createTestClient({ loginMethods: null });
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await createClient(createTestInput(), 'actor-1');

      // When the caller omits loginMethods, the service must NOT pass the
      // key into insertClient — that way the repo omits the column from
      // the INSERT, and PostgreSQL's DEFAULT NULL applies. Passing null
      // explicitly would bypass any future DB-level default change.
      const insertCall = (insertClient as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect('loginMethods' in insertCall).toBe(false);
    });

    it('passes explicit null through to the repository when input is null', async () => {
      const client = createTestClient({ loginMethods: null });
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await createClient(createTestInput({ loginMethods: null }), 'actor-1');

      expect(insertClient).toHaveBeenCalledWith(
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('normalizes a non-empty array before insert (dedup, order preserved)', async () => {
      const client = createTestClient({ loginMethods: ['password', 'magic_link'] });
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      // Duplicate 'password' should collapse; order is preserved.
      await createClient(
        createTestInput({ loginMethods: ['password', 'password', 'magic_link'] }),
        'actor-1',
      );

      expect(insertClient).toHaveBeenCalledWith(
        expect.objectContaining({ loginMethods: ['password', 'magic_link'] }),
      );
    });

    it('rejects an empty array with ClientValidationError', async () => {
      await expect(
        createClient(createTestInput({ loginMethods: [] })),
      ).rejects.toThrow(ClientValidationError);
      // Repo must never be called when validation fails — otherwise we'd
      // risk producing half-initialized state on retry.
      expect(insertClient).not.toHaveBeenCalled();
    });

    it('rejects unknown method values with ClientValidationError', async () => {
      await expect(
        createClient(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          createTestInput({ loginMethods: ['password', 'telepathy' as any] }),
        ),
      ).rejects.toThrow(/invalid method "telepathy"/);
      expect(insertClient).not.toHaveBeenCalled();
    });

    it('audit log includes the persisted loginMethods value', async () => {
      const client = createTestClient({ loginMethods: ['password'] });
      (insertClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      await createClient(createTestInput({ loginMethods: ['password'] }), 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.created',
          metadata: expect.objectContaining({ loginMethods: ['password'] }),
        }),
      );
    });
  });

  describe('updateClient — loginMethods', () => {
    it('leaves the field alone when the key is absent (partial update)', async () => {
      const updated = createTestClient({ clientName: 'Renamed' });
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      await updateClient('client-db-uuid-1', { clientName: 'Renamed' }, 'actor-1');

      const updateCall = (repoUpdateClient as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect('loginMethods' in updateCall).toBe(false);
    });

    it('passes null through when clearing the override explicitly', async () => {
      const before = createTestClient({ loginMethods: ['password'] });
      const after = createTestClient({ loginMethods: null });
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(before);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(after);

      await updateClient('client-db-uuid-1', { loginMethods: null }, 'actor-1');

      expect(repoUpdateClient).toHaveBeenCalledWith(
        'client-db-uuid-1',
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('normalizes a non-empty array before update', async () => {
      const before = createTestClient({ loginMethods: null });
      const after = createTestClient({ loginMethods: ['magic_link', 'password'] });
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(before);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(after);

      await updateClient(
        'client-db-uuid-1',
        { loginMethods: ['magic_link', 'magic_link', 'password'] },
      );

      expect(repoUpdateClient).toHaveBeenCalledWith(
        'client-db-uuid-1',
        expect.objectContaining({ loginMethods: ['magic_link', 'password'] }),
      );
    });

    it('rejects an empty array without touching the repository', async () => {
      await expect(
        updateClient('client-db-uuid-1', { loginMethods: [] }),
      ).rejects.toThrow(ClientValidationError);
      expect(repoUpdateClient).not.toHaveBeenCalled();
    });

    it('audit log records previous → new transition when field changes', async () => {
      const before = createTestClient({ loginMethods: ['password'] });
      const after = createTestClient({ loginMethods: ['password', 'magic_link'] });
      (getCachedClientById as ReturnType<typeof vi.fn>).mockResolvedValue(before);
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(after);

      await updateClient(
        'client-db-uuid-1',
        { loginMethods: ['password', 'magic_link'] },
        'actor-1',
      );

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'client.updated',
          metadata: expect.objectContaining({
            previousLoginMethods: ['password'],
            newLoginMethods: ['password', 'magic_link'],
          }),
        }),
      );
    });

    it('audit log does NOT include login-method diff when key is absent', async () => {
      const updated = createTestClient({ clientName: 'Renamed' });
      (repoUpdateClient as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      await updateClient('client-db-uuid-1', { clientName: 'Renamed' }, 'actor-1');

      const auditCall = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.metadata).not.toHaveProperty('previousLoginMethods');
      expect(auditCall.metadata).not.toHaveProperty('newLoginMethods');
    });
  });

  describe('findForOidc — loginMethods URN', () => {
    it('exposes null as-is under urn:porta:login_methods when inheriting', async () => {
      const client = createTestClient({ loginMethods: null });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      // The resolver runs in the interaction layer — here we only verify
      // that the raw override value is surfaced untouched so the resolver
      // can combine it with the org default.
      expect(result!['urn:porta:login_methods']).toBeNull();
    });

    it('exposes the validated array under urn:porta:login_methods when overridden', async () => {
      const client = createTestClient({ loginMethods: ['magic_link'] });
      (getCachedClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(client);

      const result = await findForOidc('generated-client-id-abc123');

      expect(result!['urn:porta:login_methods']).toEqual(['magic_link']);
    });
  });
});

