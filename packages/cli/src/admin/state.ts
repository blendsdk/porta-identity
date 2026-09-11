/** Immutable state displayed by the embedded administration shell. */

import type { VerifiedIdentity } from '../auth/types.js';

/** Organization actions granted by a freshly verified administration session. */
export interface AdminCapabilities {
  /** Whether organization listing and switching may be offered. */
  readonly canReadOrganizations: boolean;
  /** Whether organization creation may be offered. */
  readonly canCreateOrganizations: boolean;
  /** Whether organization settings and branding may be updated. */
  readonly canUpdateOrganizations: boolean;
  /** Whether organization lifecycle transitions may be performed. */
  readonly canSuspendOrganizations: boolean;
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
  /** Whether an organization may be permanently deleted. */
  readonly canDeleteOrganizations: boolean;
  /** Whether a user may be permanently deleted. */
  readonly canDeleteUsers: boolean;
  /** Whether global applications and modules may be inspected. */
  readonly canReadApplications: boolean;
  /** Whether a global application may be created. */
  readonly canCreateApplications: boolean;
  /** Whether applications, modules, and application lifecycle may be updated. */
  readonly canUpdateApplications: boolean;
  /** Whether a global application may be permanently deleted. */
  readonly canDeleteApplications: boolean;
  /** Whether an application module may be permanently deleted. */
  readonly canDeleteModules: boolean;
  /** Whether application roles may be listed and inspected. */
  readonly canReadRoles: boolean;
  /** Whether an application role may be created. */
  readonly canCreateRoles: boolean;
  /** Whether role metadata and direct permission mappings may be updated. */
  readonly canUpdateRoles: boolean;
  /** Whether an application role may be permanently deleted. */
  readonly canDeleteRoles: boolean;
  /** Whether application permissions may be listed and inspected. */
  readonly canReadPermissions: boolean;
  /** Whether an application permission may be created. */
  readonly canCreatePermissions: boolean;
  /** Whether mutable permission metadata may be updated. */
  readonly canUpdatePermissions: boolean;
  /** Whether an application permission may be permanently deleted. */
  readonly canDeletePermissions: boolean;
  /** Whether application roles may be assigned to or removed from users. */
  readonly canAssignRoles: boolean;
  /** Whether organization clients and secret metadata may be inspected. */
  readonly canReadClients: boolean;
  /** Whether a client may be created when application read is also granted. */
  readonly canCreateClients: boolean;
  /** Whether client configuration, lifecycle, and secrets may be updated. */
  readonly canUpdateClients: boolean;
  /** Whether clients may be permanently deleted. */
  readonly canDeleteClients: boolean;
  /** Whether nested client secrets may be permanently deleted. */
  readonly canRevokeClientSecrets: boolean;
}

/** Login methods that an organization may offer as client-inheritable defaults. */
export type AdminOrganizationLoginMethod = 'password' | 'magic_link';

/** Organization-wide second-factor policies supported after password authentication. */
export type AdminOrganizationTwoFactorPolicy =
  | 'optional'
  | 'required_email'
  | 'required_totp'
  | 'required_any';

/** Branding image slots managed by the organization workspace. */
export type AdminOrganizationAssetType = 'logo' | 'favicon';

/** Validated media types accepted for stored organization branding images. */
export type AdminOrganizationAssetContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/x-icon'
  | 'image/vnd.microsoft.icon'
  | 'image/svg+xml';

/** Complete organization settings retained by the focused management workspace. */
export interface AdminOrganizationSettings extends AdminOrganizationContext {
  /** Whether this is the protected control-plane organization. */
  readonly isSuperAdmin: boolean;
  /** Existing locale value, including a valid value not offered by this Admin UI. */
  readonly defaultLocale: string;
  /** Non-empty login methods inherited by eligible OIDC clients. */
  readonly defaultLoginMethods: readonly AdminOrganizationLoginMethod[];
  /** Second-factor policy applied only after password authentication. */
  readonly twoFactorPolicy: AdminOrganizationTwoFactorPolicy;
  /** Optional company name shown by authentication templates. */
  readonly brandingCompanyName: string | null;
  /** Optional six-digit hexadecimal brand color. */
  readonly brandingPrimaryColor: string | null;
  /** Optional external logo used when no uploaded logo exists. */
  readonly brandingLogoUrl: string | null;
  /** Optional external favicon used when no uploaded favicon exists. */
  readonly brandingFaviconUrl: string | null;
  /** Creation timestamp displayed through the shared UTC formatter. */
  readonly createdAt: string;
  /** Most recent update timestamp displayed through the shared UTC formatter. */
  readonly updatedAt: string;
}

