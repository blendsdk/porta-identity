import { describe, it, expect } from 'vitest';
import { mapRowToClient, mapRowToClientSecret } from '../../../src/clients/types.js';
import type { ClientRow, ClientSecretRow } from '../../../src/clients/types.js';

/** Standard test client row */
function createClientRow(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'client-uuid-1',
    organization_id: 'org-uuid-1',
    application_id: 'app-uuid-1',
    client_id: 'oidc-client-id-abc123',
    client_name: 'Web App',
    client_type: 'confidential',
    application_type: 'web',
    redirect_uris: ['https://example.com/callback'],
    post_logout_redirect_uris: ['https://example.com/logout'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'client_secret_basic',
    allowed_origins: ['https://example.com'],
    require_pkce: true,
    // login_methods is nullable; null means "inherit org default" (the common case).
    login_methods: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}


/** Standard test secret row */
function createSecretRow(overrides: Partial<ClientSecretRow> = {}): ClientSecretRow {
  return {
    id: 'secret-uuid-1',
    client_id: 'client-uuid-1',
    secret_hash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    label: 'production-key',
    expires_at: new Date('2027-01-01T00:00:00Z'),
    status: 'active',
    last_used_at: new Date('2026-06-01T00:00:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('client types', () => {
  describe('mapRowToClient', () => {
    it('should map all snake_case fields to camelCase', () => {
      const row = createClientRow();
      const client = mapRowToClient(row);

      expect(client.id).toBe('client-uuid-1');
      expect(client.organizationId).toBe('org-uuid-1');
      expect(client.applicationId).toBe('app-uuid-1');
      expect(client.clientId).toBe('oidc-client-id-abc123');
      expect(client.clientName).toBe('Web App');
      expect(client.clientType).toBe('confidential');
      expect(client.applicationType).toBe('web');
      expect(client.tokenEndpointAuthMethod).toBe('client_secret_basic');
      expect(client.requirePkce).toBe(true);
      expect(client.status).toBe('active');
    });

    it('should map array columns correctly', () => {
      const row = createClientRow({
        redirect_uris: ['https://a.com/cb', 'https://b.com/cb'],
        grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
      });
      const client = mapRowToClient(row);

      expect(client.redirectUris).toEqual(['https://a.com/cb', 'https://b.com/cb']);
      expect(client.grantTypes).toEqual(['authorization_code', 'refresh_token', 'client_credentials']);
    });

    it('should handle null array columns as empty arrays', () => {
      const row = createClientRow({
        redirect_uris: null as unknown as string[],
        allowed_origins: null as unknown as string[],
      });
      const client = mapRowToClient(row);

      expect(client.redirectUris).toEqual([]);
      expect(client.allowedOrigins).toEqual([]);
    });

    it('should preserve Date objects', () => {
      const row = createClientRow();
      const client = mapRowToClient(row);

      expect(client.createdAt).toBeInstanceOf(Date);
      expect(client.updatedAt).toBeInstanceOf(Date);
    });

    it('should map public client type', () => {
      const row = createClientRow({ client_type: 'public', application_type: 'spa' });
      const client = mapRowToClient(row);

      expect(client.clientType).toBe('public');
      expect(client.applicationType).toBe('spa');
    });

    // -----------------------------------------------------------------------
    // login_methods mapping
    // -----------------------------------------------------------------------
    // The DB column is a nullable TEXT[] where `null` is the sentinel for
    // "inherit from the organization default". A non-null array means the
    // client has an explicit override. Both states must round-trip faithfully.

    it('should preserve null login_methods (inherit sentinel)', () => {
      const row = createClientRow({ login_methods: null });
      const client = mapRowToClient(row);

      expect(client.loginMethods).toBeNull();
    });

    it('should map non-null login_methods to LoginMethod[]', () => {
      const row = createClientRow({ login_methods: ['password'] });
      const client = mapRowToClient(row);

      expect(client.loginMethods).toEqual(['password']);
    });

    it('should map a multi-element login_methods override', () => {
      const row = createClientRow({ login_methods: ['password', 'magic_link'] });
      const client = mapRowToClient(row);

      expect(client.loginMethods).toEqual(['password', 'magic_link']);
    });
  });


  describe('mapRowToClientSecret', () => {
    it('should map snake_case fields to camelCase', () => {
      const row = createSecretRow();
      const secret = mapRowToClientSecret(row);

      expect(secret.id).toBe('secret-uuid-1');
      expect(secret.clientId).toBe('client-uuid-1');
      expect(secret.label).toBe('production-key');
      expect(secret.status).toBe('active');
    });

    it('should NOT include secret_hash in mapped output', () => {
      const row = createSecretRow();
      const secret = mapRowToClientSecret(row);

      // secret_hash must never leave the repository layer
      expect(secret).not.toHaveProperty('secretHash');
      expect(secret).not.toHaveProperty('secret_hash');
    });

    it('should handle null optional fields', () => {
      const row = createSecretRow({
        label: null,
        expires_at: null,
        last_used_at: null,
      });
      const secret = mapRowToClientSecret(row);

      expect(secret.label).toBeNull();
      expect(secret.expiresAt).toBeNull();
      expect(secret.lastUsedAt).toBeNull();
    });

    it('should preserve Date objects', () => {
      const row = createSecretRow();
      const secret = mapRowToClientSecret(row);

      expect(secret.createdAt).toBeInstanceOf(Date);
      expect(secret.expiresAt).toBeInstanceOf(Date);
      expect(secret.lastUsedAt).toBeInstanceOf(Date);
    });
  });
});
