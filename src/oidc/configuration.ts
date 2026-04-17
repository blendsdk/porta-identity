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
 * - Client lookup via adapter pattern (adapter.find('Client', id) → findForOidc())
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
  const { ttl, jwks, cookieKeys, findAccount, adapterFactory, interactionUrl, clientBasedCORS } = params;

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
        // Only audience-restrict tokens when the client explicitly requests a resource.
        // When oneOf is undefined (no `resource` param in auth request), returning
        // undefined produces a standard, unrestricted token that works with /me (userinfo).
        // Previously this unconditionally returned 'urn:porta:default', which audience-
        // restricted EVERY token and caused the userinfo endpoint to reject them all.
        defaultResource: async (_ctx: unknown, _client: unknown, oneOf?: string) =>
          oneOf ?? undefined,
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

    // Issue refresh tokens for clients that support them.
    // The default oidc-provider implementation only checks code.scopes.has('offline_access'),
    // but offline_access may not propagate to the code scopes in all consent flows.
    // This explicit function ensures refresh tokens are issued whenever the client
    // lists 'refresh_token' in its grant_types AND the auth request included offline_access.
    issueRefreshToken: async (
      _ctx: unknown,
      client: { grantTypeAllowed: (type: string) => boolean },
      code: { scopes: Set<string> },
    ) => {
      return client.grantTypeAllowed('refresh_token') && (
        code.scopes.has('offline_access') ||
        // Fallback: also issue for confidential web clients (web + auth method != none)
        ((client as Record<string, unknown>).applicationType === 'web' &&
         (client as Record<string, unknown>).tokenEndpointAuthMethod !== 'none')
      );
    },

    // Enable refresh token rotation — each refresh generates a new token
    rotateRefreshToken: true,

    // Standard OIDC scopes
    scopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],

    // OIDC claims mapping per scope.
    // Standard claims follow OpenID Connect Core §5.4.
    // Custom claims (roles, permissions, ERP attributes) are mapped to
    // 'openid' so they are always included when the openid scope is granted.
    // This follows the Auth0/Okta/Azure AD pattern of always-include custom claims.
    claims: {
      openid: [
        'sub',
        // RBAC claims — always included
        'roles', 'permissions',
        // Custom ERP claims — always included
        'department', 'employee_id', 'cost_center', 'job_title',
      ],
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

    // Extra client metadata properties — tell the provider to preserve
    // these custom fields from the adapter's findClient response.
    // Without this, node-oidc-provider strips all unknown properties.
    extraClientMetadata: {
      properties: [
        'organizationId',
        'urn:porta:allowed_origins',
        'urn:porta:client_type',
      ],
    },
  };
}
