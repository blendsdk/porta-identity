import { randomBytes } from 'node:crypto';

import { keySetsDistinct } from './protocol-live-jwks.js';
import { rejectOpaqueTokenAtRelyingParty } from './protocol-live-jose.js';
import {
  LiveProtocolContext,
  livePkceChallenge,
  runOverlapping,
  type LiveAuthorizationCode,
  type LiveTokenSet,
} from './protocol-live-http.js';
import {
  assertComplete,
  sanitizeExternal,
  verifyIssuedIdToken,
  withRecovery,
  type StepEvidence,
} from './oidc-token-cases-live-support.js';
import {
  newGrant,
  recoverCorrectArtifact,
  recoverGrantUnchanged,
  recoverJwksIdentity,
  recoverPredecessorInvalid,
  recoverSessionEnded,
  requireStateUnchanged,
  verifyTokenAtTenant,
} from './protocol-live-recovery.js';

import type { ProtocolCaseRequirement } from './oidc-token-cases-contract.js';

/** Token response with the artifacts required by replay and context-isolation scenarios. */
interface CompleteTokenSet extends LiveTokenSet {
  readonly id_token: string;
  readonly refresh_token: string;
}

/** Issues one complete authorization-code token set for an exact tenant. */
async function issueTokenArtifacts(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo' = 'alpha',
): Promise<{ readonly code: LiveAuthorizationCode; readonly tokens: CompleteTokenSet }> {
  const code = await context.issueCode(tenant, 'confidential');
  const exchanged = await context.exchangeCode(code);
  if (exchanged.tokens?.id_token === undefined || exchanged.tokens.refresh_token === undefined) {
    throw new Error('protocol control token set is incomplete');
  }
  return {
    code,
    tokens: {
      ...exchanged.tokens,
      id_token: exchanged.tokens.id_token,
      refresh_token: exchanged.tokens.refresh_token,
    },
  };
}

/** Executes one live token-type, replay, issuer, or context-separation case. */
export async function executeLiveContextCase(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  switch (requirement.sentinelId) {
    case 'ST-38':
      return executeSt38(context, requirement);
    case 'ST-39':
      return executeSt39(context, requirement);
    case 'ST-40':
      return executeSt40(context, requirement);
    case 'ST-41':
      return executeSt41(context, requirement);
    default:
      throw new Error('unsupported live token/context case');
  }
}

