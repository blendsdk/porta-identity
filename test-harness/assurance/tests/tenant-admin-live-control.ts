import { z } from 'zod';

import {
  controlPlaneVariations,
  protectedSuperAdminOperations,
} from './tenant-admin-boundary-requirements.js';
import {
  controlPlaneAuthorityProfile,
  type ControlPlaneAuthorityCase,
} from './tenant-admin-profile-requirements.js';
import type {
  AdminMembershipNegativeControlObservation,
  AdminMembershipNegativeControlRequest,
  ControlPlaneBoundaryObservation,
  ControlPlaneVariationRequest,
  SuperAdminExceptionObservation,
} from './tenant-admin-boundaries-contract.js';
import {
  authorizationResult,
  type LiveAdminActorId,
  type LiveHttpObservation,
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

/** Returns whether the paired control consumes a fixture and therefore requires reseeding. */
function destructiveControl(target: LiveAdminTarget): boolean {
  return target.surface === 'session';
}

const permissionDenialSchema = z
  .object({
    error: z.literal('Forbidden'),
    message: z.string().regex(/^Insufficient permissions\. Required: /u),
  })
  .passthrough();
const resourceDenialSchema = z.object({ error: z.string().regex(/not found/iu) }).passthrough();
const membershipDenialSchema = z
  .object({
    error: z.literal('Forbidden'),
    message: z.literal('Admin access requires membership in the admin organization'),
  })
  .passthrough();

/** Evidence that the exact route, method, and target succeeded before one variation. */
export interface AuthorizedRouteProof {
  readonly caseId: string;
  readonly targetId: string;
  readonly method: 'GET' | 'PUT' | 'DELETE';
}

/** Returns the public method exercised by one catalog action and target. */
function catalogMethod(
  entry: ControlPlaneAuthorityCase,
  target: LiveAdminTarget,
): AuthorizedRouteProof['method'] {
  return target.surface === 'session' ? 'DELETE' : mutationAction(entry.action) ? 'PUT' : 'GET';
}

/** Creates a paired route proof only from an exact successful public control response. */
export function authorizedRouteProof(
  entry: ControlPlaneAuthorityCase,
  target: LiveAdminTarget,
  response: LiveHttpObservation,
): AuthorizedRouteProof {
  if (authorizationResult(response.status) !== 'allowed') {
    throw new Error('authorized route control did not succeed');
  }
  if (!mutationAction(entry.action)) responseEnvelope(response.body);
  return Object.freeze({
    caseId: entry.id,
    targetId: target.catalogId,
    method: catalogMethod(entry, target),
  });
}

/** Rejects a successful control that did not exercise the denied request's exact route. */
export function assertAuthorizedRouteProof(
  deniedEntry: ControlPlaneAuthorityCase,
  target: LiveAdminTarget,
  proof: AuthorizedRouteProof,
): void {
  if (
    deniedEntry.authorizedControl !== proof.caseId ||
    target.catalogId !== proof.targetId ||
    catalogMethod(deniedEntry, target) !== proof.method
  ) {
    throw new Error('authorized control proof does not match the denied route');
  }
}

/** Derives reachability only from a paired route proof and an exact public error schema. */
export function controlPlaneReachability(
  actor: LiveAdminActorId,
  response: LiveHttpObservation,
  proof?: AuthorizedRouteProof,
): Pick<
  ControlPlaneBoundaryObservation,
  'adminAuthenticationAccepted' | 'handlerReached' | 'decisionBoundary'
> {
  const result = authorizationResult(response.status);
  if (result === 'allowed') {
    return Object.freeze({
      adminAuthenticationAccepted: actor !== 'unauthenticated',
      handlerReached: true,
      decisionBoundary: 'handler',
    });
  }
  if (result === 'unauthenticated') {
    return Object.freeze({
      adminAuthenticationAccepted: false,
      handlerReached: false,
      decisionBoundary: 'handler',
    });
  }
  if (proof === undefined) throw new Error('denied route is missing its authorized control proof');
  const decisionBoundary =
    result === 'forbidden'
      ? permissionDenialSchema.safeParse(response.body).success
        ? 'permission'
        : undefined
      : resourceDenialSchema.safeParse(response.body).success
        ? 'resource'
        : undefined;
  if (decisionBoundary === undefined) {
    throw new Error('denied route did not expose the expected public decision boundary');
  }
  return Object.freeze({
    adminAuthenticationAccepted: actor !== 'unauthenticated',
    handlerReached: true,
    decisionBoundary,
  });
}

/** Validates the common response envelope returned by reachable GET handlers. */
function responseEnvelope(value: unknown): void {
  z.object({ data: z.unknown() }).passthrough().parse(value);
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
  proof?: AuthorizedRouteProof,
): Promise<ControlPlaneBoundaryObservation> {
  const target = await context.adminTarget(entry.resource);
  const before = await context.targetFingerprint(target);
  const sideEffectsBefore = await context.captureSideEffectSnapshot();
  const response = await executeCatalogCase(context, entry, target);
  const observedResult = authorizationResult(response.status);
  let after = before;
  if (!(mutationAction(entry.action) && observedResult === 'allowed')) {
    after = await context.targetFingerprint(target);
  }
  const targetChanged = before.digest !== after.digest;
  const targetDisclosed =
    observedResult !== 'allowed' && context.responseDisclosedTarget(response, target);
  const sideEffectsAfter = await context.captureSideEffectSnapshot();
  if (entry.result !== 'allowed' && proof !== undefined) {
    assertAuthorizedRouteProof(entry, target, proof);
  }
  const reachability = controlPlaneReachability(actorId(entry.actor), response, proof);
  const observation: ControlPlaneBoundaryObservation = Object.freeze({
    caseId: entry.id,
    result: observedResult,
    transport: 'raw-http',
    ...reachability,
    prohibitedSideEffects: context.observedSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
      {
        targetChanged,
        targetDisclosed,
        unauthorizedAccepted: entry.result !== 'allowed' && observedResult === 'allowed',
      },
      sideEffectsBefore,
      sideEffectsAfter,
    ),
    targetBefore: before,
    targetAfter: after,
  });
  if (destructiveControl(target) && mutationAction(entry.action) && observedResult === 'allowed')
    await context.lifecycle('reset');
  return observation;
}

