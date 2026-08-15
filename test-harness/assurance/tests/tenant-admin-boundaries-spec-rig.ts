import { createHash } from 'node:crypto';

import {
  controlPlaneVariations,
  protectedSuperAdminOperations,
  staleAuthorityScenarios,
  tenantProbeShapeBySurface,
} from './tenant-admin-boundary-requirements.js';
import {
  controlPlaneAuthorityProfile,
  tenantOidcAuthorityProfile,
  type ControlPlaneAuthorityCase,
  type ControlPlaneResource,
  type TenantAuthorityCase,
  type TenantResource,
} from './tenant-admin-profile-requirements.js';
import type {
  AdminMembershipNegativeControlObservation,
  AdminMembershipNegativeControlRequest,
  ConcurrentTenantIsolationResult,
  OrganizationCacheIsolationObservation,
  ControlPlaneBoundaryObservation,
  ControlPlaneVariationRequest,
  StaleAuthorityScenarioObservation,
  StaleAuthorityScenarioRequest,
  StaleAuthorityRetryContext,
  SuperAdminExceptionObservation,
  TargetStateFingerprint,
  TenantAdminBoundariesContract,
  TenantBoundaryObservation,
  TenantPublicProbeShape,
} from './tenant-admin-boundaries-contract.js';

/**
 * Requirements-owned rig for executing immutable tenant/admin specification structure.
 *
 * This rig does not contact Porta and is never product evidence. It makes the oracle executable
 * before a later black-box adapter supplies observations from the retained harness.
 */
export function createTenantAdminBoundariesSpecRig(): TenantAdminBoundariesContract {
  return Object.freeze({
    observeTenantCase: async (caseId: string, probeShape: TenantPublicProbeShape) =>
      observeTenantCase(caseId, probeShape),
    observeControlPlaneCase: async (caseId: string) => observeControlPlaneCase(caseId),
    observeControlPlaneVariation: async (request: ControlPlaneVariationRequest) =>
      observeControlPlaneVariation(request),
    observeAdminMembershipNegativeControl: async (request: AdminMembershipNegativeControlRequest) =>
      adminMembershipNegativeControl(request),
    observeConcurrentTenantIsolation: async () => concurrentTenantIsolation(),
    observeOrganizationCacheIsolation: async () => organizationCacheIsolation(),
    observeSuperAdminExceptions: async () => protectedSuperAdminObservations(),
    observeStaleAuthorityScenario: async (request: StaleAuthorityScenarioRequest) =>
      observeStaleAuthorityScenario(request),
  });
}

/** Returns an immutable synthetic target digest used only to prove spec-side non-mutation. */
function targetFingerprint(targetId: string): TargetStateFingerprint {
  return Object.freeze({
    targetId,
    digest: `sha256:${createHash('sha256').update(`requirements:${targetId}`).digest('hex')}`,
  });
}

/** Marks every prohibited side effect from an immutable profile as absent. */
function absentSideEffects(keys: readonly string[]): Readonly<Record<string, false>> {
  const entries: [string, false][] = keys.map((key) => [key, false]);
  const sideEffects: Record<string, false> = Object.fromEntries(entries);
  return Object.freeze(sideEffects);
}

/** Finds one required tenant catalog entry or rejects a stale specification reference. */
function tenantCase(caseId: string): TenantAuthorityCase {
  const entry = tenantOidcAuthorityProfile.cases.find((candidate) => candidate.id === caseId);
  if (entry === undefined) throw new Error(`unknown tenant authority case: ${caseId}`);
  return entry;
}

/** Finds one required tenant resource or rejects a stale specification reference. */
function tenantResource(resourceId: string): TenantResource {
  const resource = tenantOidcAuthorityProfile.resources.find(
    (candidate) => candidate.id === resourceId,
  );
  if (resource === undefined) throw new Error(`unknown tenant resource: ${resourceId}`);
  return resource;
}

