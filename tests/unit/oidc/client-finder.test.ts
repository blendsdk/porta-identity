import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be declared before imports
// ============================================================================

// Mock the client service (findForOidc + getClientByClientId)
vi.mock('../../../src/clients/service.js', () => ({
  findForOidc: vi.fn(),
  getClientByClientId: vi.fn(),
}));

// Mock the secret service (verify)
vi.mock('../../../src/clients/secret-service.js', () => ({
  verify: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ============================================================================
// Imports
// ============================================================================

import { findForOidc, getClientByClientId } from '../../../src/clients/service.js';
import { verify } from '../../../src/clients/secret-service.js';
import { findClientByClientId, extractClientSecret } from '../../../src/oidc/client-finder.js';
import { logger } from '../../../src/lib/logger.js';

// ============================================================================
// Test data
// ============================================================================

/** Sample OIDC metadata returned by findForOidc for a public client */
const publicClientMetadata = {
  client_id: 'public-client-123',
  client_name: 'Public SPA',
  application_type: 'spa',
  redirect_uris: ['http://localhost:3000/callback'],
  post_logout_redirect_uris: ['http://localhost:3000'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid profile email',
  token_endpoint_auth_method: 'none',
  'urn:porta:allowed_origins': ['http://localhost:3000'],
  'urn:porta:client_type': 'public',
};

/** Sample OIDC metadata returned by findForOidc for a confidential client */
const confidentialClientMetadata = {
  client_id: 'conf-client-456',
  client_name: 'Confidential Web App',
  application_type: 'web',
  redirect_uris: ['http://localhost:4000/callback'],
  post_logout_redirect_uris: ['http://localhost:4000'],
  grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
  response_types: ['code'],
  scope: 'openid profile email',
  token_endpoint_auth_method: 'client_secret_basic',
  'urn:porta:allowed_origins': ['http://localhost:4000'],
  'urn:porta:client_type': 'confidential',
};

/** Sample internal client record (from getClientByClientId) */
const internalClient = {
  id: 'db-uuid-456',
  clientId: 'conf-client-456',
  clientType: 'confidential' as const,
  status: 'active' as const,
  organizationId: 'org-1',
  applicationId: 'app-1',
  clientName: 'Confidential Web App',
  applicationType: 'web' as const,
  redirectUris: ['http://localhost:4000/callback'],
  postLogoutRedirectUris: ['http://localhost:4000'],
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['http://localhost:4000'],
  requirePkce: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Helper to create a mock Koa context with optional body and headers.
 * Simulates the ctx object that oidc-provider passes to findClient.
 */
function createMockCtx(options?: {
  bodySecret?: string;
  authHeader?: string;
}): unknown {
  return {
    request: {
      body: options?.bodySecret
        ? { client_secret: options.bodySecret }
        : {},
    },
    headers: {
      ...(options?.authHeader ? { authorization: options.authHeader } : {}),
    },
  };
}

/**
 * Helper to create a Basic auth header value.
 * Encodes client_id:client_secret in base64.
 */
function createBasicAuth(clientId: string, secret: string): string {
  const encoded = Buffer.from(
    `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
  ).toString('base64');
  return `Basic ${encoded}`;
}

// ============================================================================
// Tests: extractClientSecret
// ============================================================================

describe('extractClientSecret', () => {
  it('should extract secret from request body (client_secret_post)', () => {
    const ctx = createMockCtx({ bodySecret: 'my-secret-123' });
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBe('my-secret-123');
  });

  it('should extract secret from Basic auth header (client_secret_basic)', () => {
    const ctx = createMockCtx({
      authHeader: createBasicAuth('client-abc', 'secret-xyz'),
    });
    const result = extractClientSecret(ctx, 'client-abc');
    expect(result).toBe('secret-xyz');
  });

  it('should return undefined when no secret is present', () => {
    const ctx = createMockCtx();
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should prefer body secret over Basic auth header', () => {
    // Body secret should take priority per oidc-provider convention
    const ctx = createMockCtx({
      bodySecret: 'body-secret',
      authHeader: createBasicAuth('client-abc', 'header-secret'),
    });
    const result = extractClientSecret(ctx, 'client-abc');
    expect(result).toBe('body-secret');
  });

  it('should return undefined for Basic auth with wrong client_id', () => {
    const ctx = createMockCtx({
      authHeader: createBasicAuth('wrong-client', 'some-secret'),
    });
    const result = extractClientSecret(ctx, 'correct-client');
    expect(result).toBeUndefined();
  });

  it('should handle malformed Basic auth header gracefully', () => {
    const ctx = createMockCtx({
      authHeader: 'Basic not-valid-base64!!!',
    });
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should handle empty Authorization header', () => {
    const ctx = createMockCtx({ authHeader: '' });
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should handle Authorization header that is not Basic', () => {
    const ctx = createMockCtx({ authHeader: 'Bearer some-token' });
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should handle URL-encoded client_id in Basic auth (RFC 6749 §2.3.1)', () => {
    // Client IDs with special characters should be URL-encoded in Basic auth
    const clientId = 'client:with:colons';
    const secret = 'secret-value';
    const encoded = Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
    ).toString('base64');
    const ctx = createMockCtx({ authHeader: `Basic ${encoded}` });
    const result = extractClientSecret(ctx, clientId);
    expect(result).toBe(secret);
  });

  it('should return undefined for empty body secret', () => {
    const ctx = {
      request: { body: { client_secret: '' } },
      headers: {},
    };
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should return undefined for non-string body secret', () => {
    const ctx = {
      request: { body: { client_secret: 12345 } },
      headers: {},
    };
    const result = extractClientSecret(ctx, 'any-client');
    expect(result).toBeUndefined();
  });

  it('should handle Basic auth with empty secret', () => {
    // base64("client-abc:") = empty secret after colon
    const encoded = Buffer.from('client-abc:').toString('base64');
    const ctx = createMockCtx({ authHeader: `Basic ${encoded}` });
    const result = extractClientSecret(ctx, 'client-abc');
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Tests: findClientByClientId — Decision Matrix
// ============================================================================

describe('findClientByClientId', () => {
  beforeEach(() => vi.clearAllMocks());

  // --------------------------------------------------------------------------
  // Public client scenarios
  // --------------------------------------------------------------------------

  describe('public client', () => {
    it('should return metadata for public client without secret (success)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(publicClientMetadata);
      const ctx = createMockCtx();

      const result = await findClientByClientId(ctx, 'public-client-123');

      expect(result).toBeDefined();
      expect(result!.client_id).toBe('public-client-123');
      expect(result!.client_name).toBe('Public SPA');
      expect(result!.token_endpoint_auth_method).toBe('none');
      // Public clients should NOT have client_secret set
      expect(result!.client_secret).toBeUndefined();
    });

    it('should return undefined when public client sends secret (reject)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(publicClientMetadata);
      const ctx = createMockCtx({ bodySecret: 'should-not-send-this' });

      const result = await findClientByClientId(ctx, 'public-client-123');

      expect(result).toBeUndefined();
      // Should log a warning about the misconfiguration
      expect(logger.warn).toHaveBeenCalledWith(
        { clientId: 'public-client-123' },
        expect.stringContaining('Public client sent client_secret'),
      );
    });

    it('should reject public client with secret in Basic auth header', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(publicClientMetadata);
      const ctx = createMockCtx({
        authHeader: createBasicAuth('public-client-123', 'some-secret'),
      });

      const result = await findClientByClientId(ctx, 'public-client-123');

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Confidential client scenarios
  // --------------------------------------------------------------------------

  describe('confidential client', () => {
    it('should return metadata with client_secret when valid secret is presented (post)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);
      (getClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(internalClient);
      (verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const ctx = createMockCtx({ bodySecret: 'valid-secret-abc' });
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeDefined();
      expect(result!.client_id).toBe('conf-client-456');
      // The presented secret should be passed through in metadata
      expect(result!.client_secret).toBe('valid-secret-abc');
      // Verify the secret was checked against the right DB id
      expect(verify).toHaveBeenCalledWith('db-uuid-456', 'valid-secret-abc');
    });

    it('should return metadata with client_secret when valid secret is presented (basic)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);
      (getClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(internalClient);
      (verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const ctx = createMockCtx({
        authHeader: createBasicAuth('conf-client-456', 'basic-auth-secret'),
      });
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeDefined();
      expect(result!.client_secret).toBe('basic-auth-secret');
      expect(verify).toHaveBeenCalledWith('db-uuid-456', 'basic-auth-secret');
    });

    it('should return undefined when invalid secret is presented', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);
      (getClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(internalClient);
      (verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const ctx = createMockCtx({ bodySecret: 'wrong-secret' });
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        { clientId: 'conf-client-456' },
        expect.stringContaining('secret verification failed'),
      );
    });

    it('should return metadata without secret when no secret presented (auth endpoint)', async () => {
      // At the authorization endpoint, confidential clients don't send a secret.
      // The provider will enforce auth at the token endpoint.
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);

      const ctx = createMockCtx();
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeDefined();
      expect(result!.client_id).toBe('conf-client-456');
      expect(result!.client_secret).toBeUndefined();
      // Should NOT call verify when no secret is presented
      expect(verify).not.toHaveBeenCalled();
    });

    it('should return undefined when internal client lookup fails during verification', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);
      // getClientByClientId returns null — client vanished between lookups
      (getClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const ctx = createMockCtx({ bodySecret: 'some-secret' });
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Common scenarios
  // --------------------------------------------------------------------------

  describe('common scenarios', () => {
    it('should return undefined for unknown client_id', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const ctx = createMockCtx();

      const result = await findClientByClientId(ctx, 'nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined when findForOidc throws (fail closed)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection lost'));
      const ctx = createMockCtx();

      const result = await findClientByClientId(ctx, 'any-client');

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return undefined when secret verification throws (fail closed)', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(confidentialClientMetadata);
      (getClientByClientId as ReturnType<typeof vi.fn>).mockResolvedValue(internalClient);
      (verify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Argon2 failed'));

      const ctx = createMockCtx({ bodySecret: 'some-secret' });
      const result = await findClientByClientId(ctx, 'conf-client-456');

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should map all OIDC fields correctly for public client', async () => {
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(publicClientMetadata);
      const ctx = createMockCtx();

      const result = await findClientByClientId(ctx, 'public-client-123');

      expect(result!.redirect_uris).toEqual(['http://localhost:3000/callback']);
      expect(result!.post_logout_redirect_uris).toEqual(['http://localhost:3000']);
      expect(result!.grant_types).toEqual(['authorization_code', 'refresh_token']);
      expect(result!.response_types).toEqual(['code']);
      expect(result!.scope).toBe('openid profile email');
      expect(result!.allowed_origins).toEqual(['http://localhost:3000']);
    });

    it('should handle missing allowed_origins gracefully', async () => {
      const metadataWithoutOrigins = { ...publicClientMetadata };
      delete (metadataWithoutOrigins as Record<string, unknown>)['urn:porta:allowed_origins'];
      (findForOidc as ReturnType<typeof vi.fn>).mockResolvedValue(metadataWithoutOrigins);
      const ctx = createMockCtx();

      const result = await findClientByClientId(ctx, 'public-client-123');

      expect(result!.allowed_origins).toEqual([]);
    });
  });
});
