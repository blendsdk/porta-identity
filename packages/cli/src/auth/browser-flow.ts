/**
 * OIDC Authorization Code + PKCE browser flow orchestration.
 *
 * Orchestrates the complete CLI login flow:
 *   1. Discover admin metadata (client_id, issuer) from the server
 *   2. Generate PKCE code_verifier + code_challenge (S256)
 *   3. Start a temporary localhost HTTP server to receive the callback
 *   4. Open the user's browser to the authorization endpoint
 *   5. Wait for the callback with the authorization code
 *   6. Exchange the code for tokens at the token endpoint
 *   7. Decode the ID token for user identity
 *   8. Return the complete AuthFlowResult
 *
 * Supports two modes:
 *   - **Browser mode**: Opens browser, starts callback server
 *   - **Manual mode**: Prints URL, user pastes callback URL
 *
 * @module auth/browser-flow
 */

import { URL } from 'node:url';
import { question } from '../prompt.js';
import {
  MANUAL_REDIRECT_URI,
  isContainerized,
  parseCallbackUrl,
  startCallbackServer,
} from './callback-server.js';
import { fetchAdminMetadata } from './metadata.js';
import { fetchIssuerJwks, verifyCliIdToken } from './id-token-verifier.js';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import type { AuthFlowResult, CliAuthOperationOptions, TokenResponse } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OIDC scopes requested during the login flow */
const SCOPES = 'openid profile email offline_access';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the browser flow */
export interface BrowserFlowOptions {
  /** Porta server URL */
  server: string;
  /** Override the auto-discovered client ID */
  clientId?: string;
  /** Force manual mode (print URL instead of opening browser) */
  noBrowser?: boolean;
  /** Optional cancellation signal owned by the calling UI. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

/**
 * Exchange an authorization code for tokens at the OIDC token endpoint.
 *
 * Sends a POST request with the authorization code, PKCE code_verifier,
 * and redirect URI to complete the Authorization Code flow.
 *
 * @param params - Token exchange parameters
 * @returns Token response with access, refresh, and ID tokens
 * @throws Error if the token exchange fails
 */
export interface AuthorizationCodeExchange {
  /** Exact discovered token endpoint. */
  readonly tokenEndpoint: string;
  /** Public client identifier. */
  readonly clientId: string;
  /** Single-use authorization code. */
  readonly code: string;
  /** PKCE verifier bound to the authorization request. */
  readonly codeVerifier: string;
  /** Exact redirect URI used in the authorization request. */
  readonly redirectUri: string;
}

/** Exchanges a code once while propagating caller-owned cancellation. */
export async function exchangeAuthorizationCode(
  params: AuthorizationCodeExchange,
  options: CliAuthOperationOptions,
): Promise<TokenResponse> {
  const response = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      code_verifier: params.codeVerifier,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Authentication failed (HTTP ${response.status})`);
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('Authentication failed');
  }
  if (!value || typeof value !== 'object') throw new Error('Authentication failed');
  const token = value as Record<string, unknown>;
  if (
    typeof token.access_token !== 'string' ||
    token.access_token.length === 0 ||
    typeof token.id_token !== 'string' ||
    token.id_token.length === 0 ||
    typeof token.expires_in !== 'number' ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    (token.refresh_token !== undefined &&
      (typeof token.refresh_token !== 'string' || token.refresh_token.length === 0))
  ) {
    throw new Error('Authentication failed');
  }
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    id_token: token.id_token,
    expires_in: token.expires_in,
  };
}

// ---------------------------------------------------------------------------
// Flow Orchestration
// ---------------------------------------------------------------------------

/**
 * Execute the OIDC Authorization Code + PKCE login flow.
 *
 * This is the main entry point for CLI authentication. It handles
 * both browser-based and manual (Docker/headless) login modes.
 *
 * @param options - Login flow options
 * @param log - Logging callback for status messages
 * @returns Complete auth flow result ready to store as credentials
 * @throws Error on any failure (connectivity, auth, token exchange)
 */
export async function executeBrowserFlow(
  options: BrowserFlowOptions,
  log: (message: string) => void = console.log,
): Promise<AuthFlowResult> {
  const { server, noBrowser } = options;
  const signal = options.signal ?? new AbortController().signal;

  // ---------------------------------------------------------------
  // Step 1: Determine login mode (browser vs. manual)
  // ---------------------------------------------------------------
  const manualMode = noBrowser || isContainerized();

  if (manualMode && !noBrowser) {
    log('Container environment detected — using manual login mode.\n');
  }

  // ---------------------------------------------------------------
  // Step 2: Discover admin metadata (client ID + org slug)
  // ---------------------------------------------------------------
  let clientId: string;
  let orgSlug: string;
  let issuer: string;

  if (options.clientId) {
    clientId = options.clientId;
    orgSlug = 'porta-admin';
    issuer = `${server}/porta-admin`;
  } else {
    const metadata = await fetchAdminMetadata(server, { signal });
    clientId = metadata.clientId;
    orgSlug = metadata.orgSlug;
    issuer = metadata.issuer;
  }

  // ---------------------------------------------------------------
  // Step 3: Generate PKCE parameters
  // ---------------------------------------------------------------
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const nonce = generateState();

  // ---------------------------------------------------------------
  // Step 4: Set up redirect URI — mode-dependent
  // ---------------------------------------------------------------
  let redirectUri: string;
  let authCode: Promise<string>;

  if (manualMode) {
    redirectUri = MANUAL_REDIRECT_URI;
    authCode = undefined as unknown as Promise<string>;
  } else {
    const callbackServer = await startCallbackServer(state);
    redirectUri = `http://127.0.0.1:${callbackServer.port}/callback`;
    authCode = callbackServer.authCode;
  }

