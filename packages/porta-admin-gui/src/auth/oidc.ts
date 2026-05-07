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
 * Discover OIDC configuration from the Porta server.
 *
 * Uses `openid-client.discovery()` to fetch the OpenID Provider's metadata
 * from the well-known configuration endpoint.
 *
 * @param params - Discovery parameters (server URL, org slug, client ID, port).
 * @returns Resolved OIDC configuration for use in auth routes.
 */
export async function discoverOidc(params: OidcDiscoveryParams): Promise<OidcConfig> {
  const { serverUrl, orgSlug, clientId, port } = params;

  // Issuer URL includes the org slug path prefix for multi-tenant OIDC
  const issuer = new URL(`/${orgSlug}`, serverUrl).href;
  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
  const postLogoutRedirectUri = `http://127.0.0.1:${port}`;

  // Discover OIDC configuration via well-known endpoint
  const config = await client.discovery(
    new URL(issuer),
    clientId,
    undefined, // No client secret — public client
    undefined, // No client auth method
    { execute: [client.allowInsecureRequests] },
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
