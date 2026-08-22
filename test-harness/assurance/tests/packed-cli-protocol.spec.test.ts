import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePackedProtocolEvidence } from './packed-protocol-adapter.js';
import {
  packedCliProtocolRequirements,
  packedProtocolSurfaces,
} from './packed-protocol-requirements.js';
import { completePackedProtocolEvidence } from './packed-protocol-spec-fixtures.js';

// The distributed CLI must prove its real authorization-code + PKCE login through a browser,
// isolated credentials, and independent token observations.
test('should require browser-assisted packed CLI authorization-code and PKCE login', () => {
  const evidence = validatePackedProtocolEvidence(completePackedProtocolEvidence());
  assert.equal(packedProtocolSurfaces.cli.entry, 'bin:porta');
  assert.equal(packedProtocolSurfaces.cli.operation, 'authorization-code-pkce-login');
  assert.deepEqual(evidence.cliLogin, packedCliProtocolRequirements);
});

test('should reject packed CLI evidence without exact state, PKCE, or offline access facts', () => {
  for (const field of [
    'stateRoundTrip',
    'requestedOfflineAccess',
    'promptedForLoginAndConsent',
  ] as const) {
    const candidate = completePackedProtocolEvidence();
    candidate.cliLogin[field] = false;
    assert.throws(() => validatePackedProtocolEvidence(candidate), /CLI protocol/i);
  }

  const wrongPkce = completePackedProtocolEvidence();
  wrongPkce.cliLogin.codeChallengeMethod = 'plain';
  assert.throws(() => validatePackedProtocolEvidence(wrongPkce), /CLI protocol/i);
});

test('should reject packed CLI evidence without independently verified token outcomes', () => {
  for (const field of [
    'accessTokenOpaque',
    'refreshTokenPresent',
    'idTokenIndependentlyVerified',
    'idTokenAudienceExact',
    'idTokenSubjectExact',
    'accessTokenAcceptedByRawObserver',
  ] as const) {
    const candidate = completePackedProtocolEvidence();
    candidate.cliLogin[field] = false;
    assert.throws(() => validatePackedProtocolEvidence(candidate), /CLI protocol/i);
  }
});

test('should reject packed CLI evidence with unsafe credentials, output, or cleanup', () => {
  const candidate = completePackedProtocolEvidence();
  candidate.cliLogin.credentialsMode = 0o644;
  assert.throws(() => validatePackedProtocolEvidence(candidate), /credential isolation/i);

  const residue = completePackedProtocolEvidence();
  residue.ownedResidue = ['temporary-home'];
  assert.throws(() => validatePackedProtocolEvidence(residue), /owned residue/i);
});
