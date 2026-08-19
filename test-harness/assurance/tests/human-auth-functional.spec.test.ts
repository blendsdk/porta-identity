import assert from 'node:assert/strict';
import test from 'node:test';

import { humanAuthFunctionalCaseRequirements } from './human-auth-functional-requirements.js';

import type {
  CreateHumanAuthFunctionalContract,
  HumanAuthFunctionalCaseObservation,
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalLiveContext,
} from './human-auth-functional-contract.js';

function isFactory(value: unknown): value is CreateHumanAuthFunctionalContract {
  return typeof value === 'function';
}

/** Reads one mandatory owner-fenced live-harness value without accepting an empty string. */
function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`human-auth live context is missing ${name}`);
  }
  return value;
}

/** Constructs the immutable provenance input supplied by the retained harness. */
function liveContextFromEnvironment(): HumanAuthFunctionalLiveContext {
  return Object.freeze({
    runId: requiredEnvironment('HARNESS_RUN_ID'),
    endpointManifestPath: requiredEnvironment('PORTA_ENDPOINT_MANIFEST'),
    fixtureManifestPath: requiredEnvironment('HARNESS_FIXTURE_MANIFEST'),
    protectedCredentialsPath: requiredEnvironment('HARNESS_FIXTURE_CREDENTIALS'),
    projectAdmitted: process.env.PORTA_ASSURANCE_PROJECT === 'security',
    profile: requiredEnvironment('HARNESS_PROFILE'),
  });
}

/** Compares one live observation to the requirements-owned functional oracle. */
function assertCaseObservation(
  requirement: HumanAuthFunctionalCaseRequirement,
  observation: HumanAuthFunctionalCaseObservation,
  runId: string,
): void {
  assert.equal(observation.sentinelId, requirement.sentinelId);
  assert.equal(observation.runId, runId);
  assert.equal(observation.rawSecretsRetained, false);

  for (const [expectedSteps, observedSteps] of [
    [requirement.controls, observation.controls],
    [requirement.negatives, observation.negatives],
  ] as const) {
    assert.deepEqual(
      observedSteps.map((entry) => entry.id),
      expectedSteps.map((entry) => entry.id),
    );
    for (const expected of expectedSteps) {
      const observed = observedSteps.find((entry) => entry.id === expected.id);
      assert.ok(observed, expected.id);
      assert.deepEqual(observed.response, expected.response, expected.id);
      assert.deepEqual(
        observed.publicState,
        expected.publicState.map((entry) => ({
          id: entry.id,
          channel: entry.channel,
          observed: entry.expected,
        })),
        expected.id,
      );
    }
  }
}

test('freezes exact functional human-auth black-box sentinels', () => {
  assert.deepEqual(
    humanAuthFunctionalCaseRequirements.map((entry) => entry.sentinelId),
    ['ST-42', 'ST-43', 'ST-44'],
  );
  for (const requirement of humanAuthFunctionalCaseRequirements) {
    assert.ok(requirement.controls.length > 0, requirement.sentinelId);
    assert.ok(requirement.negatives.length > 0, requirement.sentinelId);
    assert.ok(
      requirement.prerequisites.every((entry) => entry.failurePolicy === 'fatal-invalid-evidence'),
    );
  }
});

test('links every negative to a reachable control and independent public state', () => {
  for (const requirement of humanAuthFunctionalCaseRequirements) {
    const controls = new Map(requirement.controls.map((entry) => [entry.id, entry] as const));
    for (const negative of requirement.negatives) {
      assert.equal(negative.kind, 'negative');
      const control = controls.get(negative.controlId ?? '');
      assert.ok(control, `${negative.id}: missing positive control`);
      assert.equal(control.action, negative.action, negative.id);
      assert.equal(control.target, negative.target, negative.id);
      assert.ok(negative.publicState.length > 0, `${negative.id}: missing public state oracle`);
      assert.ok(
        negative.publicState.every(
          (entry) => entry.channel !== 'browser-cookie-identity' || entry.id.length > 0,
        ),
        negative.id,
      );
      for (const setupControlId of negative.setupControlIds) {
        assert.ok(controls.has(setupControlId), `${negative.id}: missing setup control`);
      }
    }
  }
});

test('keeps functional enumeration to equal status body and headers without timing', () => {
  const requirement = humanAuthFunctionalCaseRequirements.find(
    (entry) => entry.sentinelId === 'ST-42',
  );
  assert.ok(requirement);
  const byId = new Map(requirement.negatives.map((entry) => [entry.id, entry] as const));
  assert.deepEqual(
    byId.get('existing-invalid-login')?.response,
    byId.get('absent-invalid-login')?.response,
  );
  const recoveryControl = requirement.controls.find(
    (entry) => entry.id === 'existing-recovery-control',
  );
  assert.deepEqual(recoveryControl?.response, byId.get('absent-recovery-request')?.response);
  assert.doesNotMatch(
    JSON.stringify(requirement),
    /timing|latency|duration|percentile|threshold-ms/iu,
  );
});

