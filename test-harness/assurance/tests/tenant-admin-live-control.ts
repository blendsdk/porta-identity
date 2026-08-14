import {
  controlPlaneVariations,
  protectedSuperAdminOperations,
} from './tenant-admin-boundary-requirements.js';
import {
  controlPlaneAuthorityProfile,
  type ControlPlaneAuthorityCase,
} from './tenant-admin-profile-requirements.js';
import type {
  ControlPlaneBoundaryObservation,
  ControlPlaneVariationRequest,
  SuperAdminExceptionObservation,
} from './tenant-admin-boundaries-contract.js';
import {
  authorizationResult,
  type LiveAdminActorId,
  type LiveAdminTarget,
  LiveTenantAdminContext,
} from './tenant-admin-live-context.js';

/** Finds one immutable administrative catalog case or rejects an unknown selector. */
function catalogCase(caseId: string): ControlPlaneAuthorityCase {
  const entry = controlPlaneAuthorityProfile.cases.find((candidate) => candidate.id === caseId);
  if (entry === undefined) throw new Error('unknown live control-plane catalog case');
  return entry;
}

/** Validates the closed administrative actor identity set. */
function actorId(value: string): LiveAdminActorId {
  if (
    value === 'admin-full' ||
    value === 'admin-limited' ||
    value === 'admin-unprivileged' ||
    value === 'unauthenticated'
  ) {
    return value;
  }
  throw new Error('unknown live administrative actor');
}

/** Returns whether an action is a state-changing operation. */
function mutationAction(action: string): boolean {
  return action.startsWith('update-') || action.startsWith('revoke-');
}

/** Executes the exact route and method represented by one catalog case. */
async function executeCatalogCase(
  context: LiveTenantAdminContext,
  entry: ControlPlaneAuthorityCase,
  target: LiveAdminTarget,
): Promise<Awaited<ReturnType<LiveTenantAdminContext['rawRequest']>>> {
  const actor = actorId(entry.actor);
  if (!mutationAction(entry.action)) return context.rawRequest('GET', target.readPath, actor);
  if (target.surface === 'session') {
    return context.rawRequest('DELETE', target.mutationPath, actor);
  }
  if (target.updateBody === undefined) throw new Error('live update target omitted safe body');
  return context.rawRequest('PUT', target.mutationPath, actor, target.updateBody);
}

/** Creates one observation from actual response, authentication, and target-state facts. */
async function observeCase(
  context: LiveTenantAdminContext,
  entry: ControlPlaneAuthorityCase,
): Promise<ControlPlaneBoundaryObservation> {
  const target = await context.adminTarget(entry.resource);
  const before = await context.targetFingerprint(target);
  const response = await executeCatalogCase(context, entry, target);
  const observedResult = authorizationResult(response.status);
  let after = before;
  if (!(mutationAction(entry.action) && observedResult === 'allowed')) {
    after = await context.targetFingerprint(target);
  }
  const targetChanged = before.digest !== after.digest;
  const targetDisclosed =
    observedResult !== 'allowed' && context.responseDisclosedTarget(response, target);
  const authenticated = entry.actor !== 'unauthenticated' && observedResult !== 'unauthenticated';
  const permissionDenied = authenticated && observedResult === 'forbidden';
  const resourceDenied = authenticated && observedResult === 'not-found';
  const observation: ControlPlaneBoundaryObservation = Object.freeze({
    caseId: entry.id,
    result: observedResult,
    transport: 'raw-http',
    adminAuthenticationAccepted: authenticated,
    handlerReached: authenticated,
    decisionBoundary: permissionDenied ? 'permission' : resourceDenied ? 'resource' : 'handler',
    prohibitedSideEffects: context.observedSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
      {
        targetChanged,
        targetDisclosed,
        unauthorizedAccepted: entry.result !== 'allowed' && observedResult === 'allowed',
      },
    ),
    targetBefore: before,
    targetAfter: after,
  });
  if (mutationAction(entry.action) && observedResult === 'allowed')
    await context.lifecycle('reset');
  return observation;
}

/** Runs one exact live administrative actor/action/resource catalog case. */
export async function observeLiveControlPlaneCase(
  context: LiveTenantAdminContext,
  caseId: string,
): Promise<ControlPlaneBoundaryObservation> {
  return observeCase(context, catalogCase(caseId));
}

