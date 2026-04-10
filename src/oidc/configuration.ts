/**
 * OIDC provider configuration builder.
 *
 * Builds the complete node-oidc-provider configuration object from external
 * dependencies (TTLs, keys, adapter factory, finders). This is a pure function
 * with no side effects — all dependencies are injected as parameters.
 *
 * The configuration enables:
 * - Hybrid adapter (Postgres/Redis) for OIDC artifact storage
 * - ES256 signing keys loaded from the database
 * - Dynamic client lookup from the database
 * - PKCE required for all authorization code flows (S256 only)
 * - Token introspection, revocation, and client credentials
 * - Standard OIDC scopes and claims mapping
 * - Refresh token rotation
 * - Cookie signing with rotation support
 */

import type { OidcTtlConfig } from '../lib/system-config.js';
import type { JwkKeyPair } from '../lib/signing-keys.js';

/** Parameters required to build the provider configuration */
export interface BuildProviderConfigParams {
  /** Token TTL configuration loaded from system_config table */
  ttl: OidcTtlConfig;
  /** JWK key set loaded from signing_keys table */
  jwks: { keys: JwkKeyPair[] };
  /** Cookie signing keys from application config (supports rotation) */
  cookieKeys: string[];
  /** Account finder function — looks up users by subject ID */
  findAccount: (ctx: unknown, sub: string) => Promise<{ accountId: string; claims: (use: string, scope: string) => Promise<Record<string, unknown>> } | undefined>;
  /** Adapter class factory — node-oidc-provider instantiates with `new` */
  adapterFactory: unknown;
  /** Interaction URL builder — returns the login/consent URL for a given interaction */
  interactionUrl: (ctx: unknown, interaction: { uid: string }) => string;
  /** CORS handler — determines if an origin is allowed for a client */
  clientBasedCORS?: (ctx: unknown, origin: string, client: unknown) => boolean;
  /** Client finder function — looks up clients by client_id with secret verification */
  findClient?: (ctx: unknown, id: string) => Promise<Record<string, unknown> | undefined>;
}

/**
 * Build the complete node-oidc-provider configuration object.
 *
 * Takes all external dependencies as parameters to keep this function
 * pure and testable. The resulting configuration covers all OIDC features
 * needed by Porta.
 *
 * @param params - All dependencies for the provider configuration
 * @returns Complete Configuration object for node-oidc-provider
 */
export function buildProviderConfiguration(params: BuildProviderConfigParams): Record<string, unknown> {
  const { ttl, jwks, cookieKeys, findAccount, adapterFactory, interactionUrl, clientBasedCORS, findClient } = params;

  return {
    // Adapter — hybrid Postgres/Redis via factory
    adapter: adapterFactory,

    // Account finder — looks up users for ID token claims and userinfo
    findAccount,

    // OIDC features
    features: {
      // Disable devInteractions — we provide our own login/consent UI
      devInteractions: { enabled: false },
      // Enable token introspection (RFC 7662)
      introspection: { enabled: true },
      // Enable token revocation (RFC 7009)
      revocation: { enabled: true },
      // Enable resource indicators (RFC 8707)
      resourceIndicators: {
        enabled: true,
        defaultResource: () => 'urn:porta:default',
        getResourceServerInfo: () => ({
          scope: 'openid profile email',
          audience: 'urn:porta:default',
          accessTokenFormat: 'opaque',
          accessTokenTTL: ttl.accessToken,
        }),
        useGrantedResource: () => true,
      },
      // Enable client credentials grant (RFC 6749 §4.4)
      clientCredentials: { enabled: true },
      // Enable RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0)
      rpInitiatedLogout: { enabled: true },
    },

    // Token formats — opaque access tokens, JWT ID tokens (default)
    formats: {
      AccessToken: 'opaque',
      ClientCredentials: 'opaque',
    },

    // PKCE — required for all authorization code flows, S256 only.
    // This is a security best practice that prevents authorization code interception.
    pkce: {
      required: () => true,
      methods: ['S256'],
    },

    // Token TTLs from system_config table
    ttl: {
      AccessToken: ttl.accessToken,
      AuthorizationCode: ttl.authorizationCode,
      IdToken: ttl.idToken,
      RefreshToken: ttl.refreshToken,
      Interaction: ttl.interaction,
      Session: ttl.session,
      Grant: ttl.grant,
    },

    // Enable refresh token rotation — each refresh generates a new token
    rotateRefreshToken: true,

    // Standard OIDC scopes
    scopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],

    // Standard OIDC claims mapping per scope
    claims: {
      openid: ['sub'],
      profile: [
        'name', 'given_name', 'family_name', 'middle_name', 'nickname',
        'preferred_username', 'profile', 'picture', 'website',
        'gender', 'birthdate', 'zoneinfo', 'locale', 'updated_at',
      ],
      email: ['email', 'email_verified'],
      address: ['address'],
      phone: ['phone_number', 'phone_number_verified'],
    },

    // Supported response types and grant types
    responseTypes: ['code'],
    grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],

    // Interaction URL — where users are redirected for login/consent.
    // Placeholder for RD-03; real login UI implemented in RD-07.
    interactions: {
      url: interactionUrl,
    },

    // Signing keys in JWK format
    jwks,

    // Cookie configuration with signing key rotation support
    cookies: {
      keys: cookieKeys,
      long: { signed: true, httpOnly: true, sameSite: 'lax' as const },
      short: { signed: true, httpOnly: true, sameSite: 'lax' as const },
    },

    // CORS handler — checks client's allowed_origins
    clientBasedCORS,

    // Client finder — bypasses adapter for client model, looks up from clients table.
    // When present, oidc-provider calls this instead of adapter.find('Client', id).
    // This is the fix for GAP-1: wiring client lookup into the provider.
    ...(findClient ? { findClient } : {}),
  };
}
