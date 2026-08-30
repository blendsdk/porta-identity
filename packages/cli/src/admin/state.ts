/** Immutable state displayed by the embedded administration shell. */

import type { VerifiedIdentity } from '../auth/types.js';

/** Organization actions granted by a freshly verified administration session. */
export interface AdminCapabilities {
  /** Whether organization listing and switching may be offered. */
  readonly canReadOrganizations: boolean;
  /** Whether organization creation may be offered. */
  readonly canCreateOrganizations: boolean;
  /** Whether users in the selected organization may be listed and inspected. */
  readonly canReadUsers: boolean;
  /** Whether a user may be created in the selected organization. */
  readonly canCreateUsers: boolean;
  /** Whether an invitation may be sent in the selected organization. */
  readonly canInviteUsers: boolean;
  /** Whether user profiles and credentials may be updated. */
  readonly canUpdateUsers: boolean;
  /** Whether user lifecycle transitions may be performed. */
  readonly canManageUserLifecycle: boolean;
  /** Whether a user may be permanently purged. */
  readonly canPurgeUsers: boolean;
  /** Whether global applications and modules may be inspected. */
  readonly canReadApplications: boolean;
  /** Whether a global application may be created. */
  readonly canCreateApplications: boolean;
  /** Whether applications, modules, and application lifecycle may be updated. */
  readonly canUpdateApplications: boolean;
  /** Whether a global application may be permanently archived. */
  readonly canArchiveApplications: boolean;
  /** Whether organization clients and secret metadata may be inspected. */
  readonly canReadClients: boolean;
  /** Whether a client may be created when application read is also granted. */
  readonly canCreateClients: boolean;
  /** Whether client configuration, lifecycle, and secrets may be updated. */
  readonly canUpdateClients: boolean;
  /** Whether clients and client secrets may be permanently revoked. */
  readonly canRevokeClients: boolean;
}

/** The bounded organization projection retained by the terminal application. */
export interface AdminOrganizationContext {
  /** Stable organization UUID. */
  readonly id: string;
  /** Control-free organization display name. */
  readonly name: string;
  /** Canonical organization slug. */
  readonly slug: string;
  /** Current organization lifecycle state. */
  readonly status: 'active' | 'suspended' | 'archived';
}

/** Fixed organization failure categories safe to expose in the terminal. */
export type AdminOrganizationFailureKind =
  'validation' | 'unauthorized' | 'conflict' | 'unavailable' | 'invalid-response';

/** Sanitized result returned by organization list and create operations. */
export type AdminOrganizationResult<T> =
  | {
      /** Successful-result discriminator. */
      readonly kind: 'success';
      /** Sanitized operation value. */
      readonly value: T;
    }
  | {
      /** Indicates that the verified session must be re-established. */
      readonly kind: 'session-invalid';
    }
  | {
      /** Fixed-failure discriminator. */
      readonly kind: 'failure';
      /** Safe category suitable for terminal presentation. */
      readonly failure: AdminOrganizationFailureKind;
    };

/** Sanitized outcome of refreshing a previously selected organization. */
export type AdminOrganizationReconciliation =
  | {
      /** Valid-match discriminator. */
      readonly kind: 'match';
      /** Refreshed organization projection. */
      readonly organization: AdminOrganizationContext;
    }
  | {
      /** Indicates that the selected UUID is no longer present. */
      readonly kind: 'absent';
    }
  | {
      /** Indicates that the selected row exists but is malformed. */
      readonly kind: 'matching-invalid';
    }
  | {
      /** Indicates that the verified session must be re-established. */
      readonly kind: 'session-invalid';
    }
  | {
      /** Fixed-failure discriminator. */
      readonly kind: 'failure';
      /** Safe category suitable for terminal presentation. */
      readonly failure: AdminOrganizationFailureKind;
    };

/** Failure categories safe to expose inside a terminal frame. */
export type AdminFailureKind =
  'unavailable' | 'unauthenticated' | 'unauthorized' | 'configuration-failure' | 'storage-failure';

/** A bounded failure value that never carries remote or internal detail. */
export interface AdminPublicFailure {
  /** Safe category used to choose a fixed user-facing message. */
  readonly kind: AdminFailureKind;
}

/** Complete connection state for one administration application. */
export type AdminConnectionState =
  | { readonly kind: 'selecting-server' }
  | {
      readonly kind: 'unauthenticated';
      readonly server: URL;
      readonly reason?: AdminFailureKind;
    }
  | { readonly kind: 'authenticating'; readonly server: URL; readonly canCancel: true }
  | { readonly kind: 'verifying'; readonly server: URL; readonly canCancel: true }
  | {
      readonly kind: 'authenticated';
      readonly server: URL;
      readonly identity: VerifiedIdentity;
      /** Organization actions derived from the current live UserInfo response. */
      readonly capabilities: AdminCapabilities;
      /** Organization currently selected for administration, when one has been chosen. */
      readonly organization?: AdminOrganizationContext;
      /** Most recent fixed organization-operation failure, when presentation is required. */
      readonly organizationFailure?: AdminOrganizationFailureKind;
    }
  | {
      readonly kind: 'unauthorized';
      readonly server: URL;
      readonly identity: VerifiedIdentity;
    }
  | { readonly kind: 'fatal'; readonly failure: AdminPublicFailure };

/** Returns true only when Retry can safely repeat a transient operation. */
export function canRetryAdminState(state: AdminConnectionState): boolean {
  return state.kind === 'unauthenticated' && state.reason === 'unavailable';
}

/** Returns the normalized server carried by a connection state, if present. */
export function adminStateServer(state: AdminConnectionState): URL | undefined {
  return 'server' in state ? state.server : undefined;
}
