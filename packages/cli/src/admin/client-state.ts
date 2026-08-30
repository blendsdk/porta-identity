/** Immutable selected-organization OIDC client values retained by the terminal application. */

/** Supported OIDC client lifecycle values. */
export type AdminClientStatus = 'active' | 'inactive' | 'revoked';

/** Allowlisted OIDC client projection safe for terminal presentation. */
export interface AdminClient {
  /** Stable internal client UUID used by Admin routes. */
  readonly id: string;
  /** Internal UUID of the owning organization. */
  readonly organizationId: string;
  /** Internal UUID of the global application definition. */
  readonly applicationId: string;
  /** Generated OIDC client identifier. */
  readonly clientId: string;
  /** Administrative display name. */
  readonly clientName: string;
  /** Whether the client holds secrets. */
  readonly clientType: 'public' | 'confidential';
  /** Deployment model used for protocol defaults. */
  readonly applicationType: 'web' | 'native' | 'spa';
  /** Registered authorization redirect URIs. */
  readonly redirectUris: readonly string[];
  /** Registered post-logout redirect URIs. */
  readonly postLogoutRedirectUris: readonly string[];
  /** Enabled OAuth grant types. */
  readonly grantTypes: readonly ('authorization_code' | 'client_credentials' | 'refresh_token')[];
  /** Enabled OIDC response types. */
  readonly responseTypes: readonly 'code'[];
  /** Space-delimited scope allowlist. */
  readonly scope: string;
  /** Token endpoint authentication method. */
  readonly tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  /** Exact browser origins permitted by the server. */
  readonly allowedOrigins: readonly string[];
  /** Whether authorization-code requests require PKCE. */
  readonly requirePkce: boolean;
  /** Per-client login-method override, or null to inherit. */
  readonly loginMethods: readonly ('password' | 'magic_link')[] | null;
  /** Effective login methods after organization inheritance. */
  readonly effectiveLoginMethods: readonly ('password' | 'magic_link')[];
  /** Current lifecycle state. */
  readonly status: AdminClientStatus;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Most recent update timestamp. */
  readonly updatedAt: string;
}

/** Allowlisted client-secret metadata that never contains plaintext. */
export interface AdminClientSecret {
  /** Stable internal secret UUID. */
  readonly id: string;
  /** Internal UUID of the owning client. */
  readonly clientId: string;
  /** Optional administrative label. */
  readonly label: string | null;
  /** Stored lifecycle state. */
  readonly status: 'active' | 'revoked';
  /** Most recent successful-use timestamp. */
  readonly lastUsedAt: string | null;
  /** Optional expiry timestamp. */
  readonly expiresAt: string | null;
  /** Creation timestamp. */
  readonly createdAt: string;
}

/** One-time secret returned only through a synchronous controller continuation. */
export interface AdminGeneratedClientSecret {
  /** Stable internal secret UUID. */
  readonly id: string;
  /** Internal UUID of the owning client. */
  readonly clientId: string;
  /** Optional administrative label. */
  readonly label: string | null;
  /** One-time plaintext that must never enter application state. */
  readonly plaintext: string;
  /** Optional expiry timestamp. */
  readonly expiresAt: string | null;
  /** Creation timestamp. */
  readonly createdAt: string;
}

/** Fixed client failure categories safe to display. */
export type AdminClientFailureKind =
  'validation' | 'unauthorized' | 'conflict' | 'unavailable' | 'invalid-response';

/** Sanitized client read result. */
export type AdminClientReadResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminClientFailureKind };

/** Sanitized client mutation result. */
export type AdminClientMutationResult<T = void> =
  | ({ readonly kind: 'success' } & (T extends void ? object : { readonly value: T }))
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminClientFailureKind };

/** Complete selected-organization client controller state. */
export type AdminClientViewState =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'loading';
      readonly organizationId: string;
      readonly previous?: readonly AdminClient[];
    }
  | {
      readonly kind: 'list';
      readonly organizationId: string;
      readonly clients: readonly AdminClient[];
    }
  | {
      readonly kind: 'indeterminate';
      readonly organizationId: string;
      readonly previous?: readonly AdminClient[];
    }
  | {
      readonly kind: 'failure';
      readonly organizationId: string;
      readonly failure: AdminClientFailureKind;
      readonly previous?: readonly AdminClient[];
    };
