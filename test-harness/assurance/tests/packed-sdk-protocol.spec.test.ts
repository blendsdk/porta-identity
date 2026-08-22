import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePackedProtocolEvidence } from './packed-protocol-adapter.js';
import {
  packedProtocolSurfaces,
  packedSdkProtocolRequirements,
} from './packed-protocol-requirements.js';
import { completePackedProtocolEvidence } from './packed-protocol-spec-fixtures.js';

// The distributed SDK must consume the CLI credential contract through its public Node entry and
// prove refresh rotation through raw observations that do not trust SDK output.
test('should require packed SDK refresh-token use through the public Node entry', () => {
  const evidence = validatePackedProtocolEvidence(completePackedProtocolEvidence());
  assert.equal(packedProtocolSurfaces.sdk.entry, '@portaidentity/sdk/node');
  assert.equal(packedProtocolSurfaces.sdk.operation, 'cli-credential-refresh-token');
  assert.deepEqual(evidence.sdkRefresh, packedSdkProtocolRequirements);
});

test('should reject SDK refresh evidence without new independently accepted access', () => {
  for (const field of [
    'credentialsFingerprintUnchanged',
    'refreshedAccessTokenChanged',
    'refreshedAccessTokenAcceptedByRawObserver',
    'outputRedacted',
  ] as const) {
    const candidate = completePackedProtocolEvidence();
    candidate.sdkRefresh[field] = false;
    assert.throws(() => validatePackedProtocolEvidence(candidate), /SDK refresh/i);
  }
});

test('should reject SDK refresh evidence unless the consumed token has exact invalid-grant retry', () => {
  const wrongStatus = completePackedProtocolEvidence();
  wrongStatus.sdkRefresh.consumedRefreshRetryStatus = 200;
  assert.throws(() => validatePackedProtocolEvidence(wrongStatus), /consumed refresh/i);

  const wrongError = completePackedProtocolEvidence();
  wrongError.sdkRefresh.consumedRefreshRetryError = 'server_error';
  assert.throws(() => validatePackedProtocolEvidence(wrongError), /consumed refresh/i);
});

test('should reject packed protocol evidence with mismatched package or source provenance', () => {
  const registrySdk = completePackedProtocolEvidence();
  registrySdk.resolution.cliUsesPackedSdk = false;
  assert.throws(() => validatePackedProtocolEvidence(registrySdk), /packed resolution/i);

  const changedTree = completePackedProtocolEvidence();
  changedTree.primaryTreeUnchanged = false;
  assert.throws(() => validatePackedProtocolEvidence(changedTree), /primary tree/i);
});
