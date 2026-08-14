import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import { controlPlaneVariations } from './tenant-admin-boundary-requirements.js';
import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';

// The write-scope sentinel first permits the exact full update, then sends the same user update
// beneath the wrong organization path and requires not-found plus independent non-mutation.
test('should bind tenant write scope fault to the wrong-organization update invariant', async () => {
  const requirement = tenantAdminFaultRequirement('tenant-write-scope-removed');
  assert.equal(requirement.semanticTarget, 'tenant-write-scope');
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-29',
    subSentinel: 'ST-29_TENANT_WRITE_SCOPE',
    expectedSignature: 'ST29_TENANT_WRITE_SCOPE_BYPASS',
  });
  const variation = controlPlaneVariations.find(
    (candidate) => candidate.invariantMarker === 'same-user-write-under-wrong-organization-path',
  );
  assert.deepEqual(variation, {
    authorizedControlCaseId: 'admin-full-update-target-user-admin-target-alpha-user',
    variation: 'target-organization',
    requestMethod: 'PUT',
    expectedResult: 'not-found',
    invariantMarker: 'same-user-write-under-wrong-organization-path',
  });
  assert.ok(variation);
  const contract = createTenantAdminBoundariesContract();
  const control = await contract.observeControlPlaneCase(variation.authorizedControlCaseId);
  const denied = await contract.observeControlPlaneVariation(variation);
  assert.equal(control.result, 'allowed');
  assert.equal(denied.requestMethod, 'PUT');
  assert.equal(denied.result, 'not-found');
  assert.deepEqual(denied.targetAfter, denied.targetBefore);
});
