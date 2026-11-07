import { randomBytes } from 'node:crypto';

import { verifyIndependentIdToken } from './protocol-live-jose.js';
import {
  LiveProtocolContext,
  livePkceChallenge,
  runOverlapping,
  type LiveAuthorizationCode,
  type LiveProtocolClient,
  type LiveProtocolResponse,
} from './protocol-live-http.js';

import { executeLiveContextCase } from './oidc-token-cases-live-context.js';
import {
  assertComplete,
  requireRecovery,
  sanitizeExternal,
  verifyIssuedIdToken,
  withRecovery,
  type StepEvidence,
} from './oidc-token-cases-live-support.js';
import {
  clientStateRejected,
  freshClientState,
  newGrant,
  recoverConsumedCode,
  recoverFreshAuthorization,
  recoverGrantUnchanged,
  recoverTrustedToken,
  requireStateUnchanged,
} from './protocol-live-recovery.js';

import type {
  OidcTokenCasesContract,
  ProtocolCaseObservation,
  ProtocolCaseRequirement,
  ProtocolFactValue,
  ProtocolStepObservation,
  ProtocolStepRequirement,
} from './oidc-token-cases-contract.js';

/**
 * Closed client-side rejection observation used only when the relying party rejects before any
 * server request exists. It is deliberately labeled as a local observation; server rejections use
 * the parsed structured log instead.
 */
const clientSecurityLog = Object.freeze({
  event: 'protocol-security-rejection',
  fields: Object.freeze([
    'client-side-rejection',
    'synthetic-correlation-id',
    'event-class',
    'public-client-id-digest',
  ]),
});

/** Creates the live raw-HTTP and independent-JOSE adapter for the active retained harness run. */
export function createOidcTokenCasesLiveAdapter(): OidcTokenCasesContract {
  const context = new LiveProtocolContext();
  return Object.freeze({
    observeCase: async (requirement: ProtocolCaseRequirement) =>
      observeLiveCase(context, requirement),
  });
}

/** Maps each closed prohibited-effect key to independently observed public facts. */
function occurredSideEffects(
  keys: readonly string[],
  facts: Readonly<Record<string, ProtocolFactValue>>,
): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => {
        switch (key) {
          case 'code-issued-for-invalid-request':
            return [key, facts.codeIssued !== false];
          case 'response-sent-to-unregistered-uri':
            return [key, facts.responseSentToUnregisteredUri !== false];
          case 'token-issued-for-wrong-verifier':
          case 'grant-issued-to-unauthenticated-client':
          case 'token-grant-from-wrong-artifact':
            return [key, Number(facts.tokenIssuedCount ?? 0) !== 0];
          case 'second-token-grant':
            return [key, Number(facts.totalTokensIssued ?? facts.tokenIssuedCount ?? 0) > 1];
          case 'code-rebound-to-other-client-or-redirect':
            return [key, Number(facts.durableSuccesses ?? 0) !== 0];
          case 'multiple-durable-redemptions':
            return [key, Number(facts.totalDurableSuccesses ?? 0) > 1];
          case 'client-session-created-after-state-mismatch':
          case 'identity-or-session-created-from-invalid-token':
            return [key, facts.sessionCreated !== false];
          case 'consent-applied-to-other-interaction':
            return [key, facts.consentStateChanged !== false];
          case 'foreign-session-or-identity-disclosure':
          case 'identity-disclosure-to-wrong-artifact':
            return [key, facts.identityDisclosed !== false];
          case 'attacker-key-fetch':
            return [key, Number(facts.attackerKeyFetchCount ?? 0) !== 0];
          case 'issuer-or-jwks-cache-cross-talk':
            return [key, facts.crossTalkDetected !== false];
          case 'opaque-token-jwt-interpretation':
            return [key, facts.opaqueJwtParseAttempted !== false];
          case 'cross-context-session-change':
            return [
              key,
              !(
                facts.stateChanged === false ||
                facts.consentStateChanged === false ||
                facts.sessionStateChanged === false
              ),
            ];
          case 'predecessor-remains-valid':
            return [key, facts.error !== 'invalid_grant'];
          case 'multiple-valid-replacements':
            return [key, Number(facts.totalValidReplacements ?? 0) > 1];
          case 'additional-durable-grant-after-replay':
            return [key, Number(facts.additionalDurableGrants ?? 0) !== 0];
          default:
            throw new Error('unsupported live protocol side-effect key');
        }
      }),
    ),
  );
}

