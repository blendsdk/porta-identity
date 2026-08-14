import assert from 'node:assert/strict';
import test from 'node:test';

import {
  controlPlaneAuthorityProfile,
  tenantOidcAuthorityProfile,
  type AuthorizationResult,
  type ControlPlaneAuthorityCase,
  type ControlPlaneAction,
  type ControlPlaneResource,
  type TenantAction,
  type TenantAuthorityCase,
  type TenantResource,
} from './tenant-admin-profile-requirements.js';

const exactResults: readonly AuthorizationResult[] = [
  'allowed',
  'unauthenticated',
  'forbidden',
  'not-found',
];

/** Verifies every denial names a prior allowed control for the same action and target. */
function assertAuthorizedControls<TCase extends TenantAuthorityCase | ControlPlaneAuthorityCase>(
  cases: readonly TCase[],
): void {
  const casesById = new Map(cases.map((entry) => [entry.id, entry]));
  for (const entry of cases) {
    if (entry.result === 'allowed') continue;
    assert.ok(entry.authorizedControl, `${entry.id} must name an authorized control`);
    assert.ok(entry.variedDimension, `${entry.id} must name the varied authority dimension`);
    const control = casesById.get(entry.authorizedControl);
    assert.ok(control, `${entry.id} references a missing authorized control`);
    assert.equal(control.result, 'allowed', entry.id);
    assert.equal(control.action, entry.action, entry.id);
    assert.equal(control.resource, entry.resource, entry.id);
  }
}

/** Verifies every declared actor, action, and resource participates in the exact matrix. */
function assertNoOrphans<
  TActor extends Readonly<{ id: string }>,
  TAction extends Readonly<{ id: string; surface: string }>,
  TResource extends Readonly<{ id: string; surface: string }>,
  TCase extends Readonly<{ actor: string; action: string; resource: string }>,
>(
  actors: readonly TActor[],
  actions: readonly TAction[],
  resources: readonly TResource[],
  cases: readonly TCase[],
): void {
  const usedActors = new Set(cases.map((entry) => entry.actor));
  const usedActions = new Set(cases.map((entry) => entry.action));
  const usedResources = new Set(cases.map((entry) => entry.resource));
  assert.ok(
    actors.every((actor) => usedActors.has(actor.id)),
    'orphan actor',
  );
  assert.ok(
    actions.every((action) => usedActions.has(action.id)),
    'orphan action',
  );
  assert.ok(
    resources.every((resource) => usedResources.has(resource.id)),
    'orphan resource',
  );
}

/** Verifies a matrix case cannot pair an action with an incompatible resource surface. */
function assertCompatibleSurfaces<
  TAction extends TenantAction | ControlPlaneAction,
  TResource extends TenantResource | ControlPlaneResource,
  TCase extends TenantAuthorityCase | ControlPlaneAuthorityCase,
>(actions: readonly TAction[], resources: readonly TResource[], cases: readonly TCase[]): void {
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  for (const entry of cases) {
    const action = actionsById.get(entry.action);
    const resource = resourcesById.get(entry.resource);
    assert.ok(action, `${entry.id} references an undeclared action`);
    assert.ok(resource, `${entry.id} references an undeclared resource`);
    assert.equal(action.surface, resource.surface, entry.id);
  }
}

// Ordinary alpha and bravo principals own only organization-keyed users, clients, sessions,
// tokens, and tenant data. Applications and roles remain explicitly global assets.
test('should define a separate ordinary-tenant OIDC authority ontology', () => {
  const profile = tenantOidcAuthorityProfile;

  assert.deepEqual(profile.actors.map((actor) => actor.organization).sort(), ['alpha', 'bravo']);
  assert.ok(profile.actors.every((actor) => actor.authority === 'ordinary-tenant'));
  for (const asset of ['users', 'clients', 'sessions', 'tokens', 'tenant-data']) {
    assert.equal(
      profile.threatProfile.assets.find((entry) => entry.id === asset)?.ownership,
      'tenant-scoped',
    );
  }
  assert.equal(
    profile.threatProfile.assets.find((asset) => asset.id === 'applications')?.ownership,
    'global',
  );
  assert.equal(
    profile.threatProfile.assets.find((asset) => asset.id === 'roles')?.ownership,
    'global',
  );
  assert.ok(profile.actions.some((action) => action.entryPoint === 'oidc-interaction'));
  assert.ok(profile.actions.some((action) => action.entryPoint === 'token-consumer'));
  assert.ok(
    profile.actions.every(
      (action) => action.entryPoint.startsWith('oidc-') || action.entryPoint === 'token-consumer',
    ),
  );
  assert.deepEqual([...new Set(profile.resources.map((resource) => resource.owner))].sort(), [
    'alpha',
    'bravo',
  ]);
});

