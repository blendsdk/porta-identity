import assert from 'node:assert/strict';
import test from 'node:test';

import { staleAuthorityScenarios } from './tenant-admin-boundary-requirements.js';
import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';

// Revoked authority must fail in every supported transition and retry context under one exact
// stale-authority sub-sentinel; unsupported membership changes remain outside it.
test('should bind the stale-authority negative control only to supported public transitions', () => {
  const requirement = tenantAdminFaultRequirement('stale-authority-recheck');
  assert.equal(requirement.semanticTarget, 'stale-authority');
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-31',
    subSentinel: 'ST-31_STALE_AUTHORITY',
    expectedSignature: 'ST31_STALE_AUTHORITY_RECHECK_CONTROL_ABSENCE',
  });
  assert.deepEqual(staleAuthorityScenarios.map((scenario) => scenario.transition).sort(), [
    'actor-deactivation',
    'actor-suspension',
    'role-removal',
    'session-revocation',
  ]);
});
