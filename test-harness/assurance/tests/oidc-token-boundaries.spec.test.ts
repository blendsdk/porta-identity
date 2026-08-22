import assert from 'node:assert/strict';
import test from 'node:test';

import { createOidcTokenCasesContract } from './oidc-token-cases-adapter.js';
import {
  oidcTokenProtocolCases,
  st33RedirectPkceCase,
  st34CodeBindingCase,
  st35RequestIntegrityCase,
  st36IdTokenVerificationCase,
  st37IdTokenForgeryCase,
  st38TokenTypeSeparationCase,
  st39RefreshReplayCase,
  st40IssuerSeparationCase,
  st41ContextSeparationCase,
} from './oidc-token-case-requirements.js';

import type {
  ProtocolCaseObservation,
  ProtocolCaseRequirement,
  ProtocolStepObservation,
  ProtocolStepRequirement,
} from './oidc-token-cases-contract.js';

const adapter = createOidcTokenCasesContract();

function observationById(
  observations: readonly ProtocolStepObservation[],
  id: string,
): ProtocolStepObservation {
  const observation = observations.find((candidate) => candidate.id === id);
  assert.ok(observation, `missing observation: ${id}`);
  return observation;
}

function assertFacts(
  observation: ProtocolStepObservation,
  requirement: ProtocolStepRequirement,
): void {
  for (const [fact, expected] of Object.entries(requirement.expectedFacts)) {
    assert.equal(observation.facts[fact], expected, `${requirement.id}: ${fact}`);
  }
}

function assertNegativeSafety(
  requirement: ProtocolCaseRequirement,
  observation: ProtocolStepObservation,
): void {
  assert.deepEqual(
    Object.keys(observation.prohibitedSideEffects).sort(),
    [...requirement.prohibitedSideEffects].sort(),
  );
  assert.ok(
    Object.values(observation.prohibitedSideEffects).every((occurred) => !occurred),
    `${observation.id}: prohibited side effect`,
  );
  assert.equal(observation.securityLog?.event, requirement.requiredLogEvent, observation.id);
  assert.ok(
    requirement.requiredLogFields.every((field) => observation.securityLog?.fields.includes(field)),
    `${observation.id}: required log fields`,
  );
  assert.ok(
    requirement.forbiddenLogFields.every(
      (field) => !observation.securityLog?.fields.includes(field),
    ),
    `${observation.id}: sensitive log field`,
  );
  assert.equal(observation.recoveryObserved, requirement.recoveryExpectation, observation.id);
}

async function observeAndAssertCase(
  requirement: ProtocolCaseRequirement,
): Promise<ProtocolCaseObservation> {
  const observation = await adapter.observeCase(requirement);
  assert.equal(observation.sentinelId, requirement.sentinelId);
  assert.deepEqual(
    observation.controls.map(({ id }) => id),
    requirement.controls.map(({ id }) => id),
  );
  assert.deepEqual(
    observation.probes.map(({ id }) => id),
    requirement.probes.map(({ id }) => id),
  );

  for (const control of requirement.controls) {
    const observed = observationById(observation.controls, control.id);
    assert.equal(observed.transport, control.transport, control.id);
    assert.equal(observed.boundary, control.boundary, control.id);
    assertFacts(observed, control);
  }
  const controlIds = new Set(requirement.controls.map(({ id }) => id));
  for (const probe of requirement.probes) {
    assert.ok(probe.controlId, `${probe.id}: missing positive control`);
    assert.ok(controlIds.has(probe.controlId), `${probe.id}: unknown positive control`);
    const observed = observationById(observation.probes, probe.id);
    assert.equal(observed.transport, probe.transport, probe.id);
    assert.equal(observed.boundary, probe.boundary, probe.id);
    assertFacts(observed, probe);
    assertNegativeSafety(requirement, observed);
  }
  return observation;
}

test('ST-33 rejects missing wrong or plain PKCE and changed redirects before issuance', async () => {
  const observation = await observeAndAssertCase(st33RedirectPkceCase);
  for (const id of ['missing-pkce', 'plain-pkce']) {
    const probe = observationById(observation.probes, id);
    assert.equal(probe.facts.codeIssued, false, id);
    assert.equal(probe.facts.error, 'invalid_request', id);
  }
  const invalidRedirect = observationById(observation.probes, 'one-character-redirect-change');
  assert.equal(invalidRedirect.facts.codeIssued, false);
  assert.equal(invalidRedirect.facts.error, 'invalid_redirect_uri');
  const wrongVerifier = observationById(observation.probes, 'wrong-pkce-verifier');
  assert.equal(wrongVerifier.facts.error, 'invalid_grant');
  assert.equal(wrongVerifier.facts.tokenIssuedCount, 0);
});

test('ST-34 binds code to client and redirect with one sequential or concurrent success', async () => {
  const observation = await observeAndAssertCase(st34CodeBindingCase);
  assert.equal(
    observationById(observation.probes, 'wrong-client-redemption').facts.error,
    'invalid_grant',
  );
  assert.equal(
    observationById(observation.probes, 'wrong-redirect-redemption').facts.error,
    'invalid_grant',
  );
  assert.equal(
    observationById(observation.probes, 'sequential-code-replay').facts.totalDurableSuccesses,
    1,
  );
  const concurrent = observationById(observation.probes, 'concurrent-code-redemption');
  assert.equal(concurrent.facts.overlapped, true);
  assert.equal(concurrent.facts.totalDurableSuccesses, 1);
  assert.equal(concurrent.facts.totalTokensIssued, 1);
});

