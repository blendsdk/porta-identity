import { adminDataCaseRequirements } from '../tests/admin-data-case-requirements.js';
import { adminDataReadControlRequirements } from '../tests/admin-data-read-control-requirements.js';
import { LiveP1BoundaryContract } from '../p1/live-adapter.js';

const adapter = new LiveP1BoundaryContract();
for (const requirement of [...adminDataCaseRequirements, ...adminDataReadControlRequirements]) {
  try {
    const observed = await adapter.observeAdminDataCase(requirement);
    const badIndependents = Object.entries(observed.independentObservations)
      .filter(([, value]) => value !== true)
      .map(([key]) => key);
    const badEffects = Object.entries(observed.prohibitedSideEffects)
      .filter(([, value]) => value !== false)
      .map(([key]) => key);
    process.stdout.write(
      `${JSON.stringify({
        id: requirement.id,
        expected: `${requirement.expectedResult}/${requirement.expectedStatus}`,
        observed: `${observed.result}/${observed.status}`,
        controlOk: observed.authorizedControlPassed,
        recoveryOk: observed.recoveryPassed,
        outcomeOk: observed.exactPublicOutcome === requirement.exactPublicOutcome,
        missingLog: requirement.requiredLogFields.filter(
          (field) => !observed.observedLogFields.includes(field),
        ),
        badIndependents,
        badEffects,
      })}\n`,
    );
  } catch (thrown) {
    process.stdout.write(
      `${JSON.stringify({ id: requirement.id, error: thrown instanceof Error ? thrown.message : String(thrown) })}\n`,
    );
  }
}
await adapter.close();
