import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlannedFaultRunner } from './fault-runner-planned.js';
import { faultExecution, faultObservation } from './fault-spec-fixtures.js';

// Every terminal outcome preserves the primary source tree and either removes every owned
// resource or names one bounded recovery command for the exact remaining identities.
for (const scenario of [
  { name: 'kill', observation: faultObservation() },
  { name: 'survivor', observation: faultObservation({ exitCode: 0, assertionSignatures: [] }) },
  { name: 'failure', observation: faultObservation({ stage: 'startup', assertionSignatures: [] }) },
  { name: 'timeout', observation: faultObservation({ timedOut: true }) },
] as const) {
  test(`should preserve the primary tree and account for residue after ${scenario.name}`, async () => {
    const runner = await createPlannedFaultRunner();
    const result = await runner.execute(faultExecution({ observation: scenario.observation }));

    assert.equal(result.primaryTreeUnchanged, true);
    assert.ok(
      result.residue.length === 0 ||
        (result.recoveryCommand !== undefined && result.recoveryCommand.length > 0),
    );
  });
}
