import { describe, expect, it } from 'vitest';
import {
  exportManifestRequestSchema,
  importManifestRequestSchema,
  portabilityManifestSchema,
  type ExportManifestRequest,
  type PortabilityManifest,
} from '../../../src/portability/index.js';

const collectionNames = [
  'organizations',
  'applications',
  'application_modules',
  'roles',
  'permissions',
  'claim_definitions',
  'role_permission_mappings',
  'users',
  'user_role_assignments',
  'user_claim_values',
  'clients',
] as const;

const completeManifest = {
  version: '1.0',
  exported_at: '2026-09-13T12:34:56.789Z',
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations', 'applications_authorization', 'users_assignments', 'oidc_clients'],
  application_selection: {
    all_applications: false,
    application_slugs: ['customer-portal'],
  },
  organizations: [
    {
      slug: 'acme',
      name: 'Acme Incorporated',
      status: 'active',
      default_locale: 'en',
      default_login_methods: ['password', 'magic_link'],
      two_factor_policy: 'required_any',
      branding: {
        logo_url: 'https://assets.example.com/acme/logo.png',
        favicon_url: null,
        primary_color: '#123456',
        company_name: 'Acme Incorporated',
        custom_css: '.brand { color: #123456; }',
        logo_asset: {
          media_type: 'image/png',
          content_base64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        },
        favicon_asset: null,
      },
    },
  ],
  applications: [
    {
      slug: 'customer-portal',
      name: 'Customer Portal',
      description: 'Customer self-service',
      status: 'active',
    },
  ],
  application_modules: [
    {
      application_slug: 'customer-portal',
      slug: 'documents',
      name: 'Documents',
      description: null,
      status: 'active',
    },
  ],
  roles: [
    {
      application_slug: 'customer-portal',
      slug: 'document-reader',
      name: 'Document reader',
      description: 'Can read documents',
    },
  ],
  permissions: [
    {
      application_slug: 'customer-portal',
      slug: 'documents:read',
      module_slug: 'documents',
      name: 'Read documents',
      description: null,
    },
  ],
  claim_definitions: [
    {
      application_slug: 'customer-portal',
      claim_name: 'department',
      claim_type: 'string',
      description: 'Organizational department',
      include_in_id_token: true,
      include_in_access_token: true,
      include_in_userinfo: false,
    },
  ],
  role_permission_mappings: [
    {
      application_slug: 'customer-portal',
      role_slug: 'document-reader',
      permission_slugs: ['documents:read'],
    },
  ],
  users: [
    {
      organization_slug: 'acme',
      email: 'alex@example.com',
      email_verified: true,
      given_name: 'Alex',
      family_name: 'Morgan',
      middle_name: null,
      nickname: 'Alex',
      preferred_username: 'alex.morgan',
      profile_url: 'https://example.com/people/alex',
      picture_url: 'https://assets.example.com/people/alex.png',
      website_url: 'https://alex.example.com',
      gender: null,
      birthdate: '1990-01-01',
      zoneinfo: 'Europe/Amsterdam',
      locale: 'en',
      phone_number: '+31612345678',
      phone_number_verified: true,
      address_street: '1 Example Street',
      address_locality: 'Amsterdam',
      address_region: 'Noord-Holland',
      address_postal_code: '1000AA',
      address_country: 'NL',
      status: 'active',
    },
  ],
  user_role_assignments: [
    {
      organization_slug: 'acme',
      email: 'alex@example.com',
      application_slug: 'customer-portal',
      role_slug: 'document-reader',
    },
  ],
  user_claim_values: [
    {
      organization_slug: 'acme',
      email: 'alex@example.com',
      application_slug: 'customer-portal',
      claim_name: 'department',
      value: { name: 'Operations', cost_center: 42 },
    },
  ],
  clients: [
    {
      client_id: 'customer-portal-web',
      organization_slug: 'acme',
      application_slug: 'customer-portal',
      name: 'Customer Portal Web',
      client_type: 'confidential',
      application_type: 'web',
      status: 'active',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid profile email',
      login_methods: ['password', 'magic_link'],
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://portal.example.com/callback'],
      post_logout_redirect_uris: ['https://portal.example.com/signed-out'],
      allowed_origins: ['https://portal.example.com'],
      require_pkce: true,
    },
  ],
} as const satisfies PortabilityManifest;

function cloneManifest(): Record<string, unknown> {
  return { ...structuredClone(completeManifest) };
}

function importRequest(manifest: unknown) {
  return {
    manifest,
    mode: 'dry-run' as const,
  };
}

