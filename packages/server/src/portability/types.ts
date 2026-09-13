/** Wire types for selective environment export and import. */

/** Closed manifest sections that an operator may select. */
export type PortabilityCategory =
  'organizations' | 'applications_authorization' | 'users_assignments' | 'oidc_clients';

/** Organization-bound or complete-environment portability scope. */
export type PortabilityScope =
  | { readonly kind: 'organization'; readonly organization_slug: string }
  | { readonly kind: 'environment' };

/** Explicit application filter used by application-related categories. */
export interface PortabilityApplicationSelection {
  /** Select every eligible application when true. */
  readonly all_applications: boolean;
  /** Select these application slugs when all applications is false. */
  readonly application_slugs: readonly string[];
}

/** Embedded branding image with declared media type and base64 bytes. */
export interface PortabilityBrandingAsset {
  /** Image media type validated against the branding allowlist. */
  readonly media_type: string;
  /** Base64-encoded image bytes. */
  readonly content_base64: string;
}

/** Portable organization branding configuration. */
export interface PortabilityBranding {
  /** External logo URL, or null when absent. */
  readonly logo_url: string | null;
  /** External favicon URL, or null when absent. */
  readonly favicon_url: string | null;
  /** Six-digit HTML accent color, or null when absent. */
  readonly primary_color: string | null;
  /** Organization name displayed by hosted templates, or null when absent. */
  readonly company_name: string | null;
  /** Bounded custom template CSS, or null when absent. */
  readonly custom_css: string | null;
  /** Embedded logo bytes, or null when no logo is embedded. */
  readonly logo_asset: PortabilityBrandingAsset | null;
  /** Embedded favicon bytes, or null when no favicon is embedded. */
  readonly favicon_asset: PortabilityBrandingAsset | null;
}

/** Portable organization record identified by its slug. */
export interface PortabilityOrganization {
  /** Public organization slug. */
  readonly slug: string;
  /** Organization display name. */
  readonly name: string;
  /** Organization lifecycle state. */
  readonly status: 'active' | 'suspended';
  /** Default locale identifier. */
  readonly default_locale: string;
  /** Default authentication methods. */
  readonly default_login_methods: readonly ('password' | 'magic_link')[];
  /** Organization two-factor policy. */
  readonly two_factor_policy: 'optional' | 'required_email' | 'required_totp' | 'required_any';
  /** Hosted-page branding configuration. */
  readonly branding: PortabilityBranding;
}

/** Portable application record identified by its slug. */
export interface PortabilityApplication {
  /** Public application slug. */
  readonly slug: string;
  /** Application display name. */
  readonly name: string;
  /** Optional application description. */
  readonly description: string | null;
  /** Application lifecycle state. */
  readonly status: 'active' | 'inactive';
}

/** Portable module record identified within an application. */
export interface PortabilityApplicationModule {
  /** Owning application slug. */
  readonly application_slug: string;
  /** Module slug. */
  readonly slug: string;
  /** Module display name. */
  readonly name: string;
  /** Optional module description. */
  readonly description: string | null;
  /** Module lifecycle state. */
  readonly status: 'active' | 'inactive';
}

/** Portable role record identified within an application. */
export interface PortabilityRole {
  /** Owning application slug. */
  readonly application_slug: string;
  /** External role claim value. */
  readonly slug: string;
  /** Role display name. */
  readonly name: string;
  /** Optional role description. */
  readonly description: string | null;
}

/** Portable permission record identified within an application. */
export interface PortabilityPermission {
  /** Owning application slug. */
  readonly application_slug: string;
  /** External permission claim value. */
  readonly slug: string;
  /** Optional owning module slug. */
  readonly module_slug: string | null;
  /** Permission display name. */
  readonly name: string;
  /** Optional permission description. */
  readonly description: string | null;
}

/** Portable custom-claim definition. */
export interface PortabilityClaimDefinition {
  /** Owning application slug. */
  readonly application_slug: string;
  /** External claim name. */
  readonly claim_name: string;
  /** Value type enforced for this claim. */
  readonly claim_type: 'string' | 'number' | 'boolean' | 'json';
  /** Optional claim description. */
  readonly description: string | null;
  /** Whether the claim appears in ID tokens. */
  readonly include_in_id_token: boolean;
  /** Whether the claim appears in access tokens. */
  readonly include_in_access_token: boolean;
  /** Whether the claim appears in UserInfo responses. */
  readonly include_in_userinfo: boolean;
}

/** Portable role-to-permission mapping for one application role. */
export interface PortabilityRolePermissionMapping {
  /** Owning application slug. */
  readonly application_slug: string;
  /** Role claim value. */
  readonly role_slug: string;
  /** Non-empty sorted permission claim values. */
  readonly permission_slugs: readonly string[];
}

