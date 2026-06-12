/**
 * Credential storage for CLI authentication.
 *
 * Stores OIDC tokens in `~/.porta/credentials.json` with strict
 * file permissions (0600 — owner-only read/write). The directory
 * is created with 0700 permissions (owner-only access).
 *
 * The credential format is intentionally identical to the SDK's
 * `StoredCredentials` interface (from `@portaidentity/sdk` CliAuth),
 * ensuring the standalone CLI and SDK share the same credential file
 * without any format conversion.
 *
 * INV2 resolution: StoredCredentials interface is 100% identical
 * between `src/cli/token-store.ts` and SDK `createCliAuth`. Fields:
 * server, orgSlug, clientId, accessToken, refreshToken, idToken,
 * expiresAt, userInfo: { sub, email, name? }.
 *
 * @module credential-store
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
 * User info embedded in stored credentials.
 * Contains the OIDC subject identifier and basic profile data.
 */
export interface StoredUserInfo {
  /** OIDC subject identifier (user ID) */
  sub: string;
  /** User's email address */
  email: string;
  /** User's display name (optional) */
  name?: string;
}

/**
 * Credentials stored on disk after a successful `porta login`.
 *
 * This format is shared with the SDK's `createCliAuth()` provider,
 * allowing the SDK to authenticate using the same credential file.
 */
export interface StoredCredentials {
  /** Porta server URL that issued these credentials */
  server: string;
  /** Organization slug used during login */
  orgSlug: string;
  /** OIDC client ID used during login */
  clientId: string;
  /** Current access token (Bearer token for API calls) */
  accessToken: string;
  /**
   * Refresh token for obtaining new access tokens.
   *
   * Optional: absent when the server did not issue a refresh token (no
   * `offline_access` granted). When missing, the CLI cannot silently renew
   * the access token and `porta login` must be re-run after it expires.
   */
  refreshToken?: string;
  /** ID token containing user identity claims */
  idToken: string;
  /** Token expiry timestamp (ISO 8601) */
  expiresAt: string;
  /** Decoded user info from the ID token */
  userInfo: StoredUserInfo;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory for Porta CLI credentials (~/.porta) */
const PORTA_DIR = join(homedir(), '.porta');

/** Credentials file path (~/.porta/credentials.json) */
const CREDENTIALS_PATH = join(PORTA_DIR, 'credentials.json');

/** File permissions: owner read/write only (0600) */
const FILE_MODE = 0o600;

/** Directory permissions: owner access only (0700) */
const DIR_MODE = 0o700;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads stored credentials from disk.
 *
 * Returns null if the file doesn't exist or contains invalid JSON.
 * Does NOT validate token expiry — callers should check `expiresAt`.
 *
 * @returns Stored credentials or null if not found
 */
export function loadCredentials(): StoredCredentials | null {
  try {
    if (!existsSync(CREDENTIALS_PATH)) {
      return null;
    }
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    // Corrupt file or parse error — treat as no credentials
    return null;
  }
}

/**
 * Saves credentials to disk with secure file permissions.
 *
 * Creates the `~/.porta` directory (0700) if it doesn't exist.
 * Writes the credentials file with 0600 permissions.
 *
 * @param credentials - The credentials to persist
 */
export function saveCredentials(credentials: StoredCredentials): void {
  // Ensure directory exists with secure permissions
  if (!existsSync(PORTA_DIR)) {
    mkdirSync(PORTA_DIR, { mode: DIR_MODE, recursive: true });
  }

  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), {
    mode: FILE_MODE,
    encoding: 'utf-8',
  });
}

/**
 * Deletes the stored credentials file.
 *
 * Used by `porta logout` to clear all stored tokens.
 * Does nothing if the file doesn't exist.
 */
export function clearCredentials(): void {
  try {
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
    }
  } catch {
    // Ignore errors — best-effort cleanup
  }
}

/**
 * Checks whether stored credentials exist on disk.
 *
 * @returns true if the credentials file exists
 */
export function hasCredentials(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

/**
 * Returns the path to the credentials file.
 * Useful for diagnostic output (e.g., `porta doctor`).
 *
 * @returns Absolute path to credentials.json
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

/**
 * Checks whether the access token is expired (with 60s safety buffer).
 *
 * @param credentials - The stored credentials to check
 * @returns true if the token is expired or will expire within 60 seconds
 */
export function isTokenExpired(credentials: StoredCredentials): boolean {
  const expiresAt = new Date(credentials.expiresAt).getTime();
  const now = Date.now();
  const bufferMs = 60_000; // 60 second safety buffer

  return now >= expiresAt - bufferMs;
}
