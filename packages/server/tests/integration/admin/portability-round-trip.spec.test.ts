import { beforeEach, describe, expect, it } from 'vitest';
import { uploadAsset } from '../../../src/lib/branding-assets.js';
import { getPool } from '../../../src/lib/database.js';
import * as portability from '../../../src/portability/index.js';
import type {
  ExportManifestRequest,
  PortabilityActor,
  PortabilityManifest,
} from '../../../src/portability/index.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestClient,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

const ALL_CATEGORIES = [
  'organizations',
  'applications_authorization',
  'users_assignments',
  'oidc_clients',
] as const;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);

type ExportResult = { readonly manifest: PortabilityManifest; readonly filename: string };
type ExportFunction = (
  request: ExportManifestRequest,
  actor: PortabilityActor,
) => Promise<ExportResult>;

interface ExportFixture {
  readonly actor: PortabilityActor;
  readonly controlPlaneUserId: string;
  readonly alphaOrganizationId: string;
  readonly betaOrganizationId: string;
  readonly alphaApplicationId: string;
  readonly betaApplicationId: string;
  readonly alphaRoleId: string;
  readonly alphaPermissionId: string;
  readonly alphaClaimId: string;
  readonly assignedUserId: string;
  readonly lockedUserId: string;
  readonly sourceIds: readonly string[];
  readonly clientIds: readonly string[];
}

/** Return the planned export entry point without coupling the specification to implementation files. */
function getExportFunction(): ExportFunction {
  const candidate: unknown = Reflect.get(portability, 'exportPortabilityManifest');
  if (typeof candidate !== 'function') {
    throw new Error('exportPortabilityManifest is not available');
  }
  return candidate;
}

/** Build signed image bytes accepted by the established branding validator. */
function signedImage(signature: Buffer, size: number): Buffer {
  return Buffer.concat([signature, Buffer.alloc(size - signature.length)]);
}

/** Construct an export request with the exact explicit application-selection contract. */
function request(
  scope: ExportManifestRequest['scope'],
  categories: ExportManifestRequest['categories'],
  applicationSlugs: readonly string[] = [],
  allApplications = false,
): ExportManifestRequest {
  return {
    scope,
    categories,
    application_selection: {
      all_applications: allApplications,
      application_slugs: applicationSlugs,
    },
  };
}

