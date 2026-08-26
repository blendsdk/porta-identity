import assert from 'node:assert/strict';
import test from 'node:test';

import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';

// Concurrent alpha/bravo responses must fail this exact sub-sentinel when issuer context crosses.
test('should bind the issuer separation negative control to the concurrent issuer invariant', () => {
  const requirement = tenantAdminFaultRequirement('issuer-separation');
  assert.equal(requirement.semanticTarget, 'issuer-separation');
  assert.equal(
    requirement.invariantMarker,
    'concurrent-response-issuer-matches-request-organization',
  );
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-30',
    subSentinel: 'ST-30_ISSUER_SEPARATION',
    expectedSignature: 'ST30_ISSUER_SEPARATION_CONTROL_ABSENCE',
  });
});
