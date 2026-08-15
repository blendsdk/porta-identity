import assert from 'node:assert/strict';
import test from 'node:test';

import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';
import { tenantOidcAuthorityProfile } from './tenant-admin-profile-requirements.js';

// Foreign ordinary-tenant reads must fail this exact sub-sentinel if tenant read scope is removed.
test('should bind the tenant read negative control to the exact foreign-read invariant', () => {
  const requirement = tenantAdminFaultRequirement('tenant-read-scope');
  assert.equal(requirement.semanticTarget, 'tenant-read-scope');
  assert.equal(
    requirement.invariantMarker,
    'foreign-tenant-read-is-not-found-and-discloses-no-data',
  );
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-28',
    subSentinel: 'ST-28_TENANT_READ_SCOPE',
    expectedSignature: 'ST28_TENANT_READ_SCOPE_CONTROL_ABSENCE',
  });
  assert.ok(
    tenantOidcAuthorityProfile.cases.some(
      (entry) => entry.variedDimension === 'tenant' && entry.result === 'not-found',
    ),
  );
});
