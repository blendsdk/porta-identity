import type {
  ControlPlaneVariationRequest,
  StaleAuthorityScenarioRequest,
  TenantAdminBoundariesContract,
  TenantPublicProbeShape,
} from './tenant-admin-boundaries-contract.js';
import {
  observeLiveControlPlaneCase,
  observeLiveControlPlaneVariation,
  observeLiveSuperAdminExceptions,
} from './tenant-admin-live-control.js';
import { LiveTenantAdminContext } from './tenant-admin-live-context.js';
import {
  observeLiveConcurrentTenantIsolation,
  observeLiveTenantCase,
} from './tenant-admin-live-oidc.js';
import { observeLiveStaleAuthorityScenario } from './tenant-admin-live-stale.js';

/**
 * Creates the live retained-harness adapter used for tenant and administrative assurance.
 *
 * This fail-closed boundary prevents a live evidence command from silently using requirement-only
 * observations while the public HTTP implementation is being installed.
 */
export function createTenantAdminBoundariesLiveAdapter(): TenantAdminBoundariesContract {
  const context = new LiveTenantAdminContext();
  return Object.freeze({
    observeTenantCase: (caseId: string, probeShape: TenantPublicProbeShape) =>
      observeLiveTenantCase(context, caseId, probeShape),
    observeControlPlaneCase: (caseId: string) => observeLiveControlPlaneCase(context, caseId),
    observeControlPlaneVariation: (request: ControlPlaneVariationRequest) =>
      observeLiveControlPlaneVariation(context, request),
    observeConcurrentTenantIsolation: () => observeLiveConcurrentTenantIsolation(context),
    observeSuperAdminExceptions: () => observeLiveSuperAdminExceptions(context),
    observeStaleAuthorityScenario: (request: StaleAuthorityScenarioRequest) =>
      observeLiveStaleAuthorityScenario(context, request),
  });
}
