import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { claimSchema, traceabilitySchema } from '../schema.js';
import {
  matchRedSignature,
  transitionClaim,
  validateCatalog,
  validateRedSignatureRegistry,
  validateTraceability,
} from '../scripts/validate-assurance.js';
import { completeClaim, knownTests } from './assurance-fixtures.js';

test('should name invalid claim fields without discarding the original value', () => {
  const invalidClaim = structuredClone(completeClaim);
  Reflect.deleteProperty(invalidClaim, 'owner');

  const result = claimSchema.safeParse(invalidClaim);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.error.issues[0]?.path, ['owner']);
  assert.equal(invalidClaim.id, completeClaim.id);
});

test('should reject invalid assured transitions before returning a changed claim', () => {
  const missingFaultKill = structuredClone(completeClaim);
  missingFaultKill.evidence.killedFaultIds = [];

  assert.throws(
    () => transitionClaim(missingFaultKill, 'assured', { knownTests }),
    /assured.*killed fault|killed fault.*assured/i,
  );
  assert.equal(missingFaultKill.status, 'incomplete');
});

test('should reject catalog runner mismatches with the referenced test path', () => {
  const mismatchedClaim = structuredClone(completeClaim);
  mismatchedClaim.sentinels[0].runner = 'playwright';

  assert.throws(
    () => validateCatalog([mismatchedClaim], { knownTests }),
    /runner mismatch.*protocol\.spec\.test\.ts/i,
  );
});

test('should reject traceability node lists that drift from exact mappings', () => {
  const graph = traceabilitySchema.parse(
    JSON.parse(readFileSync('test-harness/assurance/traceability.json', 'utf8')),
  );
  const driftedGraph = structuredClone(graph);
  driftedGraph.tasks.push('11.99');

  assert.throws(
    () => validateTraceability(driftedGraph, []),
    /task list does not match exact mappings/i,
  );
});

test('should require unique RED signatures and exact case, exit, and marker matches', () => {
  const registry = {
    version: 1 as const,
    signatures: [
      {
        id: 'foundation-red',
        caseId: 'ST-01',
        expectedExit: 21,
        marker: 'EXACT_FAILURE_MARKER',
      },
    ],
  };

  assert.equal(
    matchRedSignature(registry, 'ST-01', 'foundation-red', 21, 'EXACT_FAILURE_MARKER'),
    true,
  );
  assert.throws(
    () => matchRedSignature(registry, 'ST-02', 'foundation-red', 21, 'EXACT_FAILURE_MARKER'),
    /case mismatch/i,
  );
  assert.throws(
    () =>
      validateRedSignatureRegistry({
        ...registry,
        signatures: [...registry.signatures, registry.signatures[0]],
      }),
    /duplicate.*foundation-red/i,
  );
});
