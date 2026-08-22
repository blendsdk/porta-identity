import {
  oidcTokenClaimRequirements,
  oidcTokenSliceProfiles,
  type ProtocolSliceId,
} from './oidc-token-slice-profile-requirements.js';

import type {
  ProtocolCaseRequirement,
  ProtocolFactValue,
  ProtocolInputValue,
  ProtocolStepRequirement,
} from './oidc-token-cases-contract.js';

/** Compact authoring shape used to build immutable control and probe steps. */
type StepDefinition = Readonly<{
  id: string;
  controlId?: string;
  transport?: 'raw-http' | 'independent-jose';
  boundary?: 'spa' | 'bff' | 'raw-http-jose';
  inputs?: Readonly<Record<string, ProtocolInputValue>>;
  expectedFacts: Readonly<Record<string, ProtocolFactValue>>;
}>;

/** Normalizes one requirement-owned step without importing runtime behavior. */
function step(definition: StepDefinition): ProtocolStepRequirement {
  return {
    id: definition.id,
    ...(definition.controlId === undefined ? {} : { controlId: definition.controlId }),
    transport: definition.transport ?? 'raw-http',
    boundary: definition.boundary ?? 'raw-http-jose',
    inputs: definition.inputs ?? {},
    expectedFacts: definition.expectedFacts,
  };
}

/** Combines the threat, logging, and recovery rules for the profiles behind one case. */
function profileValues(profileIds: readonly ProtocolSliceId[]): {
  prohibitedSideEffects: readonly string[];
  requiredLogEvent: string;
  requiredLogFields: readonly string[];
  forbiddenLogFields: readonly string[];
  recoveryExpectation: string;
} {
  const profiles = profileIds.map((profileId) => {
    const profile = oidcTokenSliceProfiles.find((candidate) => candidate.id === profileId);
    if (profile === undefined) throw new Error(`unknown protocol profile: ${profileId}`);
    return profile;
  });
  const log = profiles[0]?.privacySafeLogs[0];
  const recovery = profiles[0]?.recoveryExpectations[0];
  if (log === undefined || recovery === undefined) throw new Error('incomplete protocol profile');
  return {
    prohibitedSideEffects: [
      ...new Set(profiles.flatMap((profile) => profile.prohibitedSideEffects)),
    ],
    requiredLogEvent: log.event,
    requiredLogFields: log.requiredFields,
    forbiddenLogFields: [
      ...new Set(profiles.flatMap((profile) => profile.privacySafeLogs[0]?.forbiddenFields ?? [])),
    ],
    recoveryExpectation: recovery,
  };
}

/** Binds controls and probes to the independently authored claim and profile catalog. */
function protocolCase(
  sentinelId: ProtocolCaseRequirement['sentinelId'],
  profileIds: readonly ProtocolSliceId[],
  controls: readonly ProtocolStepRequirement[],
  probes: readonly ProtocolStepRequirement[],
): ProtocolCaseRequirement {
  const claim = oidcTokenClaimRequirements.find((candidate) => candidate.sentinelId === sentinelId);
  if (claim === undefined) throw new Error(`missing protocol claim: ${sentinelId}`);
  return {
    sentinelId,
    profileIds,
    controls,
    probes,
    ...profileValues(profileIds),
    independentClientRule: claim.independentClientRule,
  };
}

const rejectedBeforeCode = {
  result: 'rejected',
  status: 400,
  error: 'invalid_redirect_uri',
  responseLocation: 'direct-response',
  codeIssued: false,
} as const;
const redirectedPkceRejection = {
  result: 'rejected',
  status: 303,
  error: 'invalid_request',
  responseLocation: 'redirect-response',
  codeIssued: false,
} as const;
const invalidGrant = {
  result: 'rejected',
  status: 400,
  error: 'invalid_grant',
  tokenIssuedCount: 0,
} as const;