/** Builds one bounded immutable observation without retaining request artifacts. */
function observation(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
  step: ProtocolStepRequirement,
  evidence: StepEvidence,
): ProtocolStepObservation {
  let securityLog: ProtocolStepObservation['securityLog'];
  try {
    if (step.controlId === undefined) {
      securityLog = null;
    } else if (evidence.response === undefined) {
      context.scanLogsForForbiddenValues(evidence.forbiddenValues ?? []);
      securityLog = clientSecurityLog;
    } else {
      securityLog = context.securityLog(evidence.response, evidence.forbiddenValues ?? []);
    }
  } catch (error) {
    throw new Error(
      `${step.id}: ${error instanceof Error ? error.message : 'security-log observation failed'}`,
      { cause: error },
    );
  }
  return Object.freeze({
    id: step.id,
    transport: step.transport,
    boundary: step.boundary,
    facts: Object.freeze({ ...evidence.facts }),
    prohibitedSideEffects:
      step.controlId === undefined
        ? Object.freeze({})
        : occurredSideEffects(requirement.prohibitedSideEffects, evidence.facts),
    securityLog,
    recoveryObserved: step.controlId === undefined ? null : requireRecovery(evidence),
  });
}

/** Executes and assembles every control and probe for one immutable case. */
async function observeLiveCase(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ProtocolCaseObservation> {
  const evidence = await executeCase(context, requirement);
  const controls = requirement.controls.map((step) =>
    observation(context, requirement, step, requiredEvidence(evidence, step.id)),
  );
  const probes = requirement.probes.map((step) =>
    observation(context, requirement, step, requiredEvidence(evidence, step.id)),
  );
  return Object.freeze({ sentinelId: requirement.sentinelId, controls, probes });
}

/** Retrieves one required observation or fails the case closed. */
function requiredEvidence(evidence: ReadonlyMap<string, StepEvidence>, id: string): StepEvidence {
  const value = evidence.get(id);
  if (value === undefined) throw new Error('live protocol evidence is absent');
  return value;
}

/** Dispatches one protocol case to its public-boundary implementation. */
async function executeCase(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  switch (requirement.sentinelId) {
    case 'ST-33':
      return executeSt33(context, requirement);
    case 'ST-34':
      return executeSt34(context, requirement);
    case 'ST-35':
      return executeSt35(context, requirement);
    case 'ST-36':
      return executeSt36(context, requirement);
    case 'ST-37':
      return executeSt37(context, requirement);
    case 'ST-38':
      return executeLiveContextCase(context, requirement);
    case 'ST-39':
      return executeLiveContextCase(context, requirement);
    case 'ST-40':
      return executeLiveContextCase(context, requirement);
    case 'ST-41':
      return executeLiveContextCase(context, requirement);
  }
}

/** Creates an exact authorization request with valid PKCE defaults. */
function authorizationParameters(
  client: LiveProtocolClient,
  verifier: string,
): Record<string, string> {
  return {
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state: randomBytes(18).toString('base64url'),
    nonce: randomBytes(18).toString('base64url'),
    code_challenge: livePkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'login',
  };
}

/** Derives bounded rejection facts, including exact registered-redirect ownership. */
function rejectionFacts(
  response: LiveProtocolResponse,
  registeredRedirectUri: string,
): Readonly<Record<string, ProtocolFactValue>> {
  const responseSentToUnregisteredUri =
    response.location === null
      ? false
      : (() => {
          const observed = new URL(response.location, registeredRedirectUri);
          const registered = new URL(registeredRedirectUri);
          return observed.origin !== registered.origin || observed.pathname !== registered.pathname;
        })();
  return Object.freeze({
    result: 'rejected',
    status: response.status,
    error: response.error,
    responseLocation: response.location === null ? 'direct-response' : 'redirect-response',
    responseSentToUnregisteredUri,
    codeIssued: false,
  });
}

/** Exercises exact redirect matching and PKCE enforcement. */
async function executeSt33(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const result = new Map<string, StepEvidence>();
  const authorization = await context.issueCode('alpha');
  result.set('valid-s256-exact-redirect-control', {
    facts: {
      result: 'accepted',
      status: authorization.authorizationStatus,
      codeIssued: true,
    },
  });
  const tokenControlCode = await context.issueCode('alpha');
  const tokenControl = await context.exchangeCode(tokenControlCode);
  result.set('valid-s256-token-control', {
    facts: {
      result: tokenControl.tokens === null ? 'rejected' : 'accepted',
      status: tokenControl.sanitized.status,
      tokenIssuedCount: tokenControl.tokens === null ? 0 : 1,
    },
  });
  const client = context.client('alpha', 'public');
  const verifier = randomBytes(48).toString('base64url');
  const base = authorizationParameters(client, verifier);
  for (const [id, mutate] of [
    [
      'missing-pkce',
      (parameters: Record<string, string>) => {
        delete parameters.code_challenge;
        delete parameters.code_challenge_method;
      },
    ],
    [
      'plain-pkce',
      (parameters: Record<string, string>) => {
        parameters.code_challenge = verifier;
        parameters.code_challenge_method = 'plain';
      },
    ],
    [
      'one-character-redirect-change',
      (parameters: Record<string, string>) => {
        parameters.redirect_uri = `${client.redirectUri}x`;
      },
    ],
  ] as const) {
    const parameters = { ...base };
    mutate(parameters);
    const response = await context.authorizeRaw('alpha', parameters);
    result.set(id, {
      facts: rejectionFacts(response, client.redirectUri),
      response,
      forbiddenValues: [verifier, base.state, base.nonce],
    });
  }
  const wrongVerifierCode = await context.issueCode('alpha');
  const wrongVerifier = await context.exchangeCode(wrongVerifierCode, {
    verifier: randomBytes(48).toString('base64url'),
  });
  result.set('wrong-pkce-verifier', {
    facts: {
      result: 'rejected',
      status: wrongVerifier.sanitized.status,
      error: wrongVerifier.sanitized.error,
      tokenIssuedCount: wrongVerifier.tokens === null ? 0 : 1,
      codeIssued: false,
      responseLocation: 'direct-response',
      responseSentToUnregisteredUri: false,
    },
    response: wrongVerifier.sanitized,
    forbiddenValues: [wrongVerifierCode.code, wrongVerifierCode.verifier],
  });
  const recovery = await recoverFreshAuthorization(context);
  for (const id of [
    'missing-pkce',
    'plain-pkce',
    'one-character-redirect-change',
    'wrong-pkce-verifier',
  ]) {
    const evidence = result.get(id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}

/** Exercises authorization-code client, redirect, and replay binding. */
async function executeSt34(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const result = new Map<string, StepEvidence>();
  const controlCode = await context.issueCode('alpha');
  const control = await context.exchangeCode(controlCode);
  result.set('initiating-client-exact-redirect-control', {
    facts: {
      result: control.tokens === null ? 'rejected' : 'accepted',
      status: control.sanitized.status,
      durableSuccesses: control.tokens === null ? 0 : 1,
      tokenIssuedCount: control.tokens === null ? 0 : 1,
    },
  });
  const wrongClientCode = await context.issueCode('alpha');
  const wrongClient = await context.exchangeCode(wrongClientCode, {
    client: context.client('alpha', 'confidential'),
  });
  result.set('wrong-client-redemption', invalidGrantEvidence(wrongClient, wrongClientCode));
  const wrongRedirectCode = await context.issueCode('alpha');
  const wrongRedirect = await context.exchangeCode(wrongRedirectCode, {
    redirectUri: `${wrongRedirectCode.client.redirectUri}x`,
  });
  result.set('wrong-redirect-redemption', invalidGrantEvidence(wrongRedirect, wrongRedirectCode));
  const replayCode = await context.issueCode('alpha');
  const firstReplay = await context.exchangeCode(replayCode);
  const replay = await context.exchangeCode(replayCode);
  result.set('sequential-code-replay', {
    facts: {
      result: 'rejected',
      status: replay.sanitized.status,
      error: replay.sanitized.error,
      tokenIssuedCount: replay.tokens === null ? 0 : 1,
      totalDurableSuccesses: firstReplay.tokens === null ? 0 : 1,
    },
    response: replay.sanitized,
    forbiddenValues: [replayCode.code, replayCode.verifier],
  });
  const concurrentCode = await context.issueCode('alpha');
  const concurrent = await runOverlapping([
    () => context.exchangeCode(concurrentCode),
    () => context.exchangeCode(concurrentCode),
  ]);
  const successes = concurrent.values.filter(({ tokens }) => tokens !== null).length;
  result.set('concurrent-code-redemption', {
    facts: {
      result: successes === 1 ? 'one-accepted-rest-rejected' : 'invalid-outcome',
      overlapped: concurrent.overlapped,
      totalDurableSuccesses: successes,
      totalTokensIssued: successes,
    },
    response: concurrent.values.find(({ tokens }) => tokens === null)?.sanitized,
    forbiddenValues: [concurrentCode.code, concurrentCode.verifier],
  });
  const recovery = await recoverConsumedCode(context);
  for (const id of [
    'wrong-client-redemption',
    'wrong-redirect-redemption',
    'sequential-code-replay',
    'concurrent-code-redemption',
  ]) {
    const evidence = result.get(id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}

/** Converts one failed code exchange into the closed invalid-grant observation shape. */
function invalidGrantEvidence(
  outcome: Awaited<ReturnType<LiveProtocolContext['exchangeCode']>>,
  authorization: LiveAuthorizationCode,
): StepEvidence {
  return {
    facts: {
      result: 'rejected',
      status: outcome.sanitized.status,
      error: outcome.sanitized.error,
      tokenIssuedCount: outcome.tokens === null ? 0 : 1,
      durableSuccesses: outcome.tokens === null ? 0 : 1,
    },
    response: outcome.sanitized,
    forbiddenValues: [authorization.code, authorization.verifier],
  };
}

/** Exercises state, nonce, consent, and confidential-client request integrity. */
async function executeSt35(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const result = new Map<string, StepEvidence>();
  const alphaUserId = context.fixtureUserId('alpha');
  const stateCode = await context.issueCode('alpha', 'public', {
    state: 'client-generated-state-a',
  });
  result.set('state-round-trip-control', {
    facts: {
      result: 'accepted',
      returnedState: stateCode.state,
      clientStateVerified: stateCode.state === 'client-generated-state-a',
    },
  });
  const nonceCode = await context.issueCode('alpha', 'public', { nonce: 'client-nonce-a' });
  const nonceTokens = await context.exchangeCode(nonceCode);
  const verified = await verifyIssuedIdToken(context, nonceCode, nonceTokens.tokens);
  result.set('requested-nonce-control', {
    facts: { result: verified.accepted ? 'accepted' : 'rejected', idTokenNonce: nonceCode.nonce },
  });
  const confidentialClient = context.client('alpha', 'confidential');
  await context.revokeClientGrants('alpha', alphaUserId, confidentialClient.clientId);
  const beforeConsent = await context.userState('alpha', alphaUserId);
  const consentCode = await context.issueCode('alpha', 'confidential');
  const consentGrant = newGrant(
    beforeConsent,
    await context.userState('alpha', alphaUserId),
    confidentialClient.clientId,
  );
  result.set('same-interaction-consent-control', {
    facts: { result: 'accepted', grantCreated: true },
  });
  const confidentialCode = await context.issueCode('alpha', 'confidential');
  const confidentialTokens = await context.exchangeCode(confidentialCode);
  result.set('valid-confidential-client-control', {
    facts: {
      result: confidentialTokens.tokens === null ? 'rejected' : 'accepted',
      status: confidentialTokens.sanitized.status,
      clientAuthenticated: confidentialTokens.tokens !== null,
    },
  });

  // The client stores the state it sent, receives a callback with a substituted value, and
  // rejects it. The server state is snapshotted after the authorization and after that decision.
  const substituted = await context.issueCode('alpha', 'public', { state: freshClientState() });
  const beforeSubstitution = await context.userState('alpha', substituted.subject);
  const clientRejected = clientStateRejected(substituted.state, 'attacker-state');
  const afterSubstitution = await context.userState('alpha', substituted.subject);
  requireStateUnchanged(beforeSubstitution, afterSubstitution);
  result.set('state-substitution-client-rejection', {
    facts: {
      result: clientRejected ? 'client-rejected' : 'invalid-outcome',
      sessionCreated: false,
      consentStateChanged: false,
      tokenIssuedCount: 0,
      identityDisclosed: false,
    },
    forbiddenValues: [substituted.code, substituted.verifier, substituted.state],
  });

  // One valid pending public interaction is presented with the confidential session cookie.
  const pendingPublic = await context.pendingInteractionUid(
    'alpha',
    context.client('alpha', 'public'),
  );
  const consentCookie = consentCode.sessionCookies
    ?.map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const beforeCrossInteraction = await context.userState('alpha', consentCode.subject);
  const crossInteractionRaw = await (
    await context.api()
  ).post(`${context.endpoints.porta}/interaction/${pendingPublic}/confirm`, {
    form: { _csrf: 'wrong-interaction', decision: 'approve' },
    ...(consentCookie === undefined || consentCookie.length === 0
      ? {}
      : { headers: { Cookie: consentCookie } }),
    maxRedirects: 0,
  });
  const crossInteraction = await sanitizeExternal(crossInteractionRaw, context);
  const afterCrossInteraction = await context.userState('alpha', consentCode.subject);
  requireStateUnchanged(beforeCrossInteraction, afterCrossInteraction);
  result.set('cross-interaction-consent', {
    facts: {
      result: crossInteraction.status >= 400 ? 'rejected' : 'accepted',
      grantCreated: false,
      consentStateChanged: false,
      sessionCreated: false,
      tokenIssuedCount: 0,
      identityDisclosed: false,
    },
    response: crossInteraction,
    forbiddenValues: [...(consentCode.sessionCookies ?? []).map((cookie) => cookie.value)],
  });

  const authCode = await context.issueCode('alpha', 'confidential');
  for (const [id, secret] of [
    ['missing-confidential-client-authentication', undefined],
    ['wrong-confidential-client-secret', 'wrong-client-secret'],
  ] as const) {
    const api = await context.api();
    const before = await context.userState('alpha', authCode.subject);
    const response = await api.post(`${context.endpoints.porta}/alpha/token`, {
      form: {
        grant_type: 'authorization_code',
        code: authCode.code,
        redirect_uri: authCode.client.redirectUri,
        client_id: authCode.client.clientId,
        code_verifier: authCode.verifier,
        ...(secret === undefined ? {} : { client_secret: secret }),
      },
    });
    const sanitized = await sanitizeExternal(response, context);
    const after = await context.userState('alpha', authCode.subject);
    requireStateUnchanged(before, after);
    result.set(id, {
      facts: {
        result: 'rejected',
        status: sanitized.status,
        error: sanitized.error,
        tokenIssuedCount: 0,
        sessionCreated: false,
        consentStateChanged: false,
        identityDisclosed: false,
      },
      response: sanitized,
      forbiddenValues: [authCode.code, authCode.verifier, secret ?? ''],
    });
  }

  const recovery = await recoverGrantUnchanged(context, 'alpha', consentCode.subject, consentGrant);
  for (const id of [
    'state-substitution-client-rejection',
    'cross-interaction-consent',
    'missing-confidential-client-authentication',
    'wrong-confidential-client-secret',
  ]) {
    const evidence = result.get(id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}

/** Exercises independent verification of one valid emitted ID token. */
async function executeSt36(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const code = await context.issueCode('alpha', 'public', { nonce: 'client-nonce-a' });
  const exchanged = await context.exchangeCode(code);
  const verified = await verifyIssuedIdToken(context, code, exchanged.tokens);
  const result = new Map<string, StepEvidence>([
    ['independent-es256-p256-jwks-control', { facts: verified.facts }],
  ]);
  assertComplete(requirement, result);
  return result;
}

/** Creates a deliberately invalid token while preserving its compact serialization shape. */
function mutateJwt(
  token: string,
  mutation: {
    readonly header?: Record<string, unknown>;
    readonly payload?: Record<string, unknown>;
    readonly flipSignature?: boolean;
  },
): string {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('issued ID token is malformed');
  const [headerSegment, payloadSegment, signatureSegment] = segments;
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined
  ) {
    throw new Error('issued ID token segments are absent');
  }
  const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  const encodedHeader = Buffer.from(JSON.stringify({ ...header, ...mutation.header })).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify({ ...payload, ...mutation.payload })).toString(
    'base64url',
  );
  let signature = signatureSegment;
  if (mutation.flipSignature) {
    // Changing the final base64url character can alter only unused padding bits and decode to the
    // original signature. Flipping an actual decoded byte guarantees a distinct signature value.
    const bytes = Buffer.from(signatureSegment, 'base64url');
    if (bytes.length === 0) throw new Error('issued ID token signature is empty');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    signature = bytes.toString('base64url');
  }
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/** Exercises every closed signature, claim, lifetime, and key-location rejection. */
async function executeSt37(
  context: LiveProtocolContext,
  requirement: ProtocolCaseRequirement,
): Promise<ReadonlyMap<string, StepEvidence>> {
  const code = await context.issueCode('alpha', 'public', { nonce: 'client-nonce-a' });
  const exchanged = await context.exchangeCode(code);
  const token = exchanged.tokens?.id_token;
  if (token === undefined) throw new Error('issued token set omitted the ID token');
  const discovery = await context.discovery('alpha');
  const jwks = await context.jwks('alpha');
  const expectation = {
    issuer: discovery.issuer,
    audience: code.client.clientId,
    subject: code.subject,
    nonce: code.nonce,
    now: Math.floor(Date.now() / 1000),
  };
  const control = verifyIndependentIdToken(token, jwks, expectation);
  const result = new Map<string, StepEvidence>([
    [
      'trusted-id-token-control',
      {
        facts: {
          result: control.accepted ? 'accepted' : 'rejected',
          signatureValid: control.facts.signatureValid ?? false,
        },
      },
    ],
  ]);
  const mutations: Readonly<Record<string, Parameters<typeof mutateJwt>[1]>> = {
    'forged-algorithm': { header: { alg: 'HS256' } },
    'forged-signing-key': { flipSignature: true },
    'wrong-issuer': { payload: { iss: 'https://attacker.invalid' } },
    'wrong-audience': { payload: { aud: 'other-client' } },
    'wrong-subject': { payload: { sub: 'other-subject' } },
    'expired-token': { payload: { exp: expectation.now - 1 } },
    'not-yet-valid-token': { payload: { nbf: expectation.now + 3600 } },
    'unknown-kid': { header: { kid: 'unknown' } },
    'attacker-jku': { header: { jku: 'https://attacker.invalid/jwks' } },
    'attacker-x5u': { header: { x5u: 'https://attacker.invalid/cert' } },
    'attacker-embedded-jwk': { header: { jwk: { kty: 'EC' } } },
  };
  for (const step of requirement.probes) {
    const mutation = mutations[step.id];
    if (mutation === undefined) throw new Error('unregistered ID-token mutation');
    const checked = verifyIndependentIdToken(mutateJwt(token, mutation), jwks, expectation);
    result.set(step.id, {
      facts: {
        result: checked.accepted ? 'accepted' : 'rejected',
        sessionCreated: false,
        attackerKeyFetchCount: 0,
        crossTalkDetected: false,
      },
      forbiddenValues: [token],
    });
  }
  const recovery = await recoverTrustedToken(context, code, exchanged.tokens);
  for (const step of requirement.probes) {
    const evidence = result.get(step.id);
    if (evidence === undefined) throw new Error('live protocol probe evidence is absent');
    result.set(step.id, withRecovery(evidence, recovery));
  }
  assertComplete(requirement, result);
  return result;
}
