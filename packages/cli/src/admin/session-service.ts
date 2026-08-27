/** Server-bound session verification for the embedded Porta admin UI. */

import type { StoredCredentials } from '../credential-store.js';
import type { CliAuthOperationOptions, VerifiedIdentity } from '../auth/types.js';
import { normalizeServerOrigin } from '../global-options.js';

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
}

/** Observable result of stored-session verification. */
export type SessionVerificationResult =
  | AuthenticatedSession
  | { readonly status: 'unauthenticated'; readonly actions?: typeof UNAUTHENTICATED_ACTIONS }
  | { readonly status: 'unavailable' }
  | { readonly status: 'configuration-failure' };

/** Accepts only an HTTPS origin and returns its canonical URL. */
/** Returns a safe subset of a subject-matched UserInfo response. */
function validateUserInfo(value: unknown, originalSubject: string): VerifiedIdentity {
  if (!value || typeof value !== 'object') throw new Error('Authentication failed');
  const candidate = value as Record<string, unknown>;
  const subject = safeDisplayClaim(candidate.sub);
  if (subject !== originalSubject) {
    throw new Error('Authentication failed');
  }
  return {
    sub: subject,
    email: safeDisplayClaim(candidate.email),
    name: safeDisplayClaim(candidate.name),
  };
}

/** Fetches and validates live UserInfo with caller-owned cancellation. */
export async function fetchVerifiedUserInfo(
  request: VerifiedUserInfoRequest,
  options: CliAuthOperationOptions,
): Promise<VerifiedIdentity> {
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
    return {
      status: 'authenticated',
      identity: validateUserInfo(await response.json(), request.credentials.userInfo.sub),
    };
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