/** Validated metadata for one stored organization branding image. */
export interface AdminOrganizationAsset {
  /** Branding slot occupied by this image. */
  readonly assetType: AdminOrganizationAssetType;
  /** Media type confirmed by server validation. */
  readonly contentType: AdminOrganizationAssetContentType;
  /** Number of decoded bytes stored by the server. */
  readonly size: number;
  /** Most recent replacement timestamp. */
  readonly updatedAt: string;
}

/** Four text branding values edited independently from stored image assets. */
export interface AdminOrganizationBranding {
  /** Optional company name, or `null` to use the organization name. */
  readonly companyName: string | null;
  /** Optional brand color, or `null` to use Porta's default. */
  readonly primaryColor: string | null;
  /** Optional external logo fallback URL. */
  readonly logoUrl: string | null;
  /** Optional external favicon fallback URL. */
  readonly faviconUrl: string | null;
}

/** Editable Overview fields sent without an ETag precondition. */
export interface AdminOrganizationOverviewInput {
  /** Changed organization name. */
  readonly name?: string;
  /** Changed default locale. */
  readonly defaultLocale?: string;
}

/** Tabs whose operation controls have independent pending ownership. */
export type AdminOrganizationWorkspaceTab = 'overview' | 'authentication' | 'branding';

/** Closed set of user actions emitted by the organization workspace. */
export type AdminOrganizationIntent =
  | { readonly kind: 'save-overview'; readonly input: AdminOrganizationOverviewInput }
  | { readonly kind: 'activate' | 'suspend' }
  | {
      readonly kind: 'save-authentication';
      readonly loginMethods: readonly AdminOrganizationLoginMethod[];
      readonly twoFactorPolicy: AdminOrganizationTwoFactorPolicy;
    }
  | {
      readonly kind: 'save-branding';
      readonly input: {
        readonly companyName?: string | null;
        readonly primaryColor?: string | null;
        readonly logoUrl?: string | null;
        readonly faviconUrl?: string | null;
      };
    }
  | {
      readonly kind: 'upload-asset' | 'remove-asset';
      readonly assetType: AdminOrganizationAssetType;
    };

/** Fixed workspace failure categories that are safe to render. */
export type AdminOrganizationWorkspaceFailureKind =
  | AdminOrganizationFailureKind
  | 'file-type'
  | 'file-size'
  | 'file-read';

/** Sanitized read result returned by organization workspace operations. */
export type AdminOrganizationWorkspaceReadResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminOrganizationWorkspaceFailureKind };

/** Sanitized mutation result that distinguishes an unknown network outcome. */
export type AdminOrganizationWorkspaceMutationResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminOrganizationWorkspaceFailureKind };

/** Authoritative organization data retained beneath transient workspace states. */
export interface AdminOrganizationWorkspaceProjection {
  /** Complete validated organization settings. */
  readonly organization: AdminOrganizationSettings;
  /** Complete validated logo and favicon metadata collection. */
  readonly assets: readonly AdminOrganizationAsset[];
}

/** Complete state rendered by the selected-organization management workspace. */
export type AdminOrganizationWorkspaceState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly previous?: AdminOrganizationWorkspaceProjection }
  | ({
      readonly kind: 'ready';
      readonly pendingTabs?: readonly AdminOrganizationWorkspaceTab[];
      readonly failure?: AdminOrganizationWorkspaceFailureKind;
      readonly reloadedAfterFailure?: boolean;
    } & AdminOrganizationWorkspaceProjection)
  | ({ readonly kind: 'failure'; readonly failure: AdminOrganizationWorkspaceFailureKind } &
      Partial<AdminOrganizationWorkspaceProjection>);

/** The bounded organization projection retained by the terminal application. */
export interface AdminOrganizationContext {
  /** Stable organization UUID. */
  readonly id: string;
  /** Control-free organization display name. */
  readonly name: string;
  /** Canonical organization slug. */
  readonly slug: string;
  /** Current organization lifecycle state. */
  readonly status: 'active' | 'suspended';
  /** Whether this is the undeletable control-plane organization. */
  readonly isSuperAdmin?: boolean;
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
