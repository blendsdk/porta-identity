import type { TenantAdminFaultRequirementId } from './tenant-admin-fault-requirements.js';
import { createTenantAdminBoundariesContract } from './tenant-admin-boundaries-adapter.js';
import {
  controlPlaneVariations,
  staleAuthorityScenarios,
  tenantProbeShapeBySurface,
} from './tenant-admin-boundary-requirements.js';
import { tenantOidcAuthorityProfile } from './tenant-admin-profile-requirements.js';
import type { TenantAdminBoundariesContract } from './tenant-admin-boundaries-contract.js';

/** Exact designated-check failure accepted by the outer sensitivity executor. */
export class TenantAdminControlCheckDetected extends Error {
  /** Stable assertion signature safe to retain in sanitized evidence. */
  public readonly signature: string;

  /** Creates one detected result without retaining response data or credentials. */
  public constructor(signature: string) {
    super('designated tenant/admin control check detected the isolated source variant');
    this.name = 'TenantAdminControlCheckDetected';
    this.signature = signature;
  }
}

/** Throws the one registered signature when a defensive invariant is absent. */
function requireInvariant(condition: boolean, signature: string): void {
  if (!condition) throw new TenantAdminControlCheckDetected(signature);
}

/**
 * Fails closed until reviewed live fault execution is installed behind this test-only boundary.
 *
 * Requirements-only specifications must never be mistaken for a killed fault or Porta evidence.
 */
export async function executeTenantAdminFaultLive(
  faultId: TenantAdminFaultRequirementId,
): Promise<void> {
  if (process.env.PORTA_ASSURANCE_TENANT_ADMIN_ADAPTER !== 'live') {
    throw new Error('TENANT_ADMIN_FAULT_LIVE_UNAVAILABLE');
  }
  await evaluateTenantAdminControlCheck(faultId, createTenantAdminBoundariesContract());
}

/** Evaluates one exact defensive invariant through a supplied observation boundary. */
export async function evaluateTenantAdminControlCheck(
  faultId: TenantAdminFaultRequirementId,
  contract: TenantAdminBoundariesContract,
): Promise<void> {
  if (faultId === 'tenant-read-scope-removed') {
    const negative = tenantOidcAuthorityProfile.cases.find(
      (entry) =>
        entry.variedDimension === 'tenant' &&
        entry.resource === 'alpha-user' &&
        entry.result === 'not-found',
    );
    if (negative?.authorizedControl === undefined) throw new Error('tenant read check is absent');
    const control = await contract.observeTenantCase(
      negative.authorizedControl,
      tenantProbeShapeBySurface.user,
    );
    const denied = await contract.observeTenantCase(negative.id, tenantProbeShapeBySurface.user);
    requireInvariant(
      control.result === 'allowed' &&
        denied.result === 'not-found' &&
        !denied.foreignDataDisclosed &&
        denied.targetBefore.digest === denied.targetAfter.digest,
      'ST28_TENANT_READ_SCOPE_BYPASS',
    );
    return;
  }
  if (faultId === 'tenant-write-scope-removed') {
    const request = controlPlaneVariations.find(
      (entry) => entry.invariantMarker === 'same-user-write-under-wrong-organization-path',
    );
    if (request === undefined) throw new Error('tenant write check is absent');
    const control = await contract.observeControlPlaneCase(request.authorizedControlCaseId);
    const denied = await contract.observeControlPlaneVariation(request);
    requireInvariant(
      control.result === 'allowed' &&
        denied.requestMethod === 'PUT' &&
        denied.result === 'not-found' &&
        denied.targetBefore.digest === denied.targetAfter.digest,
      'ST29_TENANT_WRITE_SCOPE_BYPASS',
    );
    return;
  }
  if (faultId === 'issuer-separation-removed') {
    const result = await contract.observeConcurrentTenantIsolation();
    const issuerValid = result.observations.every(
      (entry) => entry.issuerOrganization === entry.requestOrganization,
    );
    requireInvariant(
      result.overlapped && !result.crossTalkDetected && issuerValid,
      'ST30_ISSUER_SEPARATION_BYPASS',
    );
    return;
  }
  if (faultId === 'organization-cache-scope-removed') {
    const result = await contract.observeOrganizationCacheIsolation();
    requireInvariant(
      result.cacheWarmAccepted &&
        result.requestOrganization === 'bravo' &&
        result.tokenOrganization === 'alpha' &&
        result.result === 'not-found',
      'ST30_ORGANIZATION_CACHE_SEPARATION_BYPASS',
    );
    return;
  }
  if (faultId === 'stale-authority-recheck-removed') {
    const scenario = staleAuthorityScenarios.find((entry) => entry.transition === 'role-removal');
    if (scenario === undefined) throw new Error('stale authority check is absent');
    const observed = await contract.observeStaleAuthorityScenario(scenario);
    requireInvariant(
      observed.authorizedControlPassed &&
        observed.cacheWarmed &&
        observed.mutationAccepted &&
        observed.revokedStateObserved &&
        observed.retries.every((entry) => !entry.authorityAccepted) &&
        observed.targetBefore.digest === observed.targetAfter.digest,
      'ST31_STALE_AUTHORITY_RECHECK_BYPASS',
    );
    return;
  }
  if (faultId === 'admin-organization-membership-removed') {
    const observed = await contract.observeAdminMembershipNegativeControl({
      actorId: 'alpha-ordinary-admin-role-control',
      userState: 'active',
      organization: 'alpha',
      token: 'valid-opaque-token',
      assignedRole: 'porta-auditor',
      expectedResult: 'forbidden',
      rejectionBoundary: 'admin-organization-membership',
    });
    requireInvariant(
      observed.validTokenAdmitted &&
        observed.result === 'forbidden' &&
        observed.decisionBoundary === 'admin-organization-membership' &&
        observed.targetBefore.digest === observed.targetAfter.digest,
      'ST32_ADMIN_ORGANIZATION_MEMBERSHIP_BYPASS',
    );
    return;
  }
  const permissionVariation = controlPlaneVariations.find(
    (entry) => entry.variation === 'permission' && entry.requestMethod === 'PUT',
  );
  if (permissionVariation === undefined) throw new Error('permission check is absent');
  const control = await contract.observeControlPlaneCase(
    permissionVariation.authorizedControlCaseId,
  );
  const denied = await contract.observeControlPlaneVariation(permissionVariation);
  requireInvariant(
    control.result === 'allowed' &&
      denied.adminAuthenticationAccepted &&
      denied.result === 'forbidden' &&
      denied.targetBefore.digest === denied.targetAfter.digest,
    'ST32_ADMIN_PERMISSION_RBAC_BYPASS',
  );
}
