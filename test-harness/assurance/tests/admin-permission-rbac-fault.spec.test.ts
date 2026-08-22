import assert from 'node:assert/strict';
import test from 'node:test';

import { tenantAdminFaultRequirement } from './tenant-admin-fault-requirements.js';
import { controlPlaneAuthorityProfile } from './tenant-admin-profile-requirements.js';

// Permission/RBAC weakening must fail only the exact limited-write and unprivileged-action
// invariant after administrative organization membership and handler reachability succeed.
test('should bind the permission negative control to limited and unprivileged denials', () => {
  const requirement = tenantAdminFaultRequirement('admin-permission-rbac');
  assert.equal(requirement.semanticTarget, 'permission-rbac');
  assert.deepEqual(requirement.tuple, {
    claimId: 'CLAIM-R5-03',
    sentinelId: 'ST-32',
    subSentinel: 'ST-32_PERMISSION_RBAC',
    expectedSignature: 'ST32_ADMIN_PERMISSION_RBAC_CONTROL_ABSENCE',
  });
  const permissionDenials = controlPlaneAuthorityProfile.cases.filter(
    (entry) => entry.variedDimension === 'permission' && entry.result === 'forbidden',
  );
  assert.ok(permissionDenials.some((entry) => entry.actor === 'admin-limited'));
  assert.ok(permissionDenials.some((entry) => entry.actor === 'admin-unprivileged'));
  assert.ok(permissionDenials.every((entry) => entry.authorizedControl?.length));
});
