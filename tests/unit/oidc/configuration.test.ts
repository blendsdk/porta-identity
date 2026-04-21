/**
 * Unit tests for OIDC provider configuration builder.
 *
 * Tests the buildProviderConfiguration() function, focusing on:
 * - Cookie `secure` flag derivation from issuer URL
 * - Cookie security attributes (httpOnly, sameSite, signed)
 * - Core configuration structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock config — vi.hoisted ensures the object is defined before vi.mock
// hoists the factory. The issuerBaseUrl is mutable so individual tests can
// override it.
// ---------------------------------------------------------------------------
const mockConfig = vi.hoisted(() => ({
  nodeEnv: 'development' as string,
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://localhost/porta',
  redisUrl: 'redis://localhost:6379',
  issuerBaseUrl: 'http://localhost:3000',
  cookieKeys: ['test-cookie-key-0123456789'],
  smtp: { host: 'localhost', port: 587, user: '', pass: '', from: 'test@test.com' },
  logLevel: 'info',
  trustProxy: false,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: mockConfig,
}));

import { buildProviderConfiguration, type BuildProviderConfigParams } from '../../../src/oidc/configuration.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid params for buildProviderConfiguration */
function createTestParams(overrides?: Partial<BuildProviderConfigParams>): BuildProviderConfigParams {
  return {
    ttl: {
      accessToken: 3600,
      authorizationCode: 600,
      idToken: 3600,
      refreshToken: 86400,
      interaction: 3600,
      session: 1209600,
      grant: 1209600,
    },
    jwks: { keys: [] },
    cookieKeys: ['test-key-for-cookie-signing-12345'],
    findAccount: async () => undefined,
    adapterFactory: class MockAdapter {},
    interactionUrl: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    ...overrides,
  };
}

/**
 * Extract the cookies configuration from the built provider config.
 * Returns a typed object for easier assertions.
 */
function getCookies(cfg: Record<string, unknown>): {
  keys: string[];
  long: { signed: boolean; httpOnly: boolean; sameSite: string; secure: boolean };
  short: { signed: boolean; httpOnly: boolean; sameSite: string; secure: boolean };
} {
  return cfg.cookies as ReturnType<typeof getCookies>;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('buildProviderConfiguration', () => {
  beforeEach(() => {
    // Reset to HTTP localhost (dev default) before each test
    mockConfig.issuerBaseUrl = 'http://localhost:3000';
  });

  // -------------------------------------------------------------------------
  // Cookie secure flag — the primary fix for Gap 3
  // -------------------------------------------------------------------------

  describe('cookie secure flag', () => {
    it('sets secure: false when issuer is HTTP (localhost dev)', () => {
      mockConfig.issuerBaseUrl = 'http://localhost:3000';
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.secure).toBe(false);
      expect(cookies.short.secure).toBe(false);
    });

    it('sets secure: true when issuer is HTTPS (production)', () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com';
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.secure).toBe(true);
      expect(cookies.short.secure).toBe(true);
    });

    it('sets secure: false when issuer is HTTP with non-localhost host', () => {
      // Edge case: dev HTTP setup on a LAN address
      mockConfig.issuerBaseUrl = 'http://192.168.1.100:3000';
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.secure).toBe(false);
      expect(cookies.short.secure).toBe(false);
    });

    it('sets secure: true when issuer is HTTPS with port', () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com:8443';
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.secure).toBe(true);
      expect(cookies.short.secure).toBe(true);
    });

    it('sets secure: true when issuer is HTTPS with path', () => {
      mockConfig.issuerBaseUrl = 'https://auth.example.com/oidc';
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.secure).toBe(true);
      expect(cookies.short.secure).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Cookie security attributes — defence-in-depth
  // -------------------------------------------------------------------------

  describe('cookie security attributes', () => {
    it('sets httpOnly: true on both long and short cookies', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.httpOnly).toBe(true);
      expect(cookies.short.httpOnly).toBe(true);
    });

    it('sets sameSite: lax on both long and short cookies', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.sameSite).toBe('lax');
      expect(cookies.short.sameSite).toBe('lax');
    });

    it('sets signed: true on both long and short cookies', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const cookies = getCookies(cfg);

      expect(cookies.long.signed).toBe(true);
      expect(cookies.short.signed).toBe(true);
    });

    it('passes the provided cookie keys', () => {
      const keys = ['key-one-32chars-at-least-1234567', 'key-two-32chars-at-least-1234567'];
      const cfg = buildProviderConfiguration(createTestParams({ cookieKeys: keys }));
      const cookies = getCookies(cfg);

      expect(cookies.keys).toEqual(keys);
    });
  });

  // -------------------------------------------------------------------------
  // Core configuration structure
  // -------------------------------------------------------------------------

  describe('core configuration', () => {
    it('disables devInteractions', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const features = cfg.features as Record<string, Record<string, unknown>>;

      expect(features.devInteractions.enabled).toBe(false);
    });

    it('requires PKCE with S256 only', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const pkce = cfg.pkce as { required: () => boolean; methods: string[] };

      expect(pkce.required()).toBe(true);
      expect(pkce.methods).toEqual(['S256']);
    });

    it('uses opaque access token format', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const formats = cfg.formats as Record<string, string>;

      expect(formats.AccessToken).toBe('opaque');
      expect(formats.ClientCredentials).toBe('opaque');
    });

    it('only allows authorization code response type', () => {
      const cfg = buildProviderConfiguration(createTestParams());

      expect(cfg.responseTypes).toEqual(['code']);
    });

    it('allows authorization_code, client_credentials, and refresh_token grants', () => {
      const cfg = buildProviderConfiguration(createTestParams());

      expect(cfg.grantTypes).toEqual(['authorization_code', 'client_credentials', 'refresh_token']);
    });

    it('includes standard OIDC scopes', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const scopes = cfg.scopes as string[];

      expect(scopes).toContain('openid');
      expect(scopes).toContain('profile');
      expect(scopes).toContain('email');
      expect(scopes).toContain('offline_access');
    });

    it('maps RBAC claims to openid scope', () => {
      const cfg = buildProviderConfiguration(createTestParams());
      const claims = cfg.claims as Record<string, string[]>;

      expect(claims.openid).toContain('roles');
      expect(claims.openid).toContain('permissions');
    });

    it('enables refresh token rotation', () => {
      const cfg = buildProviderConfiguration(createTestParams());

      expect(cfg.rotateRefreshToken).toBe(true);
    });

    it('sets TTLs from provided config', () => {
      const customTtl = {
        accessToken: 1800,
        authorizationCode: 300,
        idToken: 7200,
        refreshToken: 43200,
        interaction: 1800,
        session: 604800,
        grant: 604800,
      };
      const cfg = buildProviderConfiguration(createTestParams({ ttl: customTtl }));
      const ttl = cfg.ttl as Record<string, number>;

      expect(ttl.AccessToken).toBe(1800);
      expect(ttl.AuthorizationCode).toBe(300);
      expect(ttl.IdToken).toBe(7200);
      expect(ttl.RefreshToken).toBe(43200);
      expect(ttl.Interaction).toBe(1800);
      expect(ttl.Session).toBe(604800);
      expect(ttl.Grant).toBe(604800);
    });
  });
});
