import assert from 'node:assert/strict';
import test from 'node:test';

import { humanAuthArtifactCaseRequirements } from './human-auth-recovery-case-requirements.js';

import type {
  CreateSecondFactorContract,
  SecondFactorLiveContext,
} from './human-auth-second-factor-contract.js';

function isFactory(value: unknown): value is CreateSecondFactorContract {
  return typeof value === 'function';
}

/** Reads one mandatory owner-fenced harness value. */
function environment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing ${name}`);
  return value;
}

/** Builds the exact production-security context without retaining credentials. */
function liveContext(): SecondFactorLiveContext {
  return Object.freeze({
    runId: environment('HARNESS_RUN_ID'),
    fixtureManifestPath: environment('HARNESS_FIXTURE_MANIFEST'),
    protectedCredentialsPath: environment('HARNESS_FIXTURE_CREDENTIALS'),
    projectAdmitted: process.env.PORTA_ASSURANCE_PROJECT === 'security',
    profile: 'production-security',
  });
}

test('freezes email OTP recovery-code and TOTP public controls and probes', () => {
  const email = humanAuthArtifactCaseRequirements.find((entry) => entry.sentinelId === 'ST-47');
  const secondFactor = humanAuthArtifactCaseRequirements.find(
    (entry) => entry.sentinelId === 'ST-48',
  );
  assert.ok(email && secondFactor);
  assert.deepEqual(email.profileIds, ['email-otp']);
  assert.deepEqual(secondFactor.profileIds, ['totp', 'recovery-code']);
  assert.ok(email.probes.some((entry) => entry.id === 'email-otp-sequential-replay'));
  assert.ok(secondFactor.probes.some((entry) => entry.id === 'sequential-replay-recovery-code'));
  assert.ok(secondFactor.controls.some((entry) => entry.id === 'valid-totp-control'));
});

test('keeps same-window TOTP replay outside admitted product evidence', () => {
  const secondFactor = humanAuthArtifactCaseRequirements.find(
    (entry) => entry.sentinelId === 'ST-48',
  );
  assert.ok(secondFactor);
  const replay = secondFactor.probes.find((entry) => entry.id === 'sequential-totp-replay');
  assert.ok(replay);
  assert.deepEqual(replay.inputs, { use: 'second-sequential' });
  assert.equal(process.env.PORTA_ASSURANCE_ADMIT_TOTP_REPLAY, undefined);
});

test('requires a live owner-fenced second-factor adapter', async () => {
  const modulePath: string = './human-auth-second-factor-live-adapter.js';
  let loaded: unknown;
  try {
    loaded = await import(modulePath);
  } catch {
    assert.fail('HUMAN_AUTH_SECOND_FACTOR_CAPABILITY_MISSING');
  }
  assert.ok(typeof loaded === 'object' && loaded !== null);
  assert.ok(isFactory(Reflect.get(loaded, 'createSecondFactorContract')));
});

test(
  'executes admitted public second-factor journeys without retaining their values',
  { skip: process.env.PORTA_ASSURANCE_SECOND_FACTOR_ADAPTER !== 'live' },
  async () => {
    const modulePath: string = './human-auth-second-factor-live-adapter.js';
    const loaded: unknown = await import(modulePath);
    assert.ok(typeof loaded === 'object' && loaded !== null);
    const factory = Reflect.get(loaded, 'createSecondFactorContract');
    assert.ok(isFactory(factory));
    const context = liveContext();
    const contract = factory(context);
    for (const id of ['email-otp', 'totp', 'recovery-code'] as const) {
      const observation = await contract.observeJourney(id);
      assert.equal(observation.id, id);
      assert.equal(observation.runId, context.runId);
      assert.equal(observation.secretRetained, false);
      assert.equal(observation.cleanupCompleted, true);
      assert.ok(observation.attempts.length >= 2);
    }
  },
);
