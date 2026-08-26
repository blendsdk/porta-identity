/**
 * OIDC test client for E2E tests.
 *
 * Builds authorization URLs with PKCE challenges, exchanges codes for tokens,
 * refreshes tokens, introspects/revokes tokens, and fetches discovery documents.
 *
 * Uses the TestHttpClient internally but exposes a high-level OIDC-specific API
 * that handles the protocol details (PKCE, Basic auth, form-encoded bodies).
 *
 * @example
 *   const oidc = new OidcTestClient(baseUrl, 'acme-corp', clientId, clientSecret);
 *   const discovery = await oidc.discovery();
 *   const { url, codeVerifier } = oidc.buildAuthorizationUrl();
 *   // ... follow redirect chain, login, consent ...
 *   const tokens = await oidc.exchangeCode(code, codeVerifier);
 */

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authorization request with PKCE parameters */
export interface AuthorizationRequest {
  /** Full authorization URL to redirect the user to */
  url: string;
  /** PKCE code verifier (needed for token exchange) */
  codeVerifier: string;
  /** PKCE code challenge (included in the URL) */
  codeChallenge: string;
  /** State parameter for CSRF protection */
  state: string;
  /** Nonce parameter for replay protection */
  nonce: string;
}

/** Token set returned by token endpoint */
export interface TokenSet {
  /** OAuth 2.0 access token */
  access_token: string;
  /** Token type (typically "Bearer") */
  token_type: string;
  /** Token lifetime in seconds */
  expires_in: number;
  /** OpenID Connect ID token (if openid scope was requested) */
  id_token?: string;
  /** Refresh token (if offline_access or refresh_token grant type) */
  refresh_token?: string;
  /** Granted scopes */
  scope?: string;
}

/** Token introspection result */
export interface IntrospectionResult {
  /** Whether the token is active */
  active: boolean;
  /** Client ID the token was issued to */
  client_id?: string;
  /** Scopes associated with the token */
  scope?: string;
  /** Token expiration (epoch seconds) */
  exp?: number;
  /** Token issuer */
  iss?: string;
  /** Token subject */
  sub?: string;
  /** Token type */
  token_type?: string;
  [key: string]: unknown;
}

/** OIDC Discovery document (partial, fields we care about in tests) */
export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  [key: string]: unknown;
}

/** JWKS document */
export interface JWKSDocument {
  keys: Array<{
    kty: string;
    kid: string;
    alg?: string;
    use?: string;
    crv?: string;
    x?: string;
    y?: string;
    [key: string]: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * OIDC test client for E2E tests.
 *
 * Provides high-level methods for all OIDC protocol operations needed
 * in testing: authorization URL building, code exchange, refresh, introspect,
 * revoke, client_credentials, discovery, and JWKS.
 */
export class OidcTestClient {
  /** Base URL of the test server */
  protected baseUrl: string;
  /** Organization slug (for path-based multi-tenancy) */
  protected orgSlug: string;
  /** OIDC client_id */
  protected clientId: string;
  /** OIDC client_secret (for confidential clients) */
  protected clientSecret?: string;

  constructor(
    baseUrl: string,
    orgSlug: string,
    clientId: string,
    clientSecret?: string,
  ) {
    this.baseUrl = baseUrl;
    this.orgSlug = orgSlug;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // ── Discovery & JWKS ──────────────────────────────────────────

  /**
   * Fetch the OIDC discovery document for the org.
   *
   * @returns Parsed discovery document
   */
  async discovery(): Promise<DiscoveryDocument> {
    const url = `${this.baseUrl}/${this.orgSlug}/.well-known/openid-configuration`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as DiscoveryDocument;
  }

  /**
   * Fetch the JWKS (JSON Web Key Set) for the org.
   *
   * @returns Parsed JWKS document with signing keys
   */
  async jwks(): Promise<JWKSDocument> {
    const url = `${this.baseUrl}/${this.orgSlug}/jwks`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`JWKS failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as JWKSDocument;
  }

  // ── Authorization ─────────────────────────────────────────────

  /**
   * Build an authorization URL with PKCE challenge.
   *
   * Generates random state, nonce, and PKCE verifier/challenge.
   * Returns the full URL plus all generated parameters for later use
   * in code exchange and assertion.
   *
   * @param options - Optional overrides for scope, state, nonce, redirectUri
   * @returns Authorization request with URL and PKCE parameters
   */
  buildAuthorizationUrl(options?: {
    scope?: string;
    state?: string;
    nonce?: string;
    redirectUri?: string;
  }): AuthorizationRequest {
    const state = options?.state ?? randomBytes(16).toString('hex');
    const nonce = options?.nonce ?? randomBytes(16).toString('hex');
    const scope = options?.scope ?? 'openid profile email';
    const redirectUri = options?.redirectUri ?? 'http://localhost:3001/callback';

    // Generate PKCE code verifier and challenge
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${this.baseUrl}/${this.orgSlug}/auth?${params.toString()}`;

    return { url, codeVerifier, codeChallenge, state, nonce };
  }

  // ── Token Operations ──────────────────────────────────────────

  /**
   * Exchange an authorization code for tokens.
   *
   * Sends the code + PKCE verifier to the token endpoint with
   * client authentication via Basic auth (if secret is available)
   * or form-encoded client_id.
   *
   * @param code - Authorization code from the callback
   * @param codeVerifier - PKCE verifier from buildAuthorizationUrl
   * @param redirectUri - Must match the original authorization request
   * @returns Token set with access_token, id_token, refresh_token
   */
  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri = 'http://localhost:3001/callback',
  ): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    // If no client_secret, include client_id in body
    if (!this.clientSecret) {
      body.set('client_id', this.clientId);
    }

    const url = `${this.baseUrl}/${this.orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.authHeaders(),
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${error}`);
    }

