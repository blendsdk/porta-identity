import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectPackedAdminDataJourneys,
  type PackedAdminDataDriver,
} from '../compat/admin-data.js';
import { isPackedCompatibilitySelector } from '../compat/command.js';
import {
  packedAdminDataForbiddenOutputClasses,
  packedAdminDataRequirements,
} from './packed-admin-data-requirements.js';

const digest = `sha256:${'a'.repeat(64)}`;

/** Creates a recording driver with independently identical results. */
function driver(events: string[]): PackedAdminDataDriver {
  let state = 0;
  return {
    async observeState() {
      events.push(`state:${state}`);
      state += 1;
      return digest;
    },
    async executeClient(requirement) {
      events.push(`client:${requirement.id}`);
      const result = {
        outcome: requirement.expectedOutcome,
        status: requirement.expectedOutcome === 'allowed' ? 200 : 400,
        bodyDigest: digest,
        recordCount: requirement.surface === 'export-users-json' ? 2 : null,
        publicFieldDigest: digest,
      } as const;
      return {
        result,
        boundedOutput: requirement.id,
        ...(requirement.client === 'cli'
          ? {
              cliIsolation: {
                temporaryHomeMode: 0o700,
                temporaryHomeRemoved: true,
                callerCredentialFingerprintUnchanged: true,
              },
            }
          : {}),
      };
    },
    async executeIndependentRaw(requirement) {
      events.push(`raw:${requirement.id}`);
      return {
        outcome: requirement.expectedOutcome,
        status: requirement.expectedOutcome === 'allowed' ? 200 : 400,
        bodyDigest: digest,
        recordCount: requirement.surface === 'export-users-json' ? 2 : null,
        publicFieldDigest: digest,
      };
    },
    async scanForbiddenOutput(output) {
      events.push(`scan:${output}`);
      return Object.fromEntries(packedAdminDataForbiddenOutputClasses.map((key) => [key, false]));
    },
  };
}

test('should execute every journey in order with packed, raw, scan, and state observations', async () => {
  const events: string[] = [];
  const evidence = await collectPackedAdminDataJourneys(driver(events));
  assert.deepEqual(
    evidence.map(({ requirementId }) => requirementId),
    packedAdminDataRequirements.map(({ id }) => id),
  );
  for (const requirement of packedAdminDataRequirements) {
    const clientIndex = events.indexOf(`client:${requirement.id}`);
    assert.ok(clientIndex >= 0);
    assert.ok(events.indexOf(`raw:${requirement.id}`) > clientIndex);
    assert.ok(events.indexOf(`scan:${requirement.id}`) > clientIndex);
  }
  assert.ok(evidence.every(({ outcome }) => outcome === 'passed'));
});

test('should classify mismatched raw output and protected output as product failures', async () => {
  const events: string[] = [];
  const base = driver(events);
  const mismatch: PackedAdminDataDriver = {
    ...base,
    async executeIndependentRaw(requirement) {
      const result = await base.executeIndependentRaw(requirement);
      return requirement.id === packedAdminDataRequirements[0]?.id
        ? { ...result, bodyDigest: `sha256:${'b'.repeat(64)}` }
        : result;
    },
  };
  const evidence = await collectPackedAdminDataJourneys(mismatch);
  assert.equal(evidence[0]?.outcome, 'product-failure');
});

test('should expose only the exact administrative-data selector', () => {
  assert.equal(isPackedCompatibilitySelector('admin-data'), true);
  assert.equal(isPackedCompatibilitySelector('admin-data-extra'), false);
});
