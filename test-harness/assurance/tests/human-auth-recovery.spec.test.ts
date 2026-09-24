/**
 * Immutable live specification for delivered-authentication-artifact recovery (ST-46).
 *
 * The structural cases always run and need no services. The execution case runs only under the
 * admitted production-security harness with the live adapter enabled, mirroring the existing
 * functional specification. When the live adapter is absent the suite skips cleanly.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { humanAuthArtifactCaseRequirements } from './human-auth-recovery-case-requirements.js';

import type {
  HumanAuthCaseObservation,
  HumanAuthCaseRequirement,
  HumanAuthStepObservation,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

/** The single delivered-artifact sentinel this specification exercises. */
const recoveryRequirement = humanAuthArtifactCaseRequirements.find(
  (entry) => entry.sentinelId === 'ST-46',
);

if (recoveryRequirement === undefined) {
  throw new Error('ST-46 delivered-artifact requirement is missing');
}

/** A sentinel the live adapter must refuse, proving live mode never mixes in synthetic evidence. */
const unsupportedRequirement = humanAuthArtifactCaseRequirements.find(
  (entry) => entry.sentinelId === 'ST-47',
);

if (unsupportedRequirement === undefined) {
  throw new Error('ST-47 requirement is missing');
}

/** Narrows a dynamically imported module to a callable factory against the stable seam. */
function isCasesFactory(
  value: unknown,
): value is () => { observeCase(requirement: HumanAuthCaseRequirement): Promise<unknown> } {
  return typeof value === 'function';
}

/** Reads one exact step observation or fails with its identifier. */
function findObservation(
  observations: readonly HumanAuthStepObservation[],
  id: string,
): HumanAuthStepObservation {
  const observation = observations.find((entry) => entry.id === id);
  assert.ok(observation, `missing observation ${id}`);
  return observation;
}

/** Asserts immutable step identity, which the adapter echoes from the requirement. */
function assertStepIdentity(
  observation: HumanAuthStepObservation,
  requirement: HumanAuthStepRequirement,
): void {
  assert.equal(observation.id, requirement.id);
  assert.equal(observation.boundary, requirement.boundary);
  assert.equal(observation.action, requirement.action);
  assert.equal(observation.target, requirement.target);
}

/** Asserts the concrete facts match the requirement's expected facts exactly. */
function assertExpectedFacts(
  observation: HumanAuthStepObservation,
  requirement: HumanAuthStepRequirement,
): void {
  assert.deepEqual(observation.facts, requirement.expectedFacts, requirement.id);
  assert.ok(observation.publicResponse, `${requirement.id}: missing public response`);
  assert.deepEqual(
    Object.keys(observation.publicResponse).sort(),
    ['bodySchemaDigest', 'securityHeadersDigest', 'status'],
    requirement.id,
  );
}

/** Asserts probe-only evidence: no prohibited effect, protected state, and privacy-safe logging. */
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
    `${observation.id}: prohibited side effect occurred`,
  );
  assert.deepEqual(
    Object.keys(observation.protectedStateUnchanged).sort(),
    [...requirement.protectedStateKeys].sort(),
    observation.id,
  );
  assert.ok(
    Object.values(observation.protectedStateUnchanged).every((unchanged) => unchanged),
    `${observation.id}: protected state changed`,
  );
  assert.equal(observation.securityLog?.event, requirement.requiredLogEvent, observation.id);
  assert.ok(
    requirement.requiredLogFields.every((field) => observation.securityLog?.fields.includes(field)),
    `${observation.id}: missing required log field`,
  );
  assert.equal(observation.securityLog?.forbiddenValueObserved, false, observation.id);
  assert.equal(observation.recoveryObserved, requirement.recoveryExpectation, observation.id);
}

/** Asserts the whole observation carries no raw bearer material in a recognisable shape. */
function assertNoRawSecret(observation: HumanAuthCaseObservation): void {
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, /(?<![A-Za-z0-9])[a-f0-9]{64}(?![A-Za-z0-9])/u);
  assert.doesNotMatch(serialized, /\b(token|secret|password|cookie)\b\s*[:=]\s*"/iu);
}

test('freezes the delivered-artifact requirement shape', () => {
  assert.equal(recoveryRequirement.sentinelId, 'ST-46');
  assert.equal(recoveryRequirement.controls.length, 6);
  assert.equal(recoveryRequirement.probes.length, 12);
  assert.equal(recoveryRequirement.requiredLogEvent, 'delivered-authentication-artifact-rejection');
});

/**
 * The reachable delivered-artifact probes.
 *
 * Magic links consume through a recipient/interaction authority, so a mismatched recipient is
 * rejected. Password reset and invitation resolve the account from the token alone and are
 * issued from an authenticated admin route, so a recipient-mismatch probe or a public-issuance
 * throttle probe cannot describe them.
 */
