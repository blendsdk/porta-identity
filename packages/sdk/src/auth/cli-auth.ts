/**
 * CliAuth — reuse Porta CLI stored credentials as an authentication provider.
 *
 * Reads credentials from `~/.porta/credentials.json` (the file created by
 * `porta login`) and uses them for API authentication. Handles token expiry
 * detection and automatic refresh via the refresh_token grant.
 *
 * Key behaviors:
 * - Reads credentials file on first `getToken()` call, caches in memory
 * - Checks `expiresAt` with 60s safety buffer to detect near-expired tokens
 * - `refreshToken()` re-reads the file (CLI may have refreshed) then
 *   POSTs refresh_token grant to the token endpoint
 * - Does NOT write back to the credentials file — only the CLI writes
 *
 * @example
 * ```typescript
 * import { createCliAuth } from '@portaidentity/sdk';
 *
 * // Uses default ~/.porta/credentials.json
 * const auth = createCliAuth();
 * const client = createPortaClient({ baseUrl: '...', auth });
 *
 * // Custom path for testing
 * const auth2 = createCliAuth({ credentialsPath: '/tmp/test-creds.json' });
 * ```
 *
 * @module auth/cli-auth
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AuthProvider } from './types.js';
import { PortaAuthenticationError } from '../errors/index.js';

// ---------------------------------------------------------------------------
// Options & credential types
// ---------------------------------------------------------------------------

/**
 * Options for creating a CLI auth provider.
 */
export interface CliAuthOptions {
  /** Path to credentials file (default: '~/.porta/credentials.json') */
  credentialsPath?: string;
}

/**
 * Shape of the credentials file written by `porta login`.
 *
 * This matches the `StoredCredentials` interface from the CLI's token-store
 * module. The SDK only reads these fields — it never writes them.
 */
export interface StoredCredentials {
  /** Porta server URL (e.g., 'https://porta.local:3443') */
  server: string;
  /** Organization slug for the admin org (e.g., 'porta-admin') */
  orgSlug: string;
  /** OIDC client_id used for the login flow */
  clientId: string;
  /** JWT access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** OIDC ID token containing user identity claims */
  idToken: string;
  /** ISO 8601 datetime when the access token expires */
  expiresAt: string;
  /** Decoded user identity from the ID token */
  userInfo: {
    /** OIDC subject identifier (user ID) */
    sub: string;
    /** User email address */
    email: string;
    /** User display name */
    name?: string;
  };
}

/**
 * Shape of the OIDC token endpoint response for refresh_token grant.
 */
interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default path to the credentials file */
const DEFAULT_CREDENTIALS_DIR = '.porta';
const DEFAULT_CREDENTIALS_FILE = 'credentials.json';

/**
 * Safety buffer (in seconds) for token expiry checks.
 * Matches the CLI's 60-second buffer to avoid clock skew issues.
 */
const EXPIRY_BUFFER_SECONDS = 60;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a CLI credentials authentication provider.
 *
 * Returns an {@link AuthProvider} that reads the Porta CLI's stored
 * credentials file and uses them for API authentication. The provider
 * caches credentials in memory and handles token refresh transparently.
 *
 * **Important:** This provider does NOT write back to the credentials file.
 * Only the CLI (`porta login`, `porta logout`) manages the file. The SDK
 * refreshes tokens in-memory only.
 *
 * @param options - Optional configuration (credentials file path)
 * @returns An AuthProvider backed by CLI stored credentials
 */
export function createCliAuth(options: CliAuthOptions = {}): AuthProvider {
  const credentialsPath =
    options.credentialsPath ??
    join(homedir(), DEFAULT_CREDENTIALS_DIR, DEFAULT_CREDENTIALS_FILE);

  /** In-memory cached credentials — null until first read */
  let cached: StoredCredentials | null = null;

  /**
   * Reads and parses the credentials file from disk.
   *
   * @throws PortaAuthenticationError if file not found or unreadable
   */
  async function readCredentialsFile(): Promise<StoredCredentials> {
    try {
      const content = await readFile(credentialsPath, 'utf-8');
      const parsed = JSON.parse(content) as StoredCredentials;

      // Validate minimum required fields
      if (!parsed.accessToken || !parsed.server || !parsed.orgSlug) {
        throw new PortaAuthenticationError({
          message: `Invalid credentials file at ${credentialsPath}: missing required fields. Run 'porta login' to re-authenticate.`,
        });
      }

      return parsed;
    } catch (error) {
      // File not found — user hasn't logged in yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new PortaAuthenticationError({
          message: `Credentials file not found at ${credentialsPath}. Run 'porta login' first.`,
        });
      }

      // Re-throw PortaAuthenticationError (from validation above or nested)
      if (error instanceof PortaAuthenticationError) {
        throw error;
      }

      // JSON parse error or other read failure
      throw new PortaAuthenticationError({
        message: `Failed to read credentials file at ${credentialsPath}: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Checks whether the access token is expired or about to expire.
   * Uses a 60-second safety buffer matching the CLI's behavior.
   */
  function isTokenExpired(creds: StoredCredentials): boolean {
    if (!creds.expiresAt) return false;
    const expiresAtMs = new Date(creds.expiresAt).getTime();
    return Date.now() >= expiresAtMs - EXPIRY_BUFFER_SECONDS * 1000;
  }

  /**
   * Refreshes the access token using the refresh_token grant.
   *
   * POSTs to the OIDC token endpoint (`/{orgSlug}/token`) with
   * grant_type=refresh_token. Updates the in-memory cache but does
   * NOT write back to the credentials file.
   *
   * @throws PortaAuthenticationError if refresh fails or missing refresh_token
   */
  async function refreshWithGrant(
    creds: StoredCredentials,
  ): Promise<string> {
    if (!creds.refreshToken) {
      throw new PortaAuthenticationError({
        message: "Cannot refresh token: no refresh_token available. Run 'porta login' again.",
      });
    }

    // Construct token endpoint from server URL and org slug
    const tokenUrl = `${creds.server}/${creds.orgSlug}/token`;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      refresh_token: creds.refreshToken,
    });

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (error) {
      throw new PortaAuthenticationError({
        message: `Token refresh request failed: ${(error as Error).message}. Run 'porta login' again.`,
      });
    }

    if (!response.ok) {
      throw new PortaAuthenticationError({
        message: `Token refresh failed (${response.status}). Run 'porta login' again.`,
      });
    }

    const data = (await response.json()) as RefreshTokenResponse;

    if (!data.access_token) {
      throw new PortaAuthenticationError({
        message: "Token refresh response missing access_token. Run 'porta login' again.",
      });
    }

    // Update in-memory cache with new tokens (don't write to file)
    cached = {
      ...creds,
      accessToken: data.access_token,
      // Preserve existing tokens if server doesn't rotate them
      refreshToken: data.refresh_token ?? creds.refreshToken,
      idToken: data.id_token ?? creds.idToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : creds.expiresAt,
    };

    return data.access_token;
  }

  return {
    async getToken(): Promise<string> {
      // Read from file on first call
      if (!cached) {
        cached = await readCredentialsFile();
      }

      // If expired, try to refresh using the refresh_token grant
      if (isTokenExpired(cached)) {
        return refreshWithGrant(cached);
      }

      return cached.accessToken;
    },

    async refreshToken(): Promise<string> {
      // Re-read from file — the CLI may have refreshed since we last read
      cached = await readCredentialsFile();
      return refreshWithGrant(cached);
    },
  };
}
