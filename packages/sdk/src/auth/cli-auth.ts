/**
 * Authentication backed by credentials created by the Porta CLI.
 *
 * The default provider remains memory-only. CLI consumers may opt into a
 * transaction that persists refresh-token rotation before a new access token
 * becomes observable.
 *
 * @module auth/cli-auth
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PortaAuthenticationError } from '../errors/index.js';
import type { AuthProvider } from './types.js';

/** Consumer-owned persistence hooks for a durable refresh transaction. */
export interface CliCredentialPersistence {
  /** Runs an operation while holding the consumer's refresh lock. */
  readonly withRefreshLock: <T>(operation: () => Promise<T>) => Promise<T>;
  /** Atomically replaces the previous stored snapshot with the refreshed one. */
  readonly persistRefreshedCredentials: (
    previous: StoredCredentials,
    refreshed: StoredCredentials,
  ) => Promise<void>;
}

/** Options for creating a CLI credential authentication provider. */
export interface CliAuthOptions {
  /** Path to the credentials file. Defaults to `~/.porta/credentials.json`. */
  readonly credentialsPath?: string;
  /** Optional durable persistence supplied by the CLI. */
  readonly credentialPersistence?: CliCredentialPersistence;
}

/** User identity retained in the CLI credential snapshot. */
export interface StoredUserInfo {
  /** Stable OIDC subject identifier. */
  readonly sub: string;
  /** Display email accepted during login. */
  readonly email: string;
  /** Optional display name accepted during login. */
  readonly name?: string;
}

/** Credentials written by `porta login` and consumed by the SDK. */
export interface StoredCredentials {
  /** Porta server origin. */
  readonly server: string;
  /** Organization slug used by the CLI client. */
  readonly orgSlug: string;
  /** Public OIDC client identifier. */
  readonly clientId: string;
  /** Current bearer access token. */
  readonly accessToken: string;
  /** Optional refresh token; omission means interactive login is required. */
  readonly refreshToken?: string;
  /** Last validated ID token. */
  readonly idToken: string;
  /** ISO timestamp at which the access token expires. */
  readonly expiresAt: string;
  /** Last validated display identity. */
  readonly userInfo: StoredUserInfo;
}

/** Validated subset of an OIDC refresh response. */
interface RefreshTokenResponse {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly idToken?: string;
  readonly expiresIn?: number;
}

/** A validated write that may be retried without replaying its grant. */
interface PendingCredentialWrite {
  readonly previous: StoredCredentials;
  readonly refreshed: StoredCredentials;
}

const DEFAULT_CREDENTIALS_PATH = join(homedir(), '.porta', 'credentials.json');
const EXPIRY_BUFFER_MS = 60_000;
const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

/** Creates a categorized authentication error without exposing remote detail. */
function authenticationError(message: string, code?: string): PortaAuthenticationError {
  const error = new PortaAuthenticationError({ message });
  if (code) {
    Object.defineProperty(error, 'code', { configurable: true, enumerable: true, value: code });
  }
  return error;
}

/** Returns true when a value is a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Validates untrusted JSON as a complete stored credential snapshot. */
function parseStoredCredentials(value: unknown): StoredCredentials {
  if (!value || typeof value !== 'object') {
    throw authenticationError(
      "Invalid credentials: missing required fields. Run 'porta login' again.",
    );
  }
  const candidate = value as Record<string, unknown>;
  const userInfo = candidate.userInfo;
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
    !userInfo ||
    typeof userInfo !== 'object'
  ) {
    throw authenticationError(
      "Invalid credentials: missing required fields. Run 'porta login' again.",
    );
  }
  const identity = userInfo as Record<string, unknown>;
  if (
    !isNonEmptyString(identity.sub) ||
    typeof identity.email !== 'string' ||
    (identity.name !== undefined && typeof identity.name !== 'string')
  ) {
    throw authenticationError("Invalid credentials. Run 'porta login' again.");
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
      throw new Error('invalid server');
    }
  } catch {
    throw authenticationError("Invalid credentials. Run 'porta login' again.");
  }

  return {
    server: candidate.server,
    orgSlug: candidate.orgSlug,
    clientId: candidate.clientId,
    accessToken: candidate.accessToken,
    refreshToken: isNonEmptyString(candidate.refreshToken) ? candidate.refreshToken : undefined,
    idToken: candidate.idToken,
    expiresAt: candidate.expiresAt,
    userInfo: { sub: identity.sub, email: identity.email, name: identity.name },
  };
}

/** Validates the security-relevant fields returned by the token endpoint. */
function parseRefreshResponse(value: unknown): RefreshTokenResponse {
  if (!value || typeof value !== 'object') {
    throw authenticationError('Token refresh returned an invalid response.');
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.access_token) ||
    (candidate.refresh_token !== undefined && !isNonEmptyString(candidate.refresh_token)) ||
    (candidate.id_token !== undefined && !isNonEmptyString(candidate.id_token)) ||
    (candidate.expires_in !== undefined &&
      (typeof candidate.expires_in !== 'number' ||
        !Number.isFinite(candidate.expires_in) ||
        candidate.expires_in <= 0))
  ) {
    throw authenticationError(
      candidate.access_token === undefined
        ? 'Token refresh response missing access_token.'
        : 'Token refresh returned an invalid response.',
    );
  }
  return {
    accessToken: candidate.access_token,
    refreshToken: candidate.refresh_token,
    idToken: candidate.id_token,
    expiresIn: candidate.expires_in,
  };
}

