/**
 * ClientCredentialsAuth — OIDC client_credentials flow authentication provider.
 *
 * Implements the OAuth2 Client Credentials grant for machine-to-machine
 * authentication. Fetches access tokens from the OIDC token endpoint,
 * caches them with expiry awareness, and deduplicates concurrent requests.
 *
 * Key behaviors:
 * - Caches token and serves from cache until near-expiry (30s safety margin)
 * - Concurrent `getToken()` calls share a single in-flight fetch (dedup)
 * - `refreshToken()` clears cache and forces a new token fetch
 * - Uses native `fetch` — no `openid-client` dependency
 *
 * @example
 * ```typescript
 * import { createClientCredentialsAuth } from '@porta/sdk';
 *
 * const auth = createClientCredentialsAuth({
 *   tokenEndpoint: 'https://porta.example.com/super-admin/token',
 *   clientId: 'my-service',
 *   clientSecret: 'secret123',
 * });
 * const client = createPortaClient({ baseUrl: '...', auth });
 * ```
 *
 * @module auth/client-credentials-auth
 */

import type { AuthProvider } from './types.js';
import { PortaAuthenticationError } from '../errors/index.js';

// ---------------------------------------------------------------------------
// Options & internal types
// ---------------------------------------------------------------------------

/**
 * Options for creating a client credentials auth provider.
 */
export interface ClientCredentialsAuthOptions {
  /** Token endpoint URL (e.g., 'https://porta.example.com/super-admin/token') */
  tokenEndpoint: string;
  /** Client ID */
  clientId: string;
  /** Client secret */
  clientSecret: string;
  /** Scopes to request (default: 'openid') */
  scope?: string;
}

/**
 * Internal cached token state.
 * Stores the access token and the timestamp (ms) at which it becomes invalid.
 */
interface CachedToken {
  /** The access token string */
  accessToken: string;
  /** Timestamp (ms since epoch) when this token should be considered expired */
  expiresAt: number;
}

/**
 * Shape of the OIDC token endpoint response.
 * Only the fields we need — the endpoint may return additional fields.
 */
interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Safety margin before token expiry (in milliseconds).
 * Tokens are refreshed 30 seconds before their actual expiry to prevent
 * race conditions with in-flight requests.
 */
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

/**
 * Default token lifetime (in seconds) if the token endpoint doesn't
 * return an `expires_in` value. One hour matches common OIDC defaults.
 */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a client credentials authentication provider.
 *
 * Returns an {@link AuthProvider} that fetches tokens from the OIDC token
 * endpoint using the `client_credentials` grant. Tokens are cached and
 * reused until near-expiry. Concurrent `getToken()` calls are deduplicated
 * to avoid redundant token requests.
 *
 * @param options - Client credentials configuration
 * @returns An AuthProvider with automatic token management
 */
export function createClientCredentialsAuth(
  options: ClientCredentialsAuthOptions,
): AuthProvider {
  const { tokenEndpoint, clientId, clientSecret, scope = 'openid' } = options;

  /** Cached token — null when no valid token is available */
  let cachedToken: CachedToken | null = null;

  /**
   * In-flight token request promise — used for concurrent dedup.
   * When multiple getToken() calls happen simultaneously, they all
   * await the same promise instead of firing multiple HTTP requests.
   */
  let inFlightRequest: Promise<string> | null = null;

  /**
   * Fetches a new access token from the token endpoint.
   * POSTs with grant_type=client_credentials and caches the result.
   *
   * @throws PortaAuthenticationError on non-OK response or missing access_token
   */
  async function fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      // Try to extract error details from the response body
      const errorBody = await response.text().catch(() => '');
      throw new PortaAuthenticationError({
        message: `Token endpoint returned ${response.status}: ${errorBody || response.statusText}`,
      });
    }

    const data = (await response.json()) as TokenResponse;

    if (!data.access_token) {
      throw new PortaAuthenticationError({
        message: 'Token endpoint response missing access_token',
      });
    }

    // Cache the token with computed expiry (actual expiry minus safety margin)
    const expiresInMs =
      (data.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInMs - EXPIRY_SAFETY_MARGIN_MS,
    };

    return data.access_token;
  }

  /**
   * Returns true if the cached token exists and hasn't expired
   * (accounting for the safety margin).
   */
  function isTokenValid(): boolean {
    return cachedToken !== null && Date.now() < cachedToken.expiresAt;
  }

  /**
   * Gets a valid token, with concurrent request deduplication.
   *
   * If a valid cached token exists, returns it immediately.
   * If another getToken() call is already fetching, waits for that result.
   * Otherwise, initiates a new fetch.
   */
  async function getTokenWithDedup(): Promise<string> {
    // Return cached token if still valid
    if (isTokenValid()) {
      return cachedToken!.accessToken;
    }

    // Concurrent dedup: reuse the in-flight request if one exists
    if (inFlightRequest) {
      return inFlightRequest;
    }

    // Start a new token fetch and track it for dedup
    inFlightRequest = fetchToken().finally(() => {
      inFlightRequest = null;
    });

    return inFlightRequest;
  }

  return {
    async getToken(): Promise<string> {
      return getTokenWithDedup();
    },

    async refreshToken(): Promise<string> {
      // Clear cached state to force a fresh fetch
      cachedToken = null;
      inFlightRequest = null;
      return getTokenWithDedup();
    },
  };
}
