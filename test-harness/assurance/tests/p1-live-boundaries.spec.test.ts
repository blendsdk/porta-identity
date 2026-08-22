import assert from 'node:assert/strict';
import test from 'node:test';

import { createP1LiveBoundaryContract } from './p1-live-adapter.js';
import { adminDataCaseRequirements as adminDataMutationCases } from './admin-data-case-requirements.js';
import { adminDataReadControlRequirements } from './admin-data-read-control-requirements.js';
import { validationExposureRawCases } from './validation-exposure-raw-case-requirements.js';

const adminDataCases = [...adminDataMutationCases, ...adminDataReadControlRequirements];

/** Requires every declared observation key and rejects undeclared synthetic success. */
function assertExactBooleanMap(
  expectedKeys: readonly string[],
  actual: Readonly<Record<string, boolean>>,
  expectedValue: boolean,
  caseId: string,
): void {
  assert.deepEqual(Object.keys(actual).sort(), [...expectedKeys].sort(), caseId);
  assert.ok(
    Object.values(actual).every((value) => value === expectedValue),
    caseId,
  );
}

/** Applies the immutable oracle to every operational raw-input observation. */
async function assertOperationalRawCases(
  adapter: ReturnType<typeof createP1LiveBoundaryContract>,
): Promise<void> {
  const cases = validationExposureRawCases.filter((entry) =>
    entry.executionProfiles.includes('operational'),
  );
  assert.ok(cases.length > 0);
  for (const requirement of cases) {
    const observed = await adapter.observeValidationCase(requirement);
    assert.equal(observed.caseId, requirement.id);
    assert.equal(observed.profile, 'operational');
    assert.equal(observed.rawTransport, true);
    assert.equal(observed.control.status, requirement.control.expectedStatus);
    assert.equal(observed.probe.status, requirement.expected.status);
    assert.equal(observed.result, requirement.expected.result);
    assert.equal(observed.probe.bodyContract, requirement.expected.bodyContract);
    assertExactBooleanMap(
      requirement.expected.headerContract,
      observed.probe.headerContracts,
      true,
      requirement.id,
    );
    assertExactBooleanMap(
      requirement.independentStateObservations,
      observed.independentStateObservations,
      true,
      requirement.id,
    );
    assertExactBooleanMap(
      requirement.prohibitedSideEffects,
      observed.prohibitedSideEffects,
      false,
      requirement.id,
    );
    assert.ok(
      requirement.requiredLogFields.every((field) => observed.observedLogFields.includes(field)),
      requirement.id,
    );
    assert.deepEqual(observed.exposedForbiddenFields, [], requirement.id);
    assert.equal(observed.recoveryPassed, true, requirement.id);
  }
}

/** Applies the immutable oracle to every administrative-data observation. */
async function assertAdministrativeDataCases(
  adapter: ReturnType<typeof createP1LiveBoundaryContract>,
): Promise<void> {
  assert.ok(adminDataCases.length > 0);
  for (const requirement of adminDataCases) {
    const observed = await adapter.observeAdminDataCase(requirement);
    assert.equal(observed.caseId, requirement.id);
    assert.equal(observed.result, requirement.expectedResult);
    assert.equal(observed.status, requirement.expectedStatus);
    assert.equal(observed.exactPublicOutcome, requirement.exactPublicOutcome);
    assert.equal(observed.authorizedControlPassed, true);
    assertExactBooleanMap(
      requirement.independentObservations,
      observed.independentObservations,
      true,
      requirement.id,
    );
    assertExactBooleanMap(
      requirement.prohibitedSideEffects,
      observed.prohibitedSideEffects,
      false,
      requirement.id,
    );
    assert.ok(
      requirement.requiredLogFields.every((field) => observed.observedLogFields.includes(field)),
      requirement.id,
    );
    assert.deepEqual(observed.exposedForbiddenFields, [], requirement.id);
    assert.equal(observed.recoveryPassed, true, requirement.id);
  }
}

test('executes every operational P1 case through concrete public observations', async () => {
  const adapter = createP1LiveBoundaryContract();
  await assertOperationalRawCases(adapter);
  await assertAdministrativeDataCases(adapter);
});