  // ---------------------------------------------------------------
  // Step 5: Build the authorization URL
  // ---------------------------------------------------------------
  const authUrl = new URL(`${server}/${orgSlug}/auth`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  // prompt MUST include `consent` for `offline_access` to survive.
  //
  // Per OIDC Core §3.1.2.1 and node-oidc-provider's check_scope, the provider
  // strips `offline_access` from the request unless `prompt` contains `consent`
  // — so without it no refresh_token is ever issued (the credentials file then
  // lacks `refreshToken`). `login` is kept to force fresh credential entry on
  // every `porta login`. Porta auto-consents first-party clients, so adding
  // `consent` shows no extra UI to the admin.
  authUrl.searchParams.set('prompt', 'login consent');

  // ---------------------------------------------------------------
  // Step 6: Open browser or print URL + collect auth code
  // ---------------------------------------------------------------
  let code: string;

  if (manualMode) {
    log('Open this URL in your browser to log in:\n');
    log(`  ${authUrl.toString()}\n`);
    log("After logging in, your browser will redirect to a page that won't load.");
    log("Copy the full URL from your browser's address bar and paste it below.\n");

    const pastedUrl = await question('Paste the callback URL: ');
    code = parseCallbackUrl(pastedUrl, state);
  } else {
    log('Opening browser for authentication...');
    try {
      // Dynamic import — `open` is an ESM-only package
      const { default: openUrl } = await import('open');
      await openUrl(authUrl.toString());
    } catch {
      log('\nCould not open browser. Open this URL manually:\n');
      log(`  ${authUrl.toString()}\n`);
    }

    log('Waiting for authentication...');
    code = await authCode;
  }

  // ---------------------------------------------------------------
  // Step 7: Exchange the authorization code for tokens
  // ---------------------------------------------------------------
  const tokens = await exchangeAuthorizationCode(
    {
      tokenEndpoint: `${server}/${orgSlug}/token`,
      code,
      redirectUri,
      clientId,
      codeVerifier,
    },
    { signal },
  );

  // ---------------------------------------------------------------
  // Step 7.5: Warn if the server did not issue a refresh token.
  //
  // Without a refresh token, the CLI cannot silently renew the access
  // token and will require `porta login` again once it expires (~1h).
  // This usually means the client lacks the `refresh_token` grant or the
  // request did not result in `offline_access` being granted. Login still
  // succeeds (credentials are saved) — this is a caveat, not a failure. (AR-8)
  // ---------------------------------------------------------------
  if (!tokens.refresh_token) {
    log(
      "Warning: the server did not issue a refresh token. You'll need to run 'porta login' " +
        'again when the access token expires (~1h). Ensure the client allows the ' +
        "'refresh_token' grant and the 'offline_access' scope.",
    );
  }

  // ---------------------------------------------------------------
  // Step 8: Authenticate the ID token before accepting identity
  // ---------------------------------------------------------------
  const jwks = await fetchIssuerJwks(`${issuer}/jwks`, { signal });
  const identity = await verifyCliIdToken({
    token: tokens.id_token,
    issuer,
    clientId,
    nonce,
    jwks,
  });

  // ---------------------------------------------------------------
  // Step 9: Build and return the auth flow result
  // ---------------------------------------------------------------
  return {
    server,
    orgSlug,
    clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    userInfo: {
      sub: identity.sub,
      email: identity.email ?? '',
      name: identity.name,
    },
  };
}