/** Creates an authentication provider over the Porta CLI credential file. */
export function createCliAuth(options: CliAuthOptions = {}): AuthProvider {
  const credentialsPath = options.credentialsPath ?? DEFAULT_CREDENTIALS_PATH;
  const persistence = options.credentialPersistence;
  let cached: StoredCredentials | undefined;
  let refreshInFlight: Promise<string> | undefined;
  let pendingWrite: PendingCredentialWrite | undefined;
  let terminalRefreshFailure: PortaAuthenticationError | undefined;

  /** Latches a post-dispatch failure so a rotated grant is never replayed. */
  function latchRefreshFailure(error: PortaAuthenticationError): PortaAuthenticationError {
    if (!('code' in error)) {
      Object.defineProperty(error, 'code', {
        configurable: true,
        enumerable: true,
        value: 'REFRESH_INDETERMINATE',
      });
    }
    terminalRefreshFailure = error;
    return error;
  }

  /** Reads and validates the latest on-disk credential snapshot. */
  async function readCredentialsFile(): Promise<StoredCredentials> {
    try {
      return parseStoredCredentials(JSON.parse(await readFile(credentialsPath, 'utf-8')));
    } catch (error) {
      if (error instanceof PortaAuthenticationError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw authenticationError("Credentials not found. Run 'porta login' first.");
      }
      throw authenticationError("Unable to read credentials. Run 'porta login' again.");
    }
  }

  /** Determines whether a token is expired or within the safety buffer. */
  function isExpired(credentials: StoredCredentials): boolean {
    return Date.now() >= Date.parse(credentials.expiresAt) - EXPIRY_BUFFER_MS;
  }

  /** Dispatches exactly one refresh grant and validates its response. */
  async function dispatchRefresh(previous: StoredCredentials): Promise<StoredCredentials> {
    if (!previous.refreshToken) {
      throw authenticationError(
        "Cannot refresh token: no refresh_token available. Run 'porta login' again.",
      );
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: previous.clientId,
      refresh_token: previous.refreshToken,
    });

    let response: Response;
    try {
      response = await fetch(`${previous.server}/${previous.orgSlug}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      throw latchRefreshFailure(
        authenticationError(
          "Token refresh outcome is unknown. Run 'porta login' again.",
          'REFRESH_INDETERMINATE',
        ),
      );
    }
    if (!response.ok) {
      throw latchRefreshFailure(
        authenticationError(
          `Token refresh was rejected (${response.status}). Run 'porta login' again.`,
          'REFRESH_REJECTED',
        ),
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw latchRefreshFailure(authenticationError('Token refresh returned an invalid response.'));
    }
    let refreshed: RefreshTokenResponse;
    try {
      refreshed = parseRefreshResponse(data);
    } catch (error) {
      throw latchRefreshFailure(
        error instanceof PortaAuthenticationError
          ? error
          : authenticationError('Token refresh returned an invalid response.'),
      );
    }
    return {
      ...previous,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? previous.refreshToken,
      idToken: refreshed.idToken ?? previous.idToken,
      expiresAt: refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
        : previous.expiresAt,
    };
  }

  /** Commits a durable refresh, retaining a failed write for same-write retry. */
  async function refreshDurably(): Promise<string> {
    if (!persistence) throw new Error('Durable refresh requires persistence hooks');
    return persistence.withRefreshLock(async () => {
      if (pendingWrite) {
        await persistence.persistRefreshedCredentials(
          pendingWrite.previous,
          pendingWrite.refreshed,
        );
        cached = pendingWrite.refreshed;
        pendingWrite = undefined;
        return cached.accessToken;
      }
      if (terminalRefreshFailure) throw terminalRefreshFailure;

      const current = await readCredentialsFile();
      if (!isExpired(current)) {
        cached = current;
        return current.accessToken;
      }
      const refreshed = await dispatchRefresh(current);
      pendingWrite = { previous: current, refreshed };
      await persistence.persistRefreshedCredentials(current, refreshed);
      pendingWrite = undefined;
      cached = refreshed;
      return refreshed.accessToken;
    });
  }

  /** Coalesces callers onto one immutable refresh transaction. */
  function refreshOnce(): Promise<string> {
    if (terminalRefreshFailure) return Promise.reject(terminalRefreshFailure);
    if (!refreshInFlight) {
      const operation = persistence
        ? refreshDurably()
        : (async () => {
            const previous = cached ?? (await readCredentialsFile());
            cached = await dispatchRefresh(previous);
            return cached.accessToken;
          })();
      refreshInFlight = operation.finally(() => {
        refreshInFlight = undefined;
      });
    }
    return refreshInFlight;
  }

  return {
    async getToken(): Promise<string> {
      if (terminalRefreshFailure) throw terminalRefreshFailure;
      cached ??= await readCredentialsFile();
      return isExpired(cached) || pendingWrite ? refreshOnce() : cached.accessToken;
    },
    async refreshToken(): Promise<string> {
      if (terminalRefreshFailure) throw terminalRefreshFailure;
      cached = await readCredentialsFile();
      return refreshOnce();
    },
  };
}
