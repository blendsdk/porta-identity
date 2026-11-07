/**
 * Independent recovery observations for the live protocol adapter.
 *
 * Each helper performs a real public-boundary operation after the adversarial probes and returns
 * the exact requirement label only when the observation passes. The live adapter fails closed when
 * a probe has no verified recovery value.
 */

import { randomBytes } from 'node:crypto';

import { verifyIssuedIdToken } from './oidc-token-cases-live-support.js';
import { verifyIndependentIdToken } from './protocol-live-jose.js';
import type {
  LiveAuthorizationCode,
  LiveConnectedApp,
  LiveProtocolContext,
  LiveTokenSet,
  LiveUserState,
} from './protocol-live-http.js';

/** Exact recovery labels from the immutable protocol profiles. */
export const PROTOCOL_RECOVERY = Object.freeze({
  /** A fresh exact-redirect S256 authorization still succeeds. */
  freshAuthorization: 'fresh-exact-redirect-s256-authorization-remains-usable',
  /** A consumed authorization code remains rejected on replay. */
  consumedCode: 'consumed-code-remains-consumed',
  /** The original interaction's grant remains authoritative and unchanged. */
  originalInteraction: 'original-interaction-state-remains-authoritative',
  /** The trusted current key and valid claims remain usable. */
  trustedToken: 'trusted-current-key-and-valid-claims-remain-usable',
  /** The correct artifact still works at its correct consumer. */
  correctArtifact: 'correct-artifact-at-correct-consumer-remains-usable',
  /** The rotated predecessor refresh token remains invalid. */
  predecessorInvalid: 'predecessor-remains-invalid-across-processes',
} as const);

/** Union of the exact recovery labels. */
export type ProtocolRecovery = (typeof PROTOCOL_RECOVERY)[keyof typeof PROTOCOL_RECOVERY];

/** Issues one fresh authorization to prove the exact-redirect S256 path still works. */
export async function recoverFreshAuthorization(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo' = 'alpha',
): Promise<ProtocolRecovery> {
  await context.issueCode(tenant);
  return PROTOCOL_RECOVERY.freshAuthorization;
}

/** Issues, consumes and replays a fresh code to prove the consumed-code invariant still holds. */
export async function recoverConsumedCode(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo' = 'alpha',
): Promise<ProtocolRecovery> {
  const code = await context.issueCode(tenant);
  const first = await context.exchangeCode(code);
  if (first.tokens === null) throw new Error('consumed-code recovery control failed');
  const replay = await context.exchangeCode(code);
  if (replay.tokens !== null || replay.sanitized.error !== 'invalid_grant') {
    throw new Error('consumed authorization code remained redeemable');
  }
  return PROTOCOL_RECOVERY.consumedCode;
}

/** Re-verifies one known-good ID token after the forgery probes. */
export async function recoverTrustedToken(
  context: LiveProtocolContext,
  code: LiveAuthorizationCode,
  tokens: LiveTokenSet | null,
): Promise<ProtocolRecovery> {
  const verified = await verifyIssuedIdToken(context, code, tokens);
  if (!verified.accepted) throw new Error('trusted ID token became unusable');
  return PROTOCOL_RECOVERY.trustedToken;
}

/** Reuses the correct opaque access token at UserInfo after the artifact probes. */
export async function recoverCorrectArtifact(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo',
  accessToken: string,
): Promise<ProtocolRecovery> {
  const userinfo = await context.userinfo(tenant, accessToken);
  if (userinfo.response.status !== 200 || !userinfo.disclosed) {
    throw new Error('correct artifact became unusable at its consumer');
  }
  return PROTOCOL_RECOVERY.correctArtifact;
}

/** Replays one rotated predecessor after a real process restart. */
export async function recoverPredecessorInvalid(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo',
  client: LiveAuthorizationCode['client'],
  predecessor: string,
): Promise<ProtocolRecovery> {
  await context.restartServer();
  const replay = await context.refresh(tenant, client, predecessor);
  if (replay.tokens !== null || replay.sanitized.error !== 'invalid_grant') {
    throw new Error('rotated predecessor remained valid after restart');
  }
  return PROTOCOL_RECOVERY.predecessorInvalid;
}

/** Verifies one issued token against a specific tenant's discovery, JWKS and exact claims. */
export async function verifyTokenAtTenant(
  context: LiveProtocolContext,
  code: LiveAuthorizationCode,
  tokens: LiveTokenSet | null,
  tenant: 'alpha' | 'bravo',
): Promise<boolean> {
  if (tokens?.id_token === undefined) return false;
  const discovery = await context.discovery(tenant);
  const jwks = await context.jwks(tenant);
  return verifyIndependentIdToken(tokens.id_token, jwks, {
    issuer: discovery.issuer,
    audience: code.client.clientId,
    subject: code.subject,
    nonce: code.nonce,
    now: Math.floor(Date.now() / 1000),
  }).accepted;
}

