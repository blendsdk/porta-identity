/**
 * Public types for the client service-account binding subresource.
 *
 * The binding is managed by a human administrator. Responses never contain a
 * credential, an internal authorization version, or a permission snapshot;
 * the policy is an allowlist of ordinary organizations and application-qualified
 * role and claim-definition references.
 */

/** One application-qualified role that an invitation may assign. */
export interface ClientServiceAccountRoleReference {
  /** Internal application UUID that owns the role. */
  applicationId: string;
  /** Internal role UUID within that application. */
  roleId: string;
}

/** One application-qualified claim definition that an invitation may assign. */
export interface ClientServiceAccountClaimReference {
  /** Internal application UUID that owns the claim definition. */
  applicationId: string;
  /** Internal claim-definition UUID within that application. */
  claimDefinitionId: string;
}

/** One ordinary organization and the assignments allowed there. */
export interface ClientServiceAccountTarget {
  /** Internal organization UUID. */
  organizationId: string;
  /** Application-qualified roles allowed in this organization. */
  allowedRoles: ClientServiceAccountRoleReference[];
  /** Application-qualified claim definitions allowed in this organization. */
  allowedClaimDefinitions: ClientServiceAccountClaimReference[];
}

/** Secret-free binding projection returned by reads and writes. */
export interface ClientServiceAccount {
  /** Durable binding UUID. */
  id: string;
  /** Internal UUID of the owning client, not its public OAuth client ID. */
  clientId: string;
  /** Internal UUID of the permanently classified owned account. */
  serviceAccountId: string;
  /** Immutable account email metadata; never a login credential. */
  accountEmail: string;
  /** Current binding lifecycle state. */
  status: 'active' | 'revoked';
  /** Complete organization/assignment allowlist for this binding. */
  targets: ClientServiceAccountTarget[];
  /** ISO timestamp of the original binding. */
  createdAt: string;
  /** ISO timestamp of the last durable binding change. */
  updatedAt: string;
}

/** Complete replacement policy accepted by the write operation. */
export interface SetClientServiceAccountInput {
  /** Initial account email; required by the server only for the first binding. */
  accountEmail?: string;
  /** Complete replacement allowlist; omitted targets are not retained. */
  targets: ClientServiceAccountTarget[];
}