test('ST-35 preserves client-owned state nonce consent and confidential-client authentication', async () => {
  const observation = await observeAndAssertCase(st35RequestIntegrityCase);
  assert.equal(
    observationById(observation.controls, 'state-round-trip-control').facts.clientStateVerified,
    true,
  );
  assert.equal(
    observationById(observation.controls, 'requested-nonce-control').facts.idTokenNonce,
    'client-nonce-a',
  );
  assert.equal(
    observationById(observation.probes, 'cross-interaction-consent').facts.grantCreated,
    false,
  );
  for (const id of [
    'missing-confidential-client-authentication',
    'wrong-confidential-client-secret',
  ]) {
    const probe = observationById(observation.probes, id);
    assert.equal(probe.facts.status, 401, id);
    assert.equal(probe.facts.error, 'invalid_client', id);
  }
});

test('ST-36 independently verifies exact ES256 P-256 trusted-JWKS ID-token claims', async () => {
  const observation = await observeAndAssertCase(st36IdTokenVerificationCase);
  const control = observation.controls[0];
  assert.ok(control);
  assert.equal(control.transport, 'independent-jose');
  assert.deepEqual(control.facts, {
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
  });
  assert.match(st36IdTokenVerificationCase.independentClientRule, /no Porta token helper/);
});

test('ST-37 rejects forged JOSE algorithms keys claims and attacker key locations', async () => {
  const observation = await observeAndAssertCase(st37IdTokenForgeryCase);
  assert.deepEqual(
    observation.probes.map(({ id }) => id),
    [
      'forged-algorithm',
      'forged-signing-key',
      'wrong-issuer',
      'wrong-audience',
      'wrong-subject',
      'expired-token',
      'not-yet-valid-token',
      'unknown-kid',
      'attacker-jku',
      'attacker-x5u',
      'attacker-embedded-jwk',
    ],
  );
  for (const probe of observation.probes) {
    assert.equal(probe.facts.result, 'rejected', probe.id);
    assert.equal(probe.facts.attackerKeyFetchCount, 0, probe.id);
  }
});

test('ST-38 rejects artifact substitutions without parsing opaque access tokens as JWTs', async () => {
  const observation = await observeAndAssertCase(st38TokenTypeSeparationCase);
  assert.equal(
    st38TokenTypeSeparationCase.independentClientRule,
    'opaque access tokens are never decoded or treated as JWTs',
  );
  for (const id of ['opaque-access-at-rp', 'opaque-access-as-code']) {
    assert.equal(observationById(observation.probes, id).facts.opaqueJwtParseAttempted, false, id);
  }
  for (const probe of observation.probes) assert.equal(probe.facts.result, 'rejected', probe.id);
});

test('ST-39 rotates refresh tokens and rejects sequential and concurrent predecessor replay', async () => {
  const observation = await observeAndAssertCase(st39RefreshReplayCase);
  assert.equal(observation.controls[0]?.facts.replacementDistinct, true);
  assert.equal(
    observationById(observation.probes, 'sequential-predecessor-replay').facts
      .additionalDurableGrants,
    0,
  );
  const concurrent = observationById(observation.probes, 'concurrent-predecessor-replay');
  assert.equal(concurrent.facts.overlapped, true);
  assert.equal(concurrent.facts.totalDurableSuccesses, 1);
  assert.equal(concurrent.facts.totalValidReplacements, 1);
});

test('ST-40 concurrently isolates alpha and bravo issuer discovery and JWKS contexts', async () => {
  const observation = await observeAndAssertCase(st40IssuerSeparationCase);
  const concurrent = observationById(observation.probes, 'concurrent-alpha-bravo-issuer-contexts');
  assert.equal(concurrent.facts.overlapped, true);
  assert.equal(concurrent.facts.alphaIssuer, 'alpha');
  assert.equal(concurrent.facts.alphaDiscoveryIssuer, 'alpha');
  assert.equal(concurrent.facts.alphaJwksIssuer, 'alpha');
  assert.equal(concurrent.facts.bravoIssuer, 'bravo');
  assert.equal(concurrent.facts.bravoDiscoveryIssuer, 'bravo');
  assert.equal(concurrent.facts.bravoJwksIssuer, 'bravo');
  assert.equal(concurrent.facts.crossTalkDetected, false);
});

test('ST-41 prevents UserInfo consent and logout context crossing', async () => {
  const observation = await observeAndAssertCase(st41ContextSeparationCase);
  for (const probe of observation.probes) {
    assert.equal(probe.facts.result, 'rejected', probe.id);
    assert.equal(probe.facts.identityDisclosed, false, probe.id);
  }
  assert.equal(
    observationById(observation.probes, 'consent-wrong-session').facts.consentStateChanged,
    false,
  );
  assert.equal(
    observationById(observation.probes, 'logout-wrong-client-tenant-session').facts
      .sessionStateChanged,
    false,
  );
});

test('keeps the protocol behavior catalog closed and live mode unavailable', async () => {
  assert.deepEqual(
    oidcTokenProtocolCases.map(({ sentinelId }) => sentinelId),
    ['ST-33', 'ST-34', 'ST-35', 'ST-36', 'ST-37', 'ST-38', 'ST-39', 'ST-40', 'ST-41'],
  );
  const previous = process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER;
  process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER = 'live';
  try {
    assert.throws(() => createOidcTokenCasesContract(), /OIDC_TOKEN_LIVE_ADAPTER_UNAVAILABLE/);
  } finally {
    if (previous === undefined) delete process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER;
    else process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER = previous;
  }
});
