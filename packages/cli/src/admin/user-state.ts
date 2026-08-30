/** Immutable user administration values retained by the terminal application. */

/** Supported user lifecycle values. */
export type AdminUserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

/** Bounded row displayed in the user list. */
export interface AdminUserListItem {
  /** Stable user UUID. */
  readonly id: string;
  /** UUID of the organization that owns the user. */
  readonly organizationId: string;
  /** User email address. */
  readonly email: string;
  /** OIDC given name, when present. */
  readonly givenName: string | null;
  /** OIDC family name, when present. */
  readonly familyName: string | null;
  /** Current lifecycle state. */
  readonly status: AdminUserStatus;
}

/** One validated page of users. */
export interface AdminUserPage {
  /** Validated rows in server order. */
  readonly data: readonly AdminUserListItem[];
  /** Total number of matching users. */
  readonly total: number;
  /** One-based page number. */
  readonly page: number;
  /** Fixed number of requested rows per page. */
  readonly pageSize: number;
  /** Number of available pages. */
  readonly totalPages: number;
}

/** Allowlisted user detail safe for terminal presentation. */
export interface AdminUserDetail extends AdminUserListItem {
  /** Whether the email address is verified. */
  readonly emailVerified: boolean;
  /** Whether the user currently has a password. */
  readonly hasPassword: boolean;
  /** OIDC middle name, when present. */
  readonly middleName: string | null;
  /** OIDC nickname, when present. */
  readonly nickname: string | null;
  /** OIDC preferred username, when present. */
  readonly preferredUsername: string | null;
  /** OIDC profile URL, when present. */
  readonly profileUrl: string | null;
  /** OIDC picture URL, when present. */
  readonly pictureUrl: string | null;
  /** OIDC website URL, when present. */
  readonly websiteUrl: string | null;
  /** OIDC gender value, when present. */
  readonly gender: string | null;
  /** OIDC birthdate, when present. */
  readonly birthdate: string | null;
  /** OIDC time zone, when present. */
  readonly zoneinfo: string | null;
  /** OIDC locale, when present. */
  readonly locale: string | null;
  /** OIDC phone number, when present. */
  readonly phoneNumber: string | null;
  /** Whether the phone number is verified. */
  readonly phoneNumberVerified: boolean;
  /** Address street, when present. */
  readonly addressStreet: string | null;
  /** Address locality, when present. */
  readonly addressLocality: string | null;
  /** Address region, when present. */
  readonly addressRegion: string | null;
  /** Address postal code, when present. */
  readonly addressPostalCode: string | null;
  /** Two-letter address country, when present. */
  readonly addressCountry: string | null;
  /** Whether two-factor authentication is enabled. */
  readonly twoFactorEnabled: boolean;
  /** Last successful login timestamp, when available. */
  readonly lastLoginAt: string | null;
  /** Non-negative successful login count. */
  readonly loginCount: number;
  /** User creation timestamp. */
  readonly createdAt: string;
  /** Most recent user update timestamp. */
  readonly updatedAt: string;
}

/** One allowlisted user history entry. */
export interface AdminUserHistoryEntry {
  /** Bounded event type. */
  readonly eventType: string;
  /** Actor UUID, or `System` for a server-generated event. */
  readonly actor: string;
  /** Event timestamp. */
  readonly createdAt: string;
}

/** First validated page of user history. */
export interface AdminUserHistory {
  /** Newest-first history rows. */
  readonly entries: readonly AdminUserHistoryEntry[];
  /** Whether more history exists on the server. */
  readonly hasMore: boolean;
}

/** Plain-text invitation preview safe for terminal display. */
export interface AdminInvitationPreview {
  /** Bounded email subject. */
  readonly subject: string;
  /** Bounded plain-text email body. */
  readonly text: string;
}

/** Fixed user-operation failures safe to display. */
export type AdminUserFailureKind =
  'validation' | 'unauthorized' | 'not-found' | 'conflict' | 'unavailable' | 'invalid-response';

/** Fixed outcome that may be displayed over a validated user view. */
export type AdminUserOutcome = AdminUserFailureKind | 'outcome-unknown';

/** A validated page with its currently selected row, when one is open. */
export interface AdminUserSelection {
  /** Page retained behind the detail view. */
  readonly page: AdminUserPage;
  /** Selected row from the retained page. */
  readonly selected: AdminUserListItem;
  /** Validated detail for the selected row. */
  readonly detail: AdminUserDetail;
  /** Opaque update precondition retained by the controller, never rendered. */
  readonly etag: string | null;
}

/** Previous validated projection retained while loading or after a recoverable failure. */
export type AdminUserProjection =
  | { readonly kind: 'page'; readonly page: AdminUserPage }
  | ({ readonly kind: 'detail' } & AdminUserSelection)
  | ({ readonly kind: 'history'; readonly history: AdminUserHistory } & AdminUserSelection);

/** Complete user workspace state for one selected organization and session. */
export type AdminUserViewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'success'; readonly action: 'created' | 'invited' }
  | { readonly kind: 'indeterminate' }
  | { readonly kind: 'loading'; readonly previous?: AdminUserProjection }
  | { readonly kind: 'page'; readonly page: AdminUserPage; readonly outcome?: AdminUserOutcome }
  | ({ readonly kind: 'detail'; readonly outcome?: AdminUserOutcome } & AdminUserSelection)
  | ({
      readonly kind: 'history';
      readonly history: AdminUserHistory;
      readonly outcome?: AdminUserOutcome;
    } & AdminUserSelection)
  | {
      readonly kind: 'failure';
      readonly failure: AdminUserFailureKind;
      readonly previous?: AdminUserProjection;
    };