/** Exact redirect and PKCE controls and rejection probes. */
export const st33RedirectPkceCase = protocolCase(
  'ST-33',
  ['redirect-pkce'],
  [
    step({
      id: 'valid-s256-exact-redirect-control',
      inputs: { redirectVariant: 'exact', codeChallengeMethod: 'S256', verifier: 'valid' },
      expectedFacts: { result: 'accepted', status: 303, codeIssued: true },
    }),
    step({
      id: 'valid-s256-token-control',
      inputs: { redirectVariant: 'exact', verifier: 'valid' },
      expectedFacts: { result: 'accepted', status: 200, tokenIssuedCount: 1 },
    }),
  ],
  [
    step({
      id: 'missing-pkce',
      controlId: 'valid-s256-exact-redirect-control',
      inputs: { codeChallenge: null },
      expectedFacts: redirectedPkceRejection,
    }),
    step({
      id: 'plain-pkce',
      controlId: 'valid-s256-exact-redirect-control',
      inputs: { codeChallengeMethod: 'plain' },
      expectedFacts: redirectedPkceRejection,
    }),
    step({
      id: 'one-character-redirect-change',
      controlId: 'valid-s256-exact-redirect-control',
      inputs: { redirectVariant: 'one-character-changed' },
      expectedFacts: rejectedBeforeCode,
    }),
    step({
      id: 'wrong-pkce-verifier',
      controlId: 'valid-s256-token-control',
      inputs: { verifier: 'wrong' },
      expectedFacts: invalidGrant,
    }),
  ],
);

/** Exact authorization-code binding and single-use controls and probes. */
export const st34CodeBindingCase = protocolCase(
  'ST-34',
  ['authorization-code-binding'],
  [
    step({
      id: 'initiating-client-exact-redirect-control',
      inputs: { codeFixture: 'fresh-control-code', client: 'initiating', redirect: 'exact' },
      expectedFacts: { result: 'accepted', status: 200, durableSuccesses: 1, tokenIssuedCount: 1 },
    }),
  ],
  [
    step({
      id: 'wrong-client-redemption',
      controlId: 'initiating-client-exact-redirect-control',
      inputs: { codeFixture: 'fresh-wrong-client-code', client: 'different' },
      expectedFacts: { ...invalidGrant, durableSuccesses: 0 },
    }),
    step({
      id: 'wrong-redirect-redemption',
      controlId: 'initiating-client-exact-redirect-control',
      inputs: { codeFixture: 'fresh-wrong-redirect-code', redirect: 'changed' },
      expectedFacts: { ...invalidGrant, durableSuccesses: 0 },
    }),
    step({
      id: 'sequential-code-replay',
      controlId: 'initiating-client-exact-redirect-control',
      inputs: { codeFixture: 'already-redeemed-code', execution: 'sequential-replay' },
      expectedFacts: { ...invalidGrant, totalDurableSuccesses: 1 },
    }),
    step({
      id: 'concurrent-code-redemption',
      controlId: 'initiating-client-exact-redirect-control',
      inputs: {
        codeFixture: 'fresh-concurrent-code',
        execution: 'genuinely-concurrent',
        requestCount: 2,
      },
      expectedFacts: {
        result: 'one-accepted-rest-rejected',
        overlapped: true,
        totalDurableSuccesses: 1,
        totalTokensIssued: 1,
      },
    }),
  ],
);

