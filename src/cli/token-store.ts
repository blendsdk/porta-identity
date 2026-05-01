/**
 * Token storage for CLI authentication.
 *
 * Stores OIDC tokens in ~/.porta/credentials.json with strict
 * file permissions (0600 — owner-only read/write). The directory
 * is created with 0700 permissions (owner-only access).
 *
 * Handles:
 *   - Reading stored credentials from disk
 *   - Writing new credentials after login
 *   - Clearing credentials on logout
 *   - Checking token expiry (with 60s safety buffer)
 *   - Refreshing expired access tokens via refresh_token grant
 *
 * The refresh flow POSTs to the OIDC token endpoint with
 * grant_type=refresh_token. On success, the updated credentials
 * are automatically persisted to disk.
 *
 * @module cli/token-store
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Credentials stored on disk after a successful login.
 *
 * Contains everything needed to make authenticated API requests
 * and refresh tokens when they expire.
 */
export interface StoredCredentials {
  /** Porta server URL (e.g., "https://porta.local:3443") */
  server: string;
  /** Organization slug for the admin org (e.g., "porta-admin") */
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
    /** User display name (from given_name + family_name) */
    name?: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory name under the user's home for Porta CLI config */
const CREDENTIALS_DIR = '.porta';

/** Filename for stored credentials */
const CREDENTIALS_FILE = 'credentials.json';

/**
 * Safety buffer (in seconds) for token expiry checks.
 * Consider the token expired 60 seconds before the actual expiry
 * to avoid clock skew and in-flight request failures.
 */
const EXPIRY_BUFFER_SECONDS = 60;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Get the full path to the credentials file.
 *
 * @returns Absolute path to ~/.porta/credentials.json
 */
export function getCredentialsPath(): string {
  return join(homedir(), CREDENTIALS_DIR, CREDENTIALS_FILE);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Read stored credentials from disk.
 *
 * Returns null if the file doesn't exist or cannot be parsed.
 * Gracefully handles corrupted files by returning null rather
 * than throwing, since the caller will treat this as "not logged in".
 *
 * @returns Parsed credentials or null if not found/invalid
 */
export function readCredentials(): StoredCredentials | null {
  const credPath = getCredentialsPath();
  if (!existsSync(credPath)) return null;

  try {
    const data = readFileSync(credPath, 'utf-8');
    return JSON.parse(data) as StoredCredentials;
  } catch {
    // Corrupted or unreadable file — treat as not logged in
    return null;
  }
}

/**
 * Write credentials to disk with secure file permissions.
 *
 * Creates the ~/.porta/ directory with 0700 (owner-only) if it
 * doesn't exist. The credentials file is written with 0600
 * (owner read/write only) to protect sensitive tokens.
 *
 * @param creds - Credentials to persist
 */
export function writeCredentials(creds: StoredCredentials): void {
  const dir = join(homedir(), CREDENTIALS_DIR);
  // Create directory with owner-only access (rwx------)
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const credPath = join(dir, CREDENTIALS_FILE);
  // Write with owner-only read/write (rw-------)
  writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * Delete stored credentials from disk.
 *
 * Safe to call even if no credentials file exists — silently
 * does nothing if the file is missing.
 */
export function clearCredentials(): void {
  const credPath = getCredentialsPath();
  if (existsSync(credPath)) {
    unlinkSync(credPath);
  }
}

// ---------------------------------------------------------------------------
// Token expiry
// ---------------------------------------------------------------------------

/**
 * Check if the access token has expired.
 *
 * Uses a 60-second safety buffer — the token is considered expired
 * 60 seconds before the actual expiry time to prevent race conditions
 * where a request starts with a valid token but arrives at the server
 * after it expires.
 *
 * @param creds - Stored credentials to check
 * @returns true if the access token is expired or about to expire
 */
export function isTokenExpired(creds: StoredCredentials): boolean {
  const expiresAt = new Date(creds.expiresAt).getTime();
  const now = Date.now();
  // Expired if current time is within the buffer window of expiry
  return now >= expiresAt - EXPIRY_BUFFER_SECONDS * 1000;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Refresh the access token using the refresh_token grant.
 *
 * POSTs to the OIDC token endpoint (/{orgSlug}/token) with
 * grant_type=refresh_token. On success, updates the stored
 * credentials with the new access token (and optionally new
 * refresh/ID tokens if the server rotates them).
 *
 * Returns null on any failure — the caller should prompt the
 * user to re-authenticate via `porta login`.
 *
 * @param creds - Current stored credentials with a valid refresh token
 * @returns Updated credentials or null if refresh failed
 */
export async function refreshAccessToken(
  creds: StoredCredentials,
): Promise<StoredCredentials | null> {
  const tokenUrl = `${creds.server}/${creds.orgSlug}/token`;

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.clientId,
        refresh_token: creds.refreshToken,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
    };

    // Build updated credentials — preserve existing refresh/ID tokens
    // if the server doesn't rotate them (OIDC spec allows both behaviors)
    const updated: StoredCredentials = {
      ...creds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? creds.refreshToken,
      idToken: data.id_token ?? creds.idToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };

    // Persist the updated credentials to disk immediately
    writeCredentials(updated);
    return updated;
  } catch {
    // Network error or other failure — caller should re-authenticate
    return null;
  }
}