/** Portable user profile without credentials, lock state, or activity counters. */
export interface PortabilityUser {
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** User email address. */
  readonly email: string;
  /** Whether the email address is verified. */
  readonly email_verified: boolean;
  /** OIDC given name. */
  readonly given_name: string | null;
  /** OIDC family name. */
  readonly family_name: string | null;
  /** OIDC middle name. */
  readonly middle_name: string | null;
  /** OIDC nickname. */
  readonly nickname: string | null;
  /** OIDC preferred username. */
  readonly preferred_username: string | null;
  /** OIDC profile URL. */
  readonly profile_url: string | null;
  /** OIDC picture URL. */
  readonly picture_url: string | null;
  /** OIDC website URL. */
  readonly website_url: string | null;
  /** OIDC gender value. */
  readonly gender: string | null;
  /** OIDC calendar birthdate. */
  readonly birthdate: string | null;
  /** OIDC time-zone identifier. */
  readonly zoneinfo: string | null;
  /** OIDC locale identifier. */
  readonly locale: string | null;
  /** OIDC phone number. */
  readonly phone_number: string | null;
  /** Whether the phone number is verified. */
  readonly phone_number_verified: boolean;
  /** Street address. */
  readonly address_street: string | null;
  /** Address locality. */
  readonly address_locality: string | null;
  /** Address region. */
  readonly address_region: string | null;
  /** Postal code. */
  readonly address_postal_code: string | null;
  /** Two-letter country code. */
  readonly address_country: string | null;
  /** Portable lifecycle state; automatic lock state is excluded. */
  readonly status: 'active' | 'inactive';
}

/** Portable assignment of one application role to one user. */
export interface PortabilityUserRoleAssignment {
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** Assigned user's email address. */
  readonly email: string;
  /** Owning application slug. */
  readonly application_slug: string;
  /** Assigned role claim value. */
  readonly role_slug: string;
}

/** JSON values supported in custom claim assignments. */
export type PortabilityJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly PortabilityJsonValue[]
  | { readonly [key: string]: PortabilityJsonValue };

/** Portable custom-claim value assigned to one user. */
export interface PortabilityUserClaimValue {
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** Assigned user's email address. */
  readonly email: string;
  /** Owning application slug. */
  readonly application_slug: string;
  /** Claim definition name. */
  readonly claim_name: string;
  /** JSON-compatible claim value. */
  readonly value: PortabilityJsonValue;
}

/** Portable OIDC client registration without secret material. */
export interface PortabilityClient {
  /** Public OIDC client identifier. */
  readonly client_id: string;
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** Owning application slug. */
  readonly application_slug: string;
  /** Client display name. */
  readonly name: string;
  /** Client confidentiality mode. */
  readonly client_type: 'public' | 'confidential';
  /** Client deployment type. */
  readonly application_type: 'web' | 'native' | 'spa';
  /** Client lifecycle state. */
  readonly status: 'active' | 'inactive';
  /** Enabled OAuth grant types. */
  readonly grant_types: readonly string[];
  /** Enabled OIDC response types. */
  readonly response_types: readonly string[];
  /** Space-separated scope string. */
  readonly scope: string;
  /** Explicit login methods, or null to inherit organization defaults. */
  readonly login_methods: readonly ('password' | 'magic_link')[] | null;
  /** Token endpoint authentication method. */
  readonly token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
  /** Exact authorization redirect URIs. */
  readonly redirect_uris: readonly string[];
  /** Exact post-logout redirect URIs. */
  readonly post_logout_redirect_uris: readonly string[];
  /** Exact browser origins allowed by the client. */
  readonly allowed_origins: readonly string[];
  /** Whether authorization-code requests require PKCE. */
  readonly require_pkce: boolean;
}

/** Complete version 1.0 portability manifest. */
export interface PortabilityManifest {
  /** Manifest format version. */
  readonly version: '1.0';
  /** UTC instant at which the export snapshot was created. */
  readonly exported_at: string;
  /** Source data scope represented by the manifest. */
  readonly scope: PortabilityScope;
  /** Selected manifest categories. */
  readonly categories: readonly PortabilityCategory[];
  /** Application filter used by application-related categories. */
  readonly application_selection: PortabilityApplicationSelection;
  /** Portable organizations. */
  readonly organizations: readonly PortabilityOrganization[];
  /** Portable applications. */
  readonly applications: readonly PortabilityApplication[];
  /** Portable application modules. */
  readonly application_modules: readonly PortabilityApplicationModule[];
  /** Portable application roles. */
  readonly roles: readonly PortabilityRole[];
  /** Portable application permissions. */
  readonly permissions: readonly PortabilityPermission[];
  /** Portable custom-claim definitions. */
  readonly claim_definitions: readonly PortabilityClaimDefinition[];
  /** Portable role-to-permission mappings. */
  readonly role_permission_mappings: readonly PortabilityRolePermissionMapping[];
  /** Portable organization users. */
  readonly users: readonly PortabilityUser[];
  /** Portable user-to-role assignments. */
  readonly user_role_assignments: readonly PortabilityUserRoleAssignment[];
  /** Portable user custom-claim values. */
  readonly user_claim_values: readonly PortabilityUserClaimValue[];
  /** Portable OIDC clients. */
  readonly clients: readonly PortabilityClient[];
}

