/**
 * OIDC Client Wrapper
 *
 * Wraps openid-client v6 functions for the BFF playground.
 * Handles discovery, authorization URL building, code exchange,
 * token refresh, userinfo, introspection, revocation, logout,
 * and client_credentials grant (M2M).
 *
 * Each org gets its own discovered Configuration (cached).
 * Since Porta runs on http://localhost, allowInsecureRequests
 * is called on every config.
 */

import * as oidc from 'openid-client';
import type { OrgConfig, M2MConfig } from './config.js';

// Cache discovered configurations per issuer URL
const discoveredConfigs = new Map<string, oidc.Configuration>();

/**
 * Create a custom fetch that rewrites the well-known discovery URL.
 *
 * Porta uses path-based multi-tenancy but its issuer is the root URL.
 * The discovery endpoint is at /:orgSlug/.well-known/openid-configuration
 * but the issuer in the response is http://localhost:3000 (root).
 *
 * openid-client v6 compares the issuer in the response against the URL
 * passed to discovery(). To make this work, we discover against the root
 * URL (matching the issuer) but redirect the actual HTTP request to the
 * org-specific well-known endpoint.
 */
function createOrgDiscoveryFetch(portaUrl: string, orgSlug: string): typeof fetch {
  const rootWellKnown = `${portaUrl}/.well-known/openid-configuration`;
  const orgWellKnown = `${portaUrl}/${orgSlug}/.well-known/openid-configuration`;

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Rewrite root well-known to org-specific well-known
    if (url === rootWellKnown) {
      return fetch(orgWellKnown, init);
    }
    return fetch(input, init);
  };
}

/**
 * Discover and configure an openid-client Configuration for a specific org.
 * Caches the result so subsequent calls reuse the discovery response.
 *
 * @param portaUrl - Base URL of the Porta server (e.g. http://localhost:3000)
 * @param org - Organization configuration with client credentials
 * @returns Configured openid-client Configuration
 */
export async function getOidcConfig(
  portaUrl: string,
  org: OrgConfig,
): Promise<oidc.Configuration> {
  const cacheKey = `${portaUrl}/${org.slug}`;

  if (discoveredConfigs.has(cacheKey)) {
    return discoveredConfigs.get(cacheKey)!;
  }

  // Discover using root URL (matches issuer) with a custom fetch that
  // redirects to the org-specific well-known endpoint.
  const config = await oidc.discovery(
    new URL(portaUrl),
    org.clientId,
    org.clientSecret,
    oidc.ClientSecretPost(org.clientSecret),
    {
      execute: [oidc.allowInsecureRequests],
      [oidc.customFetch]: createOrgDiscoveryFetch(portaUrl, org.slug),
    },
  );

  discoveredConfigs.set(cacheKey, config);
  return config;
}

/**
 * Build an authorization URL with PKCE.
 * Returns the URL to redirect the user to, plus PKCE verifier, state, and nonce
 * that must be stored in the session for the callback.
 *
 * @param config - Discovered OIDC configuration
 * @param redirectUri - Where Porta should redirect after auth (e.g. /auth/callback)
 * @param scope - OIDC scopes to request
 * @returns Authorization URL and session-storable PKCE/state/nonce values
 */
export async function buildAuthUrl(
  config: oidc.Configuration,
  redirectUri: string,
  scope: string,
): Promise<{ url: URL; codeVerifier: string; state: string; nonce: string }> {
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url, codeVerifier, state, nonce };
}

/**
 * Exchange an authorization code for tokens.
 *
 * @param config - Discovered OIDC configuration
 * @param currentUrl - The full callback URL (with code and state query params)
 * @param checks - PKCE verifier, expected state and nonce from session
 * @returns Token endpoint response with access_token, id_token, etc.
 */
export async function exchangeCode(
  config: oidc.Configuration,
  currentUrl: URL,
  checks: { codeVerifier: string; state: string; nonce: string },
): Promise<oidc.TokenEndpointResponse> {
  return oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true,
  });
}

/**
 * Refresh tokens using a refresh_token.
 *
 * @param config - Discovered OIDC configuration
 * @param refreshToken - The refresh token from the session
 * @returns New token endpoint response
 */
export async function refreshTokens(
  config: oidc.Configuration,
  refreshToken: string,
): Promise<oidc.TokenEndpointResponse> {
  return oidc.refreshTokenGrant(config, refreshToken);
}

/**
 * Fetch UserInfo from the provider.
 *
 * @param config - Discovered OIDC configuration
 * @param accessToken - The access token from the session
 * @returns UserInfo response (claims object)
 */
export async function fetchUserInfo(
  config: oidc.Configuration,
  accessToken: string,
): Promise<oidc.UserInfoResponse> {
  return oidc.fetchUserInfo(config, accessToken, oidc.skipSubjectCheck);
}

/**
 * Introspect a token at the authorization server.
 *
 * @param config - Discovered OIDC configuration
 * @param token - The token to introspect
 * @returns Introspection response (active flag, claims)
 */
export async function introspectToken(
  config: oidc.Configuration,
  token: string,
): Promise<oidc.IntrospectionResponse> {
  return oidc.tokenIntrospection(config, token);
}

/**
 * Revoke a token at the authorization server.
 *
 * @param config - Discovered OIDC configuration
 * @param token - The token to revoke
 */
export async function revokeToken(
  config: oidc.Configuration,
  token: string,
): Promise<void> {
  return oidc.tokenRevocation(config, token);
}

/**
 * Build the end_session URL for RP-Initiated Logout.
 *
 * @param config - Discovered OIDC configuration
 * @param idToken - The id_token to hint for logout
 * @param postLogoutRedirectUri - Where to redirect after logout
 * @returns The end_session URL
 */
export function buildEndSessionUrl(
  config: oidc.Configuration,
  idToken: string,
  postLogoutRedirectUri: string,
): URL {
  return oidc.buildEndSessionUrl(config, {
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
}

/**
 * Perform a client_credentials grant (M2M flow).
 * Discovers the issuer for the M2M org and requests a token
 * using only client credentials — no user interaction.
 *
 * @param portaUrl - Base URL of the Porta server
 * @param m2m - M2M client configuration
 * @returns Token endpoint response with access_token
 */
export async function clientCredentialsGrant(
  portaUrl: string,
  m2m: M2MConfig,
): Promise<oidc.TokenEndpointResponse> {
  const cacheKey = `m2m:${portaUrl}/${m2m.orgSlug}`;

  let config = discoveredConfigs.get(cacheKey);
  if (!config) {
    config = await oidc.discovery(
      new URL(portaUrl),
      m2m.clientId,
      m2m.clientSecret,
      oidc.ClientSecretPost(m2m.clientSecret),
      {
        execute: [oidc.allowInsecureRequests],
        [oidc.customFetch]: createOrgDiscoveryFetch(portaUrl, m2m.orgSlug),
      },
    );
    discoveredConfigs.set(cacheKey, config);
  }

  return oidc.clientCredentialsGrant(config);
}

/**
 * Get a discovered config for the M2M client (for introspection/revocation).
 * Requires that clientCredentialsGrant was called first (to populate the cache).
 *
 * @param portaUrl - Base URL of the Porta server
 * @param m2m - M2M client configuration
 * @returns The cached configuration, or null if not yet discovered
 */
export function getM2mConfig(
  portaUrl: string,
  m2m: M2MConfig,
): oidc.Configuration | null {
  const cacheKey = `m2m:${portaUrl}/${m2m.orgSlug}`;
  return discoveredConfigs.get(cacheKey) ?? null;
}
