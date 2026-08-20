import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductionExposureContract } from './production-exposure-adapter.js';
import { validationExposureProductionCases } from './validation-exposure-production-case-requirements.js';
import { validationExposureRawCases } from './validation-exposure-raw-case-requirements.js';

const profile = process.env.HARNESS_PROFILE;
if (profile !== 'operational' && profile !== 'production-security') {
  throw new Error('PRODUCTION_EXPOSURE_PROFILE_REQUIRED');
}

const applicableCases = [
  ...validationExposureRawCases,
  ...validationExposureProductionCases,
].filter(
  (requirement) =>
    requirement.executionProfiles.includes(profile) &&
    (requirement.sentinelId === 'ST-53' ||
      requirement.sentinelId === 'ST-55' ||
      requirement.sentinelId === 'ST-56'),
);

test('observes every applicable production policy and dependency case without log overclaim', async (context) => {
  const observer = await createProductionExposureContract();
  try {
    for (const requirement of applicableCases) {
      await context.test(requirement.id, async () => {
        const observation = await observer.observe(requirement);
        assert.equal(observation.caseId, requirement.id);
        assert.equal(observation.profile, profile);
        assert.equal(observation.control.status, requirement.control.expectedStatus);
        assert.equal(observation.probe.status, requirement.expected.status);
        assert.equal(observation.probe.bodyContract, requirement.expected.bodyContract);
        for (const expectedHeader of requirement.expected.headerContract) {
          assert.equal(observation.probe.headerContracts[expectedHeader], true, expectedHeader);
        }
        for (const stateCheck of requirement.independentStateObservations) {
          assert.equal(observation.independentStateObservations[stateCheck], true, stateCheck);
        }
        for (const prohibitedEffect of requirement.prohibitedSideEffects) {
          assert.equal(
            observation.prohibitedSideEffects[prohibitedEffect],
            false,
            prohibitedEffect,
          );
        }
        assert.equal(observation.recoveryPassed, true);
        assert.equal(observation.correlatedLogCredit, false);
        assert.equal(
          observation.correlatedLogGap,
          'correlated-security-decision-event-unavailable',
        );
      });
    }
  } finally {
    await observer.close();
  }
});