// Administrative actors always live in the one super-admin organization. Their full, limited,
// and unprivileged porta-* authority varies independently from alpha and bravo target resources.
test('should define a separate control-plane administrative authority ontology', () => {
  const profile = controlPlaneAuthorityProfile;

  assert.ok(profile.actors.every((actor) => actor.organization === 'super-admin'));
  assert.ok(profile.actors.every((actor) => actor.role.startsWith('porta-')));
  assert.deepEqual(
    profile.actors.map(({ id, role }) => ({ id, role })),
    [
      { id: 'admin-full', role: 'porta-super-admin' },
      { id: 'admin-limited', role: 'porta-auditor' },
      { id: 'admin-unprivileged', role: 'porta-assurance-unprivileged' },
    ],
  );
  assert.deepEqual(profile.actors.map((actor) => actor.permissionProfile).sort(), [
    'full',
    'limited',
    'unprivileged',
  ]);
  assert.deepEqual(
    [...new Set(profile.resources.map((resource) => resource.targetOrganization))].sort(),
    ['alpha', 'bravo', 'global'],
  );
  assert.ok(
    profile.resources.some(
      (resource) => resource.surface === 'application' && resource.targetOrganization === 'global',
    ),
  );
  assert.ok(
    profile.resources.some(
      (resource) => resource.surface === 'role' && resource.targetOrganization === 'global',
    ),
  );
  assert.ok(
    profile.cases.some((entry) => entry.actor === 'admin-full' && entry.result === 'allowed'),
  );
  assert.ok(
    profile.cases.some((entry) => entry.actor === 'admin-limited' && entry.result === 'forbidden'),
  );
  assert.ok(
    profile.cases.some((entry) => entry.actor === 'admin-limited' && entry.result === 'allowed'),
  );
  assert.ok(
    profile.cases.some(
      (entry) => entry.actor === 'admin-unprivileged' && entry.result === 'forbidden',
    ),
  );
});

// The control plane uses the exact public permission contract. The limited actor is read-only for
// every target surface, while full authority is the same-target control for every rejected write.
test('should enforce exact control-plane permissions and read-only limited authority', () => {
  const profile = controlPlaneAuthorityProfile;
  assert.deepEqual(profile.actions.map((action) => action.requiredPermission).sort(), [
    'admin:app:read',
    'admin:app:update',
    'admin:client:read',
    'admin:client:update',
    'admin:role:read',
    'admin:role:update',
    'admin:session:read',
    'admin:session:revoke',
    'admin:user:read',
    'admin:user:update',
  ]);

  const actionsById = new Map(profile.actions.map((action) => [action.id, action]));
  const limitedCases = profile.cases.filter((entry) => entry.actor === 'admin-limited');
  for (const entry of limitedCases) {
    const action = actionsById.get(entry.action);
    assert.ok(action, entry.id);
    const expected = action.requiredPermission.endsWith(':read') ? 'allowed' : 'forbidden';
    assert.equal(entry.result, expected, entry.id);
    if (expected === 'forbidden') assert.ok(entry.authorizedControl, entry.id);
  }
});

// A denial cannot be credited unless an allowed control first proves the same action, handler, and
// exact target resource are reachable before authentication, tenant, identifier, or permission is
// changed.
test('should require a target-matched authorized control for every negative matrix row', () => {
  assertAuthorizedControls(tenantOidcAuthorityProfile.cases);
  assertAuthorizedControls(controlPlaneAuthorityProfile.cases);
});