/** Request body for creating one manifest export. */
export interface ExportManifestRequest {
  /** Requested source scope. */
  readonly scope: PortabilityScope;
  /** Non-empty selected categories. */
  readonly categories: readonly PortabilityCategory[];
  /** Application filter required by application-related categories. */
  readonly application_selection: PortabilityApplicationSelection;
}

/** Import operation mode. */
export type PortabilityImportMode = 'dry-run' | 'keep-existing' | 'update-existing';

/** Request body for previewing or applying one manifest. */
export interface ImportManifestRequest {
  /** Strict manifest to validate and process. */
  readonly manifest: PortabilityManifest;
  /** Preview, keep-existing, or update-existing behavior. */
  readonly mode: PortabilityImportMode;
}

/** Portable entity groups in dependency order. */
export type PortabilityEntityType =
  | 'organizations'
  | 'applications'
  | 'application_modules'
  | 'roles'
  | 'permissions'
  | 'claim_definitions'
  | 'role_permission_mappings'
  | 'users'
  | 'user_role_assignments'
  | 'user_claim_values'
  | 'clients';

/** Planned or completed action for one manifest record. */
export type PortabilityAction = 'created' | 'updated' | 'skipped' | 'rejected';

/** Counts for one entity group. */
export interface PortabilityActionCounts {
  /** Records created. */
  readonly created: number;
  /** Records updated. */
  readonly updated: number;
  /** Existing records left unchanged. */
  readonly skipped: number;
  /** Invalid or incompatible records rejected. */
  readonly rejected: number;
}

/** Public natural-key fields identifying one result item. */
export type PortabilityNaturalKey = Readonly<Record<string, string>>;

/** Ordered result item for one manifest record. */
export interface PortabilityResultItem {
  /** Entity group containing the record. */
  readonly entity_type: PortabilityEntityType;
  /** Planned or completed action. */
  readonly action: PortabilityAction;
  /** Public natural key without database identifiers. */
  readonly natural_key: PortabilityNaturalKey;
  /** Whether apply will create a confidential-client credential. */
  readonly credential_will_be_generated?: boolean;
}

/** Closed safe validation codes returned for rejected records. */
export type PortabilityResultErrorCode =
  | 'invalid_record'
  | 'duplicate_natural_key'
  | 'missing_dependency'
  | 'ambiguous_dependency'
  | 'incompatible_record'
  | 'cross_scope_reference'
  | 'control_plane_record'
  | 'client_id_collision';

/** Safe bounded error for one rejected manifest record. */
export interface PortabilityResultError {
  /** Entity group containing the rejected record. */
  readonly entity_type: PortabilityEntityType;
  /** Public natural key without database identifiers. */
  readonly natural_key: PortabilityNaturalKey;
  /** Stable safe rejection code. */
  readonly code: PortabilityResultErrorCode;
}

/** One-time credential returned only after a committed confidential-client creation. */
export interface PortabilityCredential {
  /** Public OIDC client identifier. */
  readonly client_id: string;
  /** Human-readable credential label. */
  readonly label: string;
  /** Plaintext secret shown only in this response. */
  readonly secret: string;
  /** UTC credential expiry instant. */
  readonly expires_at: string;
}

/** Safe ordered preview or apply result. */
export interface PortabilityResult {
  /** Operation mode represented by this result. */
  readonly mode: PortabilityImportMode;
  /** Per-entity counts in the closed dependency groups. */
  readonly summary: Readonly<Record<PortabilityEntityType, PortabilityActionCounts>>;
  /** Ordered record outcomes. */
  readonly items: readonly PortabilityResultItem[];
  /** Bounded safe rejected-record details. */
  readonly errors: readonly PortabilityResultError[];
  /** One-time committed credentials; absent during preview. */
  readonly credentials?: readonly PortabilityCredential[];
}

/** Authenticated actor details required by portability audits. */
export interface PortabilityActor {
  /** Authenticated Admin user identifier. */
  readonly userId: string;
  /** Control-plane organization identifier that owns environment audit events. */
  readonly controlPlaneOrganizationId: string;
}

/** Stable safe portability failures that route adapters may expose. */
export type PortabilityErrorCode =
  'export_manifest_too_large' | 'export_scope_rejected' | 'import_plan_rejected';

/** Typed expected failure from a portability service. */
export class PortabilityError extends Error {
  /** HTTP status selected by the closed API contract. */
  readonly status: 409 | 413;
  /** Stable safe error code. */
  readonly code: PortabilityErrorCode;
  /** Safe rejected plan result when the code is import_plan_rejected. */
  readonly result?: PortabilityResult;

  /** Create one expected portability failure for route mapping. */
  constructor(
    status: 409 | 413,
    code: PortabilityErrorCode,
    message: string,
    result?: PortabilityResult,
  ) {
    super(message);
    this.name = 'PortabilityError';
    this.status = status;
    this.code = code;
    this.result = result;
  }
}
