import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import {
  ordinaryTenantAdminMembershipNegativeControl,
  tenantAdminFaultRequirement,
} from './tenant-admin-fault-requirements.js';
import { controlPlaneAuthorityProfile } from './tenant-admin-profile-requirements.js';

// An active alpha user with a valid opaque token and porta-auditor role remains outside the one
// administrative organization and must be forbidden before permission evaluation.
test('should bind the admin membership check to an ordinary-tenant negative control', async () => {
  const requirement = tenantAdminFaultRequirement('admin-organization-membership');
  assert.equal(requirement.semanticTarget, 'admin-organization-membership');
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-32',
    subSentinel: 'ST-32_ADMIN_ORGANIZATION_MEMBERSHIP',
    expectedSignature: 'ST32_ADMIN_ORGANIZATION_MEMBERSHIP_CONTROL_ABSENCE',
  });
  assert.deepEqual(ordinaryTenantAdminMembershipNegativeControl, {
    actorId: 'alpha-ordinary-admin-role-control',
    userState: 'active',
    organization: 'alpha',
    token: 'valid-opaque-token',
    assignedRole: 'porta-auditor',
    expectedResult: 'forbidden',
    rejectionBoundary: 'admin-organization-membership',
  });
  assert.ok(
    controlPlaneAuthorityProfile.staleTransitions
      .filter((transition) => transition.status === 'not-applicable')
      .every((transition) => transition.gap?.length),
  );
  const contract = createTenantAdminBoundariesContract();
  const observed = await contract.observeAdminMembershipNegativeControl(
    ordinaryTenantAdminMembershipNegativeControl,
  );
  assert.equal(observed.actorId, ordinaryTenantAdminMembershipNegativeControl.actorId);
  assert.equal(observed.validTokenAdmitted, true);
  assert.equal(observed.result, 'forbidden');
  assert.equal(observed.decisionBoundary, 'admin-organization-membership');
  assert.deepEqual(observed.targetAfter, observed.targetBefore);
});
