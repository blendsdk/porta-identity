import assert from 'node:assert/strict';
import test from 'node:test';

import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';

// Cache, session, and response organization identities share one exact independently selectable
// sub-sentinel without conflating them with the separate issuer invariant.
test('should bind organization cache fault to cache session and response isolation', () => {
  const requirement = tenantAdminFaultRequirement('organization-cache-scope-removed');
  assert.equal(requirement.semanticTarget, 'organization-cache-separation');
  assert.equal(
    requirement.invariantMarker,
    'cache-session-and-response-organization-match-request-organization',
  );
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-30',
    subSentinel: 'ST-30_ORGANIZATION_CACHE_SEPARATION',
    expectedSignature: 'ST30_ORGANIZATION_CACHE_SEPARATION_BYPASS',
  });
});
