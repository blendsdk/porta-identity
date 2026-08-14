import type { AuthorizationResult } from './tenant-admin-profile-requirements.js';

/** Public request shapes that expose ordinary tenant/OIDC identity boundaries. */
export type TenantPublicProbeShape =
  'organization-slug' | 'client-id' | 'interaction-id' | 'presented-token' | 'userinfo-read';

/** Raw administrative substitutions that must reach Porta without client normalization. */
export type ControlPlaneVariation =
  'permission' | 'target-organization' | 'target-id' | 'target-slug';

/** One independently observed durable target fingerprint. */
export interface TargetStateFingerprint {
  /** Stable target fixture identity. */
  readonly targetId: string;
  /** Digest produced independently from the client under test. */
  readonly digest: string;
}

/** Black-box observation for one ordinary tenant/OIDC matrix case. */
export interface TenantBoundaryObservation {
  /** Catalog case executed by the adapter. */
  readonly caseId: string;
  /** Public request shape that reached the declared OIDC boundary. */
  readonly probeShape: TenantPublicProbeShape;
  /** Exact catalog result classification. */
  readonly result: AuthorizationResult;
  /** Organization selected by the public OIDC boundary. */
  readonly responseOrganization: 'alpha' | 'bravo' | 'none';
  /** Whether any foreign user, client, session, token, or tenant data was disclosed. */
  readonly foreignDataDisclosed: boolean;
  /** Every cataloged prohibited side effect and whether it was observed. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Target state before the request, observed outside the client under test. */
  readonly targetBefore: TargetStateFingerprint;
  /** Target state after the request, observed outside the client under test. */
  readonly targetAfter: TargetStateFingerprint;
}

/** Request for one raw control-plane substitution probe. */
export interface ControlPlaneVariationRequest {
  /** Same-handler, same-target allowed catalog case executed first. */
  readonly authorizedControlCaseId: string;
  /** One changed authority or resource-addressing dimension. */
  readonly variation: ControlPlaneVariation;
  /** Exact expected public classification. */
  readonly expectedResult: 'forbidden' | 'not-found';
}

/** Black-box observation for one control-plane catalog or substitution case. */
export interface ControlPlaneBoundaryObservation {
  /** Catalog case or stable variation identity. */
  readonly caseId: string;
  /** Exact public result classification. */
  readonly result: AuthorizationResult;
  /** Transport proves substitutions were not normalized by an SDK or browser. */
  readonly transport: 'raw-http';
  /** Administrative authentication completed before permission/resource evaluation. */
  readonly adminAuthenticationAccepted: boolean;
  /** Intended handler was reached before the request was rejected. */
  readonly handlerReached: boolean;
  /** Boundary that made the final authorization decision. */
  readonly decisionBoundary: 'handler' | 'permission' | 'resource';
  /** Every cataloged prohibited side effect and whether it was observed. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Target state before the request, observed independently. */
  readonly targetBefore: TargetStateFingerprint;
  /** Target state after the request, observed independently. */
  readonly targetAfter: TargetStateFingerprint;
}

/** One side of the concurrent issuer/cache isolation observation. */
export interface ConcurrentTenantObservation {
  /** Organization that initiated the request. */
  readonly requestOrganization: 'alpha' | 'bravo';
  /** Organization encoded by the response issuer. */
  readonly issuerOrganization: 'alpha' | 'bravo';
  /** Organization namespace used by the warmed cache entry. */
  readonly cacheOrganization: 'alpha' | 'bravo';
  /** Organization bound to the resulting session. */
  readonly sessionOrganization: 'alpha' | 'bravo';
  /** Organization whose synthetic data appears in the response. */
  readonly responseOrganization: 'alpha' | 'bravo';
  /** Stable cache-key fingerprint, never a credential or token. */
  readonly cacheKeyFingerprint: string;
  /** Stable session fingerprint, never a session cookie. */
  readonly sessionFingerprint: string;
}

/** Concurrent alpha/bravo cache-warming result. */
export interface ConcurrentTenantIsolationResult {
  /** Both requests overlapped while issuer and tenant caches were warm. */
  readonly overlapped: boolean;
  /** One complete observation per organization. */
  readonly observations: readonly ConcurrentTenantObservation[];
  /** Whether issuer, cache, session, or response state crossed organizations. */
  readonly crossTalkDetected: boolean;
}

/** One documented protection for the bootstrap super-admin user. */
export interface SuperAdminExceptionObservation {
  /** Protected destructive operation. */
  readonly operation:
    | 'delete'
    | 'suspend'
    | 'archive'
    | 'lock'
    | 'deactivate'
    | 'remove-super-admin-role'
    | 'manage-2fa';
  /** Public result observed after the protected operation. */
  readonly result: AuthorizationResult;
  /** Whether independently verified bootstrap-user state remained unchanged. */
  readonly targetUnchanged: boolean;
}

/** Stable adapter boundary consumed by immutable tenant/admin specifications. */
export interface TenantAdminBoundariesContract {
  /** Runs one public tenant/OIDC catalog case through its compatible public request shape. */
  observeTenantCase(
    caseId: string,
    probeShape: TenantPublicProbeShape,
  ): Promise<TenantBoundaryObservation>;
  /** Runs one exact cataloged administrative actor/action/resource case. */
  observeControlPlaneCase(caseId: string): Promise<ControlPlaneBoundaryObservation>;
  /** Runs an allowed control followed by one raw permission or resource substitution. */
  observeControlPlaneVariation(
    request: ControlPlaneVariationRequest,
  ): Promise<ControlPlaneBoundaryObservation>;
  /** Overlaps alpha and bravo OIDC requests after warming issuer and tenant caches. */
  observeConcurrentTenantIsolation(): Promise<ConcurrentTenantIsolationResult>;
  /** Exercises documented protections for the bootstrap super-admin user. */
  observeSuperAdminExceptions(): Promise<readonly SuperAdminExceptionObservation[]>;
}
