import assert from 'node:assert/strict';
import test from 'node:test';

import {
  productionExposureCollectorExit,
  type ProductionExposureCaseEvidence,
} from '../production-exposure/evidence.js';

/** Creates one requirement-shaped sanitized collector record. */
function record(
  outcome: ProductionExposureCaseEvidence['outcome'],
): ProductionExposureCaseEvidence {
  return {
    caseId: 'st56-operational-database-error-exposure',
    outcome,
    expectedStatus: 503,
    observedStatus: 599,
    expectedBodyContract: 'generic-service-unavailable',
    observedBodyContract: 'no-bounded-response',
    failedControlObservations: [],
    failedHeaderContracts: [],
    failedStateObservations: [],
    unobservedStateObservations: [],
    observedProhibitedEffects: [],
    unobservedProhibitedEffects: [],
    recoveryPassed: true,
    recoveryMode: 'porta-restart-required',
  };
}

test('keeps product incomplete and execution outcomes distinct from test assertions', () => {
  assert.equal(productionExposureCollectorExit([record('passed')]), 0);
  assert.equal(productionExposureCollectorExit([record('product-failure')]), 20);
  assert.equal(productionExposureCollectorExit([record('incomplete')]), 40);
  assert.equal(productionExposureCollectorExit([record('execution-failure')]), 30);
  assert.equal(
    productionExposureCollectorExit([
      record('product-failure'),
      record('incomplete'),
      record('execution-failure'),
    ]),
    30,
  );
});
