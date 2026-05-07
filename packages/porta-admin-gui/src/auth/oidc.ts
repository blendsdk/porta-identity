/**
 * OIDC discovery and authorization URL builder using `openid-client` v6.
 *
 * Discovers the OIDC configuration from the Porta server's issuer URL,
 * generates PKCE code verifier/challenge pairs, and builds authorization URLs
 * for the login flow.
 *
 * @module auth/oidc
 */

import * as client from 'openid-client';

/** Parameters required for OIDC discovery. */
export interface OidcDiscoveryParams {
  /** Porta server base URL (e.g. "https://porta.example.com"). */
  serverUrl: string;
  /** Super-admin organization slug (from metadata endpoint). */
  orgSlug: string;
  /** OIDC client ID (from metadata endpoint). */
  clientId: string;
  /** BFF listen port (for redirect URI construction). */
  port: number;
}

/** Resolved OIDC configuration used throughout the BFF. */
export interface OidcConfig {
  /** The openid-client configuration object. */
  config: client.Configuration;
  /** OIDC client ID. */
  clientId: string;
  /** Issuer URL. */
  issuer: string;
  /** Redirect URI for the OIDC callback. */
  redirectUri: string;
  /** Post-logout redirect URI. */
  postLogoutRedirectUri: string;
  /** BFF listen port. */
  port: number;
  /** Porta server base URL. */
  serverUrl: string;
}

/**
 * Create a custom fetch that rewrites the root well-known URL to the
 * org-scoped well-known URL.
 *
 * Porta uses path-based multi-tenancy: the OIDC well-known endpoint lives at
 * `/{orgSlug}/.well-known/openid-configuration`, but the discovery document
 * returns `issuer` as the base server URL (without org slug). openid-client
 * discovers against the base URL (matching the issuer), so we intercept
 * the fetch to redirect it to the correct org-scoped path.
 *
 * @param baseUrl - Porta server base URL (e.g. "https://porta.local:3443")
 * @param orgSlug - Organization slug (e.g. "porta-admin")
 * @returns Custom fetch function for openid-client discovery
 */
function createOrgDiscoveryFetch(baseUrl: string, orgSlug: string): client.CustomFetch {
  const rootWellKnown = `${baseUrl}/.well-known/openid-configuration`;
  const orgWellKnown = `${baseUrl}/${orgSlug}/.well-known/openid-configuration`;
  return (url: string, options: client.CustomFetchOptions) => {
    if (url === rootWellKnown) return fetch(orgWellKnown, options as RequestInit);
    return fetch(url, options as RequestInit);
  };
}

/**
 * Discover OIDC configuration from the Porta server.
 *
 * Uses `openid-client.discovery()` to fetch the OpenID Provider's metadata
 * from the well-known configuration endpoint. Because Porta uses path-based
 * multi-tenancy, the issuer in the discovery document is the base server URL
 * (without org slug), while the well-known endpoint lives under `/{orgSlug}/`.
 * A custom fetch rewrites the discovery URL to the correct org-scoped path.
 *
 * @param params - Discovery parameters (server URL, org slug, client ID, port).
 * @returns Resolved OIDC configuration for use in auth routes.
 */
export async function discoverOidc(params: OidcDiscoveryParams): Promise<OidcConfig> {
  const { serverUrl, orgSlug, clientId, port } = params;

  // The issuer returned by the OIDC provider is the base server URL
  // (without org slug) — this is how node-oidc-provider works with
  // path-based multi-tenancy (the org prefix is stripped before the
  // provider sees the request).
  const issuer = serverUrl.replace(/\/+$/, '');
  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
  const postLogoutRedirectUri = `http://127.0.0.1:${port}`;

  // Discover OIDC configuration via well-known endpoint.
  // We discover against the base URL (matching the issuer) and use
  // a custom fetch to redirect to the org-scoped well-known path.
  const config = await client.discovery(
    new URL(issuer),
    clientId,
    undefined, // No client secret — public client
    undefined, // No client auth method
    {
      execute: [client.allowInsecureRequests],
      [client.customFetch]: createOrgDiscoveryFetch(issuer, orgSlug),
    },
  );

  return {
    config,
    clientId,
    issuer,
    redirectUri,
    postLogoutRedirectUri,
    port,
    serverUrl,
  };
}

/**
 * Generate a PKCE code verifier and challenge pair.
 *
 * @returns Object with `codeVerifier` and `codeChallenge` strings.
 */
export async function generatePkce(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Build the OIDC authorization URL for login redirection.
 *
 * @param oidcConfig - Resolved OIDC configuration.
 * @param codeChallenge - PKCE code challenge.
 * @param state - Random state parameter for CSRF prevention.
 * @returns Full authorization URL to redirect the browser to.
 */
export function buildAuthorizationUrl(
  oidcConfig: OidcConfig,
  codeChallenge: string,
  state: string,
): string {
  const authUrl = client.buildAuthorizationUrl(oidcConfig.config, {
    redirect_uri: oidcConfig.redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return authUrl.href;
}
