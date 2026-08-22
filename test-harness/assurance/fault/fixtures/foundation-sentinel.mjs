import assert from 'node:assert/strict';

import { foundationControls } from './foundation-control.mjs';

const tupleBySentinel = Object.freeze({
  'ST-64': Object.freeze({
    actual: foundationControls.alpha,
    marker: 'FOUNDATION_FAULT_DETECTED_ALPHA',
  }),
  'ST-66': Object.freeze({
    actual: foundationControls.bravo,
    marker: 'FOUNDATION_FAULT_DETECTED_BRAVO',
  }),
});

const sentinelId = process.argv[2];
const tuple = tupleBySentinel[sentinelId];
if (tuple === undefined) {
  process.stderr.write('FOUNDATION_SENTINEL_INVALID\n');
  process.exitCode = 2;
} else {
  try {
    assert.equal(tuple.actual, true);
  } catch {
    process.stderr.write(`${tuple.marker}\n`);
    process.exitCode = 1;
  }
}
