import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPackedClientFoundationsContract,
  type PackedCliOutcome,
} from './packed-client-foundations-planned.js';

const terminalOutcomes: readonly PackedCliOutcome[] = [
  'success',
  'failure',
  'timeout',
  'sigint',
  'sigterm',
];

// Every CLI subprocess receives a newly created HOME whose owner-only permissions prevent other
// local users from reading transient credentials.
test('should give every packed CLI subprocess a fresh restrictive temporary HOME', async () => {
  const contract = createPackedClientFoundationsContract();
  const results = [];

  for (const outcome of terminalOutcomes) {
    results.push(await contract.runCliWithIsolatedHome(outcome));
  }

  assert.equal(new Set(results.map((result) => result.temporaryHomePath)).size, results.length);
  for (const result of results) assert.equal(result.temporaryHomeMode, 0o700, result.outcome);
});

// Success, ordinary failure, timeout, and both supported signals remove the temporary HOME and
// credentials while an independent pre/post fingerprint proves the caller's real Porta credential
// path was never changed.
test('should preserve real credentials and remove temporary credentials for every outcome', async () => {
  const contract = createPackedClientFoundationsContract();

  for (const outcome of terminalOutcomes) {
    const result = await contract.runCliWithIsolatedHome(outcome);

    assert.equal(result.outcome, outcome);
    assert.equal(result.temporaryResourcesRemoved, true, outcome);
    assert.equal(
      result.callerCredentialFingerprintAfter,
      result.callerCredentialFingerprintBefore,
      outcome,
    );
  }
});
