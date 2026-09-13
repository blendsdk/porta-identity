import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as portability from '../../../src/portability/index.js';
import type {
  ExportManifestRequest,
  PortabilityActor,
  PortabilityManifest,
} from '../../../src/portability/index.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ connect: mocks.connect }),
}));

vi.mock('../../../src/lib/logger.js', () => ({ logger: mocks.log }));

type ExportPortabilityManifest = (
  request: ExportManifestRequest,
  actor: PortabilityActor,
) => Promise<{ readonly manifest: PortabilityManifest; readonly filename: string }>;

/** Narrow the dynamically discovered public member to the planned export contract. */
function isExportFunction(value: unknown): value is ExportPortabilityManifest {
  return typeof value === 'function';
}

interface ExportRows {
  readonly organizations?: readonly Record<string, unknown>[];
  readonly branding_assets?: readonly Record<string, unknown>[];
  readonly applications?: readonly Record<string, unknown>[];
  readonly application_modules?: readonly Record<string, unknown>[];
  readonly roles?: readonly Record<string, unknown>[];
  readonly permissions?: readonly Record<string, unknown>[];
  readonly custom_claim_definitions?: readonly Record<string, unknown>[];
  readonly role_permissions?: readonly Record<string, unknown>[];
  readonly users?: readonly Record<string, unknown>[];
  readonly user_roles?: readonly Record<string, unknown>[];
  readonly custom_claim_values?: readonly Record<string, unknown>[];
  readonly clients?: readonly Record<string, unknown>[];
}

const actor: PortabilityActor = {
  userId: '00000000-0000-4000-8000-000000000001',
  controlPlaneOrganizationId: '00000000-0000-4000-8000-000000000002',
};

const alphaOrganization = {
  id: 'internal-org-alpha',
  slug: 'alpha',
  name: 'Alpha Organization',
  status: 'active',
  is_super_admin: false,
  default_locale: 'en',
  default_login_methods: ['password', 'magic_link'],
  two_factor_policy: 'optional',
  branding_logo_url: null,
  branding_favicon_url: null,
  branding_primary_color: '#123456',
  branding_company_name: 'Alpha',
  branding_custom_css: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-02T00:00:00.000Z',
};

const bravoOrganization = {
  ...alphaOrganization,
  id: 'internal-org-bravo',
  slug: 'bravo',
  name: 'Bravo Organization',
};

const alphaApplication = {
  id: 'internal-app-alpha',
  slug: 'alpha-app',
  name: 'Alpha App',
  description: 'Alpha application',
  status: 'active',
  created_at: '2025-02-01T00:00:00.000Z',
  updated_at: '2025-02-02T00:00:00.000Z',
};

const betaApplication = {
  ...alphaApplication,
  id: 'internal-app-beta',
  slug: 'beta-app',
  name: 'Beta App',
};

const alphaUser = {
  id: 'internal-user-alpha',
  organization_id: 'internal-org-alpha',
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
  password_hash: 'argon2-secret-hash',
  locked_at: null,
  locked_reason: null,
  failed_login_count: 0,
  last_failed_login_at: null,
  login_count: 17,
  created_at: '2025-03-01T00:00:00.000Z',
  updated_at: '2025-03-02T00:00:00.000Z',
};

/** Return the planned public export function without reading its implementation. */
function exportFunction(): ExportPortabilityManifest {
  const descriptor = Object.getOwnPropertyDescriptor(portability, 'exportPortabilityManifest');
  const candidate: unknown = descriptor?.value;
  expect(
    candidate,
    'exportPortabilityManifest must be available from the portability API',
  ).toBeTypeOf('function');
  if (!isExportFunction(candidate)) throw new TypeError('Export engine is unavailable');
  return candidate;
}

/** Build a valid request while allowing each specification to select its exact portable scope. */
function request(
  categories: ExportManifestRequest['categories'],
  applicationSlugs: readonly string[] = [],
  scope: ExportManifestRequest['scope'] = { kind: 'organization', organization_slug: 'alpha' },
): ExportManifestRequest {
  return {
    scope,
    categories,
    application_selection: {
      all_applications: false,
      application_slugs: applicationSlugs,
    },
  };
}