// Every declared actor, action, and resource must participate in at least one exact row. Each row
// must also pair an action only with its compatible asset surface, preventing structurally valid but
// semantically incomplete or nonsensical catalogs.
test('should reject orphan declarations and incompatible action resource pairs', () => {
  assertNoOrphans(
    tenantOidcAuthorityProfile.actors,
    tenantOidcAuthorityProfile.actions,
    tenantOidcAuthorityProfile.resources,
    tenantOidcAuthorityProfile.cases,
  );
  assertCompatibleSurfaces(
    tenantOidcAuthorityProfile.actions,
    tenantOidcAuthorityProfile.resources,
    tenantOidcAuthorityProfile.cases,
  );
  assertNoOrphans(
    controlPlaneAuthorityProfile.actors,
    controlPlaneAuthorityProfile.actions,
    controlPlaneAuthorityProfile.resources,
    controlPlaneAuthorityProfile.cases,
  );
  assertCompatibleSurfaces(
    controlPlaneAuthorityProfile.actions,
    controlPlaneAuthorityProfile.resources,
    controlPlaneAuthorityProfile.cases,
  );
});

// Both authority matrices expose the exact four result classes and complete assets, entry points,
// trust boundaries, abuses, rejections, side effects, privacy-safe logs, and recovery expectations.
test('should provide complete threat log and recovery profiles with exact result classes', () => {
  const profiles = [tenantOidcAuthorityProfile, controlPlaneAuthorityProfile];

  for (const profile of profiles) {
    const observedResults = new Set(profile.cases.map((entry) => entry.result));
    assert.ok(observedResults.has('allowed'), profile.id);
    assert.ok(observedResults.has('unauthenticated'), profile.id);
    assert.ok(observedResults.has('forbidden') || observedResults.has('not-found'), profile.id);
    assert.ok(
      [...observedResults].every((result) => exactResults.includes(result)),
      profile.id,
    );
    assert.ok(profile.threatProfile.assets.length > 0, profile.id);
    assert.ok(profile.threatProfile.entryPoints.length > 0, profile.id);
    assert.ok(
      profile.threatProfile.entryPoints.every((entry) => entry.trustBoundary.length > 0),
      profile.id,
    );
    assert.ok(profile.threatProfile.abuseCases.length > 0, profile.id);
    assert.deepEqual([...profile.threatProfile.rejectionClasses].sort(), [
      'forbidden',
      'not-found',
      'unauthenticated',
    ]);
    assert.ok(profile.threatProfile.prohibitedSideEffects.length > 0, profile.id);
    assert.ok(profile.threatProfile.privacySafeLogs.length > 0, profile.id);
    assert.ok(
      profile.threatProfile.privacySafeLogs.every(
        (expectation) =>
          expectation.allowedFields.length > 0 && expectation.forbiddenFields.length > 0,
      ),
      profile.id,
    );
    assert.ok(profile.threatProfile.recoveryExpectations.length > 0, profile.id);
  }
});

// Only role removal, actor deactivation/suspension, and session revocation are supported stale-
// authority transitions. Membership removal and reassignment stay explicitly unavailable with a
// named gap, so the test model cannot invent product behavior.
test('should catalog only supported stale-authority transitions and name unavailable gaps', () => {
  const transitions = controlPlaneAuthorityProfile.staleTransitions;
  const supported = transitions.filter((transition) => transition.status === 'supported');
  const unavailable = transitions.filter((transition) => transition.status === 'not-applicable');

  assert.deepEqual(supported.map((transition) => transition.id).sort(), [
    'actor-deactivation',
    'actor-suspension',
    'role-removal',
    'session-revocation',
  ]);
  assert.deepEqual(unavailable.map((transition) => transition.id).sort(), [
    'organization-membership-removal',
    'organization-reassignment',
  ]);
  assert.ok(unavailable.every((transition) => transition.gap?.length));
  assert.ok(unavailable.every((transition) => transition.expected === 'no behavior invented'));
});
