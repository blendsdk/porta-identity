import * as portability from '../../../src/portability/index.js';
import type {
  PortabilityActor,
  PortabilityManifest,
  PortabilityResult,
} from '../../../src/portability/index.js';
import { getPool } from '../../../src/lib/database.js';
import { seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** Planned mutation-free import entry point discovered at runtime. */
export type BuildPlanFunction = (
  manifest: PortabilityManifest,
  mode: 'dry-run' | 'keep-existing' | 'update-existing',
) => Promise<PortabilityResult>;

/** Planned atomic import entry point discovered at runtime. */
export type ApplyManifestFunction = (
  manifest: PortabilityManifest,
  mode: 'keep-existing' | 'update-existing',
  actor: PortabilityActor,
) => Promise<PortabilityResult>;

/** Stable identifiers for the initialized destination graph created by the fixture. */
export interface DestinationFixture {
  /** Control-plane actor authorized to apply the manifest. */
  readonly actor: PortabilityActor;
  /** Destination control-plane organization excluded from portable data. */
  readonly controlPlaneOrganizationId: string;
  /** Destination tenant organization used by import examples. */
  readonly organizationId: string;
  /** Destination application used by authorization examples. */
  readonly applicationId: string;
  /** Existing destination role used by relationship examples. */
  readonly roleId: string;
  /** Existing destination permission used by relationship examples. */
  readonly permissionId: string;
  /** Existing destination user used by lifecycle examples. */
  readonly userId: string;
}

/** Small valid manifest base used to isolate one live import concern per example. */
const emptyManifest = {
  version: '1.0',
  exported_at: '2026-09-13T12:34:56.789Z',
  scope: { kind: 'organization', organization_slug: 'alpha-org' },
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

/** Collection overrides accepted by the focused live manifest factory. */
type ManifestOverrides = Partial<{
  [Field in keyof PortabilityManifest]: PortabilityManifest[Field];
}>;

/** Return true only for the planned live planner call shape. */
function isBuildPlanFunction(value: unknown): value is BuildPlanFunction {
  return typeof value === 'function';
}

/** Return true only for the planned live apply call shape. */
function isApplyManifestFunction(value: unknown): value is ApplyManifestFunction {
  return typeof value === 'function';
}

/**
 * Discover the planned planner through the public feature barrel without a static member import.
 *
 * @returns Available public planner
 * @throws Error while the planner is intentionally unavailable during the red phase
 */
export function getBuildPlanFunction(): BuildPlanFunction {
  const candidate: unknown = Reflect.get(portability, 'buildPortabilityPlan');
  if (!isBuildPlanFunction(candidate)) throw new Error('buildPortabilityPlan is not available');
  return candidate;
}

/**
 * Discover the planned apply function through the public feature barrel without a static member import.
 *
 * @returns Available public apply operation
 * @throws Error while apply is intentionally unavailable during the red phase
 */
export function getApplyManifestFunction(): ApplyManifestFunction {
  const candidate: unknown = Reflect.get(portability, 'applyPortabilityManifest');
  if (!isApplyManifestFunction(candidate)) {
    throw new Error('applyPortabilityManifest is not available');
  }
  return candidate;
}

/**
 * Construct a strict complete manifest with focused collection overrides.
 *
 * @param overrides - Collections and root fields varied by one example
 * @returns Complete strict manifest
 */
export function manifest(overrides: ManifestOverrides): PortabilityManifest {
  return { ...emptyManifest, ...overrides };
}

/**
 * Return one portable organization matching the seeded destination tenant.
 *
 * @param name - Portable organization display name
 * @returns Organization record without database identifiers
 */
export function organizationRecord(name = 'Alpha Organization') {
  return {
    slug: 'alpha-org',
    name,
    status: 'active' as const,
    default_locale: 'en',
    default_login_methods: ['password'] as const,
    two_factor_policy: 'optional' as const,
    branding: {
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      company_name: null,
      custom_css: null,
      logo_asset: null,
      favicon_asset: null,
    },
  };
}

/**
 * Return one portable user matching the seeded destination identity.
 *
 * @param status - Portable active or inactive lifecycle state
 * @returns User record without authentication state
 */
export function userRecord(status: 'active' | 'inactive' = 'active') {
  return {
    organization_slug: 'alpha-org',
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
    status,
  };
}

/**
 * Return a portable client record with a selectable public or confidential type.
 *
 * @param clientType - OIDC client confidentiality class
 * @returns Portable OIDC client without credential material
 */
export function clientRecord(clientType: 'public' | 'confidential' = 'confidential') {
  return {
    client_id: 'portable-client',
    organization_slug: 'alpha-org',
    application_slug: 'alpha-app',
    name: 'Portable Client',
    client_type: clientType,
    application_type: 'web' as const,
    status: 'active' as const,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'openid',
    login_methods: ['password'] as const,
    token_endpoint_auth_method:
      clientType === 'public' ? ('none' as const) : ('client_secret_basic' as const),
    redirect_uris: ['https://portable.example/callback'],
    post_logout_redirect_uris: [],
    allowed_origins: ['https://portable.example'],
    require_pkce: true,
  };
}

/**
 * Seed the initialized destination and one reusable product graph.
 *
 * @returns Public actor plus internal identifiers used only for verification
 */
export async function seedDestination(): Promise<DestinationFixture> {
  await seedBaseData();
  const pool = getPool();
  const controlPlane = await pool.query<{ id: string }>(
    "SELECT id FROM organizations WHERE slug = 'porta-admin'",
  );
  const controlPlaneOrganizationId = controlPlane.rows[0]?.id;
  if (controlPlaneOrganizationId === undefined) throw new Error('Control plane is missing');

  const organization = await createTestOrganization({
    name: 'Alpha Organization',
    slug: 'alpha-org',
  });
  const application = await createTestApplication({ name: 'Alpha Application', slug: 'alpha-app' });
  const role = await createTestRole(application.id, { name: 'Operator', slug: 'OPERATOR' });
  const permission = await createTestPermission(application.id, {
    name: 'Read orders',
    slug: 'orders:read / delegated',
  });
  const actorUser = await createTestUser(controlPlaneOrganizationId, {
    email: 'admin@porta.invalid',
  });
  const user = await createTestUser(organization.id, {
    email: 'member@alpha.example',
    givenName: 'Alpha',
    familyName: 'Member',
  });
  await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
    role.id,
    permission.id,
  ]);

  return {
    actor: { userId: actorUser.id, controlPlaneOrganizationId },
    controlPlaneOrganizationId,
    organizationId: organization.id,
    applicationId: application.id,
    roleId: role.id,
    permissionId: permission.id,
    userId: user.id,
  };
}

/**
 * Count product and audit rows used to prove preview and rollback immutability.
 *
 * @returns Count indexed by the fixed table labels used by the specifications
 */
export async function durableCounts(): Promise<Record<string, number>> {
  const result = await getPool().query<{ table_name: string; count: string }>(`
    SELECT 'organizations' AS table_name, COUNT(*)::text AS count FROM organizations
    UNION ALL SELECT 'applications', COUNT(*)::text FROM applications
    UNION ALL SELECT 'users', COUNT(*)::text FROM users
    UNION ALL SELECT 'clients', COUNT(*)::text FROM clients
    UNION ALL SELECT 'role_permissions', COUNT(*)::text FROM role_permissions
    UNION ALL SELECT 'user_roles', COUNT(*)::text FROM user_roles
    UNION ALL SELECT 'custom_claim_values', COUNT(*)::text FROM custom_claim_values
    UNION ALL SELECT 'client_secrets', COUNT(*)::text FROM client_secrets
    UNION ALL SELECT 'audit_log', COUNT(*)::text FROM audit_log
  `);
  return Object.fromEntries(
    result.rows.map(({ table_name, count }) => [table_name, Number(count)]),
  );
}