/** Exact state, nonce, consent, and confidential-client authentication controls and probes. */
export const st35RequestIntegrityCase = protocolCase(
  'ST-35',
  ['request-consent-client-integrity'],
  [
    step({
      id: 'state-round-trip-control',
      boundary: 'spa',
      inputs: { state: 'client-generated-state-a' },
      expectedFacts: {
        result: 'accepted',
        returnedState: 'client-generated-state-a',
        clientStateVerified: true,
      },
    }),
    step({
      id: 'requested-nonce-control',
      transport: 'independent-jose',
      boundary: 'spa',
      inputs: { nonce: 'client-nonce-a' },
      expectedFacts: { result: 'accepted', idTokenNonce: 'client-nonce-a' },
    }),
    step({
      id: 'same-interaction-consent-control',
      boundary: 'bff',
      inputs: { interaction: 'interaction-a', consent: 'consent-a' },
      expectedFacts: { result: 'accepted', grantCreated: true },
    }),
    step({
      id: 'valid-confidential-client-control',
      boundary: 'bff',
      inputs: { authentication: 'valid-client-secret-basic' },
      expectedFacts: { result: 'accepted', status: 200, clientAuthenticated: true },
    }),
  ],
  [
    step({
      id: 'state-substitution-client-rejection',
      controlId: 'state-round-trip-control',
      boundary: 'spa',
      inputs: { returnedState: 'attacker-state' },
      expectedFacts: { result: 'client-rejected', sessionCreated: false },
    }),
    step({
      id: 'cross-interaction-consent',
      controlId: 'same-interaction-consent-control',
      boundary: 'bff',
      inputs: { interaction: 'interaction-b', consent: 'consent-a' },
      expectedFacts: { result: 'rejected', grantCreated: false, consentStateChanged: false },
    }),
    step({
      id: 'missing-confidential-client-authentication',
      controlId: 'valid-confidential-client-control',
      boundary: 'bff',
      inputs: { authentication: 'missing' },
      expectedFacts: {
        result: 'rejected',
        status: 401,
        error: 'invalid_client',
        tokenIssuedCount: 0,
      },
    }),
    step({
      id: 'wrong-confidential-client-secret',
      controlId: 'valid-confidential-client-control',
      boundary: 'bff',
      inputs: { authentication: 'wrong-client-secret-basic' },
      expectedFacts: {
        result: 'rejected',
        status: 401,
        error: 'invalid_client',
        tokenIssuedCount: 0,
      },
    }),
  ],
);

/** Exact independent ID-token verification control. */
export const st36IdTokenVerificationCase = protocolCase(
  'ST-36',
  ['id-token-validation'],
  [
    step({
      id: 'independent-es256-p256-jwks-control',
      transport: 'independent-jose',
      inputs: { verifier: 'independent', jwks: 'trusted-issuer-jwks' },
      expectedFacts: {
        result: 'accepted',
        alg: 'ES256',
        curve: 'P-256',
        kidTrusted: true,
        issExact: true,
        audExact: true,
        subExact: true,
        nonceExact: true,
        expValid: true,
        nbfValid: true,
        signatureValid: true,
      },
    }),
  ],
  [],
);

const forgedIdTokenVariants: readonly [string, Readonly<Record<string, ProtocolInputValue>>][] = [
  ['forged-algorithm', { alg: 'HS256' }],
  ['forged-signing-key', { signingKey: 'attacker' }],
  ['wrong-issuer', { iss: 'attacker-issuer' }],
  ['wrong-audience', { aud: 'other-client' }],
  ['wrong-subject', { sub: 'other-subject' }],
  ['expired-token', { exp: 'expired' }],
  ['not-yet-valid-token', { nbf: 'future' }],
  ['unknown-kid', { kid: 'unknown' }],
  ['attacker-jku', { jku: 'https://attacker.invalid/jwks' }],
  ['attacker-x5u', { x5u: 'https://attacker.invalid/cert' }],
  ['attacker-embedded-jwk', { jwk: 'attacker-public-key' }],
];

/** Forged-token and attacker key-location rejection probes. */
export const st37IdTokenForgeryCase = protocolCase(
  'ST-37',
  ['id-token-validation'],
  [
    step({
      id: 'trusted-id-token-control',
      transport: 'independent-jose',
      inputs: { token: 'valid-trusted-id-token' },
      expectedFacts: { result: 'accepted', signatureValid: true },
    }),
  ],
  forgedIdTokenVariants.map(([id, inputs]) =>
    step({
      id,
      controlId: 'trusted-id-token-control',
      transport: 'independent-jose',
      inputs,
      expectedFacts: { result: 'rejected', sessionCreated: false, attackerKeyFetchCount: 0 },
    }),
  ),
);

