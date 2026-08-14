/** Stable invariant-specific fault identities for tenant/admin assurance. */
export type TenantAdminFaultRequirementId =
  | 'tenant-read-scope-removed'
  | 'tenant-write-scope-removed'
  | 'issuer-separation-removed'
  | 'organization-cache-scope-removed'
  | 'stale-authority-recheck-removed'
  | 'admin-organization-membership-removed'
  | 'admin-permission-rbac-removed';

/** Semantic control targeted by exactly one requirements-only fault. */
export type TenantAdminFaultSemanticTarget =
  | 'tenant-read-scope'
  | 'tenant-write-scope'
  | 'issuer-separation'
  | 'organization-cache-separation'
  | 'stale-authority'
  | 'admin-organization-membership'
  | 'permission-rbac';

/** Closed exact grammar of independently selectable tenant/admin sub-sentinels. */
export type TenantAdminFaultSubSentinel =
  | 'ST-28_TENANT_READ_SCOPE'
  | 'ST-29_TENANT_WRITE_SCOPE'
  | 'ST-30_ISSUER_SEPARATION'
  | 'ST-30_ORGANIZATION_CACHE_SEPARATION'
  | 'ST-31_STALE_AUTHORITY'
  | 'ST-32_ADMIN_ORGANIZATION_MEMBERSHIP'
  | 'ST-32_PERMISSION_RBAC';

/** Closed exact failure signatures compatible with curated-fault tuple validation. */
export type TenantAdminFaultExpectedSignature =
  | 'ST28_TENANT_READ_SCOPE_BYPASS'
  | 'ST29_TENANT_WRITE_SCOPE_BYPASS'
  | 'ST30_ISSUER_SEPARATION_BYPASS'
  | 'ST30_ORGANIZATION_CACHE_SEPARATION_BYPASS'
  | 'ST31_STALE_AUTHORITY_RECHECK_BYPASS'
  | 'ST32_ADMIN_ORGANIZATION_MEMBERSHIP_BYPASS'
  | 'ST32_ADMIN_PERMISSION_RBAC_BYPASS';

/** Exact sentinel tuple that must fail only for its named invariant marker. */
export interface TenantAdminFaultTupleRequirement {
  /** Governing tenant/admin assurance claim. */
  readonly claimId: 'CLAIM-R5-03';
  /** Stable top-level specification identity. */
  readonly sentinelId: 'ST-28' | 'ST-29' | 'ST-30' | 'ST-31' | 'ST-32';
  /** Exact independently selectable invariant sub-sentinel. */
  readonly subSentinel: TenantAdminFaultSubSentinel;
  /** Exact failure signature required to classify this tuple as killed. */
  readonly expectedSignature: TenantAdminFaultExpectedSignature;
}

/** One semantic fault requirement without implementation paths, patches, or commands. */
export interface TenantAdminFaultRequirement {
  /** Stable reviewed fault identity. */
  readonly id: TenantAdminFaultRequirementId;
  /** Human-readable reason this fault is required. */
  readonly rationale: string;
  /** One and only one semantic control weakened by the future fault. */
  readonly semanticTarget: TenantAdminFaultSemanticTarget;
  /** Exact implementation-neutral marker expected to disappear or invert. */
  readonly invariantMarker: string;
  /** One exact claim/sub-sentinel/signature tuple. */
  readonly tuple: TenantAdminFaultTupleRequirement;
  /** Live execution remains unavailable until a reviewed implementation supplies it. */
  readonly liveExecution: 'unavailable';
}

/** Ordinary tenant actor that must fail administrative membership before permission evaluation. */
export interface OrdinaryTenantAdminMembershipNegativeControl {
  /** Stable synthetic actor identity. */
  readonly actorId: 'alpha-ordinary-admin-role-control';
  /** Actor remains an active alpha-owned user. */
  readonly userState: 'active';
  /** Actor belongs to alpha rather than the administrative organization. */
  readonly organization: 'alpha';
  /** Structurally valid opaque token presented to the administrative API. */
  readonly token: 'valid-opaque-token';
  /** Admin-shaped role proves role prefix/permission alone cannot grant membership. */
  readonly assignedRole: 'porta-auditor';
  /** Exact public result required from the administrative boundary. */
  readonly expectedResult: 'forbidden';
  /** Exact boundary that must reject the actor. */
  readonly rejectionBoundary: 'admin-organization-membership';
}

