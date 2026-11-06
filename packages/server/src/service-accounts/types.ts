/** Application-qualified role identity permitted in an invitation policy. */
export interface ServiceAccountRoleReference {
  /** Application that owns the role definition. */
  applicationId: string;
  /** Role definition, not an effective permission snapshot. */
  roleId: string;
}

/** Application-qualified custom-claim definition permitted in an invitation policy. */
export interface ServiceAccountClaimReference {
  /** Application that owns the claim definition. */
  applicationId: string;
  /** Definition identity; the invitation supplies its value separately. */
  claimDefinitionId: string;
}

/** Explicit invitation and assignment authority within one ordinary organization. */
export interface ServiceAccountPolicyTarget {
  /** Organization in which invitations may be created. */
  organizationId: string;
  /** Exact role pairs; an empty list permits no role pre-assignment. */
  allowedRoles: ServiceAccountRoleReference[];
  /** Exact claim pairs; an empty list permits no claim pre-assignment. */
  allowedClaimDefinitions: ServiceAccountClaimReference[];
}

/** Complete replacement policy, never a partial merge or wildcard grant. */
export interface ServiceAccountPolicy {
  /** Distinct explicitly authorized organizations with their individual assignment ceilings. */
  targets: ServiceAccountPolicyTarget[];
}

/** Validated management input; initial account-email presence is checked by the lifecycle service. */
export interface SetServiceAccountInput extends ServiceAccountPolicy {
  /** Normalized account metadata, required for initial provisioning and immutable afterwards. */
  accountEmail?: string;
}

/** Stored lifecycle states; revocation is reversible only through explicit binding management. */
export const SERVICE_ACCOUNT_STATUS = {
  /** Current machine authority, subject to live client/account/policy checks. */
  ACTIVE: 'active',
  /** No machine authority; an ownerless revoked row is permanently non-restorable. */
  REVOKED: 'revoked',
} as const;

/** One supported binding lifecycle value. */
export type ServiceAccountStatus =
  (typeof SERVICE_ACCOUNT_STATUS)[keyof typeof SERVICE_ACCOUNT_STATUS];

/** Secret-free management projection, constructed only while the owned account exists. */
export interface ServiceAccountBinding extends ServiceAccountPolicy {
  /** Durable binding UUID. */
  id: string;
  /** Internal client UUID, not its public OAuth client identifier. */
  clientId: string;
  /** UUID of the permanently classified real account. */
  serviceAccountId: string;
  /** Immutable account email metadata; never a login or recovery authorization. */
  accountEmail: string;
  /** Current binding lifecycle state. */
  status: ServiceAccountStatus;
  /** Original binding creation time. */
  createdAt: Date;
  /** Last durable binding change. */
  updatedAt: Date;
}

/**
 * Internal authoritative state, including fields that must never enter management responses.
 *
 * A null account is retained ownership history, not an invitation to create another account.
 * Only a revoked row with an empty policy may represent that state.
 */
export interface StoredServiceAccount extends ServiceAccountPolicy {
  /** Durable binding UUID. */
  id: string;
  /** Internal UUID of the client that permanently owns this binding. */
  clientId: string;
  /** Owned account UUID, or null after physical deletion. */
  accountId: string | null;
  /** Unpredictable authority generation compared with server-owned opaque-token metadata. */
  authorizationVersion: string;
  /** Current binding lifecycle state. */
  status: ServiceAccountStatus;
  /** Original binding creation time. */
  createdAt: Date;
  /** Last durable binding change. */
  updatedAt: Date;
}