/** Produces one catalog-derived ordinary tenant observation without contacting Porta. */
function observeTenantCase(
  caseId: string,
  probeShape: TenantPublicProbeShape,
): TenantBoundaryObservation {
  const entry = tenantCase(caseId);
  const action = tenantOidcAuthorityProfile.actions.find(
    (candidate) => candidate.id === entry.action,
  );
  if (action === undefined) throw new Error(`unknown tenant action: ${entry.action}`);
  const expectedShape = tenantProbeShapeBySurface[action.surface];
  if (probeShape !== expectedShape)
    throw new Error(`probe ${probeShape} is incompatible with ${action.surface}`);
  const resource = tenantResource(entry.resource);
  const fingerprint = targetFingerprint(resource.id);
  return Object.freeze({
    caseId: entry.id,
    probeShape,
    result: entry.result,
    responseOrganization: entry.result === 'allowed' ? resource.owner : 'none',
    foreignDataDisclosed: false,
    prohibitedSideEffects: absentSideEffects(
      tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
    ),
    targetBefore: fingerprint,
    targetAfter: fingerprint,
  });
}

/** Finds one required control-plane catalog entry or rejects a stale specification reference. */
function controlPlaneCase(caseId: string): ControlPlaneAuthorityCase {
  const entry = controlPlaneAuthorityProfile.cases.find((candidate) => candidate.id === caseId);
  if (entry === undefined) throw new Error(`unknown control-plane authority case: ${caseId}`);
  return entry;
}

/** Finds one required control-plane resource or rejects a stale specification reference. */
function controlPlaneResource(resourceId: string): ControlPlaneResource {
  const resource = controlPlaneAuthorityProfile.resources.find(
    (candidate) => candidate.id === resourceId,
  );
  if (resource === undefined) throw new Error(`unknown control-plane resource: ${resourceId}`);
  return resource;
}

/** Produces one exact catalog-derived administrative observation without contacting Porta. */
function observeControlPlaneCase(caseId: string): ControlPlaneBoundaryObservation {
  const entry = controlPlaneCase(caseId);
  const resource = controlPlaneResource(entry.resource);
  const fingerprint = targetFingerprint(resource.id);
  const authenticated = entry.actor !== 'unauthenticated';
  return Object.freeze({
    caseId: entry.id,
    result: entry.result,
    transport: 'raw-http',
    adminAuthenticationAccepted: authenticated,
    handlerReached: authenticated,
    decisionBoundary: entry.result === 'forbidden' ? 'permission' : 'handler',
    prohibitedSideEffects: absentSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
    ),
    targetBefore: fingerprint,
    targetAfter: fingerprint,
  });
}

/** Produces one raw substitution result linked to its exact allowed catalog control. */
function observeControlPlaneVariation(
  request: ControlPlaneVariationRequest,
): ControlPlaneBoundaryObservation {
  const declared = controlPlaneVariations.find(
    (candidate) =>
      candidate.authorizedControlCaseId === request.authorizedControlCaseId &&
      candidate.variation === request.variation &&
      candidate.requestMethod === request.requestMethod &&
      candidate.expectedResult === request.expectedResult &&
      candidate.invariantMarker === request.invariantMarker,
  );
  if (declared === undefined)
    throw new Error(`undeclared control-plane variation: ${request.variation}`);
  const control = controlPlaneCase(request.authorizedControlCaseId);
  if (control.result !== 'allowed')
    throw new Error(`variation control is not allowed: ${control.id}`);
  const resource = controlPlaneResource(control.resource);
  const fingerprint = targetFingerprint(resource.id);
  return Object.freeze({
    caseId: `${control.id}-${request.variation}`,
    result: request.expectedResult,
    transport: 'raw-http',
    requestMethod: request.requestMethod,
    adminAuthenticationAccepted: true,
    handlerReached: true,
    decisionBoundary: request.variation === 'permission' ? 'permission' : 'resource',
    prohibitedSideEffects: absentSideEffects(
      controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
    ),
    targetBefore: fingerprint,
    targetAfter: fingerprint,
  });
}