/** Install a PostgreSQL double that returns database-shaped rows by queried table. */
function useRows(rows: ExportRows): void {
  mocks.query.mockImplementation((sqlValue: unknown) => {
    const sql = String(sqlValue).toLowerCase();
    if (/^\s*(begin|commit|rollback)\b/.test(sql) || /insert\s+into\s+audit_log/.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }

    const tableOrder: readonly (keyof ExportRows)[] = [
      'role_permissions',
      'user_roles',
      'custom_claim_values',
      'custom_claim_definitions',
      'application_modules',
      'branding_assets',
      'permissions',
      'applications',
      'clients',
      'users',
      'roles',
      'organizations',
    ];
    const table = tableOrder.find((name) => new RegExp(`\\b${name}\\b`).test(sql));
    return Promise.resolve({
      rows: table === undefined ? [] : [...(rows[table] ?? [])],
      rowCount: 0,
    });
  });
}

/** Read every key recursively so sensitive storage fields cannot hide in nested records. */
function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  useRows({});
});

describe('portability export engine specification', () => {
  // An organization-only export contains exactly the selected organization and empty unselected collections.
  it('should export only the selected organization when organizations is the only category', async () => {
    useRows({ organizations: [alphaOrganization] });

    const { manifest } = await exportFunction()(request(['organizations']), actor);

    expect(manifest.organizations.map(({ slug }) => slug)).toStrictEqual(['alpha']);
    expect([
      manifest.applications,
      manifest.application_modules,
      manifest.roles,
      manifest.permissions,
      manifest.claim_definitions,
      manifest.role_permission_mappings,
      manifest.users,
      manifest.user_role_assignments,
      manifest.user_claim_values,
      manifest.clients,
    ]).toStrictEqual(Array.from({ length: 10 }, () => []));
  });

  // Environment scope exports each tenant once while omitting control-plane organizations and identities.
  it('should exclude control-plane records when exporting the environment', async () => {
    useRows({
      organizations: [bravoOrganization, alphaOrganization],
      users: [
        alphaUser,
        { ...alphaUser, email: 'member@bravo.example', organization_slug: 'bravo' },
      ],
    });

    const { manifest } = await exportFunction()(
      request(['organizations', 'users_assignments'], [], { kind: 'environment' }),
      actor,
    );

    expect(manifest.organizations.map(({ slug }) => slug)).toStrictEqual(['alpha', 'bravo']);
    expect(manifest.users.map(({ email }) => email)).toStrictEqual([
      'member@alpha.example',
      'member@bravo.example',
    ]);
    expect(JSON.stringify(manifest)).not.toContain('porta-admin');
  });

  // Explicit application selection includes the complete authorization graph and excludes Admin data.
  it('should export complete authorization graphs when applications are explicitly selected', async () => {
    useRows({
      applications: [alphaApplication],
      application_modules: [
        {
          application_slug: 'alpha-app',
          slug: 'orders',
          name: 'Orders',
          description: null,
          status: 'active',
        },
      ],
      roles: [
        { application_slug: 'alpha-app', slug: 'operator', name: 'Operator', description: null },
      ],
      permissions: [
        {
          application_slug: 'alpha-app',
          slug: 'orders:read',
          module_slug: 'orders',
          name: 'Read orders',
          description: null,
        },
      ],
      custom_claim_definitions: [
        {
          application_slug: 'alpha-app',
          claim_name: 'department',
          claim_type: 'string',
          description: null,
          include_in_id_token: true,
          include_in_access_token: true,
          include_in_userinfo: true,
        },
      ],
      role_permissions: [
        { application_slug: 'alpha-app', role_slug: 'operator', permission_slugs: ['orders:read'] },
      ],
    });

    const { manifest } = await exportFunction()(
      request(['applications_authorization'], ['alpha-app']),
      actor,
    );

    expect(manifest.applications.map(({ slug }) => slug)).toStrictEqual(['alpha-app']);
    expect(manifest.application_modules).toHaveLength(1);
    expect(manifest.roles).toHaveLength(1);
    expect(manifest.permissions).toHaveLength(1);
    expect(manifest.claim_definitions).toHaveLength(1);
    expect(manifest.role_permission_mappings).toHaveLength(1);
    expect(JSON.stringify(manifest)).not.toContain('porta-admin');
  });

  // Users remain portable without assignments, while retained assignments are limited to selected applications.
  it('should retain unassigned users when user assignments are selected', async () => {
    const unassigned = {
      ...alphaUser,
      id: 'internal-user-unassigned',
      email: 'orphan@alpha.example',
    };
    useRows({
      users: [unassigned, alphaUser],
      user_roles: [
        {
          organization_slug: 'alpha',
          email: 'member@alpha.example',
          application_slug: 'alpha-app',
          role_slug: 'operator',
        },
      ],
      custom_claim_values: [
        {
          organization_slug: 'alpha',
          email: 'member@alpha.example',
          application_slug: 'alpha-app',
          claim_name: 'department',
          value: 'operations',
        },
      ],
    });

    const { manifest } = await exportFunction()(
      request(['users_assignments'], ['alpha-app']),
      actor,
    );

    expect(manifest.users.map(({ email }) => email)).toStrictEqual([
      'member@alpha.example',
      'orphan@alpha.example',
    ]);
    expect(manifest.user_role_assignments).toHaveLength(1);
    expect(manifest.user_claim_values).toHaveLength(1);
    expect(manifest.user_role_assignments[0]?.application_slug).toBe('alpha-app');
  });

  // OIDC clients are opt-in, belong to selected applications, and never pull application records implicitly.
  it('should export clients only when selected without implicitly exporting applications', async () => {
    const client = {
      client_id: 'alpha-web',
      organization_slug: 'alpha',
      application_slug: 'alpha-app',
      name: 'Alpha Web',
      client_name: 'Alpha Web',
      client_type: 'confidential',
      application_type: 'web',
      status: 'active',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'openid',
      login_methods: null,
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://alpha.example/callback'],
      post_logout_redirect_uris: [],
      allowed_origins: [],
      require_pkce: true,
      secret_hash: 'must-never-export',
    };
    useRows({ clients: [client] });

    const selected = await exportFunction()(request(['oidc_clients'], ['alpha-app']), actor);
    useRows({ clients: [client] });
    const unselected = await exportFunction()(request(['organizations']), actor);

    expect(selected.manifest.clients.map(({ client_id }) => client_id)).toStrictEqual([
      'alpha-web',
    ]);
    expect(selected.manifest.applications).toStrictEqual([]);
    expect(JSON.stringify(selected.manifest)).not.toContain('must-never-export');
    expect(unselected.manifest.clients).toStrictEqual([]);
  });

  // A full manifest exposes portable natural keys and one root timestamp, never storage or security state.
  it('should exclude installation and security state when producing a full manifest', async () => {
    useRows({
      organizations: [bravoOrganization, alphaOrganization],
      applications: [betaApplication, alphaApplication],
      users: [alphaUser],
    });

    const { manifest, filename } = await exportFunction()(
      {
        scope: { kind: 'environment' },
        categories: [
          'organizations',
          'applications_authorization',
          'users_assignments',
          'oidc_clients',
        ],
        application_selection: { all_applications: true, application_slugs: [] },
      },
      actor,
    );

    const keys = collectKeys(manifest);
    for (const forbidden of [
      'id',
      'organization_id',
      'application_id',
      'user_id',
      'role_id',
      'permission_id',
      'created_at',
      'updated_at',
      'password_hash',
      'secret_hash',
      'locked_at',
      'locked_reason',
      'failed_login_count',
      'last_failed_login_at',
      'login_count',
      'original_filename',
    ]) {
      expect(keys.has(forbidden), `manifest must omit ${forbidden}`).toBe(false);
    }
    expect(manifest.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
    expect(filename).toMatch(/^porta-manifest-\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}.*\.json$/);
    expect(manifest.organizations.map(({ slug }) => slug)).toStrictEqual(['alpha', 'bravo']);
    expect(manifest.applications.map(({ slug }) => slug)).toStrictEqual(['alpha-app', 'beta-app']);
  });

  // Valid stored branding bytes survive base64 transport exactly.
  it('should preserve exact branding bytes when exporting a valid stored image', async () => {
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    useRows({
      organizations: [alphaOrganization],
      branding_assets: [
        {
          organization_id: 'internal-org-alpha',
          organization_slug: 'alpha',
          asset_type: 'logo',
          content_type: 'image/png',
          data: png,
          file_size: png.length,
        },
      ],
    });

    const { manifest } = await exportFunction()(request(['organizations']), actor);

    const exported = manifest.organizations[0]?.branding.logo_asset;
    expect(exported?.media_type).toBe('image/png');
    expect(Buffer.from(exported?.content_base64 ?? '', 'base64')).toStrictEqual(png);
  });

  // Invalid media and assets larger than their decoded slot limit reject the whole export.
  it.each([
    {
      caseName: 'the stored media type is unsupported',
      contentType: 'text/html',
      data: Buffer.from('<html></html>'),
    },
    {
      caseName: 'the decoded logo exceeds two MiB',
      contentType: 'image/png',
      data: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2 * 1024 * 1024)]),
    },
  ])('should roll back when $caseName', async ({ contentType, data }) => {
    useRows({
      organizations: [alphaOrganization],
      branding_assets: [
        {
          organization_id: 'internal-org-alpha',
          organization_slug: 'alpha',
          asset_type: 'logo',
          content_type: contentType,
          data,
          file_size: data.length,
        },
      ],
    });

    await expect(exportFunction()(request(['organizations']), actor)).rejects.toBeDefined();
    expect(mocks.query.mock.calls.some(([sql]) => /^\s*rollback\b/i.test(String(sql)))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => /^\s*commit\b/i.test(String(sql)))).toBe(false);
  });

  // Automatic lockout is runtime protection state; the portable lifecycle remains active.
  it('should export active lifecycle without lock state when the source user is locked', async () => {
    useRows({
      users: [
        {
          ...alphaUser,
          status: 'locked',
          locked_at: '2026-09-13T10:00:00.000Z',
          locked_reason: 'auto_lockout',
          failed_login_count: 5,
          last_failed_login_at: '2026-09-13T10:00:00.000Z',
        },
      ],
    });

    const { manifest } = await exportFunction()(request(['users_assignments']), actor);

    expect(manifest.users).toHaveLength(1);
    expect(manifest.users[0]?.status).toBe('active');
    expect(collectKeys(manifest.users).has('locked_at')).toBe(false);
    expect(collectKeys(manifest.users).has('failed_login_count')).toBe(false);
  });

  // Successful exports use one repeatable-read transaction and one content-free audit event.
  it('should commit one privacy-safe audit when an export succeeds', async () => {
    useRows({ organizations: [alphaOrganization] });

    const result = await exportFunction()(request(['organizations']), actor);

    const sqlCalls = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqlCalls.filter((sql) => /begin isolation level repeatable read/i.test(sql)),
    ).toHaveLength(1);
    expect(sqlCalls.filter((sql) => /insert\s+into\s+audit_log/i.test(sql))).toHaveLength(1);
    expect(sqlCalls.filter((sql) => /^\s*commit\b/i.test(sql))).toHaveLength(1);
    const auditCall = mocks.query.mock.calls.find(([sql]) =>
      /insert\s+into\s+audit_log/i.test(String(sql)),
    );
    expect(auditCall).toBeDefined();
    const auditValues: unknown = auditCall?.[1];
    expect(Array.isArray(auditValues)).toBe(true);
    if (!Array.isArray(auditValues)) return;
    expect(auditValues).toContain('admin.export');

    const auditText = JSON.stringify(auditValues);
    expect(auditText).not.toContain(alphaOrganization.name);
    expect(auditText).not.toContain(alphaOrganization.slug);
    expect(auditText).not.toContain(alphaOrganization.id);
    expect(auditText).not.toContain('branding_custom_css');
    const logCalls = Object.values(mocks.log).flatMap((loggerMethod) => loggerMethod.mock.calls);
    expect(JSON.stringify(logCalls)).not.toContain(alphaOrganization.name);
    expect(result.manifest.organizations[0]?.slug).toBe('alpha');
    expect(result).not.toHaveProperty('audit');
  });
});
