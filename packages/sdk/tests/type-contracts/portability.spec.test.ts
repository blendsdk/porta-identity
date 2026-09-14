import { describe, expectTypeOf, it } from 'vitest';
import type {
  ExportManifestRequest,
  ExportManifestResponse,
  ExportParams,
  ExportsDomain,
  ImportsDomain,
  PortaClient,
  PortabilityCategory,
  PortabilityManifest,
  PortabilityResult,
  PortabilityScope,
  TransportResponse,
} from '../../src/index.js';

// Legacy provisioning types are intentionally absent from the public SDK entry point.
// @ts-expect-error ImportManifest belonged to the removed provisioning contract.
import type { ImportManifest } from '../../src/index.js';
// @ts-expect-error ImportResult belonged to the removed provisioning contract.
import type { ImportResult } from '../../src/index.js';

type LegacyTypesOnlyForNegativeImportCheck = [ImportManifest, ImportResult];

type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type Category =
  'organizations' | 'applications_authorization' | 'users_assignments' | 'oidc_clients';
type Scope =
  | { readonly kind: 'organization'; readonly organization_slug: string }
  | { readonly kind: 'environment' };
type Asset = { readonly media_type: string; readonly content_base64: string };
type Branding = {
  readonly logo_url: string | null;
  readonly favicon_url: string | null;
  readonly primary_color: string | null;
  readonly company_name: string | null;
  readonly custom_css: string | null;
  readonly logo_asset: Asset | null;
  readonly favicon_asset: Asset | null;
};
type UserProfile = {
  readonly given_name: string | null;
  readonly family_name: string | null;
  readonly middle_name: string | null;
  readonly nickname: string | null;
  readonly preferred_username: string | null;
  readonly profile_url: string | null;
  readonly picture_url: string | null;
  readonly website_url: string | null;
  readonly gender: string | null;
  readonly birthdate: string | null;
  readonly zoneinfo: string | null;
  readonly locale: string | null;
  readonly phone_number: string | null;
  readonly phone_number_verified: boolean;
  readonly address_street: string | null;
  readonly address_locality: string | null;
  readonly address_region: string | null;
  readonly address_postal_code: string | null;
  readonly address_country: string | null;
};
type ExpectedManifest = {
  readonly version: '1.0';
  readonly exported_at: string;
  readonly scope: Scope;
  readonly categories: readonly Category[];
  readonly application_selection: {
    readonly all_applications: boolean;
    readonly application_slugs: readonly string[];
  };
  readonly organizations: readonly {
    readonly slug: string;
    readonly name: string;
    readonly status: 'active' | 'suspended';
    readonly default_locale: string;
    readonly default_login_methods: readonly ('password' | 'magic_link')[];
    readonly two_factor_policy: 'optional' | 'required_email' | 'required_totp' | 'required_any';
    readonly branding: Branding;
  }[];
  readonly applications: readonly {
    readonly slug: string;
    readonly name: string;
    readonly description: string | null;
    readonly status: 'active' | 'inactive';
  }[];
  readonly application_modules: readonly {
    readonly application_slug: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string | null;
    readonly status: 'active' | 'inactive';
  }[];
  readonly roles: readonly {
    readonly application_slug: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string | null;
  }[];
  readonly permissions: readonly {
    readonly application_slug: string;
    readonly slug: string;
    readonly module_slug: string | null;
    readonly name: string;
    readonly description: string | null;
  }[];
  readonly claim_definitions: readonly {
    readonly application_slug: string;
    readonly claim_name: string;
    readonly claim_type: 'string' | 'number' | 'boolean' | 'json';
    readonly description: string | null;
    readonly include_in_id_token: boolean;
    readonly include_in_access_token: boolean;
    readonly include_in_userinfo: boolean;
  }[];
  readonly role_permission_mappings: readonly {
    readonly application_slug: string;
    readonly role_slug: string;
    readonly permission_slugs: readonly string[];
  }[];
  readonly users: readonly ({
    readonly organization_slug: string;
    readonly email: string;
    readonly email_verified: boolean;
    readonly status: 'active' | 'inactive';
  } & UserProfile)[];
  readonly user_role_assignments: readonly {
    readonly organization_slug: string;
    readonly email: string;
    readonly application_slug: string;
    readonly role_slug: string;
  }[];
  readonly user_claim_values: readonly {
    readonly organization_slug: string;
    readonly email: string;
    readonly application_slug: string;
    readonly claim_name: string;
    readonly value: JsonValue;
  }[];
  readonly clients: readonly {
    readonly client_id: string;
    readonly organization_slug: string;
    readonly application_slug: string;
    readonly name: string;
    readonly client_type: 'public' | 'confidential';
    readonly application_type: 'web' | 'native' | 'spa';
    readonly status: 'active' | 'inactive';
    readonly grant_types: readonly string[];
    readonly response_types: readonly string[];
    readonly scope: string;
    readonly login_methods: readonly ('password' | 'magic_link')[] | null;
    readonly token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
    readonly redirect_uris: readonly string[];
    readonly post_logout_redirect_uris: readonly string[];
    readonly allowed_origins: readonly string[];
    readonly require_pkce: boolean;
  }[];
};