/** Produces the ordinary-tenant membership denial without representing a live request. */
function adminMembershipNegativeControl(
  request: AdminMembershipNegativeControlRequest,
): AdminMembershipNegativeControlObservation {
  const target = targetFingerprint('admin-target-alpha-user');
  return Object.freeze({
    actorId: request.actorId,
    validTokenAdmitted: true,
    result: request.expectedResult,
    decisionBoundary: request.rejectionBoundary,
    targetBefore: target,
    targetAfter: target,
  });
}

/** Produces exact two-tenant overlap identities without representing a live cache run. */
function concurrentTenantIsolation(): ConcurrentTenantIsolationResult {
  return Object.freeze({
    overlapped: true,
    observations: Object.freeze(
      (['alpha', 'bravo'] as const).map((organization) =>
        Object.freeze({
          requestOrganization: organization,
          issuerOrganization: organization,
          cacheOrganization: organization,
          sessionOrganization: organization,
          responseOrganization: organization,
          cacheKeyFingerprint: `cache:${organization}:requirements`,
          sessionFingerprint: `session:${organization}:requirements`,
        }),
      ),
    ),
    crossTalkDetected: false,
  });
}

/** Produces the exact public cache-isolation baseline without contacting Porta. */
function organizationCacheIsolation(): OrganizationCacheIsolationObservation {
  return Object.freeze({
    cacheWarmAccepted: true,
    requestOrganization: 'bravo',
    tokenOrganization: 'alpha',
    result: 'not-found',
  });
}

/** Produces the exact documented bootstrap-user protections from requirement fixtures. */
function protectedSuperAdminObservations(): readonly SuperAdminExceptionObservation[] {
  return Object.freeze(
    protectedSuperAdminOperations.map((operation) =>
      Object.freeze({ operation, result: 'forbidden' as const, targetUnchanged: true as const }),
    ),
  );
}

/** Produces one catalog-derived stale-authority scenario without contacting Porta. */
function observeStaleAuthorityScenario(
  request: StaleAuthorityScenarioRequest,
): StaleAuthorityScenarioObservation {
  const declared = staleAuthorityScenarios.find(
    (candidate) =>
      candidate.transition === request.transition &&
      candidate.authorizedControlCaseId === request.authorizedControlCaseId &&
      candidate.mutationMethod === request.mutationMethod &&
      candidate.mutationRoute === request.mutationRoute &&
      candidate.expectedResult === request.expectedResult,
  );
  if (declared === undefined) throw new Error(`undeclared stale transition: ${request.transition}`);

  const control =
    controlPlaneAuthorityProfile.cases.find(
      (candidate) => candidate.id === request.authorizedControlCaseId,
    ) ??
    tenantOidcAuthorityProfile.cases.find(
      (candidate) => candidate.id === request.authorizedControlCaseId,
    );
  if (control?.result !== 'allowed') {
    throw new Error(`stale transition control is not allowed: ${request.authorizedControlCaseId}`);
  }

  const contexts: readonly StaleAuthorityRetryContext[] = [
    'existing-client',
    'fresh-client',
    'fresh-porta-process',
  ];
  const target = targetFingerprint(`stale-authority:${request.transition}`);
  return Object.freeze({
    transition: request.transition,
    authorizedControlCaseId: request.authorizedControlCaseId,
    mutationMethod: request.mutationMethod,
    mutationRoute: request.mutationRoute,
    authorizedControlPassed: true,
    cacheWarmed: true,
    mutationAccepted: true,
    revokedStateObserved: true,
    retries: Object.freeze(
      contexts.map((context) =>
        Object.freeze({
          context,
          result: request.expectedResult,
          authorityAccepted: false,
          authorityMaterial: 'pre-transition' as const,
          portaRestarted: context === 'fresh-porta-process',
        }),
      ),
    ),
    prohibitedSideEffects: absentSideEffects([
      ...tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
      ...controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
    ]),
    targetBefore: target,
    targetAfter: target,
  });
}