/** Seed two tenants, two product graphs, control-plane data, users, assignments, and clients. */
async function seedPopulatedSource(): Promise<ExportFixture> {
  await seedBaseData();
  const pool = getPool();
  const controlPlane = await pool.query<{ id: string }>(
    "SELECT id FROM organizations WHERE slug = 'porta-admin'",
  );
  const controlPlaneOrganizationId = controlPlane.rows[0]?.id;
  if (controlPlaneOrganizationId === undefined) throw new Error('Control-plane seed is missing');

  const alphaOrganization = await createTestOrganization({
    name: 'Alpha Organization',
    slug: 'alpha-org',
    defaultLocale: 'nl-NL',
    brandingLogoUrl: 'https://alpha.example/logo.png',
    brandingPrimaryColor: '#123456',
    brandingCompanyName: 'Alpha Company',
    brandingCustomCss: '.brand { color: #123456; }',
    defaultLoginMethods: ['password'],
  });
  const betaOrganization = await createTestOrganization({
    name: 'Beta Organization',
    slug: 'beta-org',
    defaultLocale: 'en',
  });
  await pool.query("UPDATE organizations SET two_factor_policy = 'required_totp' WHERE id = $1", [
    alphaOrganization.id,
  ]);

  const alphaApplication = await createTestApplication({
    name: 'Alpha Application',
    slug: 'alpha-app',
    description: 'Alpha portable application',
  });
  const betaApplication = await createTestApplication({
    name: 'Beta Application',
    slug: 'beta-app',
    description: 'Beta portable application',
  });
  const adminApplication = await createTestApplication({
    name: 'Porta Admin',
    slug: 'porta-admin',
    description: 'Control-plane application',
  });

  const alphaModule = await pool.query<{ id: string }>(
    `INSERT INTO application_modules (application_id, name, slug, description)
     VALUES ($1, 'Orders', 'orders', 'Order operations') RETURNING id`,
    [alphaApplication.id],
  );
  const betaModule = await pool.query<{ id: string }>(
    `INSERT INTO application_modules (application_id, name, slug)
     VALUES ($1, 'Billing', 'billing') RETURNING id`,
    [betaApplication.id],
  );
  await pool.query(
    `INSERT INTO application_modules (application_id, name, slug)
     VALUES ($1, 'Admin', 'admin')`,
    [adminApplication.id],
  );

  const alphaRole = await createTestRole(alphaApplication.id, {
    name: 'Order Manager',
    slug: 'ORDER_MANAGER',
    description: 'Manages orders',
  });
  const betaRole = await createTestRole(betaApplication.id, {
    name: 'Billing Viewer',
    slug: 'BILLING_VIEWER',
  });
  await createTestRole(adminApplication.id, { name: 'Administrator', slug: 'ADMIN' });
  const alphaPermission = await createTestPermission(alphaApplication.id, {
    moduleId: alphaModule.rows[0]?.id,
    name: 'Create order',
    slug: 'CAN_ADD_ORDER',
  });
  const betaPermission = await createTestPermission(betaApplication.id, {
    moduleId: betaModule.rows[0]?.id,
    name: 'Read invoice',
    slug: 'ALLOW_READ_INVOICE',
  });
  await createTestPermission(adminApplication.id, {
    name: 'Administer Porta',
    slug: 'admin:all',
  });
  await pool.query(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2), ($3, $4)',
    [alphaRole.id, alphaPermission.id, betaRole.id, betaPermission.id],
  );

  const alphaClaim = await createTestClaimDefinition(alphaApplication.id, {
    claimName: 'department',
    claimType: 'string',
    includeInIdToken: true,
    includeInAccessToken: true,
    includeInUserinfo: false,
  });
  const betaClaim = await createTestClaimDefinition(betaApplication.id, {
    claimName: 'cost_center',
    claimType: 'number',
  });
  await createTestClaimDefinition(adminApplication.id, {
    claimName: 'admin_marker',
    claimType: 'boolean',
  });

  const actorUser = await createTestUser(controlPlaneOrganizationId, {
    email: 'admin@porta.invalid',
  });
  const assignedUser = await createTestUser(alphaOrganization.id, {
    email: 'assigned@alpha.example',
    emailVerified: true,
    givenName: 'Assigned',
    locale: 'nl-NL',
    passwordHash: 'password-hash-must-not-export',
  });
  const unassignedUser = await createTestUser(alphaOrganization.id, {
    email: 'unassigned@alpha.example',
  });
  const lockedUser = await createTestUser(alphaOrganization.id, {
    email: 'locked@alpha.example',
  });
  const betaUser = await createTestUser(betaOrganization.id, { email: 'user@beta.example' });
  await pool.query(
    `UPDATE users SET status = 'locked', locked_at = NOW(), locked_reason = 'auto_lockout',
                      failed_login_count = 4, last_failed_login_at = NOW(), login_count = 17
     WHERE id = $1`,
    [lockedUser.id],
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ($1, $2, $3), ($1, $4, $3), ($5, $4, $3)`,
    [assignedUser.id, alphaRole.id, actorUser.id, betaRole.id, betaUser.id],
  );
  await pool.query(
    `INSERT INTO custom_claim_values (user_id, claim_id, value)
     VALUES ($1, $2, '"sales"'::jsonb), ($1, $3, '41'::jsonb)`,
    [assignedUser.id, alphaClaim.id, betaClaim.id],
  );

  const alphaClient = await createTestClient(alphaOrganization.id, alphaApplication.id, {
    clientId: 'alpha-client',
    clientName: 'Alpha Web',
    redirectUris: ['https://alpha.example/callback'],
    postLogoutRedirectUris: ['https://alpha.example/logout'],
    allowedOrigins: ['https://alpha.example'],
    loginMethods: ['password'],
  });
  const betaAppClient = await createTestClient(alphaOrganization.id, betaApplication.id, {
    clientId: 'alpha-beta-client',
    clientName: 'Alpha Billing',
  });
  const betaClient = await createTestClient(betaOrganization.id, alphaApplication.id, {
    clientId: 'beta-alpha-client',
    clientName: 'Beta Orders',
  });
  await pool.query(
    `INSERT INTO client_secrets (client_id, secret_hash, label)
     VALUES ($1, 'secret-hash-must-not-export', 'original-secret-label')`,
    [alphaClient.id],
  );
  await pool.query(
    `INSERT INTO magic_link_tokens (user_id, organization_id, token_hash, expires_at)
     VALUES ($1, $2, 'token-hash-must-not-export', NOW() + INTERVAL '1 hour')`,
    [assignedUser.id, alphaOrganization.id],
  );
  await pool.query(
    `INSERT INTO audit_log (organization_id, actor_id, event_type, event_category, metadata)
     VALUES ($1, $2, 'fixture.private', 'security', '{"private":"audit-must-not-export"}')`,
    [alphaOrganization.id, actorUser.id],
  );

  return {
    actor: { userId: actorUser.id, controlPlaneOrganizationId },
    controlPlaneUserId: actorUser.id,
    alphaOrganizationId: alphaOrganization.id,
    betaOrganizationId: betaOrganization.id,
    alphaApplicationId: alphaApplication.id,
    betaApplicationId: betaApplication.id,
    alphaRoleId: alphaRole.id,
    alphaPermissionId: alphaPermission.id,
    alphaClaimId: alphaClaim.id,
    assignedUserId: assignedUser.id,
    lockedUserId: lockedUser.id,
    sourceIds: [
      controlPlaneOrganizationId,
      actorUser.id,
      alphaOrganization.id,
      betaOrganization.id,
      alphaApplication.id,
      betaApplication.id,
      adminApplication.id,
      alphaRole.id,
      betaRole.id,
      alphaPermission.id,
      betaPermission.id,
      alphaClaim.id,
      betaClaim.id,
      assignedUser.id,
      unassignedUser.id,
      lockedUser.id,
      betaUser.id,
      alphaClient.id,
      betaAppClient.id,
      betaClient.id,
    ],
    clientIds: [alphaClient.clientId, betaAppClient.clientId, betaClient.clientId],
  };
}

describe('selective portability export live specification', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // An organization-only export contains one exact tenant and no unselected collection data.
  it('should export only the selected organization when organizations is the only category', async () => {
    const fixture = await seedPopulatedSource();
    const result = await getExportFunction()(
      request({ kind: 'organization', organization_slug: 'alpha-org' }, ['organizations']),
      fixture.actor,
    );

    expect(result.manifest.organizations.map((organization) => organization.slug)).toEqual([
      'alpha-org',
    ]);
    for (const collection of [
      result.manifest.applications,
      result.manifest.application_modules,
      result.manifest.roles,
      result.manifest.permissions,
      result.manifest.claim_definitions,
      result.manifest.role_permission_mappings,
      result.manifest.users,
      result.manifest.user_role_assignments,
      result.manifest.user_claim_values,
      result.manifest.clients,
    ]) {
      expect(collection).toEqual([]);
    }
  });

  // Environment scope omits the source control plane and every identity owned by it.
  it('should export each product organization once without control-plane identities', async () => {
    const fixture = await seedPopulatedSource();
    const { manifest } = await getExportFunction()(
      request({ kind: 'environment' }, ['organizations', 'users_assignments'], ['alpha-app']),
      fixture.actor,
    );

    expect(manifest.organizations.map((organization) => organization.slug)).toEqual([
      'alpha-org',
      'beta-org',
    ]);
    expect(manifest.users.map((user) => user.email)).not.toContain('admin@porta.invalid');
    expect(JSON.stringify(manifest)).not.toContain(fixture.controlPlaneUserId);
  });

  // Application selection exports each selected application's complete authorization graph.
  it('should export complete non-control-plane authorization graphs for all or explicit applications', async () => {
    const fixture = await seedPopulatedSource();
    const exportManifest = getExportFunction();
    const explicit = await exportManifest(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['applications_authorization'],
        ['alpha-app'],
      ),
      fixture.actor,
    );
    const all = await exportManifest(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['applications_authorization'],
        [],
        true,
      ),
      fixture.actor,
    );

    expect(explicit.manifest.applications.map((application) => application.slug)).toEqual([
      'alpha-app',
    ]);
    expect(explicit.manifest.application_modules).toMatchObject([
      { application_slug: 'alpha-app', slug: 'orders' },
    ]);
    expect(explicit.manifest.roles).toMatchObject([
      { application_slug: 'alpha-app', slug: 'ORDER_MANAGER' },
    ]);
    expect(explicit.manifest.permissions).toMatchObject([
      { application_slug: 'alpha-app', module_slug: 'orders', slug: 'CAN_ADD_ORDER' },
    ]);
    expect(explicit.manifest.claim_definitions).toMatchObject([
      { application_slug: 'alpha-app', claim_name: 'department' },
    ]);
    expect(explicit.manifest.role_permission_mappings).toEqual([
      {
        application_slug: 'alpha-app',
        role_slug: 'ORDER_MANAGER',
        permission_slugs: ['CAN_ADD_ORDER'],
      },
    ]);
    expect(all.manifest.applications.map((application) => application.slug)).toEqual([
      'alpha-app',
      'beta-app',
    ]);
    expect(JSON.stringify(all.manifest)).not.toContain('porta-admin');
  });

  // Every scoped user remains portable while relationships are filtered by selected application.
  it('should retain unassigned users and export only selected-application relationships', async () => {
    const fixture = await seedPopulatedSource();
    const { manifest } = await getExportFunction()(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['users_assignments'],
        ['alpha-app'],
      ),
      fixture.actor,
    );

    expect(manifest.users.map((user) => user.email)).toEqual([
      'assigned@alpha.example',
      'locked@alpha.example',
      'unassigned@alpha.example',
    ]);
    expect(manifest.user_role_assignments).toEqual([
      {
        organization_slug: 'alpha-org',
        email: 'assigned@alpha.example',
        application_slug: 'alpha-app',
        role_slug: 'ORDER_MANAGER',
      },
    ]);
    expect(manifest.user_claim_values).toEqual([
      {
        organization_slug: 'alpha-org',
        email: 'assigned@alpha.example',
        application_slug: 'alpha-app',
        claim_name: 'department',
        value: 'sales',
      },
    ]);
  });

  // Selecting clients never selects application records implicitly.
  it('should keep clients empty when unselected and export only matching clients when selected', async () => {
    const fixture = await seedPopulatedSource();
    const exportManifest = getExportFunction();
    const unselected = await exportManifest(
      request({ kind: 'organization', organization_slug: 'alpha-org' }, ['organizations']),
      fixture.actor,
    );
    const selected = await exportManifest(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['oidc_clients'],
        ['alpha-app'],
      ),
      fixture.actor,
    );

    expect(unselected.manifest.clients).toEqual([]);
    expect(selected.manifest.clients).toMatchObject([
      {
        client_id: 'alpha-client',
        organization_slug: 'alpha-org',
        application_slug: 'alpha-app',
      },
    ]);
    expect(selected.manifest.applications).toEqual([]);
  });

  // A complete manifest carries portable public data but no operational or authentication state.
  it('should exclude internal identifiers timestamps and sensitive state from a populated export', async () => {
    const fixture = await seedPopulatedSource();
    const result = await getExportFunction()(
      request({ kind: 'environment' }, ALL_CATEGORIES, [], true),
      fixture.actor,
    );
    const serialized = JSON.stringify(result.manifest);
    const prohibitedKeys = new Set([
      'id',
      'organization_id',
      'application_id',
      'module_id',
      'role_id',
      'permission_id',
      'user_id',
      'claim_id',
      'created_at',
      'updated_at',
      'password_hash',
      'secret_hash',
      'token_hash',
      'locked_at',
      'locked_reason',
      'failed_login_count',
      'last_failed_login_at',
      'login_count',
      'last_login_at',
      'original_filename',
      'is_super_admin',
    ]);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        expect(prohibitedKeys, `prohibited manifest key: ${key}`).not.toContain(key);
        visit(child);
      }
    };
    visit(result.manifest);

    expect(result.manifest.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.filename).toMatch(/^porta-manifest-.*\.json$/);
    for (const id of fixture.sourceIds) expect(serialized).not.toContain(id);
    expect(serialized).not.toMatch(
      /password-hash-must-not-export|secret-hash-must-not-export|token-hash-must-not-export|audit-must-not-export|original-secret-label/,
    );
  });

  // Maximum accepted branding images preserve their validated media type and exact bytes.
  it('should round-trip maximum branding bytes and reject invalid stored media', async () => {
    const fixture = await seedPopulatedSource();
    const logo = signedImage(PNG_SIGNATURE, 2 * 1024 * 1024);
    const favicon = signedImage(ICO_SIGNATURE, 512 * 1024);
    await uploadAsset(fixture.alphaOrganizationId, 'logo', 'image/png', logo);
    await uploadAsset(fixture.alphaOrganizationId, 'favicon', 'image/x-icon', favicon);

    const exported = await getExportFunction()(
      request({ kind: 'organization', organization_slug: 'alpha-org' }, ['organizations']),
      fixture.actor,
    );
    const branding = exported.manifest.organizations[0]?.branding;
    expect(branding?.logo_asset?.media_type).toBe('image/png');
    expect(Buffer.from(branding?.logo_asset?.content_base64 ?? '', 'base64').equals(logo)).toBe(
      true,
    );
    expect(branding?.favicon_asset?.media_type).toBe('image/x-icon');
    expect(
      Buffer.from(branding?.favicon_asset?.content_base64 ?? '', 'base64').equals(favicon),
    ).toBe(true);

    await getPool().query(
      "UPDATE branding_assets SET content_type = 'application/octet-stream' WHERE organization_id = $1 AND asset_type = 'logo'",
      [fixture.alphaOrganizationId],
    );
    await expect(
      getExportFunction()(
        request({ kind: 'organization', organization_slug: 'alpha-org' }, ['organizations']),
        fixture.actor,
      ),
    ).rejects.toThrow();
  });

  // Automatic account lockout is operational state, so its portable lifecycle remains active.
  it('should export a locked source user as active without lock or failure state', async () => {
    const fixture = await seedPopulatedSource();
    const { manifest } = await getExportFunction()(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['users_assignments'],
        ['alpha-app'],
      ),
      fixture.actor,
    );
    const locked = manifest.users.find((user) => user.email === 'locked@alpha.example');

    expect(locked?.status).toBe('active');
    expect(Object.keys(locked ?? {})).not.toEqual(
      expect.arrayContaining(['locked_at', 'locked_reason', 'failed_login_count']),
    );
  });

  // Export audit metadata contains only non-sensitive version, digest, category, and count facts.
  it('should write one content-free admin export audit row after successful export', async () => {
    const fixture = await seedPopulatedSource();
    await getExportFunction()(
      request(
        { kind: 'organization', organization_slug: 'alpha-org' },
        ['organizations', 'applications_authorization'],
        ['alpha-app'],
      ),
      fixture.actor,
    );

    const audits = await getPool().query<{
      organization_id: string | null;
      actor_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT organization_id, actor_id, metadata
       FROM audit_log WHERE event_type = 'admin.export'`,
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({
      organization_id: fixture.alphaOrganizationId,
      actor_id: fixture.actor.userId,
    });

    const metadata = audits.rows[0]?.metadata ?? {};
    const allowedKeys = new Set([
      'version',
      'manifest_version',
      'digest',
      'sha256_digest',
      'mode',
      'categories',
      'counts',
      'record_counts',
    ]);
    expect(Object.keys(metadata).every((key) => allowedKeys.has(key))).toBe(true);
    expect(Object.keys(metadata).some((key) => key.includes('digest'))).toBe(true);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toMatch(
      /alpha-org|alpha-app|Alpha Organization|assigned@alpha\.example|alpha-client|https:\/\/|CAN_ADD_ORDER|department|secret/i,
    );
    for (const id of fixture.sourceIds) expect(serialized).not.toContain(id);
    for (const clientId of fixture.clientIds) expect(serialized).not.toContain(clientId);
  });
});