test('makes every email prerequisite fatal and independently counts delivery', () => {
  for (const sentinelId of ['ST-42', 'ST-43'] as const) {
    const requirement = humanAuthFunctionalCaseRequirements.find(
      (entry) => entry.sentinelId === sentinelId,
    );
    assert.ok(requirement);
    const email = requirement.prerequisites.find((entry) => entry.kind === 'email');
    assert.ok(email, sentinelId);
    assert.equal(email.failurePolicy, 'fatal-invalid-evidence');
    assert.deepEqual(email.requiredCapabilities, [
      'mailhog-health',
      'fatal-clear',
      'fatal-delivery-poll',
      'recipient-specific-cardinality',
    ]);
    const emailSteps = [...requirement.controls, ...requirement.negatives].filter(
      (entry) => entry.action.includes('passwordless') || entry.action.includes('recovery'),
    );
    assert.ok(emailSteps.length > 0, sentinelId);
    assert.ok(
      emailSteps.every((entry) =>
        entry.publicState.some((state) => state.channel === 'synthetic-mailbox-cardinality'),
      ),
      sentinelId,
    );
  }
});

test('requires exact enforcement and independent session lifecycle observations', () => {
  const enforcement = humanAuthFunctionalCaseRequirements.find(
    (entry) => entry.sentinelId === 'ST-43',
  );
  const sessions = humanAuthFunctionalCaseRequirements.find(
    (entry) => entry.sentinelId === 'ST-44',
  );
  assert.ok(enforcement && sessions);
  assert.deepEqual(
    enforcement.negatives.map((entry) => entry.id),
    [
      'disabled-password-login',
      'disabled-passwordless-login',
      'failed-login-tracking',
      'prelocked-account-login',
      'equivalent-key-rate-limit',
    ],
  );
  assert.equal(
    enforcement.negatives.find((entry) => entry.id === 'equivalent-key-rate-limit')?.response
      .status,
    429,
  );
  const renewal = sessions.controls.find(
    (entry) => entry.id === 'anonymous-authentication-renewal-control',
  );
  assert.ok(
    renewal?.publicState.some(
      (entry) =>
        entry.channel === 'browser-cookie-identity' &&
        entry.expected.anonymousAbsentOrAuthenticatedDiffers === true,
    ),
  );
  for (const negative of sessions.negatives) {
    assert.ok(
      negative.publicState.some((entry) => entry.channel === 'authorization-callback'),
      `${negative.id}: missing public prompt-none rejection`,
    );
  }
  assert.ok(
    sessions.negatives
      .filter((entry) => entry.variation !== 'logged-out')
      .every((entry) =>
        entry.publicState.some((state) => state.channel === 'admin-api-resource-state'),
      ),
  );
});

test('requires an owner-fenced live adapter without a requirements-only fallback', async () => {
  const modulePath: string = './human-auth-functional-live-adapter.js';
  let loaded: unknown;
  try {
    loaded = await import(modulePath);
  } catch {
    assert.fail('HUMAN_AUTH_FUNCTIONAL_BOUNDARY_CAPABILITY_MISSING');
  }
  if (typeof loaded !== 'object' || loaded === null) {
    assert.fail('HUMAN_AUTH_FUNCTIONAL_BOUNDARY_CAPABILITY_MISSING');
  }
  const factory = Reflect.get(loaded, 'createHumanAuthFunctionalContract');
  if (!isFactory(factory)) {
    assert.fail('HUMAN_AUTH_FUNCTIONAL_BOUNDARY_CAPABILITY_MISSING');
  }
});

test(
  'executes every functional human-auth case through the admitted production-security harness',
  { skip: process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER !== 'live' },
  async () => {
    const modulePath: string = './human-auth-functional-live-adapter.js';
    const loaded: unknown = await import(modulePath);
    assert.ok(typeof loaded === 'object' && loaded !== null);
    const factory = Reflect.get(loaded, 'createHumanAuthFunctionalContract');
    assert.ok(isFactory(factory));

    const context = liveContextFromEnvironment();
    assert.equal(context.projectAdmitted, true);
    assert.equal(context.profile, 'production-security');
    const contract = factory(context);
    for (const requirement of humanAuthFunctionalCaseRequirements) {
      const observation = await contract.observeCase(requirement);
      assertCaseObservation(requirement, observation, context.runId);
    }
  },
);
