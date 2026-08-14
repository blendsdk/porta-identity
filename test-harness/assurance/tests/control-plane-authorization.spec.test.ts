import assert from 'node:assert/strict';
import test from 'node:test';

import {
  controlPlaneVariations,
  protectedSuperAdminOperations,
} from './tenant-admin-boundary-requirements.js';
import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import { controlPlaneAuthorityProfile } from './tenant-admin-profile-requirements.js';

// Permission and organization/ID/slug substitutions are sent through raw HTTP only after a full-
// authority same-handler control succeeds. Rejection must occur after admin authentication at the
// intended permission or resource boundary and leave the independently observed target unchanged.
test('should reject raw permission and target substitutions at the intended boundary', async () => {
  const contract = createTenantAdminBoundariesContract();
  const casesById = new Map(controlPlaneAuthorityProfile.cases.map((entry) => [entry.id, entry]));

  for (const request of controlPlaneVariations) {
    const controlCase = casesById.get(request.authorizedControlCaseId);
    assert.ok(controlCase, request.authorizedControlCaseId);
    const control = await contract.observeControlPlaneCase(controlCase.id);
    const denied = await contract.observeControlPlaneVariation(request);

    assert.equal(control.result, 'allowed', request.variation);
    assert.equal(control.handlerReached, true, request.variation);
    assert.equal(denied.transport, 'raw-http', request.variation);
    assert.equal(denied.adminAuthenticationAccepted, true, request.variation);
    assert.equal(denied.handlerReached, true, request.variation);
    assert.equal(denied.result, request.expectedResult, request.variation);
    assert.equal(
      denied.decisionBoundary,
      request.variation === 'permission' ? 'permission' : 'resource',
      request.variation,
    );
    assert.deepEqual(denied.targetAfter, denied.targetBefore, request.variation);
    for (const prohibited of controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects) {
      assert.equal(denied.prohibitedSideEffects[prohibited], false, request.variation);
    }
  }
});

// Full, read-only limited, and unprivileged actors are exercised against alpha/bravo tenant targets
// and global application/role resources. Each denial retains its cataloged same-target control and
// independently proves the resource was not mutated.
test('should enforce the exact actor permission matrix across tenant and global targets', async () => {
  const contract = createTenantAdminBoundariesContract();

  for (const expected of controlPlaneAuthorityProfile.cases) {
    const observed = await contract.observeControlPlaneCase(expected.id);

    assert.equal(observed.result, expected.result, expected.id);
    if (expected.result !== 'allowed') {
      assert.ok(expected.authorizedControl, expected.id);
      assert.deepEqual(observed.targetAfter, observed.targetBefore, expected.id);
      for (const prohibited of controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects) {
        assert.equal(observed.prohibitedSideEffects[prohibited], false, expected.id);
      }
    }
  }
});

// Full administrative authority does not override the documented protections for the bootstrap
// super-admin user. Every destructive exception is forbidden and independently non-mutating.
test('should preserve documented bootstrap super-admin protections', async () => {
  const contract = createTenantAdminBoundariesContract();

  const observations = await contract.observeSuperAdminExceptions();

  assert.deepEqual(observations.map((entry) => entry.operation).sort(), [
    ...protectedSuperAdminOperations,
  ]);
  assert.ok(observations.every((entry) => entry.result === 'forbidden'));
  assert.ok(observations.every((entry) => entry.targetUnchanged));
});