/** Narrows an unknown fixture value to a mutable JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the first object in a manifest collection so rejection fixtures can mutate one field. */
function firstRecord(
  manifest: Record<string, unknown>,
  collection: string,
): Record<string, unknown> {
  const records = manifest[collection];
  if (!Array.isArray(records)) throw new TypeError(`${collection} must be an array`);

  const record: unknown = records[0];
  if (!isRecord(record)) {
    throw new TypeError(`${collection} must contain an object`);
  }
  return record;
}

// A complete manifest is strict, timestamped in UTC, and preserves every portable record field.
describe('portability manifest contract', () => {
  it('accepts and preserves a complete manifest with all eleven collections', () => {
    const result = portabilityManifestSchema.safeParse(completeManifest);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toStrictEqual(completeManifest);
    expect(result.data.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
    expect(collectionNames.every((collection) => Array.isArray(result.data[collection]))).toBe(
      true,
    );
  });

  // Invalid versions, shapes, and permission mappings are rejected before an import can be planned.
  it.each([
    {
      caseName: 'an unsupported manifest version',
      mutate(manifest: Record<string, unknown>) {
        manifest.version = '2.0';
      },
    },
    {
      caseName: 'an unknown root field',
      mutate(manifest: Record<string, unknown>) {
        manifest.unexpected = true;
      },
    },
    {
      caseName: 'an unknown record field',
      mutate(manifest: Record<string, unknown>) {
        firstRecord(manifest, 'organizations').database_id = 'installation-specific-id';
      },
    },
    {
      caseName: 'an omitted collection',
      mutate(manifest: Record<string, unknown>) {
        delete manifest.clients;
      },
    },
    {
      caseName: 'an empty role permission mapping',
      mutate(manifest: Record<string, unknown>) {
        firstRecord(manifest, 'role_permission_mappings').permission_slugs = [];
      },
    },
  ])('rejects $caseName as an invalid import manifest', ({ mutate }) => {
    const manifest = cloneManifest();
    mutate(manifest);

    const result = importManifestRequestSchema.safeParse(importRequest(manifest));

    expect(result.success).toBe(false);
    expect('data' in result).toBe(false);
  });
});

// Export requires an explicit, closed, duplicate-free category selection and produces no parsed request on failure.
describe('export category selection', () => {
  const validRequest = {
    scope: { kind: 'organization', organization_slug: 'acme' },
    categories: ['organizations'],
    application_selection: { all_applications: false, application_slugs: [] },
  } as const satisfies ExportManifestRequest;

  it.each([
    { caseName: 'no category', categories: [] },
    { caseName: 'duplicate categories', categories: ['organizations', 'organizations'] },
    { caseName: 'an invalid category', categories: ['configuration'] },
  ])('rejects $caseName as an invalid export request', ({ categories }) => {
    const result = exportManifestRequestSchema.safeParse({ ...validRequest, categories });

    expect(result.success).toBe(false);
    expect('data' in result).toBe(false);
  });
});

// Application-related exports select either every application or unique explicit slugs, while organization-only exports select neither.
describe('export application selection', () => {
  const scope = { kind: 'organization', organization_slug: 'acme' } as const;

  it.each(['applications_authorization', 'users_assignments', 'oidc_clients'] as const)(
    'accepts all-applications or explicit slugs for %s',
    (category) => {
      expect(
        exportManifestRequestSchema.safeParse({
          scope,
          categories: [category],
          application_selection: { all_applications: true, application_slugs: [] },
        }).success,
      ).toBe(true);
      expect(
        exportManifestRequestSchema.safeParse({
          scope,
          categories: [category],
          application_selection: {
            all_applications: false,
            application_slugs: ['customer-portal'],
          },
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    {
      caseName: 'both all-applications and explicit slugs',
      application_selection: {
        all_applications: true,
        application_slugs: ['customer-portal'],
      },
    },
    {
      caseName: 'neither all-applications nor explicit slugs',
      application_selection: { all_applications: false, application_slugs: [] },
    },
    {
      caseName: 'duplicate explicit slugs',
      application_selection: {
        all_applications: false,
        application_slugs: ['customer-portal', 'customer-portal'],
      },
    },
  ])('rejects $caseName for an application-related category', ({ application_selection }) => {
    const result = exportManifestRequestSchema.safeParse({
      scope,
      categories: ['applications_authorization'],
      application_selection,
    });

    expect(result.success).toBe(false);
  });

  it('requires false with no slugs for an organization-only export', () => {
    expect(
      exportManifestRequestSchema.safeParse({
        scope,
        categories: ['organizations'],
        application_selection: { all_applications: false, application_slugs: [] },
      }).success,
    ).toBe(true);

    for (const application_selection of [
      { all_applications: true, application_slugs: [] },
      { all_applications: false, application_slugs: ['customer-portal'] },
    ]) {
      expect(
        exportManifestRequestSchema.safeParse({
          scope,
          categories: ['organizations'],
          application_selection,
        }).success,
      ).toBe(false);
    }
  });
});
