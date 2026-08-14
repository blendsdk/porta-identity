import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tenantProbeShapeBySurface,
  unavailableOrdinaryTenantProbeClasses,
} from './tenant-admin-boundary-requirements.js';
import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import { tenantOidcAuthorityProfile } from './tenant-admin-profile-requirements.js';

// Every foreign-tenant OIDC probe follows its exact same-handler target-owner control. The public
// organization slug, client ID, interaction ID, presented token, or UserInfo request is used only
// where that shape belongs to the declared public surface; no tenant CRUD API is invented.
test('should deny foreign tenant public OIDC boundaries after their reachable controls', async () => {
  const contract = createTenantAdminBoundariesContract();
  const actionsById = new Map(
    tenantOidcAuthorityProfile.actions.map((action) => [action.id, action]),
  );
  const foreignCases = tenantOidcAuthorityProfile.cases.filter(
    (entry) => entry.variedDimension === 'tenant',
  );

  for (const negativeCase of foreignCases) {
    assert.ok(negativeCase.authorizedControl, negativeCase.id);
    const controlCase = tenantOidcAuthorityProfile.cases.find(
      (entry) => entry.id === negativeCase.authorizedControl,
    );
    const action = actionsById.get(negativeCase.action);
    assert.ok(controlCase, negativeCase.id);
    assert.ok(action, negativeCase.id);
    const shape = tenantProbeShapeBySurface[action.surface];

    const control = await contract.observeTenantCase(controlCase.id, shape);
    const denied = await contract.observeTenantCase(negativeCase.id, shape);

    assert.equal(control.result, 'allowed', negativeCase.id);
    assert.equal(denied.result, negativeCase.result, negativeCase.id);
    assert.equal(denied.probeShape, shape, negativeCase.id);
    assert.equal(denied.foreignDataDisclosed, false, negativeCase.id);
    assert.deepEqual(denied.targetAfter, denied.targetBefore, negativeCase.id);
    for (const prohibited of tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects) {
      assert.equal(denied.prohibitedSideEffects[prohibited], false, negativeCase.id);
    }
  }
});

// No ordinary-tenant public list or mutation API is part of the approved boundary. Those probe
// classes remain explicitly unavailable instead of being implemented through fictional CRUD.
test('should keep unavailable ordinary tenant list and write probes outside the oracle', () => {
  assert.deepEqual(
    unavailableOrdinaryTenantProbeClasses.map((entry) => entry.probeClass),
    ['list', 'write'],
  );
  assert.ok(unavailableOrdinaryTenantProbeClasses.every((entry) => entry.reason.length > 0));
});

// Concurrent alpha and bravo OIDC requests deliberately overlap after cache warming. Issuer,
// tenant-cache, session, and response identities must remain independently bound to each request.
test('should isolate concurrent issuer cache session and response contexts', async () => {
  const contract = createTenantAdminBoundariesContract();

  const result = await contract.observeConcurrentTenantIsolation();

  assert.equal(result.overlapped, true);
  assert.equal(result.crossTalkDetected, false);
  assert.deepEqual(result.observations.map((entry) => entry.requestOrganization).sort(), [
    'alpha',
    'bravo',
  ]);
  for (const observation of result.observations) {
    assert.equal(observation.issuerOrganization, observation.requestOrganization);
    assert.equal(observation.cacheOrganization, observation.requestOrganization);
    assert.equal(observation.sessionOrganization, observation.requestOrganization);
    assert.equal(observation.responseOrganization, observation.requestOrganization);
  }
  assert.equal(
    new Set(result.observations.map((entry) => entry.cacheKeyFingerprint)).size,
    result.observations.length,
  );
  assert.equal(
    new Set(result.observations.map((entry) => entry.sessionFingerprint)).size,
    result.observations.length,
  );
});
