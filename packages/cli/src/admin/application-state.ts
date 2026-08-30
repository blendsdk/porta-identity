/** Immutable global application administration values retained by the terminal application. */

/** Supported global application lifecycle values. */
export type AdminApplicationStatus = 'active' | 'inactive' | 'archived';

/** Supported application-module lifecycle values. */
export type AdminApplicationModuleStatus = 'active' | 'inactive';

/** Allowlisted global application projection safe for terminal presentation. */
export interface AdminApplication {
  /** Stable internal application UUID. */
  readonly id: string;
  /** Deployment-global display name. */
  readonly name: string;
  /** Deployment-global immutable slug. */
  readonly slug: string;
  /** Optional product description. */
  readonly description: string | null;
  /** Current lifecycle state. */
  readonly status: AdminApplicationStatus;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Most recent update timestamp. */
  readonly updatedAt: string;
}

/** Allowlisted module projection safe for terminal presentation. */
export interface AdminApplicationModule {
  /** Stable internal module UUID. */
  readonly id: string;
  /** Internal UUID of the owning application. */
  readonly applicationId: string;
  /** Module display name. */
  readonly name: string;
  /** Immutable module slug. */
  readonly slug: string;
  /** Optional module description. */
  readonly description: string | null;
  /** Current lifecycle state. */
  readonly status: AdminApplicationModuleStatus;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Most recent update timestamp. */
  readonly updatedAt: string;
}

/** Fixed application failure categories safe to display. */
export type AdminApplicationFailureKind =
  'validation' | 'unauthorized' | 'conflict' | 'unavailable' | 'invalid-response';

/** Sanitized application read result. */
export type AdminApplicationReadResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminApplicationFailureKind };

/** Sanitized application mutation result. */
export type AdminApplicationMutationResult<T = void> =
  | ({ readonly kind: 'success' } & (T extends void ? object : { readonly value: T }))
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminApplicationFailureKind };

/** Complete global application controller state. */
export type AdminApplicationViewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly previous?: readonly AdminApplication[] }
  | {
      readonly kind: 'list';
      readonly scope: 'global';
      readonly applications: readonly AdminApplication[];
    }
  | { readonly kind: 'indeterminate'; readonly previous?: readonly AdminApplication[] }
  | {
      readonly kind: 'failure';
      readonly failure: AdminApplicationFailureKind;
      readonly previous?: readonly AdminApplication[];
    };
