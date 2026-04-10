import { describe, it, expect } from 'vitest';
import { buildProviderConfiguration } from '../../../src/oidc/configuration.js';
import type { BuildProviderConfigParams } from '../../../src/oidc/configuration.js';
import type { OidcTtlConfig } from '../../../src/lib/system-config.js';

function createDefaultParams(overrides?: Partial<BuildProviderConfigParams>): BuildProviderConfigParams {
  const ttl: OidcTtlConfig = {
    accessToken: 3600,
    idToken: 3600,
    refreshToken: 2592000,
    authorizationCode: 600,
    session: 86400,
    interaction: 3600,
    grant: 2592000,
  };

  return {
    ttl,
    jwks: { keys: [] },
    cookieKeys: ['test-cookie-key-0123456789'],
    findAccount: async () => undefined,
    adapterFactory: class MockAdapter {},
    interactionUrl: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    clientBasedCORS: () => true,
    ...overrides,
  };
}

describe('configuration builder', () => {
  it('returns a valid configuration object', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    expect(config).toBeDefined();
    expect(config.adapter).toBeDefined();
    expect(config.findAccount).toBeDefined();
    expect(config.features).toBeDefined();
  });

  it('TTL values match input', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const ttl = config.ttl as Record<string, number>;
    expect(ttl.AccessToken).toBe(3600);
    expect(ttl.AuthorizationCode).toBe(600);
    expect(ttl.IdToken).toBe(3600);
    expect(ttl.RefreshToken).toBe(2592000);
    expect(ttl.Session).toBe(86400);
    expect(ttl.Interaction).toBe(3600);
    expect(ttl.Grant).toBe(2592000);
  });

  it('PKCE is required for all flows', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const pkce = config.pkce as { required: () => boolean; methods: string[] };
    expect(pkce.required()).toBe(true);
  });

  it('PKCE methods is S256 only', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const pkce = config.pkce as { methods: string[] };
    expect(pkce.methods).toEqual(['S256']);
  });

  it('access token format is opaque', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const formats = config.formats as Record<string, string>;
    expect(formats.AccessToken).toBe('opaque');
    expect(formats.ClientCredentials).toBe('opaque');
  });

  it('includes all standard OIDC scopes', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const scopes = config.scopes as string[];
    expect(scopes).toContain('openid');
    expect(scopes).toContain('profile');
    expect(scopes).toContain('email');
    expect(scopes).toContain('address');
    expect(scopes).toContain('phone');
    expect(scopes).toContain('offline_access');
  });

  it('claims mapping covers standard scopes', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const claims = config.claims as Record<string, string[]>;
    expect(claims.openid).toContain('sub');
    expect(claims.email).toContain('email');
    expect(claims.email).toContain('email_verified');
    expect(claims.profile).toContain('name');
    expect(claims.profile).toContain('given_name');
    expect(claims.phone).toContain('phone_number');
  });

  it('cookie configuration is secure', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const cookies = config.cookies as { keys: string[]; long: Record<string, unknown>; short: Record<string, unknown> };
    expect(cookies.keys).toEqual(['test-cookie-key-0123456789']);
    expect(cookies.long.httpOnly).toBe(true);
    expect(cookies.long.signed).toBe(true);
    expect(cookies.long.sameSite).toBe('lax');
    expect(cookies.short.httpOnly).toBe(true);
  });

  it('enables introspection and revocation features', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const features = config.features as Record<string, { enabled: boolean }>;
    expect(features.introspection.enabled).toBe(true);
    expect(features.revocation.enabled).toBe(true);
  });

  it('enables refresh token rotation', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    expect(config.rotateRefreshToken).toBe(true);
  });

  it('includes correct grant types', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    const grantTypes = config.grantTypes as string[];
    expect(grantTypes).toContain('authorization_code');
    expect(grantTypes).toContain('client_credentials');
    expect(grantTypes).toContain('refresh_token');
  });

  it('response types include only code', () => {
    const config = buildProviderConfiguration(createDefaultParams());
    expect(config.responseTypes).toEqual(['code']);
  });

});