type EntityType =
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
type Counts = {
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly rejected: number;
};
type Summary = { readonly [K in EntityType]: Counts };
type NaturalKey =
  | { readonly slug: string }
  | { readonly application_slug: string; readonly slug: string }
  | { readonly application_slug: string; readonly claim_name: string }
  | { readonly application_slug: string; readonly role_slug: string }
  | { readonly organization_slug: string; readonly email: string }
  | {
      readonly organization_slug: string;
      readonly email: string;
      readonly application_slug: string;
      readonly role_slug: string;
    }
  | {
      readonly organization_slug: string;
      readonly email: string;
      readonly application_slug: string;
      readonly claim_name: string;
    }
  | { readonly client_id: string };
type ResultBase = {
  readonly summary: Summary;
  readonly items: readonly {
    readonly entity_type: EntityType;
    readonly action: 'created' | 'updated' | 'skipped' | 'rejected';
    readonly natural_key: NaturalKey;
    readonly credential_will_be_generated?: boolean;
  }[];
  readonly errors: readonly {
    readonly entity_type: EntityType;
    readonly natural_key: NaturalKey;
    readonly code:
      | 'invalid_record'
      | 'duplicate_natural_key'
      | 'missing_dependency'
      | 'ambiguous_dependency'
      | 'incompatible_record'
      | 'cross_scope_reference'
      | 'control_plane_record'
      | 'client_id_collision';
  }[];
};
type ExpectedResult =
  | (ResultBase & { readonly mode: 'dry-run'; readonly credentials?: never })
  | (ResultBase & {
      readonly mode: 'keep-existing' | 'update-existing';
      readonly credentials?: readonly {
        readonly client_id: string;
        readonly label: string;
        readonly secret: string;
        readonly expires_at: string | null;
      }[];
    });
type ExpectedRequest = {
  readonly scope: Scope;
  readonly categories: readonly Category[];
  readonly application_selection: {
    readonly all_applications: boolean;
    readonly application_slugs: readonly string[];
  };
};
type ExpectedExportsDomain = {
  download(params: ExportParams): Promise<TransportResponse>;
  manifest(request: ExportManifestRequest): Promise<ExportManifestResponse>;
};
type ExpectedImportsDomain = {
  preview(manifest: PortabilityManifest): Promise<PortabilityResult>;
  apply(
    manifest: PortabilityManifest,
    mode: 'keep-existing' | 'update-existing',
  ): Promise<PortabilityResult>;
};

describe('portability SDK type contract', () => {
  // Export selection and attachment metadata expose only the approved scope, category, manifest, and filename fields.
  it('exports the exact manifest request and response types', () => {
    expectTypeOf<PortabilityCategory>().toEqualTypeOf<Category>();
    expectTypeOf<PortabilityScope>().toEqualTypeOf<Scope>();
    expectTypeOf<ExportManifestRequest>().toEqualTypeOf<ExpectedRequest>();
    expectTypeOf<ExportManifestResponse>().toEqualTypeOf<{
      readonly manifest: PortabilityManifest;
      readonly filename: string;
    }>();
  });

  // The public manifest type contains every portable collection and excludes persistence-only metadata by exact equality.
  it('exports the exact closed portability manifest type', () => {
    expectTypeOf<PortabilityManifest>().toEqualTypeOf<ExpectedManifest>();
  });

  // Results expose bounded natural keys, closed actions and errors, and credentials only for non-preview modes.
  it('exports the exact preview and apply result type', () => {
    expectTypeOf<PortabilityResult>().toEqualTypeOf<ExpectedResult>();
  });

  // The public client exposes only manifest export plus preview and apply imports, with no provisioning alias.
  it('exposes the three direct domain methods and removes the legacy import surface', () => {
    expectTypeOf<ExportsDomain>().toEqualTypeOf<ExpectedExportsDomain>();
    expectTypeOf<ImportsDomain>().toEqualTypeOf<ExpectedImportsDomain>();
    expectTypeOf<PortaClient['exports']>().toEqualTypeOf<ExportsDomain>();
    expectTypeOf<PortaClient['imports']>().toEqualTypeOf<ImportsDomain>();
    expectTypeOf<Extract<keyof ImportsDomain, 'provision'>>().toEqualTypeOf<never>();
    expectTypeOf<LegacyTypesOnlyForNegativeImportCheck>().toBeArray();
  });
});
