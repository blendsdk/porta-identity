import assert from 'node:assert/strict';
import test from 'node:test';

import { createHumanAuthCasesContract } from './human-auth-cases-adapter.js';
import {
  deferredHumanAuthCaseRequirement,
  humanAuthCaseRequirements,
} from './human-auth-case-requirements.js';

import type {
  HumanAuthCaseObservation,
  HumanAuthCaseRequirement,
  HumanAuthStepObservation,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

function byStepId(observation: HumanAuthCaseObservation, id: string): HumanAuthStepObservation {
  const step = [...observation.controls, ...observation.probes].find((entry) => entry.id === id);
  assert.ok(step, `missing observation ${id}`);
  return step;
}

function byRequirement(
  sentinelId: HumanAuthCaseRequirement['sentinelId'],
): HumanAuthCaseRequirement {
  const requirement = humanAuthCaseRequirements.find(
    (candidate) => candidate.sentinelId === sentinelId,
  );
  assert.ok(requirement, `missing requirement ${sentinelId}`);
  return requirement;
}

function assertStepIdentity(
  observation: HumanAuthStepObservation,
  requirement: HumanAuthStepRequirement,
): void {
  assert.equal(observation.id, requirement.id);
  assert.equal(observation.boundary, requirement.boundary);
  assert.equal(observation.action, requirement.action);
  assert.equal(observation.target, requirement.target);
  assert.deepEqual(observation.facts, requirement.expectedFacts, requirement.id);
}

function assertProbeEvidence(
  observation: HumanAuthStepObservation,
  requirement: HumanAuthCaseRequirement,
): void {
  assert.deepEqual(
    Object.keys(observation.prohibitedSideEffects).sort(),
    [...requirement.prohibitedSideEffects].sort(),
    observation.id,
  );
  assert.ok(
    Object.values(observation.prohibitedSideEffects).every((occurred) => !occurred),
    observation.id,
  );
  assert.deepEqual(
    Object.keys(observation.protectedStateUnchanged).sort(),
    [...requirement.protectedStateKeys].sort(),
    observation.id,
  );
  assert.ok(
    Object.values(observation.protectedStateUnchanged).every((unchanged) => unchanged),
    observation.id,
  );
  assert.equal(observation.securityLog?.event, requirement.requiredLogEvent, observation.id);
  assert.ok(
    requirement.requiredLogFields.every((field) => observation.securityLog?.fields.includes(field)),
    observation.id,
  );
  assert.equal(observation.securityLog?.forbiddenValueObserved, false, observation.id);
  assert.equal(observation.recoveryObserved, requirement.recoveryExpectation, observation.id);
}

test('executes exact positive controls before every functional negative probe', async () => {
  const contract = createHumanAuthCasesContract();
  assert.deepEqual(
    humanAuthCaseRequirements.map((requirement) => requirement.sentinelId),
    ['ST-42', 'ST-43', 'ST-44', 'ST-45', 'ST-46', 'ST-47', 'ST-48'],
  );

  for (const requirement of humanAuthCaseRequirements) {
    const observation = await contract.observeCase(requirement);
    assert.equal(observation.sentinelId, requirement.sentinelId);
    assert.deepEqual(
      observation.controls.map((entry) => entry.id),
      requirement.controls.map((entry) => entry.id),
    );
    assert.deepEqual(
      observation.probes.map((entry) => entry.id),
      requirement.probes.map((entry) => entry.id),
    );

    const controls = new Map(requirement.controls.map((entry) => [entry.id, entry] as const));
    observation.controls.forEach((entry, index) => {
      const expected = requirement.controls[index];
      assert.ok(expected);
      assert.equal(expected.controlId, undefined, expected.id);
      assertStepIdentity(entry, expected);
      assert.equal(entry.securityLog, null, entry.id);
      assert.equal(entry.recoveryObserved, null, entry.id);
    });
    observation.probes.forEach((entry, index) => {
      const expected = requirement.probes[index];
      assert.ok(expected);
      assertStepIdentity(entry, expected);
      const control = controls.get(expected.controlId ?? '');
      assert.ok(control, `${expected.id}: missing exact positive control`);
      assert.equal(control.action, expected.action, expected.id);
      assert.equal(control.boundary, expected.boundary, expected.id);
      assertProbeEvidence(entry, requirement);
    });
  }
});

test('keeps functional enumeration to status, body schema, and headers only', async () => {
  const requirement = byRequirement('ST-42');
  const observation = await createHumanAuthCasesContract().observeCase(requirement);
  const existingLogin = byStepId(observation, 'existing-invalid-login-response');
  const absentLogin = byStepId(observation, 'absent-invalid-login-response');
  const existingRecovery = byStepId(observation, 'existing-recovery-response');
  const absentRecovery = byStepId(observation, 'absent-recovery-response');

  assert.deepEqual(existingLogin.publicResponse, absentLogin.publicResponse);
  assert.deepEqual(existingRecovery.publicResponse, absentRecovery.publicResponse);
  for (const entry of [existingLogin, absentLogin, existingRecovery, absentRecovery]) {
    assert.equal(entry.facts.identityDisclosed, false);
    assert.ok(entry.publicResponse);
    assert.deepEqual(Object.keys(entry.publicResponse).sort(), [
      'bodySchemaDigest',
      'securityHeadersDigest',
      'status',
    ]);
  }

  const serialized = JSON.stringify(requirement);
  assert.doesNotMatch(serialized, /latency|duration|percentile|clock|sample-size|power-rule/i);
});

test('freezes disabled methods and equivalent failure, lockout, and limit keys', async () => {
  const observation = await createHumanAuthCasesContract().observeCase(byRequirement('ST-43'));
  assert.equal(byStepId(observation, 'disabled-password-method').facts.sessionCreated, false);
  assert.equal(
    byStepId(observation, 'disabled-passwordless-method').facts.result,
    'method-disabled',
  );
  assert.equal(byStepId(observation, 'canonical-failed-login').facts.failureRecorded, true);
  assert.equal(byStepId(observation, 'equivalent-limit-key-variant').facts.sameLimitBudget, true);
  assert.equal(byStepId(observation, 'locked-account-valid-password').facts.result, 'locked');
  assert.equal(byStepId(observation, 'rate-limit-exhausted-variant').facts.result, 'throttled');
});

test('requires session renewal and rejects expired, logged-out, and revoked sessions', async () => {
  const observation = await createHumanAuthCasesContract().observeCase(byRequirement('ST-44'));
  assert.equal(
    byStepId(observation, 'anonymous-to-authenticated-renewal-control').facts
      .sessionIdentifierChanged,
    true,
  );
  for (const state of ['expired', 'logged-out', 'revoked']) {
    const probe = byStepId(observation, `${state}-session-reuse`);
    assert.equal(probe.facts.result, 'unauthenticated');
    assert.equal(probe.facts.protectedAccess, false);
  }
});

test('requires exact cookie attributes and origin, site, and CSRF distinctions', async () => {
  const observation = await createHumanAuthCasesContract().observeCase(byRequirement('ST-45'));
  assert.deepEqual(byStepId(observation, 'production-cookie-attributes-control').facts, {
    secure: true,
    httpOnly: true,
    sameSite: 'declared-production-policy',
    hostOnly: true,
  });
  for (const id of [
    'same-origin-missing-csrf',
    'same-origin-wrong-csrf',
    'cross-origin-same-site-csrf',
    'cross-site-loopback-ip-csrf',
  ]) {
    const probe = byStepId(observation, id);
    assert.equal(probe.facts.result, 'forbidden', id);
    assert.equal(probe.facts.mutationCount, 0, id);
  }
});

test('covers every delivered-artifact binding, expiry, replay, throttle, and exposure edge', async () => {
  const contract = createHumanAuthCasesContract();
  for (const sentinel of ['ST-46', 'ST-47'] as const) {
    const requirement = byRequirement(sentinel);
    const observation = await contract.observeCase(requirement);
    const kinds =
      sentinel === 'ST-46' ? ['magic-link', 'password-reset', 'invitation'] : ['email-otp'];
    for (const kind of kinds) {
      assert.equal(
        byStepId(observation, `${kind}-delivery-control`).facts.cryptographicallyUnpredictable,
        true,
      );
      assert.equal(
        byStepId(observation, `${kind}-delivery-control`).facts.intendedDeliveryOnly,
        true,
      );
      for (const suffix of [
        'wrong-recipient',
        'wrong-tenant',
        'configured-expiry',
        'sequential-replay',
        'throttled-request',
      ]) {
        assert.ok(byStepId(observation, `${kind}-${suffix}`));
      }
    }
    assert.ok(
      requirement.prohibitedSideEffects.includes('artifact-in-retained-evidence'),
      sentinel,
    );
    assert.ok(requirement.prohibitedSideEffects.includes('artifact-in-wrong-mailbox'), sentinel);
  }
});

test('requires TOTP enforcement and recovery-code sequential single use', async () => {
  const observation = await createHumanAuthCasesContract().observeCase(byRequirement('ST-48'));
  assert.equal(byStepId(observation, 'valid-totp-control').facts.secondFactorSatisfied, true);
  for (const id of [
    'missing-totp',
    'invalid-totp',
    'wrong-account-or-tenant-totp',
    'expired-totp',
    'sequential-totp-replay',
    'totp-verification-throttled',
  ]) {
    assert.equal(byStepId(observation, id).facts.secondFactorSatisfied, false, id);
  }
  assert.equal(byStepId(observation, 'unused-recovery-code-control').facts.recoveryCount, 1);
  assert.equal(byStepId(observation, 'sequential-replay-recovery-code').facts.recoveryCount, 0);
});

test('keeps concurrent artifact consumption as a requirements-only deferred entry', () => {
  assert.deepEqual(deferredHumanAuthCaseRequirement, {
    sentinelId: 'ST-49',
    status: 'requirements-only-deferred',
    evidenceAllowed: false,
    invariant: 'concurrent duplicate consumption permits exactly one durable success',
    ordinaryScope: 'sequential-only',
    excludedMechanics: [
      'concurrent-consumption',
      'forced-race-barrier',
      'process-crash',
      'commit-boundary-interruption',
      'response-loss',
      'source-variation',
    ],
    expectedFutureOutcome:
      'one durable success, every competitor rejected, and no reusable intermediate artifact',
  });
  assert.ok(!humanAuthCaseRequirements.map((entry) => String(entry.sentinelId)).includes('ST-49'));
});

test(
  'fails closed when live human-authentication mode is requested',
  { concurrency: false },
  () => {
    const previous = process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER;
    process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER = 'live';
    try {
      assert.throws(() => createHumanAuthCasesContract(), /HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE/);
    } finally {
      if (previous === undefined) delete process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER;
      else process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER = previous;
    }
  },
);