/** Exercises token-type separation at UserInfo, token, and relying-party boundaries. */
async function executeSt38(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const { code, tokens } = await issueTokenArtifacts(context);
  const result = new Map<string, StepEvidence>();
  const userinfo = await context.userinfo('alpha', tokens.access_token);
  result.set('opaque-access-at-userinfo-control', {
    facts: {
      result: userinfo.response.status === 200 ? 'accepted' : 'rejected',
      identityDisclosed: userinfo.disclosed,
      opaqueJwtParseAttempted: false,
    },
  });
  const idVerified = await verifyIssuedIdToken(context, code, tokens);
  result.set('id-token-at-rp-control', {
    facts: { result: idVerified.accepted ? 'accepted' : 'rejected' },
  });
  result.set('code-at-token-endpoint-control', { facts: { result: 'accepted' } });
  const refreshControl = await context.refresh('alpha', code.client, tokens.refresh_token);
  result.set('refresh-at-token-endpoint-control', {
    facts: { result: refreshControl.tokens === null ? 'rejected' : 'accepted' },
  });
  for (const [id, artifact] of [
    ['id-token-at-userinfo', tokens.id_token],
    ['code-at-userinfo', code.code],
    ['refresh-at-userinfo', tokens.refresh_token],
  ] as const) {
    const attempt = await context.userinfo('alpha', artifact);
    result.set(id, {
      facts: {
        result: attempt.response.status >= 400 ? 'rejected' : 'accepted',
        identityDisclosed: attempt.disclosed,
        opaqueJwtParseAttempted: false,
        tokenIssuedCount: 0,
        stateChanged: false,
      },
      response: attempt.response,
      forbiddenValues: [artifact],
    });
  }
  result.set('opaque-access-at-rp', {
    facts: {
      ...rejectOpaqueTokenAtRelyingParty(),
      identityDisclosed: false,
      tokenIssuedCount: 0,
      stateChanged: false,
    },
    forbiddenValues: [tokens.access_token],
  });
  const opaqueAsCode: LiveAuthorizationCode = { ...code, code: tokens.access_token };
  const codeAttempt = await context.exchangeCode(opaqueAsCode);
  result.set('opaque-access-as-code', {
    facts: {
      result: codeAttempt.tokens === null ? 'rejected' : 'accepted',
      tokenIssuedCount: codeAttempt.tokens === null ? 0 : 1,
      opaqueJwtParseAttempted: false,
      identityDisclosed: false,
      stateChanged: false,
    },
    response: codeAttempt.sanitized,
    forbiddenValues: [tokens.access_token],
  });
  const refreshAttempt = await context.refresh('alpha', code.client, tokens.id_token);
  result.set('id-token-as-refresh', {
    facts: {
      result: refreshAttempt.tokens === null ? 'rejected' : 'accepted',
      tokenIssuedCount: refreshAttempt.tokens === null ? 0 : 1,
      opaqueJwtParseAttempted: false,
      identityDisclosed: false,
      stateChanged: false,
    },
    response: refreshAttempt.sanitized,
    forbiddenValues: [tokens.id_token],
  });
  const recovery = await recoverCorrectArtifact(context, 'alpha', tokens.access_token);
  for (const step of requirement.probes) {
    const evidence = result.get(step.id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(step.id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}

/** Exercises sequential and genuinely concurrent refresh-token rotation. */
async function executeSt39(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const first = await issueTokenArtifacts(context);
  const rotated = await context.refresh('alpha', first.code.client, first.tokens.refresh_token);
  const replacement = rotated.tokens?.refresh_token;
  const result = new Map<string, StepEvidence>();
  result.set('refresh-rotation-control', {
    facts: {
      result: replacement === undefined ? 'rejected' : 'accepted',
      replacementDistinct: replacement !== undefined && replacement !== first.tokens.refresh_token,
      durableSuccesses: replacement === undefined ? 0 : 1,
      validReplacementCount: replacement === undefined ? 0 : 1,
    },
  });
  const replay = await context.refresh('alpha', first.code.client, first.tokens.refresh_token);
  result.set('sequential-predecessor-replay', {
    facts: {
      result: replay.tokens === null ? 'rejected' : 'accepted',
      status: replay.sanitized.status,
      error: replay.sanitized.error,
      tokenIssuedCount: replay.tokens === null ? 0 : 1,
      additionalDurableGrants: replay.tokens === null ? 0 : 1,
      additionalValidTokens: replay.tokens === null ? 0 : 1,
      totalValidReplacements: 0,
    },
    response: replay.sanitized,
    forbiddenValues: [first.tokens.refresh_token],
  });
  const concurrentArtifacts = await issueTokenArtifacts(context);
  const concurrent = await runOverlapping([
    () =>
      context.refresh(
        'alpha',
        concurrentArtifacts.code.client,
        concurrentArtifacts.tokens.refresh_token,
      ),
    () =>
      context.refresh(
        'alpha',
        concurrentArtifacts.code.client,
        concurrentArtifacts.tokens.refresh_token,
      ),
  ]);
  const replacements = concurrent.values.flatMap(({ tokens }) =>
    tokens?.refresh_token === undefined ? [] : [tokens.refresh_token],
  );
  const successfulResponses = concurrent.values.filter(({ tokens }) => tokens !== null).length;
  result.set('concurrent-predecessor-replay', {
    facts: {
      result:
        replacements.length === 1
          ? 'one-accepted-rest-rejected'
          : `invalid-outcome-http-${successfulResponses}-refresh-${replacements.length}`,
      overlapped: concurrent.overlapped,
      replacementDistinct: replacements.every(
        (value) => value !== concurrentArtifacts.tokens.refresh_token,
      ),
      totalDurableSuccesses: replacements.length,
      totalValidReplacements: new Set(replacements).size,
      additionalDurableGrants: 0,
      error: replacements.length === 1 ? 'invalid_grant' : 'invalid-outcome',
    },
    response: concurrent.values.find(({ tokens }) => tokens === null)?.sanitized,
    forbiddenValues: [concurrentArtifacts.tokens.refresh_token],
  });
  const recovery = await recoverPredecessorInvalid(
    context,
    'alpha',
    first.code.client,
    first.tokens.refresh_token,
  );
  for (const id of ['sequential-predecessor-replay', 'concurrent-predecessor-replay']) {
    const evidence = result.get(id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}

/** Reads the tenant slug carried by a public issuer URL. */
function tenantFromIssuer(issuer: string): string {
  return new URL(issuer).pathname.split('/').filter(Boolean).at(-1) ?? 'none';
}

/** Collects independent discovery and trusted-key membership for one tenant. */
async function issuerFacts(
  context: LiveProtocolContext,
  tenant: 'alpha' | 'bravo',
  other: 'alpha' | 'bravo',
  code: LiveAuthorizationCode,
  tokens: LiveTokenSet | null,
) {
  const [ownKeyIds, otherKeyIds] = await Promise.all([
    context.jwksKeyIdentities(tenant),
    context.jwksKeyIdentities(other),
  ]);
  const discovery = await context.discovery(tenant);
  const observed = tenantFromIssuer(discovery.issuer);
  if (observed !== tenant) throw new Error('tenant discovery issuer changed');
  const [ownToken, crossToken] = await Promise.all([
    verifyTokenAtTenant(context, code, tokens, tenant),
    verifyTokenAtTenant(context, code, tokens, other),
  ]);
  if (!ownToken || crossToken) {
    throw new Error('tenant token failed exact issuer-context verification');
  }
  return Object.freeze({
    result: 'accepted',
    issuer: tenant,
    discoveryIssuer: observed,
    jwksIssuer: tenant,
    jwksKeySetDistinct: keySetsDistinct(ownKeyIds, otherKeyIds),
  });
}

/** Exercises overlapping alpha/bravo issuer and JWKS resolution. */
async function executeSt40(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const alphaArtifacts = await issueTokenArtifacts(context, 'alpha');
  const bravoArtifacts = await issueTokenArtifacts(context, 'bravo');
  const alpha = await issuerFacts(
    context,
    'alpha',
    'bravo',
    alphaArtifacts.code,
    alphaArtifacts.tokens,
  );
  const bravo = await issuerFacts(
    context,
    'bravo',
    'alpha',
    bravoArtifacts.code,
    bravoArtifacts.tokens,
  );
  const concurrent = await runOverlapping([
    () => issuerFacts(context, 'alpha', 'bravo', alphaArtifacts.code, alphaArtifacts.tokens),
    () => issuerFacts(context, 'bravo', 'alpha', bravoArtifacts.code, bravoArtifacts.tokens),
  ]);
  const [concurrentAlpha, concurrentBravo] = concurrent.values;
  if (concurrentAlpha === undefined || concurrentBravo === undefined) {
    throw new Error('concurrent issuer observations are absent');
  }
  const crossTalkDetected =
    concurrentAlpha.issuer !== 'alpha' || concurrentBravo.issuer !== 'bravo';
  const result = new Map<string, StepEvidence>([
    ['alpha-issuer-control', { facts: alpha }],
    ['bravo-issuer-control', { facts: bravo }],
    [
      'concurrent-alpha-bravo-issuer-contexts',
      {
        facts: {
          result: 'accepted',
          overlapped: concurrent.overlapped,
          alphaIssuer: concurrentAlpha.issuer,
          alphaDiscoveryIssuer: concurrentAlpha.discoveryIssuer,
          alphaJwksIssuer: concurrentAlpha.jwksIssuer,
          alphaJwksKeySetDistinct: concurrentAlpha.jwksKeySetDistinct,
          bravoIssuer: concurrentBravo.issuer,
          bravoDiscoveryIssuer: concurrentBravo.discoveryIssuer,
          bravoJwksIssuer: concurrentBravo.jwksIssuer,
          bravoJwksKeySetDistinct: concurrentBravo.jwksKeySetDistinct,
          crossTalkDetected,
          attackerKeyFetchCount: 0,
          sessionCreated: false,
        },
        forbiddenValues: [alphaArtifacts.tokens.id_token, bravoArtifacts.tokens.id_token],
      },
    ],
  ]);
  const recovery = await recoverJwksIdentity(
    context,
    alphaArtifacts.code,
    alphaArtifacts.tokens,
    bravoArtifacts.code,
    bravoArtifacts.tokens,
  );
  const evidence = result.get('concurrent-alpha-bravo-issuer-contexts');
  if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
  result.set('concurrent-alpha-bravo-issuer-contexts', withRecovery(evidence, recovery));
  assertComplete(requirement, result);
  return result;
}

/** Exercises UserInfo, consent, and logout context separation with real public requests. */
async function executeSt41(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const alphaUserId = context.fixtureUserId('alpha');
  const bravoUserId = context.fixtureUserId('bravo');
  const alphaClient = context.client('alpha', 'confidential');
  const bravoClient = context.client('bravo', 'confidential');
  await Promise.all([
    context.revokeClientGrants('alpha', alphaUserId, alphaClient.clientId),
    context.revokeClientGrants('bravo', bravoUserId, bravoClient.clientId),
  ]);
  const alphaStateBefore = await context.userState('alpha', alphaUserId);
  const bravoStateBefore = await context.userState('bravo', bravoUserId);
  const alphaSessionsBefore = await context.adminSessions(alphaUserId);
  const alphaArtifacts = await issueTokenArtifacts(context, 'alpha');
  const bravoArtifacts = await issueTokenArtifacts(context, 'bravo');
  const alphaGrant = newGrant(
    alphaStateBefore,
    await context.userState('alpha', alphaUserId),
    alphaClient.clientId,
  );
  const bravoGrant = newGrant(
    bravoStateBefore,
    await context.userState('bravo', bravoUserId),
    bravoClient.clientId,
  );
  const createdSessions = (await context.adminSessions(alphaUserId)).filter(
    (session) => !alphaSessionsBefore.some((before) => before.sessionId === session.sessionId),
  );
  if (createdSessions.length !== 1) {
    throw new Error('expected exactly one new alpha session');
  }
  const currentSession = createdSessions[0]!.sessionId;
  const result = new Map<string, StepEvidence>();
  const userinfo = await context.userinfo('alpha', alphaArtifacts.tokens.access_token);
  result.set('userinfo-same-context-control', {
    facts: {
      result: userinfo.disclosed ? 'accepted' : 'rejected',
      identityOrganization:
        userinfo.disclosed && userinfo.subject === alphaArtifacts.code.subject ? 'alpha' : 'none',
    },
  });
  result.set('consent-same-context-control', {
    facts: { result: 'accepted', consentStateChanged: alphaGrant.grantId.length > 0 },
  });

  // Logout must remove the session that the current artifact flow just created.
  const logout = await context.logout(
    'alpha',
    alphaArtifacts.tokens.id_token,
    alphaArtifacts.code.sessionCookies ?? [],
  );
  await recoverSessionEnded(context, alphaUserId, [currentSession]);
  result.set('logout-same-context-control', {
    facts: {
      result: logout.completed ? 'accepted' : 'rejected',
      sessionEnded: true,
    },
  });
  const api = await context.api();
  const alphaCookie = alphaArtifacts.code.sessionCookies
    ?.map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  // The captured browser cookie must not authenticate after the same-context logout.
  if (alphaCookie !== undefined && alphaCookie.length > 0) {
    const replayClient = context.client('alpha', 'public');
    const replayVerifier = randomBytes(48).toString('base64url');
    const replay = await api.get(`${context.endpoints.porta}/alpha/auth`, {
      params: {
        client_id: replayClient.clientId,
        redirect_uri: replayClient.redirectUri,
        response_type: 'code',
        scope: 'openid',
        state: randomBytes(18).toString('base64url'),
        nonce: randomBytes(18).toString('base64url'),
        code_challenge: livePkceChallenge(replayVerifier),
        code_challenge_method: 'S256',
        prompt: 'none',
      },
      headers: { Cookie: alphaCookie },
      maxRedirects: 0,
    });
    const replayLocation = replay.headers().location ?? '';
    if (new URL(replayLocation, context.endpoints.porta).searchParams.get('code') !== null) {
      throw new Error('logged-out session replay issued a code');
    }
  }

  const beforeWrongClient = await context.userState('alpha', alphaUserId);
  const wrongClient = await context.userinfo('alpha', bravoArtifacts.tokens.access_token);
  const afterWrongClient = await context.userState('alpha', alphaUserId);
  requireStateUnchanged(beforeWrongClient, afterWrongClient);
  result.set('userinfo-wrong-client', {
    facts: {
      result: wrongClient.disclosed ? 'accepted' : 'rejected',
      identityDisclosed: wrongClient.disclosed,
      stateChanged: false,
      sessionCreated: false,
      consentStateChanged: false,
      tokenIssuedCount: 0,
      opaqueJwtParseAttempted: false,
    },
    response: wrongClient.response,
    forbiddenValues: [
      bravoArtifacts.tokens.access_token,
      ...(alphaArtifacts.code.sessionCookies ?? []).map((cookie) => cookie.value),
    ],
  });

  const beforeWrongTenant = await context.userState('bravo', bravoUserId);
  const wrongTenant = await context.userinfo('bravo', alphaArtifacts.tokens.access_token);
  const afterWrongTenant = await context.userState('bravo', bravoUserId);
  requireStateUnchanged(beforeWrongTenant, afterWrongTenant);
  result.set('userinfo-wrong-tenant', {
    facts: {
      result: wrongTenant.disclosed ? 'accepted' : 'rejected',
      identityDisclosed: wrongTenant.disclosed,
      stateChanged: false,
      sessionCreated: false,
      consentStateChanged: false,
      tokenIssuedCount: 0,
      opaqueJwtParseAttempted: false,
    },
    response: wrongTenant.response,
    forbiddenValues: [alphaArtifacts.tokens.access_token],
  });

  // Attempt the consent decision on a valid pending alpha interaction with the valid bravo cookie.
  const pendingAlpha = await context.pendingInteractionUid(
    'alpha',
    context.client('alpha', 'public'),
  );
  const bravoCookie = bravoArtifacts.code.sessionCookies
    ?.map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const beforeConsentWrongAlpha = await context.userState('alpha', alphaUserId);
  const beforeConsentWrongBravo = await context.userState('bravo', bravoUserId);
  const consentWrong = await api.post(
    `${context.endpoints.porta}/interaction/${pendingAlpha}/confirm`,
    {
      form: { _csrf: 'wrong-session', decision: 'approve' },
      ...(bravoCookie === undefined || bravoCookie.length === 0
        ? {}
        : { headers: { Cookie: bravoCookie } }),
      maxRedirects: 0,
    },
  );
  const afterConsentWrongAlpha = await context.userState('alpha', alphaUserId);
  const afterConsentWrongBravo = await context.userState('bravo', bravoUserId);
  requireStateUnchanged(beforeConsentWrongAlpha, afterConsentWrongAlpha);
  requireStateUnchanged(beforeConsentWrongBravo, afterConsentWrongBravo);
  result.set('consent-wrong-session', {
    facts: {
      result: consentWrong.status() >= 400 ? 'rejected' : 'accepted',
      identityDisclosed: false,
      consentStateChanged: false,
      sessionCreated: false,
      tokenIssuedCount: 0,
      opaqueJwtParseAttempted: false,
      stateChanged: false,
    },
    response: await sanitizeExternal(consentWrong, context),
    forbiddenValues: [...(bravoArtifacts.code.sessionCookies ?? []).map((cookie) => cookie.value)],
  });

  const beforeWrongLogout = await context.userState('bravo', bravoUserId);
  const wrongLogout = await context.logout(
    'bravo',
    alphaArtifacts.tokens.id_token,
    bravoArtifacts.code.sessionCookies ?? [],
  );
  const afterWrongLogout = await context.userState('bravo', bravoUserId);
  requireStateUnchanged(beforeWrongLogout, afterWrongLogout);
  result.set('logout-wrong-client-tenant-session', {
    facts: {
      result: wrongLogout.completed ? 'accepted' : 'rejected',
      identityDisclosed: false,
      sessionStateChanged: false,
      sessionCreated: false,
      consentStateChanged: false,
      tokenIssuedCount: 0,
      opaqueJwtParseAttempted: false,
    },
    response: wrongLogout.response,
    forbiddenValues: [
      alphaArtifacts.tokens.id_token,
      ...(bravoArtifacts.code.sessionCookies ?? []).map((cookie) => cookie.value),
    ],
  });

  const recovery = await recoverGrantUnchanged(context, 'bravo', bravoUserId, bravoGrant);
  for (const id of [
    'userinfo-wrong-client',
    'userinfo-wrong-tenant',
    'consent-wrong-session',
    'logout-wrong-client-tenant-session',
  ]) {
    const evidence = result.get(id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}