const artifactControls = [
  step({
    id: 'opaque-access-at-userinfo-control',
    inputs: { artifact: 'opaque-access-token', consumer: 'userinfo' },
    expectedFacts: { result: 'accepted', identityDisclosed: true, opaqueJwtParseAttempted: false },
  }),
  step({
    id: 'id-token-at-rp-control',
    transport: 'independent-jose',
    inputs: { artifact: 'id-token', consumer: 'relying-party' },
    expectedFacts: { result: 'accepted' },
  }),
  step({
    id: 'code-at-token-endpoint-control',
    inputs: { artifact: 'authorization-code', consumer: 'token-endpoint' },
    expectedFacts: { result: 'accepted' },
  }),
  step({
    id: 'refresh-at-token-endpoint-control',
    inputs: { artifact: 'refresh-token', consumer: 'token-endpoint-refresh' },
    expectedFacts: { result: 'accepted' },
  }),
] as const;

/** Artifact-substitution controls and probes at their real consumer types. */
export const st38TokenTypeSeparationCase = protocolCase(
  'ST-38',
  ['opaque-token-separation'],
  artifactControls,
  [
    step({
      id: 'id-token-at-userinfo',
      controlId: 'opaque-access-at-userinfo-control',
      inputs: { artifact: 'id-token', consumer: 'userinfo' },
      expectedFacts: { result: 'rejected', identityDisclosed: false },
    }),
    step({
      id: 'code-at-userinfo',
      controlId: 'opaque-access-at-userinfo-control',
      inputs: { artifact: 'authorization-code', consumer: 'userinfo' },
      expectedFacts: { result: 'rejected', identityDisclosed: false },
    }),
    step({
      id: 'refresh-at-userinfo',
      controlId: 'opaque-access-at-userinfo-control',
      inputs: { artifact: 'refresh-token', consumer: 'userinfo' },
      expectedFacts: { result: 'rejected', identityDisclosed: false },
    }),
    step({
      id: 'opaque-access-at-rp',
      controlId: 'id-token-at-rp-control',
      transport: 'independent-jose',
      inputs: { artifact: 'opaque-access-token', consumer: 'relying-party' },
      expectedFacts: { result: 'rejected', opaqueJwtParseAttempted: false, sessionCreated: false },
    }),
    step({
      id: 'opaque-access-as-code',
      controlId: 'code-at-token-endpoint-control',
      inputs: { artifact: 'opaque-access-token', consumer: 'token-endpoint' },
      expectedFacts: { result: 'rejected', tokenIssuedCount: 0, opaqueJwtParseAttempted: false },
    }),
    step({
      id: 'id-token-as-refresh',
      controlId: 'refresh-at-token-endpoint-control',
      inputs: { artifact: 'id-token', consumer: 'token-endpoint-refresh' },
      expectedFacts: { result: 'rejected', tokenIssuedCount: 0 },
    }),
  ],
);

/** Refresh-token rotation and predecessor-replay controls and probes. */
export const st39RefreshReplayCase = protocolCase(
  'ST-39',
  ['refresh-rotation-replay'],
  [
    step({
      id: 'refresh-rotation-control',
      inputs: { predecessor: 'refresh-a', execution: 'single' },
      expectedFacts: {
        result: 'accepted',
        replacementDistinct: true,
        durableSuccesses: 1,
        validReplacementCount: 1,
      },
    }),
  ],
  [
    step({
      id: 'sequential-predecessor-replay',
      controlId: 'refresh-rotation-control',
      inputs: { predecessor: 'refresh-a', execution: 'sequential-replay' },
      expectedFacts: { ...invalidGrant, additionalDurableGrants: 0, additionalValidTokens: 0 },
    }),
    step({
      id: 'concurrent-predecessor-replay',
      controlId: 'refresh-rotation-control',
      inputs: {
        predecessor: 'fresh-concurrent-refresh',
        execution: 'genuinely-concurrent',
        requestCount: 2,
      },
      expectedFacts: {
        result: 'one-accepted-rest-rejected',
        overlapped: true,
        replacementDistinct: true,
        totalDurableSuccesses: 1,
        totalValidReplacements: 1,
      },
    }),
  ],
);