/** Exact ordinary-tenant negative control for administrative organization membership. */
export const ordinaryTenantAdminMembershipNegativeControl: OrdinaryTenantAdminMembershipNegativeControl =
  Object.freeze({
    actorId: 'alpha-ordinary-admin-role-control',
    userState: 'active',
    organization: 'alpha',
    token: 'valid-opaque-token',
    assignedRole: 'porta-auditor',
    expectedResult: 'forbidden',
    rejectionBoundary: 'admin-organization-membership',
  });

/** Immutable invariant-specific tenant/admin fault requirements. */
export const tenantAdminFaultRequirements: readonly TenantAdminFaultRequirement[] = Object.freeze([
  {
    id: 'tenant-read-scope-removed',
    rationale: 'A foreign ordinary principal must never read tenant-owned identity data.',
    semanticTarget: 'tenant-read-scope',
    invariantMarker: 'foreign-tenant-read-is-not-found-and-discloses-no-data',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-28',
      subSentinel: 'ST-28_TENANT_READ_SCOPE',
      expectedSignature: 'ST28_TENANT_READ_SCOPE_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'tenant-write-scope-removed',
    rationale: 'A tenant-targeted administrative write must not cross its organization path.',
    semanticTarget: 'tenant-write-scope',
    invariantMarker: 'same-user-write-under-wrong-organization-is-not-found-and-unchanged',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-29',
      subSentinel: 'ST-29_TENANT_WRITE_SCOPE',
      expectedSignature: 'ST29_TENANT_WRITE_SCOPE_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'issuer-separation-removed',
    rationale: 'Concurrent organization requests must retain distinct OIDC issuer contexts.',
    semanticTarget: 'issuer-separation',
    invariantMarker: 'concurrent-response-issuer-matches-request-organization',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-30',
      subSentinel: 'ST-30_ISSUER_SEPARATION',
      expectedSignature: 'ST30_ISSUER_SEPARATION_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'organization-cache-scope-removed',
    rationale: 'Concurrent organization requests must never share tenant cache or session state.',
    semanticTarget: 'organization-cache-separation',
    invariantMarker: 'cache-session-and-response-organization-match-request-organization',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-30',
      subSentinel: 'ST-30_ORGANIZATION_CACHE_SEPARATION',
      expectedSignature: 'ST30_ORGANIZATION_CACHE_SEPARATION_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'stale-authority-recheck-removed',
    rationale: 'Durably revoked authority must fail for existing, fresh, and restarted contexts.',
    semanticTarget: 'stale-authority',
    invariantMarker: 'revoked-authority-is-rejected-in-every-retry-context',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-31',
      subSentinel: 'ST-31_STALE_AUTHORITY',
      expectedSignature: 'ST31_STALE_AUTHORITY_RECHECK_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'admin-organization-membership-removed',
    rationale: 'An active ordinary tenant actor cannot become an administrator through role shape.',
    semanticTarget: 'admin-organization-membership',
    invariantMarker: 'active-alpha-user-with-porta-role-is-forbidden-before-permission-evaluation',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-32',
      subSentinel: 'ST-32_ADMIN_ORGANIZATION_MEMBERSHIP',
      expectedSignature: 'ST32_ADMIN_ORGANIZATION_MEMBERSHIP_BYPASS',
    },
    liveExecution: 'unavailable',
  },
  {
    id: 'admin-permission-rbac-removed',
    rationale: 'Authenticated administrative actors may exercise only their exact permissions.',
    semanticTarget: 'permission-rbac',
    invariantMarker: 'limited-write-and-unprivileged-actions-are-forbidden-and-unchanged',
    tuple: {
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-32',
      subSentinel: 'ST-32_PERMISSION_RBAC',
      expectedSignature: 'ST32_ADMIN_PERMISSION_RBAC_BYPASS',
    },
    liveExecution: 'unavailable',
  },
]);

/** Selects one exact semantic fault requirement without runner or catalog coupling. */
export function tenantAdminFaultRequirement(
  id: TenantAdminFaultRequirementId,
): TenantAdminFaultRequirement {
  const requirement = tenantAdminFaultRequirements.find((candidate) => candidate.id === id);
  if (requirement === undefined) throw new Error(`unknown tenant/admin fault requirement: ${id}`);
  return requirement;
}

/** Selects one exact sub-sentinel tuple without parsing a combined matrix failure. */
export function tenantAdminFaultRequirementForSubSentinel(
  subSentinel: TenantAdminFaultSubSentinel,
): TenantAdminFaultRequirement {
  const requirement = tenantAdminFaultRequirements.find(
    (candidate) => candidate.tuple.subSentinel === subSentinel,
  );
  if (requirement === undefined)
    throw new Error(`unknown tenant/admin sub-sentinel: ${subSentinel}`);
  return requirement;
}