    return (await response.json()) as TokenSet;
  }

  /**
   * Refresh tokens using a refresh_token.
   *
   * @param refreshToken - The refresh token to use
   * @returns New token set with fresh access_token and potentially new refresh_token
   */
  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    if (!this.clientSecret) {
      body.set('client_id', this.clientId);
    }

    const url = `${this.baseUrl}/${this.orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.authHeaders(),
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${error}`);
    }

    return (await response.json()) as TokenSet;
  }

  /**
   * Get tokens via client_credentials grant.
   *
   * @param scope - Requested scopes (optional)
   * @returns Token set with access_token (no id_token or refresh_token)
   */
  async clientCredentials(scope?: string): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });

    if (scope) {
      body.set('scope', scope);
    }

    const url = `${this.baseUrl}/${this.orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.authHeaders(),
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Client credentials failed (${response.status}): ${error}`);
    }

    return (await response.json()) as TokenSet;
  }

  /**
   * Introspect a token.
   *
   * @param token - The token to introspect
   * @param tokenTypeHint - Optional hint ('access_token' or 'refresh_token')
   * @returns Introspection result with active flag and metadata
   */
  async introspect(
    token: string,
    tokenTypeHint?: string,
  ): Promise<IntrospectionResult> {
    const body = new URLSearchParams({ token });

    if (tokenTypeHint) {
      body.set('token_type_hint', tokenTypeHint);
    }

    const url = `${this.baseUrl}/${this.orgSlug}/token/introspection`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.authHeaders(),
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Introspection failed (${response.status}): ${error}`);
    }

    return (await response.json()) as IntrospectionResult;
  }

  /**
   * Revoke a token.
   *
   * Per RFC 7009, the revocation endpoint always returns 200 OK,
   * even for invalid or already-revoked tokens.
   *
   * @param token - The token to revoke
   * @param tokenTypeHint - Optional hint ('access_token' or 'refresh_token')
   */
  async revoke(token: string, tokenTypeHint?: string): Promise<void> {
    const body = new URLSearchParams({ token });

    if (tokenTypeHint) {
      body.set('token_type_hint', tokenTypeHint);
    }

    const url = `${this.baseUrl}/${this.orgSlug}/token/revocation`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.authHeaders(),
      },
      body: body.toString(),
    });
    // RFC 7009: always 200, no need to check status
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * Build Authorization header for client authentication.
   * Uses HTTP Basic auth with client_id:client_secret when secret is available.
   */
  protected authHeaders(): Record<string, string> {
    if (this.clientSecret) {
      const credentials = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }
}