/** Runs one raw permission or resource substitution after validating its allowed control. */
export async function observeLiveControlPlaneVariation(
  context: LiveTenantAdminContext,
  request: ControlPlaneVariationRequest,
): Promise<ControlPlaneBoundaryObservation> {
  const declared = controlPlaneVariations.find(
    (candidate) =>
      candidate.authorizedControlCaseId === request.authorizedControlCaseId &&
      candidate.variation === request.variation &&
      candidate.expectedResult === request.expectedResult,
  );
  if (declared === undefined) throw new Error('undeclared live control-plane variation');
  const control = catalogCase(request.authorizedControlCaseId);
  const target = await context.adminTarget(control.resource);
  const before = await context.targetFingerprint(target);
  let response: Awaited<ReturnType<LiveTenantAdminContext['rawRequest']>>;
  if (request.variation === 'permission') {
    response = await executeCatalogCase(context, { ...control, actor: 'admin-limited' }, target);
  } else {
    const missing = '00000000-0000-4000-8000-000000000000';
    const changedPath =
      request.variation === 'target-organization'
        ? target.readPath.replace(context.entity('alpha'), context.entity('bravo'))
        : request.variation === 'target-slug'
          ? `${target.readPath}-missing`
          : target.readPath.replace(/[^/]+$/u, missing);
    response = await context.rawRequest('GET', changedPath, 'admin-full');
  }
  const after = await context.targetFingerprint(target);
  const result = authorizationResult(response.status);
  const targetChanged = before.digest !== after.digest;
  return Object.freeze({
    caseId: `${control.id}-${request.variation}`,
    result,
    transport: 'raw-http',
    adminAuthenticationAccepted: result !== 'unauthenticated',
    handlerReached: result !== 'unauthenticated',
    decisionBoundary: request.variation === 'permission' ? 'permission' : 'resource',
    prohibitedSideEffects: context.observedSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
      {
        targetChanged,
        targetDisclosed: context.responseDisclosedTarget(response, target),
        unauthorizedAccepted: result === 'allowed',
      },
    ),
    targetBefore: before,
    targetAfter: after,
  });
}

/** Observes every documented destructive bootstrap-user protection through raw HTTP. */
export async function observeLiveSuperAdminExceptions(
  context: LiveTenantAdminContext,
): Promise<readonly SuperAdminExceptionObservation[]> {
  const organizationId = context.entity('super-admin');
  const users = await context.rawRequest(
    'GET',
    `/api/admin/organizations/${organizationId}/users?pageSize=100`,
    'admin-full',
  );
  if (users.status !== 200) throw new Error('bootstrap-user inventory control failed');
  const data = users.body as { readonly data?: readonly Record<string, unknown>[] };
  const assuranceActorIds = new Set(
    context.manifest.superAdmin.actors.map((actor) => context.entity(actor.id)),
  );
  const bootstrap = data.data?.find(
    (entry) => typeof entry.id === 'string' && !assuranceActorIds.has(entry.id),
  );
  if (bootstrap === undefined || typeof bootstrap.id !== 'string') {
    throw new Error('bootstrap super-admin user was not independently identified');
  }
  const userId = bootstrap.id;
  const readPath = `/api/admin/users/${userId}`;
  const organizationPath = `/api/admin/organizations/${organizationId}/users/${userId}`;
  const rolesPath = `${organizationPath}/roles`;

  const routes: Readonly<
    Record<
      (typeof protectedSuperAdminOperations)[number],
      readonly ['POST' | 'DELETE', string, Readonly<Record<string, unknown>> | undefined]
    >
  > = {
    deactivate: ['POST', `${readPath}/deactivate`, undefined],
    delete: ['POST', `${organizationPath}/purge`, { confirmPurge: true }],
    lock: ['POST', `${readPath}/lock`, { reason: 'assurance-protected-user-probe' }],
    'manage-2fa': ['POST', `${organizationPath}/two-factor/disable`, undefined],
    'remove-super-admin-role': [
      'DELETE',
      `/api/admin/organizations/${organizationId}/users/${userId}/roles`,
      { roleIds: [context.entity('porta-super-admin')] },
    ],
    suspend: ['POST', `${readPath}/suspend`, { reason: 'assurance-protected-user-probe' }],
  };

  const observations: SuperAdminExceptionObservation[] = [];
  for (const operation of protectedSuperAdminOperations) {
    const [method, path, body] = routes[operation];
    const statePath = operation === 'remove-super-admin-role' ? rolesPath : readPath;
    const before = await context.rawRequest('GET', statePath, 'admin-full');
    if (before.status !== 200) throw new Error('bootstrap-user state control failed');
    const response = await context.rawRequest(method, path, 'admin-full', body);
    const after = await context.rawRequest('GET', statePath, 'admin-full');
    observations.push(
      Object.freeze({
        operation,
        result: authorizationResult(response.status),
        targetUnchanged: liveComparable(before.body) === liveComparable(after.body),
      }),
    );
  }
  return Object.freeze(observations);
}

/** Removes volatile response fields before comparing bootstrap-user state. */
function liveComparable(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const envelope = value as { readonly data?: Record<string, unknown> };
  if (envelope.data === undefined) return JSON.stringify(value);
  const { updatedAt: _updatedAt, ...stable } = envelope.data;
  return JSON.stringify(stable);
}
