/** Server-bound session verification for the embedded Porta admin UI. */

import type { StoredCredentials } from '../credential-store.js';
import {
  createCliCredentialPersistence,
  getCredentialsPath,
  loadCredentials,
  saveCredentialsDurably,
} from '../credential-store.js';
import { createCliAuth } from '@portaidentity/sdk/node';
import type { CliAuthOperationOptions, VerifiedIdentity } from '../auth/types.js';
import { authenticateCliSession } from '../auth/login-coordinator.js';
import type { LoginInteraction } from '../auth/login-coordinator.js';
import { normalizeServerOrigin } from '../global-options.js';
import type { AdminApplicationSession } from './application.js';
import type { AdminCapabilities, AdminConnectionState } from './state.js';

/** Actions offered after authentication is unavailable. */
const UNAUTHENTICATED_ACTIONS = ['authenticate', 'retry', 'quit'] as const;

/** Detects ASCII and C1 controls that can alter terminal presentation. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Returns a bounded display claim that cannot inject terminal controls. */
function safeDisplayClaim(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !containsTerminalControl(value)
    ? value
    : undefined;
}

/** Inputs for a direct UserInfo verification request. */
export interface VerifiedUserInfoRequest {
  /** User-selected Porta server origin. */
  readonly selectedServer: URL;
  /** Validated organization slug used to construct the UserInfo path. */
  readonly orgSlug: string;
  /** Bearer token issued for the selected server. */
  readonly accessToken: string;
  /** Immutable subject established by validated login. */
  readonly originalSubject: string;
  /** Optional injected fetch boundary. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Inputs for verifying a stored CLI session. */
export interface StoredSessionRequest {
  /** User-selected Porta server origin. */
  readonly selectedServer: URL;
  /** Untrusted credential snapshot loaded from local storage. */
  readonly credentials: StoredCredentials;
  /** Optional SDK bearer-client construction boundary. */
  readonly createBearerClient?: (accessToken: string) => unknown;
  /** Optional token provider used when the stored token is expired. */
  readonly getAccessToken?: () => Promise<string>;
  /** Optional injected fetch boundary. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Authenticated live session state. */
export interface AuthenticatedSession {
  /** Authenticated discriminator. */
  readonly status: 'authenticated';
  /** Subject-matched, allowlisted live identity. */
  readonly identity: VerifiedIdentity;
  /** Organization actions derived from the same live UserInfo response. */
  readonly capabilities: AdminCapabilities;
}

/** Allowlisted identity and organization capabilities from one live UserInfo response. */
export interface VerifiedAdminProfile {
  /** Subject-matched identity fields safe for display and credential persistence. */
  readonly identity: VerifiedIdentity;
  /** Ephemeral organization actions used only by the running application. */
  readonly capabilities: AdminCapabilities;
}

/** Observable result of stored-session verification. */
export type SessionVerificationResult =
  | AuthenticatedSession
  | { readonly status: 'unauthenticated'; readonly actions?: typeof UNAUTHENTICATED_ACTIONS }
  | { readonly status: 'unavailable' }
  | { readonly status: 'configuration-failure' };

/** Initial state and operations supplied to one administration application. */
export interface PreparedAdminSession {
  /** State rendered while the first live verification begins. */
  readonly initialState: AdminConnectionState;
  /** Shared verification and login operations. */
  readonly session: AdminApplicationSession;
}

/** Maps a live verification result to the application state model. */
function toApplicationState(server: URL, result: SessionVerificationResult): AdminConnectionState {
  if (result.status === 'authenticated') {
    return {
      kind: 'authenticated',
      server,
      identity: result.identity,
      capabilities: result.capabilities,
    };
  }
  return {
    kind: 'unauthenticated',
    server,
    reason: result.status === 'unauthenticated' ? 'unauthenticated' : result.status,
  };
}

/** Creates the live verification and browser-login capabilities used by `porta admin`. */
export function prepareAdminSession(
  serverInput: URL,
  interaction: LoginInteraction,
): PreparedAdminSession {
  const server = normalizeServerOrigin(serverInput);

  /** Verifies the latest credential snapshot against live UserInfo. */
  const verify = async (signal: AbortSignal): Promise<AdminConnectionState> => {
    const credentials = loadCredentials();
    if (!credentials) return { kind: 'unauthenticated', server };
    const auth = createCliAuth({
      credentialsPath: getCredentialsPath(),
      credentialPersistence: createCliCredentialPersistence({
        credentialsPath: getCredentialsPath(),
        lockTimeoutMs: 5_000,
        signal,
      }),
      signal,
    });
    const state = toApplicationState(
      server,
      await verifyStoredSession(
        {
          selectedServer: server,
          credentials,
          getAccessToken: () => auth.getToken(),
        },
        { signal },
      ),
    );
    return state;
  };

  /** Runs the shared login coordinator and retains cancellation as a distinct result. */
  const login = async (signal: AbortSignal) => {
    const current = loadCredentials();
    return authenticateCliSession(
      {
        server,
        currentServer: current ? normalizeServerOrigin(current.server) : undefined,
        persistCredentials: (credentials) => saveCredentialsDurably(credentials, signal),
      },
      interaction,
      { signal },
    );
  };

  /** Authenticates when no prior verified identity needs to be preserved. */
  const authenticate = async (signal: AbortSignal): Promise<AdminConnectionState> => {
    const result = await login(signal);
    if (result.status !== 'authenticated') return { kind: 'unauthenticated', server };
    const state = {
      kind: 'authenticated',
      server,
      identity: result.identity,
      capabilities: result.capabilities,
    } as const;
    return state;
  };

  /** Reauthenticates without discarding the live identity when the user declines or cancels. */
  const reauthenticate = async (signal: AbortSignal): Promise<AdminConnectionState | undefined> => {
    const result = await login(signal);
    return result.status === 'authenticated'
      ? {
          kind: 'authenticated',
          server,
          identity: result.identity,
          capabilities: result.capabilities,
        }
      : undefined;
  };

  const hasCredentials = loadCredentials() !== null;
  return {
    initialState: hasCredentials
      ? { kind: 'verifying', server, canCancel: true }
      : { kind: 'unauthenticated', server },
    session: {
      verify,
      authenticate,
      retry: verify,
      reauthenticate,
    },
  };
}

/** Returns true when every authorization entry is a bounded, control-free slug. */
function isValidAuthorizationArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'string' &&
        entry.length > 0 &&
        entry.length <= 100 &&
        !containsTerminalControl(entry),
    )
  );
}

