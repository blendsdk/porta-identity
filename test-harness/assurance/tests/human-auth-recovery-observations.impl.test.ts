/**
 * Implementation tests for the delivered-artifact observation helpers.
 *
 * These cover the pure classification, counting, and assembly logic used by the
 * live ST-46 adapter. They contact no service and fabricate no product evidence.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { humanAuthArtifactCaseRequirements } from './human-auth-recovery-case-requirements.js';
import {
  assembleRecoveryCaseObservation,
  classifyArtifactResponse,
  countDurableEffects,
  issuedValuesAreUnpredictable,
} from './human-auth-recovery-observations.js';
import type { HumanAuthStepObservation } from './human-auth-cases-contract.js';

const requirement = humanAuthArtifactCaseRequirements.find((entry) => entry.sentinelId === 'ST-46');

if (requirement === undefined) {
  throw new Error('ST-46 requirement missing');
}

function observationFor(id: string): HumanAuthStepObservation {
  return Object.freeze({
    id,
    boundary: 'raw-http',
    action: 'observe',
    target: 'synthetic-mailbox',
    facts: Object.freeze({}),
    publicResponse: null,
    prohibitedSideEffects: Object.freeze({}),
    protectedStateUnchanged: Object.freeze({}),
    securityLog: null,
    recoveryObserved: null,
  });
}

test('classifies a throttled public response', () => {
  assert.equal(
    classifyArtifactResponse({
      status: 429,
      redirectLocation: null,
      acceptedPage: false,
      expiredPage: false,
      genericPage: false,
    }),
    'throttled',
  );
});

test('classifies an expired artifact page', () => {
  assert.equal(
    classifyArtifactResponse({
      status: 400,
      redirectLocation: null,
      acceptedPage: false,
      expiredPage: true,
      genericPage: false,
    }),
    'expired-artifact',
  );
});

test('classifies an accepted artifact and a generic issuance page', () => {
  assert.equal(
    classifyArtifactResponse({
      status: 200,
      redirectLocation: null,
      acceptedPage: true,
      expiredPage: false,
      genericPage: false,
    }),
    'accepted',
  );
  assert.equal(
    classifyArtifactResponse({
      status: 200,
      redirectLocation: null,
      acceptedPage: false,
      expiredPage: false,
      genericPage: true,
    }),
    'generic-response',
  );
});

test('falls back to invalid-artifact for an unmarked rejection', () => {
  assert.equal(
    classifyArtifactResponse({
      status: 400,
      redirectLocation: null,
      acceptedPage: false,
      expiredPage: false,
      genericPage: false,
    }),
    'invalid-artifact',
  );
});

test('counts only the durable state keys that changed', () => {
  assert.equal(
    countDurableEffects(
      { 'alpha-user': 'sha256:a', 'alpha-membership': 'sha256:b' },
      { 'alpha-user': 'sha256:a', 'alpha-membership': 'sha256:c' },
    ),
    1,
  );
  assert.equal(countDurableEffects({ 'alpha-user': 'sha256:a' }, { 'alpha-user': 'sha256:a' }), 0);
});

test('accepts only distinct, sufficiently unpredictable issued values', () => {
  const first = 'A'.repeat(43);
  const second = 'B'.repeat(43);
  assert.equal(issuedValuesAreUnpredictable([first, second]), true);
  assert.equal(issuedValuesAreUnpredictable([first, first]), false);
  assert.equal(issuedValuesAreUnpredictable([first, 'short']), false);
});

test('assembles controls and probes in requirement order', () => {
  const observations = new Map<string, HumanAuthStepObservation>();
  for (const step of [...requirement.controls, ...requirement.probes]) {
    observations.set(step.id, observationFor(step.id));
  }
  const assembled = assembleRecoveryCaseObservation(requirement, observations);
  assert.equal(assembled.sentinelId, 'ST-46');
  assert.deepEqual(
    assembled.controls.map((entry) => entry.id),
    requirement.controls.map((entry) => entry.id),
  );
  assert.deepEqual(
    assembled.probes.map((entry) => entry.id),
    requirement.probes.map((entry) => entry.id),
  );
});

test('rejects a missing observation for a declared step', () => {
  const observations = new Map<string, HumanAuthStepObservation>();
  for (const step of [...requirement.controls, ...requirement.probes]) {
    if (step.id !== requirement.probes[0]?.id) {
      observations.set(step.id, observationFor(step.id));
    }
  }
  assert.throws(() => assembleRecoveryCaseObservation(requirement, observations));
});

test('rejects an observation that is not declared by the requirement', () => {
  const observations = new Map<string, HumanAuthStepObservation>();
  for (const step of [...requirement.controls, ...requirement.probes]) {
    observations.set(step.id, observationFor(step.id));
  }
  observations.set('not-declared-step', observationFor('not-declared-step'));
  assert.throws(() => assembleRecoveryCaseObservation(requirement, observations));
});

test('preserves a contradicting observed value without alteration', () => {
  const assembled = assembleRecoveryCaseObservation(
    requirement,
    new Map(
      [...requirement.controls, ...requirement.probes].map((step) => [
        step.id,
        Object.freeze({ ...observationFor(step.id), facts: Object.freeze({ result: 'accepted' }) }),
      ]),
    ),
  );
  assert.equal(assembled.controls[0]?.facts.result, 'accepted');
});
