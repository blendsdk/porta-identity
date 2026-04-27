import * as client from 'openid-client';
import type { TokenEndpointResponseHelpers } from 'openid-client';
import type { TokenEndpointResponse } from 'openid-client';
import type { BffConfig } from './config.js';
import type { Logger } from 'pino';

/** Combined token response type including helper methods like claims() */
export type TokenResponse = TokenEndpointResponse & TokenEndpointResponseHelpers;

/** OIDC configuration discovered from Porta */
export interface OidcConfig {
  /** Discovered OIDC server configuration */
  serverConfig: client.Configuration;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** End-session endpoint URL (undefined if not supported) */
  endSessionEndpoint: string | undefined;
}

/**
 * Discover Porta's OIDC configuration and set up the client.
 *
 * Porta uses path-based multi-tenancy where each org has its own OIDC
 * endpoints at /:orgSlug/*, but the issuer is the base URL (no org prefix).
 * This means we must fetch discovery from the org-scoped path and then
 * construct the Configuration manually (openid-client's discovery() would
 * reject the issuer mismatch).
 *
 * If orgSlug is not configured, fetches it from GET /api/admin/metadata.
 *
 * @param config - BFF configuration
 * @param logger - Pino logger
 * @returns Discovered OIDC configuration
 */
export async function setupOidc(config: BffConfig, logger: Logger): Promise<OidcConfig> {
  // Step 1: Resolve the org slug (auto-detect if not configured)
  const orgSlug = config.orgSlug || (await detectOrgSlug(config, logger));

  // Step 2: Fetch discovery document from the org-scoped path
  const discoveryUrl = `${config.portaUrl}/${orgSlug}/.well-known/openid-configuration`;
  logger.info({ discoveryUrl }, 'Fetching OIDC discovery document');

  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed: ${response.status} ${response.statusText} from ${discoveryUrl}`,
    );
  }

  const metadata = (await response.json()) as Record<string, unknown>;
  logger.info({ issuer: metadata.issuer }, 'OIDC discovery document fetched');

  // Step 3: Construct Configuration directly from the fetched metadata.
  // Porta's issuer is the base URL (e.g., http://localhost:3000), not the
  // org-scoped URL. We construct the Configuration manually to avoid the
  // issuer mismatch that client.discovery() would reject.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverConfig = new (client.Configuration as any)(
    metadata,
    config.clientId,
    config.clientSecret,
  ) as client.Configuration;

  // Allow HTTP in non-production (dev, test). Porta runs on http://localhost
  // during development. This must be called AFTER construction so the flag
  // is stored on the Configuration for all subsequent operations.
  if (config.nodeEnv !== 'production') {
    client.allowInsecureRequests(serverConfig);
  }

  logger.info('OIDC configuration constructed successfully');

  return {
    serverConfig,
    authorizationEndpoint: serverConfig.serverMetadata().authorization_endpoint!,
    tokenEndpoint: serverConfig.serverMetadata().token_endpoint!,
    endSessionEndpoint: serverConfig.serverMetadata().end_session_endpoint,
  };
}

/**
 * Auto-detect the super-admin org slug from Porta's metadata endpoint.
 * Falls back to 'porta' if metadata is unavailable.
 *
 * @param config - BFF configuration
 * @param logger - Pino logger
 * @returns Detected org slug string
 */
async function detectOrgSlug(config: BffConfig, logger: Logger): Promise<string> {
  try {
    const response = await fetch(`${config.portaUrl}/api/admin/metadata`);
    if (response.ok) {
      const metadata = (await response.json()) as { orgSlug?: string };
      if (metadata.orgSlug) {
        logger.info({ orgSlug: metadata.orgSlug }, 'Auto-detected super-admin org slug');
        return metadata.orgSlug;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to auto-detect org slug from Porta metadata');
  }

  // Fallback to 'porta' (the default super-admin org slug from seed data)
  logger.info('Using default org slug: porta');
  return 'porta';
}

/**
 * Build the OIDC authorization URL for the login flow.
 * Uses Authorization Code + PKCE (S256).
 *
 * @param oidcConfig - Discovered OIDC configuration
 * @param config - BFF configuration
 * @returns Authorization URL, PKCE code_verifier, and state to store in session
 */
export async function buildAuthUrl(
  oidcConfig: OidcConfig,
  config: BffConfig,
): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const redirectUri = `${config.publicUrl}/auth/callback`;

  const authUrl = client.buildAuthorizationUrl(oidcConfig.serverConfig, {
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return { authUrl: authUrl.toString(), codeVerifier, state };
}

/**
 * Exchange the authorization code for tokens.
 * Validates PKCE and state parameters for security.
 *
 * @param oidcConfig - Discovered OIDC configuration
 * @param _config - BFF configuration (redirect URI)
 * @param callbackUrl - The full callback URL from the browser
 * @param codeVerifier - PKCE code_verifier from session
 * @param expectedState - Expected state parameter from session
 * @returns Token endpoint response with access_token, refresh_token, id_token
 */
export async function exchangeCode(
  oidcConfig: OidcConfig,
  _config: BffConfig,
  callbackUrl: URL,
  codeVerifier: string,
  expectedState: string,
): Promise<TokenResponse> {
  return client.authorizationCodeGrant(oidcConfig.serverConfig, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
    idTokenExpected: true,
  });
}

/**
 * Refresh the access token using the refresh token.
 * Used for transparent token renewal when the access token expires.
 *
 * @param oidcConfig - Discovered OIDC configuration
 * @param refreshToken - Current refresh token
 * @returns New token endpoint response
 */
export async function refreshTokens(
  oidcConfig: OidcConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  return client.refreshTokenGrant(oidcConfig.serverConfig, refreshToken);
}
