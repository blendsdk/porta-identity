/**
 * Types for the CLI authentication flow.
 *
 * Defines the data structures used during the OIDC Authorization Code
 * + PKCE login flow: admin metadata discovery, token responses, and
 * the intermediate auth flow result.
 *
 * @module auth/types
 */

// ---------------------------------------------------------------------------
// Admin Metadata
// ---------------------------------------------------------------------------

/**
 * Response shape from the admin metadata endpoint.
 *
 * `GET /api/admin/metadata` returns this data — an unauthenticated
 * endpoint that exposes the OIDC client_id, issuer, and organization
 * slug needed to initiate the login flow.
 */
export interface AdminMetadata {
  /** OIDC issuer URL (e.g., "https://porta.local:3443/porta-admin") */
  issuer: string;
  /** OIDC client_id for the admin CLI PKCE client */
  clientId: string;
  /** Organization slug for the admin org (e.g., "porta-admin") */
  orgSlug: string;
}

// ---------------------------------------------------------------------------
// Token Response
// ---------------------------------------------------------------------------

/**
 * Token response from the OIDC token endpoint.
 *
 * Returned after exchanging an authorization code for tokens via
 * `POST /{orgSlug}/token`.
 */
export interface TokenResponse {
  /** JWT access token for API authorization */
  access_token: string;
  /** Refresh token for obtaining new access tokens */
  refresh_token: string;
  /** OIDC ID token containing user identity claims */
  id_token: string;
  /** Seconds until the access token expires */
  expires_in: number;
}

// ---------------------------------------------------------------------------
// Auth Flow Result
// ---------------------------------------------------------------------------

/**
 * Result of the browser-based auth flow.
 *
 * Contains all tokens and user info needed to store credentials
 * after a successful login.
 */
export interface AuthFlowResult {
  /** Server URL that was authenticated against */
  server: string;
  /** Organization slug used during login */
  orgSlug: string;
  /** OIDC client ID used during login */
  clientId: string;
  /** JWT access token */
  accessToken: string;
  /** Refresh token for renewing access */
  refreshToken: string;
  /** OIDC ID token */
  idToken: string;
  /** ISO 8601 expiry timestamp for the access token */
  expiresAt: string;
  /** Decoded user info from the ID token */
  userInfo: {
    /** OIDC subject identifier (user ID) */
    sub: string;
    /** User email address */
    email: string;
    /** User display name (optional) */
    name?: string;
  };
}
