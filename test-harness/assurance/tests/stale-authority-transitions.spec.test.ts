import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import { staleAuthorityScenarios } from './tenant-admin-boundary-requirements.js';
import {
  controlPlaneAuthorityProfile,
  tenantOidcAuthorityProfile,
} from './tenant-admin-profile-requirements.js';

const requiredRetryContexts = ['existing-client', 'fresh-client', 'fresh-porta-process'] as const;

// Every supported transition first proves authority, warms the relevant state, mutates through the
// declared public route, and then denies reuse from the original client, a fresh client, and a
// fresh Porta process. Rejected reuse cannot mutate or disclose protected target state.
test('should reject stale authority in existing fresh and restarted contexts', async () => {
  const contract = createTenantAdminBoundariesContract();
  const prohibitedSideEffects = new Set([
    ...tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
    ...controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
  ]);

  for (const scenario of staleAuthorityScenarios) {
    const observed = await contract.observeStaleAuthorityScenario(scenario);

    assert.equal(observed.transition, scenario.transition);
    assert.equal(observed.authorizedControlCaseId, scenario.authorizedControlCaseId);
    assert.equal(observed.mutationMethod, scenario.mutationMethod);
    assert.equal(observed.mutationRoute, scenario.mutationRoute);
    assert.equal(observed.authorizedControlPassed, true, scenario.transition);
    assert.equal(observed.cacheWarmed, true, scenario.transition);
    assert.equal(observed.mutationAccepted, true, scenario.transition);
    assert.equal(observed.revokedStateObserved, true, scenario.transition);
    assert.deepEqual(
      observed.retries.map((retry) => retry.context),
      requiredRetryContexts,
      scenario.transition,
    );
    for (const retry of observed.retries) {
      assert.equal(
        retry.result,
        scenario.expectedResult,
        `${scenario.transition}:${retry.context}`,
      );
      assert.equal(retry.authorityAccepted, false, `${scenario.transition}:${retry.context}`);
      assert.equal(
        retry.authorityMaterial,
        'pre-transition',
        `${scenario.transition}:${retry.context}`,
      );
      assert.equal(
        retry.portaRestarted,
        retry.context === 'fresh-porta-process',
        `${scenario.transition}:${retry.context}`,
      );
    }
    assert.deepEqual(observed.targetAfter, observed.targetBefore, scenario.transition);
    for (const sideEffect of prohibitedSideEffects) {
      assert.equal(observed.prohibitedSideEffects[sideEffect], false, scenario.transition);
    }
  }
});

// The immutable request set is grounded in the public administrative routes and exact public
// outcomes. Role removal reaches admin authentication but removes its porta-* role; inactive actors
// and revoked OIDC sessions instead fail authentication.
test('should use only the supported public stale-authority transitions', () => {
  assert.deepEqual(staleAuthorityScenarios, [
    {
      transition: 'role-removal',
      authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
      mutationMethod: 'DELETE',
      mutationRoute: '/api/admin/organizations/:orgId/users/:userId/roles',
      expectedResult: 'forbidden',
    },
    {
      transition: 'actor-deactivation',
      authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
      mutationMethod: 'POST',
      mutationRoute: '/api/admin/organizations/:orgId/users/:userId/deactivate',
      expectedResult: 'unauthenticated',
    },
    {
      transition: 'actor-suspension',
      authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
      mutationMethod: 'POST',
      mutationRoute: '/api/admin/organizations/:orgId/users/:userId/suspend',
      expectedResult: 'unauthenticated',
    },
    {
      transition: 'session-revocation',
      authorizedControlCaseId: 'alpha-principal-resume-session-alpha-session',
      mutationMethod: 'DELETE',
      mutationRoute: '/api/admin/sessions/:sessionId',
      expectedResult: 'unauthenticated',
    },
  ]);
});

// Organization membership removal and reassignment are not public operations in the current
// single-organization user model. They remain explicit named gaps and are never synthesized by the
// stale-authority adapter.
test('should keep unsupported membership transitions as named non-applicable gaps', () => {
  const unavailable = controlPlaneAuthorityProfile.staleTransitions.filter(
    (transition) => transition.status === 'not-applicable',
  );
  assert.deepEqual(unavailable.map((transition) => transition.id).sort(), [
    'organization-membership-removal',
    'organization-reassignment',
  ]);
  assert.ok(unavailable.every((transition) => transition.gap?.length));
  assert.ok(
    unavailable.every(
      (transition) =>
        !staleAuthorityScenarios.some((scenario) => scenario.transition === transition.id),
    ),
  );
});
