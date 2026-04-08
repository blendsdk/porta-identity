import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the client service (which client-finder now delegates to)
vi.mock('../../../src/clients/service.js', () => ({
  findForOidc: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { findForOidc } from '../../../src/clients/service.js';
import { findClientByClientId } from '../../../src/oidc/client-finder.js';

// Sample OIDC metadata returned by findForOidc (the service)
const sampleOidcMetadata = {
  client_id: 'client-123',
  client_name: 'Test App',
  application_type: 'web',
  redirect_uris: ['http://localhost:3000/callback'],
  post_logout_redirect_uris: ['http://localhost:3000'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid profile email',
  token_endpoint_auth_method: 'client_secret_basic',
  'urn:porta:allowed_origins': ['http://localhost:3000'],
};

describe('client-finder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return client metadata for active client', async () => {
    (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(sampleOidcMetadata);

    const result = await findClientByClientId('client-123');

    expect(result).toBeDefined();
    expect(result!.client_id).toBe('client-123');
    expect(result!.client_name).toBe('Test App');
    expect(findForOidc).toHaveBeenCalledWith('client-123');
  });

  it('should return undefined for missing client', async () => {
    (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await findClientByClientId('nonexistent');

    expect(result).toBeUndefined();
  });

  it('should map all OIDC fields correctly', async () => {
    (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(sampleOidcMetadata);

    const result = await findClientByClientId('client-123');

    expect(result!.redirect_uris).toEqual(['http://localhost:3000/callback']);
    expect(result!.post_logout_redirect_uris).toEqual(['http://localhost:3000']);
    expect(result!.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(result!.response_types).toEqual(['code']);
    expect(result!.scope).toBe('openid profile email');
    expect(result!.token_endpoint_auth_method).toBe('client_secret_basic');
    // allowed_origins mapped from urn:porta:allowed_origins
    expect(result!.allowed_origins).toEqual(['http://localhost:3000']);
  });

  it('should return undefined on service error', async () => {
    (findForOidc as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('service error'));

    const result = await findClientByClientId('client-123');

    expect(result).toBeUndefined();
  });

  it('should handle missing allowed_origins gracefully', async () => {
    const metadataWithoutOrigins = { ...sampleOidcMetadata };
    delete (metadataWithoutOrigins as Record<string, unknown>)['urn:porta:allowed_origins'];
    (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(metadataWithoutOrigins);

    const result = await findClientByClientId('client-123');

    expect(result!.allowed_origins).toEqual([]);
  });
});