/**
 * Derives organization actions from untrusted live authorization claims.
 *
 * Roles and permissions are validated independently. A malformed claim cannot cancel a valid
 * capability from the other claim, and no raw claim value is retained.
 *
 * @param roles - Untrusted UserInfo role claim.
 * @param permissions - Untrusted UserInfo permission claim.
 * @returns Two fixed capability booleans.
 * @example
 * ```ts
 * const capabilities = validateAdminCapabilities([], ['admin:org:read']);
 * ```
 */
export function validateAdminCapabilities(roles: unknown, permissions: unknown): AdminCapabilities {
  const validRoles = isValidAuthorizationArray(roles) ? roles : [];
  const validPermissions = isValidAuthorizationArray(permissions) ? permissions : [];
  const isLegacyAdministrator = validRoles.includes('porta-admin');
  return {
    canReadOrganizations: isLegacyAdministrator || validPermissions.includes('admin:org:read'),
    canCreateOrganizations: isLegacyAdministrator || validPermissions.includes('admin:org:create'),
  };
}

/**
 * Returns a safe profile from a subject-matched UserInfo response.
 *
 * @param value - Untrusted decoded UserInfo response.
 * @param originalSubject - Subject established by the verified login.
 * @returns Allowlisted identity fields and fixed capability booleans.
 * @throws A fixed authentication error when the subject is missing or does not match.
 */
function validateUserInfo(value: unknown, originalSubject: string): VerifiedAdminProfile {
  if (!value || typeof value !== 'object') throw new Error('Authentication failed');
  const candidate = value as Record<string, unknown>;
  const subject = safeDisplayClaim(candidate.sub);
  if (subject !== originalSubject) {
    throw new Error('Authentication failed');
  }
  return {
    identity: {
      sub: subject,
      email: safeDisplayClaim(candidate.email),
      name: safeDisplayClaim(candidate.name),
    },
    capabilities: validateAdminCapabilities(candidate.roles, candidate.permissions),
  };
}

