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

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { CliCredentialPersistence } from '@portaidentity/sdk/node';
import { withCredentialLock } from './credential-lock.js';

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

/** Maximum wait for another CLI process to finish a credential update. */
const LOGIN_LOCK_TIMEOUT_MS = 5_000;

/** Organization slug format shared with Porta's server-side validator. */
const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

/** Returns true for a non-empty string accepted at a credential boundary. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Validates a stored credential snapshot before any field is trusted. */
function parseStoredCredentials(value: unknown): StoredCredentials | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const userInfoValue = candidate.userInfo;
  if (!userInfoValue || typeof userInfoValue !== 'object') return null;
  const userInfo = userInfoValue as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.server) ||
    !isNonEmptyString(candidate.orgSlug) ||
    !ORGANIZATION_SLUG.test(candidate.orgSlug) ||
    !isNonEmptyString(candidate.clientId) ||
    !isNonEmptyString(candidate.accessToken) ||
    (candidate.refreshToken !== undefined && typeof candidate.refreshToken !== 'string') ||
    !isNonEmptyString(candidate.idToken) ||
    !isNonEmptyString(candidate.expiresAt) ||
    Number.isNaN(Date.parse(candidate.expiresAt)) ||
    !isNonEmptyString(userInfo.sub) ||
    typeof userInfo.email !== 'string' ||
    (userInfo.name !== undefined && typeof userInfo.name !== 'string')
  ) {
    return null;
  }
  try {
    const server = new URL(candidate.server);
    if (
      server.protocol !== 'https:' ||
      server.username ||
      server.password ||
      !/^\/*$/.test(server.pathname) ||
      server.search ||
      server.hash
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    server: candidate.server,
    orgSlug: candidate.orgSlug,
    clientId: candidate.clientId,
    accessToken: candidate.accessToken,
    refreshToken: isNonEmptyString(candidate.refreshToken) ? candidate.refreshToken : undefined,
    idToken: candidate.idToken,
    expiresAt: candidate.expiresAt,
    userInfo: { sub: userInfo.sub, email: userInfo.email, name: userInfo.name },
  };
}

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
    return parseStoredCredentials(JSON.parse(raw));
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

/** Persists login credentials under the same lock and atomic-write contract as refresh. */
export async function saveCredentialsDurably(
  credentials: StoredCredentials,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  await prepareCredentialDirectory(CREDENTIALS_PATH);
  await withCredentialLock(
    {
      lockPath: `${CREDENTIALS_PATH}.lock`,
      timeoutMs: LOGIN_LOCK_TIMEOUT_MS,
      signal,
    },
    async () => persistAtomically(CREDENTIALS_PATH, credentials),
  );
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

/** Options for durable SDK refresh persistence owned by the CLI. */
export interface CliCredentialPersistenceOptions {
  /** Credential file to replace atomically. */
  readonly credentialsPath?: string;
  /** Maximum time to wait for another CLI process. */
  readonly lockTimeoutMs: number;
  /** Optional cancellation signal for lock acquisition. */
  readonly signal?: AbortSignal;
}

/** Creates and corrects the owner-only directory needed by a credential path. */
async function prepareCredentialDirectory(path: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: DIR_MODE });
  await chmod(directory, DIR_MODE);
}

/** Writes a credential snapshot through an owner-only sibling and atomic rename. */
async function persistAtomically(path: string, credentials: StoredCredentials): Promise<void> {
  await prepareCredentialDirectory(path);
  const temporaryPath = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  const handle = await open(temporaryPath, 'wx', FILE_MODE);
  try {
    try {
      await handle.writeFile(JSON.stringify(credentials), 'utf8');
      await handle.sync();
      await handle.chmod(FILE_MODE);
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
    await chmod(path, FILE_MODE);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

/** Creates the CLI-owned lock and atomic-write hooks used by SDK refresh. */
export function createCliCredentialPersistence(
  options: CliCredentialPersistenceOptions,
): CliCredentialPersistence {
  const credentialsPath = options.credentialsPath ?? CREDENTIALS_PATH;
  const signal = options.signal ?? new AbortController().signal;
  return {
    withRefreshLock: (operation) =>
      withCredentialLock(
        {
          lockPath: `${credentialsPath}.lock`,
          timeoutMs: options.lockTimeoutMs,
          signal,
        },
        operation,
      ),
    persistRefreshedCredentials: async (_previous, refreshed) => {
      await persistAtomically(credentialsPath, refreshed);
    },
  };
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