const reachableProbeIds = [
  'magic-link-wrong-recipient',
  'magic-link-wrong-tenant',
  'magic-link-configured-expiry',
  'magic-link-sequential-replay',
  'magic-link-throttled-request',
  'password-reset-wrong-tenant',
  'password-reset-configured-expiry',
  'password-reset-sequential-replay',
  'password-reset-throttled-request',
  'invitation-wrong-tenant',
  'invitation-configured-expiry',
  'invitation-sequential-replay',
] as const;

test('declares exactly the reachable delivered-artifact probes', () => {
  assert.deepEqual(
    recoveryRequirement.probes.map((probe) => probe.id),
    [...reachableProbeIds],
  );
  const facts = new Map(
    recoveryRequirement.probes.map((probe) => [probe.id, probe.expectedFacts] as const),
  );
  for (const id of [
    'magic-link-wrong-recipient',
    'magic-link-wrong-tenant',
    'password-reset-wrong-tenant',
    'invitation-wrong-tenant',
    'magic-link-sequential-replay',
    'password-reset-sequential-replay',
    'invitation-sequential-replay',
  ]) {
    assert.equal(facts.get(id)?.result, 'invalid-artifact', id);
  }
  for (const id of [
    'magic-link-configured-expiry',
    'password-reset-configured-expiry',
    'invitation-configured-expiry',
  ]) {
    assert.equal(facts.get(id)?.result, 'expired-artifact', id);
  }
  for (const id of ['magic-link-throttled-request', 'password-reset-throttled-request']) {
    assert.equal(facts.get(id)?.result, 'throttled', id);
  }
});

test('keeps every probe tied to a declared control that precedes it', () => {
  const controlIds = new Set(recoveryRequirement.controls.map((entry) => entry.id));
  assert.ok(recoveryRequirement.controls.length > 0);
  assert.ok(
    recoveryRequirement.controls.every((entry) => entry.controlId === undefined),
    'controls must not declare a controlId',
  );
  for (const probe of recoveryRequirement.probes) {
    assert.ok(probe.controlId !== undefined, `${probe.id}: missing controlId`);
    assert.ok(controlIds.has(probe.controlId), `${probe.id}: unknown control`);
  }
});

test('exposes the live adapter seam without a requirements-only fallback', async () => {
  const modulePath: string = './human-auth-cases-adapter.js';
  let loaded: unknown;
  try {
    loaded = await import(modulePath);
  } catch {
    assert.fail('HUMAN_AUTH_RECOVERY_CAPABILITY_MISSING');
  }
  if (typeof loaded !== 'object' || loaded === null) {
    assert.fail('HUMAN_AUTH_RECOVERY_CAPABILITY_MISSING');
  }
  const factory = Reflect.get(loaded, 'createHumanAuthCasesContract');
  if (!isCasesFactory(factory)) {
    assert.fail('HUMAN_AUTH_RECOVERY_CAPABILITY_MISSING');
  }
});

test(
  'executes the delivered-artifact case through the admitted production-security harness',
  { skip: process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER !== 'live' },
  async () => {
    assert.equal(process.env.PORTA_ASSURANCE_PROJECT, 'security');
    assert.equal(process.env.HARNESS_PROFILE, 'production-security');

    const modulePath: string = './human-auth-cases-adapter.js';
    const loaded: unknown = await import(modulePath);
    assert.ok(typeof loaded === 'object' && loaded !== null);
    const factory = Reflect.get(loaded, 'createHumanAuthCasesContract');
    assert.ok(isCasesFactory(factory));
    const contract = factory();

    await assert.rejects(
      () => contract.observeCase(unsupportedRequirement),
      /HUMAN_AUTH_LIVE_SENTINEL_UNSUPPORTED/u,
    );

    const observation = (await contract.observeCase(
      recoveryRequirement,
    )) as HumanAuthCaseObservation;
    assert.equal(observation.sentinelId, 'ST-46');
    assert.deepEqual(
      observation.controls.map((entry) => entry.id),
      recoveryRequirement.controls.map((entry) => entry.id),
    );
    assert.deepEqual(
      observation.probes.map((entry) => entry.id),
      recoveryRequirement.probes.map((entry) => entry.id),
    );

    for (const requirement of recoveryRequirement.controls) {
      const control = findObservation(observation.controls, requirement.id);
      assertStepIdentity(control, requirement);
      assertExpectedFacts(control, requirement);
      assert.equal(control.securityLog, null, control.id);
      assert.equal(control.recoveryObserved, null, control.id);
    }

    for (const requirement of recoveryRequirement.probes) {
      const probe = findObservation(observation.probes, requirement.id);
      assertStepIdentity(probe, requirement);
      assertExpectedFacts(probe, requirement);
      assertProbeEvidence(probe, recoveryRequirement);
    }

    assertNoRawSecret(observation);
  },
);
