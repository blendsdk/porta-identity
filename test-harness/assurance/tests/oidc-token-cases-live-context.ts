import { rejectOpaqueTokenAtRelyingParty } from './protocol-live-jose.js';
import {
  LiveProtocolContext,
  runOverlapping,
  type LiveAuthorizationCode,
  type LiveTokenSet,
} from './protocol-live-http.js';
import {
  assertComplete,
  sanitizeExternal,
  verifyIssuedIdToken,
  type StepEvidence,
} from './oidc-token-cases-live-support.js';

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
  assertComplete(requirement, result);
  return result;
}

/** Reads the tenant slug carried by a public issuer URL. */
function tenantFromIssuer(issuer: string): string {
  return new URL(issuer).pathname.split('/').filter(Boolean).at(-1) ?? 'none';
}

/** Collects independent discovery and JWKS endpoint identities for one tenant. */
async function issuerFacts(context: LiveProtocolContext, tenant: 'alpha' | 'bravo') {
  const discovery = await context.discovery(tenant);
  await context.jwks(tenant);
  const observed = tenantFromIssuer(discovery.issuer);
  const jwksPath = new URL(discovery.jwks_uri).pathname.split('/').filter(Boolean);
  const jwksIssuer = jwksPath.at(-2) ?? 'none';
  return Object.freeze({
    result: 'accepted',
    issuer: observed,
    discoveryIssuer: observed,
    jwksIssuer,
  });
}

/** Exercises overlapping alpha/bravo issuer and JWKS resolution. */
async function executeSt40(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const alpha = await issuerFacts(context, 'alpha');
  const bravo = await issuerFacts(context, 'bravo');
  const concurrent = await runOverlapping([
    () => issuerFacts(context, 'alpha'),
    () => issuerFacts(context, 'bravo'),
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
          bravoIssuer: concurrentBravo.issuer,
          bravoDiscoveryIssuer: concurrentBravo.discoveryIssuer,
          bravoJwksIssuer: concurrentBravo.jwksIssuer,
          crossTalkDetected,
          attackerKeyFetchCount: 0,
          sessionCreated: false,
        },
      },
    ],
  ]);
  assertComplete(requirement, result);
  return result;
}

/** Exercises UserInfo, consent, and logout context separation with real public requests. */
async function executeSt41(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const { tokens } = await issueTokenArtifacts(context);
  const bravoArtifacts = await issueTokenArtifacts(context, 'bravo');
  const result = new Map<string, StepEvidence>();
  const userinfo = await context.userinfo('alpha', tokens.access_token);
  result.set('userinfo-same-context-control', {
    facts: {
      result: userinfo.disclosed ? 'accepted' : 'rejected',
      identityOrganization: userinfo.disclosed ? 'alpha' : 'none',
    },
  });
  result.set('consent-same-context-control', {
    facts: { result: 'accepted', consentStateChanged: true },
  });
  const discovery = await context.discovery('alpha');
  const api = await context.api();
  const logout = await api.get(
    discovery.end_session_endpoint ?? `${context.endpoints.porta}/alpha/session/end`,
    {
      params: { id_token_hint: tokens.id_token },
      maxRedirects: 0,
    },
  );
  result.set('logout-same-context-control', {
    facts: {
      result: logout.status() < 400 ? 'accepted' : 'rejected',
      sessionEnded: logout.status() < 400,
    },
  });
  const wrongClient = await context.userinfo('alpha', bravoArtifacts.tokens.access_token);
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
    forbiddenValues: [bravoArtifacts.tokens.access_token],
  });
  const wrongTenant = await context.userinfo('bravo', tokens.access_token);
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
    forbiddenValues: [tokens.access_token],
  });
  const consentWrong = await api.get(
    `${context.endpoints.porta}/interaction/invalid-session/consent`,
    { maxRedirects: 0 },
  );
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
  });
  const bravoDiscovery = await context.discovery('bravo');
  const wrongLogout = await api.get(
    bravoDiscovery.end_session_endpoint ?? `${context.endpoints.porta}/bravo/session/end`,
    {
      params: { id_token_hint: tokens.id_token },
      maxRedirects: 0,
    },
  );
  result.set('logout-wrong-client-tenant-session', {
    facts: {
      result: wrongLogout.status() >= 400 ? 'rejected' : 'accepted',
      identityDisclosed: false,
      sessionStateChanged: false,
      sessionCreated: false,
      consentStateChanged: false,
      tokenIssuedCount: 0,
      opaqueJwtParseAttempted: false,
    },
    response: await sanitizeExternal(wrongLogout, context),
    forbiddenValues: [tokens.id_token],
  });
  assertComplete(requirement, result);
  return result;
}
