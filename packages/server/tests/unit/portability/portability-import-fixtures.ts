import type { Mock } from 'vitest';
import type { PortabilityActor, PortabilityManifest } from '../../../src/portability/index.js';

/** Authenticated control-plane actor used by import service examples. */
export const actor: PortabilityActor = {
  userId: '00000000-0000-4000-8000-000000000001',
  controlPlaneOrganizationId: '00000000-0000-4000-8000-000000000002',
};

/** Portable organization record shared across planner and apply examples. */
export const portableOrganization = {
  slug: 'alpha',
  name: 'Alpha Organization',
  status: 'active',
  default_locale: 'en',
  default_login_methods: ['password'],
  two_factor_policy: 'optional',
  branding: {
    logo_url: null,
    favicon_url: null,
    primary_color: null,
    company_name: null,
    custom_css: null,
    logo_asset: null,
    favicon_asset: null,
  },
} as const;

/** Portable application record shared across authorization examples. */
export const portableApplication = {
  slug: 'alpha-app',
  name: 'Alpha App',
  description: null,
  status: 'active',
} as const;

/** Portable user profile without destination-only authentication state. */
export const portableUser = {
  organization_slug: 'alpha',
  email: 'member@alpha.example',
  email_verified: true,
  given_name: 'Alpha',
  family_name: 'Member',
  middle_name: null,
  nickname: null,
  preferred_username: null,
  profile_url: null,
  picture_url: null,
  website_url: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: 'en',
  phone_number: null,
  phone_number_verified: false,
  address_street: null,
  address_locality: null,
  address_region: null,
  address_postal_code: null,
  address_country: null,
  status: 'active',
} as const;

/** Confidential client record used to verify one-time credential handling. */
export const confidentialClient = {
  client_id: 'alpha-web',
  organization_slug: 'alpha',
  application_slug: 'alpha-app',
  name: 'Alpha Web',
  client_type: 'confidential',
  application_type: 'web',
  status: 'active',
  grant_types: ['authorization_code'],
  response_types: ['code'],
  scope: 'openid',
  login_methods: ['password'],
  token_endpoint_auth_method: 'client_secret_basic',
  redirect_uris: ['https://alpha.example/callback'],
  post_logout_redirect_uris: [],
  allowed_origins: ['https://alpha.example'],
  require_pkce: true,
  require_consent: true,
} as const;

/** Destination organization row with its internal relationship identifier. */
export const alphaOrganization = {
  id: 'internal-org-alpha',
  ...portableOrganization,
  is_super_admin: false,
  branding_logo_url: null,
  branding_favicon_url: null,
  branding_primary_color: null,
  branding_company_name: null,
  branding_custom_css: null,
};

/** Destination application row with its internal relationship identifier. */
export const alphaApplication = {
  id: 'internal-app-alpha',
  ...portableApplication,
};

/** Destination user row including authentication state that import must preserve. */
export const alphaUser = {
  id: 'internal-user-alpha',
  organization_id: 'internal-org-alpha',
  ...portableUser,
  password_hash: 'destination-password-hash',
  locked_at: null,
  locked_reason: null,
  failed_login_count: 0,
};

/** Small valid manifest base used to isolate one import concern per example. */
const emptyImportManifest = {
  version: '1.0',
  exported_at: '2026-09-13T12:34:56.789Z',
  scope: { kind: 'organization', organization_slug: 'alpha' },
  categories: ['organizations'],
  application_selection: { all_applications: false, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
} as const satisfies PortabilityManifest;

/** Collection overrides accepted by the focused manifest factory. */
type ManifestOverrides = Partial<{
  [Collection in keyof PortabilityManifest]: PortabilityManifest[Collection];
}>;

/** Destination rows returned by the table-aware query double. */
export interface ImportRows {
  /** Organization rows visible to the current import transaction. */
  readonly organizations?: readonly Record<string, unknown>[];
  /** Application rows visible to the current import transaction. */
  readonly applications?: readonly Record<string, unknown>[];
  /** Role rows visible to the current import transaction. */
  readonly roles?: readonly Record<string, unknown>[];
  /** Permission rows visible to the current import transaction. */
  readonly permissions?: readonly Record<string, unknown>[];
  /** Existing role-to-permission relationship rows. */
  readonly role_permissions?: readonly Record<string, unknown>[];
  /** User rows visible to the current import transaction. */
  readonly users?: readonly Record<string, unknown>[];
  /** Existing custom-claim value rows. */
  readonly custom_claim_values?: readonly Record<string, unknown>[];
  /** OIDC client rows visible to the current import transaction. */
  readonly clients?: readonly Record<string, unknown>[];
}

/** Construct a complete import manifest with focused record overrides. */
export function importManifest(overrides: ManifestOverrides): PortabilityManifest {
  return { ...emptyImportManifest, ...overrides };
}

/** Configure a query double to return destination records from the named product table. */
export function installImportRows(query: Mock, rows: ImportRows): void {
  query.mockImplementation((sqlValue: unknown) => {
    const sql = String(sqlValue).toLowerCase();
    const tableOrder: readonly (keyof ImportRows)[] = [
      'role_permissions',
      'custom_claim_values',
      'permissions',
      'clients',
      'applications',
      'users',
      'roles',
      'organizations',
    ];
    const table = tableOrder.find((name) => new RegExp(`\\bfrom\\s+${name}\\b`).test(sql));
    return Promise.resolve({
      rows: table === undefined ? [] : [...(rows[table] ?? [])],
      rowCount: /^\s*(?:insert|update|delete)/i.test(sql) ? 1 : 0,
    });
  });
}
