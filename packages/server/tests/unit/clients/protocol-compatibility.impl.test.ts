import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/clients/types.js';

vi.mock('../../../src/clients/repository.js', () => ({
  insertClient: vi.fn(),
  findClientById: vi.fn(),
  findClientByClientId: vi.fn(),
  updateClient: vi.fn(),
  listClients: vi.fn(),
  listClientsCursor: vi.fn(),
}));

vi.mock('../../../src/clients/cache.js', () => ({
  getCachedClientByClientId: vi.fn(),
  getCachedClientById: vi.fn(),
  cacheClient: vi.fn(),
  invalidateClientCache: vi.fn(),
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  generateClientId: vi.fn().mockReturnValue('generated-client-id'),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../../../src/applications/service.js', () => ({ getApplicationById: vi.fn() }));
vi.mock('../../../src/organizations/service.js', () => ({ getOrganizationById: vi.fn() }));
vi.mock('../../../src/clients/secret-service.js', () => ({ verify: vi.fn() }));
vi.mock('../../../src/clients/secret-repository.js', () => ({
  getLatestActiveSha256: vi.fn().mockResolvedValue(null),
}));

import { getCachedClientById } from '../../../src/clients/cache.js';
import { updateClient as updateClientRow } from '../../../src/clients/repository.js';
import { updateClient } from '../../../src/clients/service.js';
import { validateClientProtocolCompatibility } from '../../../src/clients/validators.js';

/** Build one valid persisted client for merged partial-update checks. */
function persistedClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-id',
    organizationId: 'organization-id',
    applicationId: 'application-id',
    clientId: 'oidc-client-id',
    clientName: 'Implementation client',
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
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('client protocol validator mechanics', () => {
  it('returns every finite error branch without stopping at the first failure', () => {
    const result = validateClientProtocolCompatibility({
      clientType: 'public',
      redirectUris: ['https://client.example.test/callback#fragment'],
      postLogoutRedirectUris: ['https://client.example.test/logout#fragment'],
      grantTypes: ['unsupported_grant', 'client_credentials'],
      responseTypes: ['token'],
      tokenEndpointAuthMethod: 'client_secret_basic',
      requirePkce: false,
      allowedOrigins: ['https://client.example.test/path'],
    });

    expect(result).toEqual({
      isValid: false,
      errors: [
        'redirectUris must contain 1 to 10 safe redirect URIs',
        'postLogoutRedirectUris must contain safe redirect URIs',
        'allowedOrigins must contain exact HTTP or HTTPS origins',
        'grantTypes contains an unsupported value',
        'responseTypes must contain only code',
        'public clients cannot authenticate with a secret',
        'public clients require PKCE',
        'public clients cannot use client_credentials',
      ],
    });
  });

  it('reports the confidential-none branch independently', () => {
    const result = validateClientProtocolCompatibility({
      clientType: 'confidential',
      redirectUris: ['https://client.example.test/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
      requirePkce: false,
      allowedOrigins: [],
    });

    expect(result).toEqual({
      isValid: false,
      errors: ['confidential clients require token endpoint authentication'],
    });
  });
});

describe('client protocol partial-update merging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an invalid partial update after merging persisted public-client fields', async () => {
    vi.mocked(getCachedClientById).mockResolvedValue(persistedClient());

    await expect(updateClient('client-id', { requirePkce: false })).rejects.toThrow(
      'public clients require PKCE',
    );
    expect(updateClientRow).not.toHaveBeenCalled();
  });

  it('validates merged confidential state but persists only fields supplied by the caller', async () => {
    const existing = persistedClient({
      clientType: 'confidential',
      tokenEndpointAuthMethod: 'client_secret_post',
      requirePkce: false,
    });
    const updated = { ...existing, allowedOrigins: ['https://new.example.test'] };
    vi.mocked(getCachedClientById).mockResolvedValue(existing);
    vi.mocked(updateClientRow).mockResolvedValue(updated);

    await expect(
      updateClient('client-id', { allowedOrigins: ['https://new.example.test'] }),
    ).resolves.toEqual(updated);
    expect(updateClientRow).toHaveBeenCalledWith('client-id', {
      allowedOrigins: ['https://new.example.test'],
    });
  });
});