/** Runs one exact live administrative actor/action/resource catalog case. */
export async function observeLiveControlPlaneCase(
  context: LiveTenantAdminContext,
  caseId: string,
): Promise<ControlPlaneBoundaryObservation> {
  const entry = catalogCase(caseId);
  if (entry.result === 'allowed') return observeCase(context, entry);
  if (entry.authorizedControl === undefined) {
    throw new Error('denied live control-plane case omitted its authorized control');
  }
  const controlEntry = catalogCase(entry.authorizedControl);
  const controlTarget = await context.adminTarget(controlEntry.resource);
  const controlResponse = await executeCatalogCase(context, controlEntry, controlTarget);
  const proof = authorizedRouteProof(controlEntry, controlTarget, controlResponse);
  if (destructiveControl(controlTarget) && mutationAction(controlEntry.action)) {
    await context.lifecycle('reset');
  }
  return observeCase(context, entry, proof);
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
  const controlTarget = await context.adminTarget(control.resource);
  const controlResponse = await executeCatalogCase(context, control, controlTarget);
  const proof = authorizedRouteProof(control, controlTarget, controlResponse);
  if (destructiveControl(controlTarget) && mutationAction(control.action)) {
    await context.lifecycle('reset');
  }
  const target = await context.adminTarget(control.resource);
  const before = await context.targetFingerprint(target);
  const sideEffectsBefore = await context.captureSideEffectSnapshot();
  let response: Awaited<ReturnType<LiveTenantAdminContext['rawRequest']>>;
  if (request.variation === 'permission') {
    response = await executeCatalogCase(context, { ...control, actor: 'admin-limited' }, target);
  } else {
    const missing = '00000000-0000-4000-8000-000000000000';
    const sourcePath = request.requestMethod === 'PUT' ? target.mutationPath : target.readPath;
    const changedPath =
      request.variation === 'target-organization'
        ? sourcePath.replace(context.entity('alpha'), context.entity('bravo'))
        : request.variation === 'target-slug'
          ? `${sourcePath}-missing`
          : sourcePath.replace(/[^/]+$/u, missing);
    response = await context.rawRequest(
      request.requestMethod,
      changedPath,
      'admin-full',
      request.requestMethod === 'PUT' ? target.updateBody : undefined,
    );
  }
  const after = await context.targetFingerprint(target);
  const sideEffectsAfter = await context.captureSideEffectSnapshot();
  const result = authorizationResult(response.status);
  const targetChanged = before.digest !== after.digest;
  assertAuthorizedRouteProof({ ...control, authorizedControl: control.id, result }, target, proof);
  const reachability = controlPlaneReachability(
    request.variation === 'permission' ? 'admin-limited' : 'admin-full',
    response,
    proof,
  );
  return Object.freeze({
    caseId: `${control.id}-${request.variation}`,
    result,
    transport: 'raw-http',
    requestMethod: request.requestMethod,
    ...reachability,
    prohibitedSideEffects: context.observedSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
      {
        targetChanged,
        targetDisclosed: context.responseDisclosedTarget(response, target),
        unauthorizedAccepted: result === 'allowed',
      },
      sideEffectsBefore,
      sideEffectsAfter,
    ),
    targetBefore: before,
    targetAfter: after,
  });
}

/** Presents the ordinary alpha token and Porta-shaped role to the admin membership boundary. */
export async function observeLiveAdminMembershipNegativeControl(
  context: LiveTenantAdminContext,
  request: AdminMembershipNegativeControlRequest,
): Promise<AdminMembershipNegativeControlObservation> {
  if (
    request.actorId !== 'alpha-ordinary-admin-role-control' ||
    request.token !== 'valid-opaque-token' ||
    request.expectedResult !== 'forbidden' ||
    request.rejectionBoundary !== 'admin-organization-membership'
  ) {
    throw new Error('undeclared admin membership negative control');
  }
  const target = await context.adminTarget('admin-target-alpha-user');
  const before = await context.targetFingerprint(target);
  const response = await context.rawOrdinaryTokenRequest(
    'GET',
    target.readPath,
    'credential:alpha:token:baseline',
  );
  const after = await context.targetFingerprint(target);
  const result = authorizationResult(response.status);
  const membershipBoundary = membershipDenialSchema.safeParse(response.body).success;
  if (result === 'forbidden' && !membershipBoundary) {
    throw new Error('admin membership denial did not expose its exact public boundary');
  }
  return Object.freeze({
    actorId: request.actorId,
    validTokenAdmitted: response.status !== 401,
    result,
    decisionBoundary: membershipBoundary ? 'admin-organization-membership' : 'permission',
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