/** Concurrent issuer, discovery, and JWKS separation controls and probes. */
export const st40IssuerSeparationCase = protocolCase(
  'ST-40',
  ['id-token-validation'],
  [
    step({
      id: 'alpha-issuer-control',
      transport: 'independent-jose',
      inputs: { organization: 'alpha' },
      expectedFacts: {
        result: 'accepted',
        issuer: 'alpha',
        discoveryIssuer: 'alpha',
        jwksIssuer: 'alpha',
      },
    }),
    step({
      id: 'bravo-issuer-control',
      transport: 'independent-jose',
      inputs: { organization: 'bravo' },
      expectedFacts: {
        result: 'accepted',
        issuer: 'bravo',
        discoveryIssuer: 'bravo',
        jwksIssuer: 'bravo',
      },
    }),
  ],
  [
    step({
      id: 'concurrent-alpha-bravo-issuer-contexts',
      controlId: 'alpha-issuer-control',
      transport: 'independent-jose',
      inputs: { organizations: ['alpha', 'bravo'], execution: 'genuinely-concurrent' },
      expectedFacts: {
        result: 'accepted',
        overlapped: true,
        alphaIssuer: 'alpha',
        alphaDiscoveryIssuer: 'alpha',
        alphaJwksIssuer: 'alpha',
        bravoIssuer: 'bravo',
        bravoDiscoveryIssuer: 'bravo',
        bravoJwksIssuer: 'bravo',
        crossTalkDetected: false,
      },
    }),
  ],
);

/** UserInfo, consent, and logout context-substitution controls and probes. */
export const st41ContextSeparationCase = protocolCase(
  'ST-41',
  ['request-consent-client-integrity', 'opaque-token-separation'],
  [
    step({
      id: 'userinfo-same-context-control',
      inputs: {
        operation: 'userinfo',
        client: 'alpha-client',
        tenant: 'alpha',
        token: 'alpha-access',
      },
      expectedFacts: { result: 'accepted', identityOrganization: 'alpha' },
    }),
    step({
      id: 'consent-same-context-control',
      inputs: {
        operation: 'consent',
        client: 'alpha-client',
        session: 'alpha-session',
        tenant: 'alpha',
      },
      expectedFacts: { result: 'accepted', consentStateChanged: true },
    }),
    step({
      id: 'logout-same-context-control',
      inputs: {
        operation: 'logout',
        client: 'alpha-client',
        session: 'alpha-session',
        tenant: 'alpha',
      },
      expectedFacts: { result: 'accepted', sessionEnded: true },
    }),
  ],
  [
    step({
      id: 'userinfo-wrong-client',
      controlId: 'userinfo-same-context-control',
      inputs: {
        operation: 'userinfo',
        client: 'bravo-client',
        tenant: 'alpha',
        token: 'alpha-access',
      },
      expectedFacts: { result: 'rejected', identityDisclosed: false, stateChanged: false },
    }),
    step({
      id: 'userinfo-wrong-tenant',
      controlId: 'userinfo-same-context-control',
      inputs: {
        operation: 'userinfo',
        client: 'alpha-client',
        tenant: 'bravo',
        token: 'alpha-access',
      },
      expectedFacts: { result: 'rejected', identityDisclosed: false, stateChanged: false },
    }),
    step({
      id: 'consent-wrong-session',
      controlId: 'consent-same-context-control',
      inputs: {
        operation: 'consent',
        client: 'alpha-client',
        session: 'bravo-session',
        tenant: 'alpha',
      },
      expectedFacts: { result: 'rejected', identityDisclosed: false, consentStateChanged: false },
    }),
    step({
      id: 'logout-wrong-client-tenant-session',
      controlId: 'logout-same-context-control',
      inputs: {
        operation: 'logout',
        client: 'bravo-client',
        session: 'bravo-session',
        tenant: 'bravo',
      },
      expectedFacts: { result: 'rejected', identityDisclosed: false, sessionStateChanged: false },
    }),
  ],
);

/** Closed protocol behavior catalog in stable sentinel order. */
export const oidcTokenProtocolCases: readonly ProtocolCaseRequirement[] = [
  st33RedirectPkceCase,
  st34CodeBindingCase,
  st35RequestIntegrityCase,
  st36IdTokenVerificationCase,
  st37IdTokenForgeryCase,
  st38TokenTypeSeparationCase,
  st39RefreshReplayCase,
  st40IssuerSeparationCase,
  st41ContextSeparationCase,
];
