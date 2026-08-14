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
  let context: LiveTenantAdminContext | undefined;
  const liveContext = (): LiveTenantAdminContext => {
    context ??= new LiveTenantAdminContext();
    return context;
  };
  return Object.freeze({
    observeTenantCase: (caseId: string, probeShape: TenantPublicProbeShape) =>
      observeLiveTenantCase(liveContext(), caseId, probeShape),
    observeControlPlaneCase: (caseId: string) => observeLiveControlPlaneCase(liveContext(), caseId),
    observeControlPlaneVariation: (request: ControlPlaneVariationRequest) => {
      if (request.invariantMarker === 'same-user-write-under-wrong-organization-path') {
        throw new Error('TENANT_ADMIN_WRITE_VARIATION_LIVE_UNAVAILABLE');
      }
      return observeLiveControlPlaneVariation(liveContext(), request);
    },
    observeAdminMembershipNegativeControl: async () => {
      throw new Error('TENANT_ADMIN_MEMBERSHIP_LIVE_UNAVAILABLE');
    },
    observeConcurrentTenantIsolation: () => observeLiveConcurrentTenantIsolation(liveContext()),
    observeSuperAdminExceptions: () => observeLiveSuperAdminExceptions(liveContext()),
    observeStaleAuthorityScenario: (request: StaleAuthorityScenarioRequest) =>
      observeLiveStaleAuthorityScenario(liveContext(), request),
  });
}