/**
 * Fetches and validates live UserInfo with caller-owned cancellation.
 *
 * @param request - Server-bound UserInfo request details.
 * @param options - Caller-owned cancellation signal.
 * @returns The subject-matched identity and ephemeral organization capabilities.
 * @throws A fixed authentication error when the response is unavailable or invalid.
 * @example
 * ```ts
 * const profile = await fetchVerifiedUserInfo(request, { signal });
 * ```
 */
export async function fetchVerifiedUserInfo(
  request: VerifiedUserInfoRequest,
  options: CliAuthOperationOptions,
): Promise<VerifiedAdminProfile> {
  const selected = normalizeServerOrigin(request.selectedServer);
  if (!/^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/.test(request.orgSlug)) {
    throw new Error('Authentication failed');
  }
  const fetcher = request.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(`${selected.origin}/${encodeURIComponent(request.orgSlug)}/me`, {
      headers: { Authorization: `Bearer ${request.accessToken}` },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Authentication failed', { cause: error });
  }
  if (!response.ok) throw new Error('Authentication failed');
  try {
    return validateUserInfo(await response.json(), request.originalSubject);
  } catch {
    throw new Error('Authentication failed');
  }
}

/** Verifies exact server binding and a live subject-matched UserInfo response. */
export async function verifyStoredSession(
  request: StoredSessionRequest,
  options: CliAuthOperationOptions,
): Promise<SessionVerificationResult> {
  let selected: URL;
  let credentialServer: URL;
  try {
    selected = normalizeServerOrigin(request.selectedServer);
    credentialServer = normalizeServerOrigin(request.credentials.server);
    if (
      !request.credentials.orgSlug ||
      !request.credentials.accessToken ||
      !request.credentials.userInfo?.sub
    ) {
      return { status: 'configuration-failure' };
    }
  } catch {
    return { status: 'configuration-failure' };
  }
  if (selected.origin !== credentialServer.origin) return { status: 'unauthenticated' };

  let accessToken = request.credentials.accessToken;
  if (Date.parse(request.credentials.expiresAt) <= Date.now() && request.getAccessToken) {
    try {
      accessToken = await request.getAccessToken();
    } catch {
      return { status: 'unauthenticated', actions: UNAUTHENTICATED_ACTIONS };
    }
  }
  request.createBearerClient?.(accessToken);
  const fetcher = request.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(
      `${selected.origin}/${encodeURIComponent(request.credentials.orgSlug)}/me`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: options.signal },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated', actions: UNAUTHENTICATED_ACTIONS };
  }
  if (!response.ok) return { status: 'unavailable' };
  try {
    const profile = validateUserInfo(await response.json(), request.credentials.userInfo.sub);
    return { status: 'authenticated', ...profile };
  } catch {
    return { status: 'unauthenticated' };
  }
}

/** Inputs for an explicit cross-origin credential replacement decision. */
export interface CredentialReplacementRequest {
  /** Current serialized profile and normalized server. */
  readonly current: { readonly server: URL; readonly serialized: string };
  /** Fully validated replacement candidate. */
  readonly replacement: {
    readonly server: URL;
    readonly serialized: string;
    readonly validated?: boolean;
  };
  /** UI confirmation boundary. */
  readonly confirm: (currentServer: URL, nextServer: URL) => Promise<boolean>;
  /** Atomic persistence boundary. */
  readonly persist: (serialized: string) => Promise<void> | void;
}

/** Preserves the current bytes unless a validated replacement is approved. */
export async function confirmCredentialReplacement(
  request: CredentialReplacementRequest,
): Promise<
  { readonly status: 'cancelled'; readonly preserved: string } | { readonly status: 'replaced' }
> {
  const current = normalizeServerOrigin(request.current.server);
  const replacement = normalizeServerOrigin(request.replacement.server);
  if (!(await request.confirm(current, replacement))) {
    return { status: 'cancelled', preserved: request.current.serialized };
  }
  if (request.replacement.validated !== true) throw new Error('Authentication failed');
  await request.persist(request.replacement.serialized);
  return { status: 'replaced' };
}

/** Classifies an administration response without discarding live identity. */
export function classifyAdminResponse(
  session: AuthenticatedSession,
  response: Response,
): AuthenticatedSession | { readonly status: 'unauthorized'; readonly identity: VerifiedIdentity } {
  return response.status === 403 ? { status: 'unauthorized', identity: session.identity } : session;
}