/** Re-verifies both tenant tokens in their own context and rejects them in the other context. */
export async function recoverJwksIdentity(
  context: LiveProtocolContext,
  alphaCode: LiveAuthorizationCode,
  alphaTokens: LiveTokenSet | null,
  bravoCode: LiveAuthorizationCode,
  bravoTokens: LiveTokenSet | null,
): Promise<ProtocolRecovery> {
  const [alphaOwn, alphaCross, bravoOwn, bravoCross] = await Promise.all([
    verifyTokenAtTenant(context, alphaCode, alphaTokens, 'alpha'),
    verifyTokenAtTenant(context, alphaCode, alphaTokens, 'bravo'),
    verifyTokenAtTenant(context, bravoCode, bravoTokens, 'bravo'),
    verifyTokenAtTenant(context, bravoCode, bravoTokens, 'alpha'),
  ]);
  if (!tenantTokenContextsValid(alphaOwn, alphaCross, bravoOwn, bravoCross)) {
    throw new Error('tenant token no longer verifies only in its exact issuer context');
  }
  return PROTOCOL_RECOVERY.trustedToken;
}

/** Returns the single grant created for one client between two state snapshots. */
export function newGrant(
  before: LiveUserState,
  after: LiveUserState,
  clientId: string,
): LiveConnectedApp {
  const beforeIds = new Set(before.connectedApps.map((app) => app.grantId));
  const created = after.connectedApps.filter(
    (app) => app.clientId === clientId && !beforeIds.has(app.grantId),
  );
  if (created.length !== 1) throw new Error('expected exactly one new connected app');
  return created[0]!;
}

/** Returns whether one expected grant still matches the observed stable fields. */
export function sameGrant(
  expected: LiveConnectedApp,
  observed: LiveConnectedApp | undefined,
): boolean {
  return (
    observed !== undefined &&
    observed.grantId === expected.grantId &&
    observed.clientId === expected.clientId &&
    observed.applicationId === expected.applicationId &&
    observed.createdAt === expected.createdAt &&
    observed.expiresAt === expected.expiresAt &&
    observed.scopes.join(' ') === expected.scopes.join(' ')
  );
}

/** Returns whether every session observed before logout is absent afterwards. */
export function sessionEnded(
  sessionsBefore: readonly string[],
  sessionsAfter: readonly string[],
): boolean {
  return (
    sessionsBefore.length > 0 &&
    sessionsBefore.every((sessionId) => !sessionsAfter.includes(sessionId))
  );
}

/** Returns whether both tenant tokens verify only in their exact issuer context. */
export function tenantTokenContextsValid(
  alphaOwn: boolean,
  alphaCross: boolean,
  bravoOwn: boolean,
  bravoCross: boolean,
): boolean {
  return alphaOwn && !alphaCross && bravoOwn && !bravoCross;
}

/** Requires an expected grant to remain identical on its bounded fields. */
export async function recoverGrantUnchanged(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo',
  userId: string,
  expected: LiveConnectedApp,
): Promise<ProtocolRecovery> {
  const state = await context.userState(tenant, userId);
  const observed = state.connectedApps.find((app) => app.grantId === expected.grantId);
  if (!sameGrant(expected, observed)) {
    throw new Error('original interaction grant changed after a probe');
  }
  return PROTOCOL_RECOVERY.originalInteraction;
}

/** Requires every session observed before a logout to be absent from the active set. */
export async function recoverSessionEnded(
  context: LiveProtocolContext,
  userId: string,
  sessionsBefore: readonly string[],
): Promise<ProtocolRecovery> {
  if (sessionsBefore.length === 0) throw new Error('no session was observed before logout');
  const after = (await context.adminSessions(userId)).map((session) => session.sessionId);
  if (!sessionEnded(sessionsBefore, after)) {
    throw new Error('logout left the original session active');
  }
  return PROTOCOL_RECOVERY.originalInteraction;
}

/** Requires the user's stable session and consent fields to be identical after a probe. */
export function requireStateUnchanged(before: LiveUserState, after: LiveUserState): void {
  const sessions = (state: LiveUserState): string =>
    state.activeSessions
      .map((session) =>
        [
          session.sessionId,
          session.userId ?? '',
          session.clientId ?? '',
          session.organizationId ?? '',
          session.grantId ?? '',
          session.createdAt,
          // Session activity intentionally rolls the expiry; authority is unchanged.
          session.revokedAt ?? '',
        ].join(':'),
      )
      .sort()
      .join('|');
  const grants = (state: LiveUserState): string =>
    state.connectedApps
      .map((app) =>
        [
          app.grantId,
          app.clientId,
          app.applicationId,
          app.createdAt,
          app.expiresAt ?? '',
          app.scopes.join(','),
        ].join(':'),
      )
      .sort()
      .join('|');
  const beforeSessions = sessions(before);
  const afterSessions = sessions(after);
  if (beforeSessions !== afterSessions) {
    throw new Error(`probe changed the user session state: ${beforeSessions} -> ${afterSessions}`);
  }
  const beforeGrants = grants(before);
  const afterGrants = grants(after);
  if (beforeGrants !== afterGrants) {
    throw new Error(`probe changed the consent state: ${beforeGrants} -> ${afterGrants}`);
  }
}

/** Generates a fresh client state value for a real authorization request. */
export function freshClientState(): string {
  return randomBytes(18).toString('base64url');
}

/** Returns whether a client must reject a callback because its state does not match. */
export function clientStateRejected(expected: string, received: string): boolean {
  return expected !== received;
}
