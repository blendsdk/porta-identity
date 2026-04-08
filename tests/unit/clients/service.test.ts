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
  });
});
