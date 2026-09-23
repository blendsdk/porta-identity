/** Explicit PostgreSQL reads used to plan selective portability imports. */

import { randomUUID } from 'node:crypto';
import { getPool } from '../lib/database.js';
import type {
  PortabilityApplication,
  PortabilityApplicationModule,
  PortabilityClaimDefinition,
  PortabilityClient,
  PortabilityManifest,
  PortabilityJsonValue,
  PortabilityOrganization,
  PortabilityPermission,
  PortabilityRole,
  PortabilityUser,
} from './types.js';

/** Destination organization fields needed for matching and mutable-value comparison. */
export interface ImportOrganizationRow extends Omit<PortabilityOrganization, 'branding'> {
  /** Internal identifier used only to resolve relationships inside the transaction. */
  readonly id: string;
  /** Whether this is Porta's protected control-plane organization. */
  readonly is_super_admin: boolean;
  /** Stored external logo URL. */
  readonly branding_logo_url: string | null;
  /** Stored external favicon URL. */
  readonly branding_favicon_url: string | null;
  /** Stored HTML accent color. */
  readonly branding_primary_color: string | null;
  /** Stored hosted-page company name. */
  readonly branding_company_name: string | null;
  /** Stored hosted-page custom CSS. */
  readonly branding_custom_css: string | null;
}

/** Stored organization branding bytes needed for exact update planning. */
export interface ImportBrandingAssetRow {
  /** Owning organization's public slug. */
  readonly organization_slug: string;
  /** Branding slot occupied by these bytes. */
  readonly asset_type: 'logo' | 'favicon';
  /** Validated image media type. */
  readonly content_type: string;
  /** Validated stored image bytes. */
  readonly data: Buffer;
}

/** Destination application fields needed for matching and comparison. */
export interface ImportApplicationRow extends PortabilityApplication {
  /** Internal identifier used only to resolve children. */
  readonly id: string;
}

/** Destination application-module fields plus internal relationship identifiers. */
export interface ImportModuleRow extends PortabilityApplicationModule {
  /** Internal module identifier used only by writers. */
  readonly id: string;
  /** Internal application identifier used only by writers. */
  readonly application_id: string;
}

/** Destination role fields plus internal relationship identifiers. */
export interface ImportRoleRow extends PortabilityRole {
  /** Internal role identifier used only by writers. */
  readonly id: string;
  /** Internal application identifier used only by writers. */
  readonly application_id: string;
}

/** Destination permission fields plus internal relationship identifiers. */
export interface ImportPermissionRow extends PortabilityPermission {
  /** Internal permission identifier used only by writers. */
  readonly id: string;
  /** Internal application identifier used only by writers. */
  readonly application_id: string;
  /** Internal module identifier, or null for application-wide permission. */
  readonly module_id: string | null;
}

/** Destination custom-claim definition plus its internal identifier. */
export interface ImportClaimDefinitionRow extends PortabilityClaimDefinition {
  /** Internal claim identifier used only by writers. */
  readonly id: string;
  /** Internal application identifier used only by writers. */
  readonly application_id: string;
}

/** Existing role-to-permission edges aggregated for one public role natural key. */
export interface ImportRolePermissionRow {
  /** Owning application slug. */
  readonly application_slug: string;
  /** Role claim value. */
  readonly role_slug: string;
  /** Existing permission claim values for this role. */
  readonly permission_slugs: readonly string[];
}

/** Destination user fields plus internal ownership identifiers. */
export interface ImportUserRow extends PortabilityUser {
  /** Internal user identifier used only by writers. */
  readonly id: string;
  /** Internal organization identifier used only by writers. */
  readonly organization_id: string;
}

/** One existing user-to-role edge, qualified by public natural keys. */
export interface ImportUserRoleRow {
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** Assigned user's normalized email. */
  readonly email: string;
  /** Owning application slug. */
  readonly application_slug: string;
  /** Assigned role claim value. */
  readonly role_slug: string;
}

/** One existing user claim value, qualified by public natural keys. */
export interface ImportUserClaimValueRow {
  /** Owning organization slug. */
  readonly organization_slug: string;
  /** Assigned user's normalized email. */
  readonly email: string;
  /** Owning application slug. */
  readonly application_slug: string;
  /** Custom claim name. */
  readonly claim_name: string;
  /** Existing JSON-compatible claim value. */
  readonly value: PortabilityJsonValue;
}

/** Destination OIDC client fields plus internal ownership identifiers. */
export interface ImportClientRow extends PortabilityClient {
  /** Internal client identifier used only by writers. */
  readonly id: string;
  /** Internal organization identifier used only by writers. */
  readonly organization_id: string;
  /** Internal application identifier used only by writers. */
  readonly application_id: string;
}

/** Complete destination state required by the mutation-free import planner. */
export interface PortabilityImportSnapshot {
  /** Destination organizations. */
  readonly organizations: readonly ImportOrganizationRow[];
  /** Destination branding image records. */
  readonly brandingAssets: readonly ImportBrandingAssetRow[];
  /** Destination applications. */
  readonly applications: readonly ImportApplicationRow[];
  /** Destination application modules. */
  readonly applicationModules: readonly ImportModuleRow[];
  /** Destination roles. */
  readonly roles: readonly ImportRoleRow[];
  /** Destination permissions. */
  readonly permissions: readonly ImportPermissionRow[];
  /** Destination custom-claim definitions. */
  readonly claimDefinitions: readonly ImportClaimDefinitionRow[];
  /** Destination role-to-permission edges. */
  readonly rolePermissions: readonly ImportRolePermissionRow[];
  /** Destination users. */
  readonly users: readonly ImportUserRow[];
  /** Destination user-to-role edges. */
  readonly userRoles: readonly ImportUserRoleRow[];
  /** Destination custom-claim values. */
  readonly userClaimValues: readonly ImportUserClaimValueRow[];
  /** Destination OIDC clients. */
  readonly clients: readonly ImportClientRow[];
}

/** Parameterized filter appended to one destination snapshot query. */
interface SnapshotFilter {
  /** SQL predicate including its leading `WHERE`. */
  readonly sql: string;
  /** Values bound to the predicate placeholders. */
  readonly values: readonly (string | readonly string[])[];
}

/**
 * Restrict organization-owned reads to the requested portability scope.
 *
 * @param column - Qualified organization slug column
 * @param manifest - Normalized import manifest
 * @returns Parameterized organization predicate
 */
function organizationFilter(column: string, manifest: PortabilityManifest): SnapshotFilter {
  if (manifest.scope.kind === 'organization') {
    return {
      sql: `WHERE LOWER(BTRIM(${column})) = $1`,
      values: [manifest.scope.organization_slug.trim().toLowerCase()],
    };
  }
  return { sql: 'WHERE NOT o.is_super_admin', values: [] };
}

/**
 * Restrict application-owned reads to the declared application selection.
 *
 * @param column - Qualified application slug column
 * @param manifest - Normalized import manifest
 * @param parameterIndex - First PostgreSQL placeholder available to this predicate
 * @returns Parameterized application predicate
 */
function applicationFilter(
  column: string,
  manifest: PortabilityManifest,
  parameterIndex = 1,
): SnapshotFilter {
  if (manifest.application_selection.all_applications) {
    return { sql: `WHERE LOWER(BTRIM(${column})) <> 'porta-admin'`, values: [] };
  }
  return {
    sql: `WHERE LOWER(BTRIM(${column})) = ANY($${parameterIndex}::text[])`,
    values: [
      manifest.application_selection.application_slugs.map((slug) => slug.trim().toLowerCase()),
    ],
  };
}

/**
 * Read the small destination catalog used to plan an import.
 *
 * The product is configured by an administrator and does not need large-data streaming here.
 * Explicit columns keep credentials, lock state, audit data, and other non-portable fields out of
 * planner memory. The surrounding request transaction provides the consistent snapshot.
 *
 * @param manifest - Normalized scope, category, application selection, and imported client IDs
 * @returns Destination records with internal identifiers retained only for relationship matching
 */
export async function readPortabilityImportSnapshot(
  manifest: PortabilityManifest,
): Promise<PortabilityImportSnapshot> {
  const pool = getPool();
  const organizationScope = organizationFilter(
    manifest.scope.kind === 'organization' ? 'slug' : 'o.slug',
    manifest,
  );
  const ownedOrganizationScope = organizationFilter('o.slug', manifest);
  const selectedApplications = applicationFilter('a.slug', manifest);
  const applicationTableSelection = applicationFilter('slug', manifest);
  const selectedApplicationsAfterOrganization = applicationFilter(
    'a.slug',
    manifest,
    ownedOrganizationScope.values.length + 1,
  );
  const includesOrganizations = manifest.categories.includes('organizations');
  const includesAuthorization = manifest.categories.includes('applications_authorization');
  const includesUsers = manifest.categories.includes('users_assignments');
  const includesClients = manifest.categories.includes('oidc_clients');
  const includesApplicationData = includesAuthorization || includesUsers || includesClients;
  const organizations = await pool.query<ImportOrganizationRow>(
    `SELECT o.id, o.slug, o.name, o.status, o.is_super_admin, o.default_locale,
            o.default_login_methods,
            two_factor_policy, branding_logo_url, branding_favicon_url,
            branding_primary_color, branding_company_name, branding_custom_css
       FROM organizations o
       ${organizationScope.sql}`,
    [...organizationScope.values],
  );
  const applications: { readonly rows: readonly ImportApplicationRow[] } = includesApplicationData
    ? await pool.query<ImportApplicationRow>(
        `SELECT id, slug, name, description, status
           FROM applications
           ${applicationTableSelection.sql}`,
        [...applicationTableSelection.values],
      )
    : { rows: [] };
  const brandingAssets: { readonly rows: readonly ImportBrandingAssetRow[] } = includesOrganizations
    ? await pool.query<ImportBrandingAssetRow>(
        `SELECT o.slug AS organization_slug, b.asset_type, b.content_type, b.data
       FROM branding_assets b
       JOIN organizations o ON o.id = b.organization_id
       ${ownedOrganizationScope.sql}`,
        [...ownedOrganizationScope.values],
      )
    : { rows: [] };
  const modules: { readonly rows: readonly ImportModuleRow[] } = includesAuthorization
    ? await pool.query<ImportModuleRow>(
        `SELECT m.id, m.application_id, a.slug AS application_slug, m.slug, m.name,
            m.description, m.status
       FROM application_modules m
       JOIN applications a ON a.id = m.application_id
       ${selectedApplications.sql}`,
        [...selectedApplications.values],
      )
    : { rows: [] };
  const roles: { readonly rows: readonly ImportRoleRow[] } =
    includesAuthorization || includesUsers
      ? await pool.query<ImportRoleRow>(
          `SELECT r.id, r.application_id, a.slug AS application_slug, r.slug, r.name, r.description
       FROM roles r
       JOIN applications a ON a.id = r.application_id
       ${selectedApplications.sql}`,
          [...selectedApplications.values],
        )
      : { rows: [] };
  const permissions: { readonly rows: readonly ImportPermissionRow[] } = includesAuthorization
    ? await pool.query<ImportPermissionRow>(
        `SELECT p.id, p.application_id, p.module_id, a.slug AS application_slug, p.slug,
            m.slug AS module_slug, p.name, p.description
       FROM permissions p
       JOIN applications a ON a.id = p.application_id
       LEFT JOIN application_modules m ON m.id = p.module_id
       ${selectedApplications.sql}`,
        [...selectedApplications.values],
      )
    : { rows: [] };
  const includeClaimDefinitions = includesAuthorization || manifest.user_claim_values.length > 0;
  const claims: { readonly rows: readonly ImportClaimDefinitionRow[] } = includeClaimDefinitions
    ? await pool.query<ImportClaimDefinitionRow>(
        `SELECT c.id, c.application_id, a.slug AS application_slug, c.claim_name, c.claim_type,
            c.description, c.include_in_id_token, c.include_in_access_token,
            c.include_in_userinfo
       FROM custom_claim_definitions c
       JOIN applications a ON a.id = c.application_id
       ${selectedApplications.sql}`,
        [...selectedApplications.values],
      )
    : { rows: [] };
  const rolePermissions: { readonly rows: readonly ImportRolePermissionRow[] } =
    includesAuthorization
      ? await pool.query<ImportRolePermissionRow>(
          `SELECT a.slug AS application_slug, r.slug AS role_slug,
            ARRAY_AGG(p.slug ORDER BY BTRIM(p.slug) COLLATE "C") AS permission_slugs
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN applications a ON a.id = r.application_id
      ${selectedApplications.sql} AND p.application_id = r.application_id
      GROUP BY a.slug, r.slug`,
          [...selectedApplications.values],
        )
      : { rows: [] };
  const users: { readonly rows: readonly ImportUserRow[] } = includesUsers
    ? await pool.query<ImportUserRow>(
        `SELECT u.id, u.organization_id, o.slug AS organization_slug, u.email::text AS email,
            u.email_verified, u.given_name, u.family_name, u.middle_name, u.nickname,
            u.preferred_username, u.profile_url, u.picture_url, u.website_url, u.gender,
            u.birthdate::text AS birthdate, u.zoneinfo, u.locale, u.phone_number,
            u.phone_number_verified, u.address_street, u.address_locality, u.address_region,
            u.address_postal_code, u.address_country,
            CASE WHEN u.status = 'inactive' THEN 'inactive' ELSE 'active' END AS status
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       ${ownedOrganizationScope.sql}`,
        [...ownedOrganizationScope.values],
      )
    : { rows: [] };
  const userRoles: { readonly rows: readonly ImportUserRoleRow[] } = includesUsers
    ? await pool.query<ImportUserRoleRow>(
        `SELECT o.slug AS organization_slug, u.email::text AS email, a.slug AS application_slug,
            r.slug AS role_slug
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       JOIN organizations o ON o.id = u.organization_id
       JOIN roles r ON r.id = ur.role_id
       JOIN applications a ON a.id = r.application_id
       ${ownedOrganizationScope.sql} AND ${selectedApplicationsAfterOrganization.sql.slice('WHERE '.length)}`,
        [...ownedOrganizationScope.values, ...selectedApplicationsAfterOrganization.values],
      )
    : { rows: [] };
  const userClaimValues: { readonly rows: readonly ImportUserClaimValueRow[] } = includesUsers
    ? await pool.query<ImportUserClaimValueRow>(
        `SELECT o.slug AS organization_slug, u.email::text AS email, a.slug AS application_slug,
            c.claim_name, v.value
       FROM custom_claim_values v
       JOIN users u ON u.id = v.user_id
       JOIN organizations o ON o.id = u.organization_id
       JOIN custom_claim_definitions c ON c.id = v.claim_id
       JOIN applications a ON a.id = c.application_id
       ${ownedOrganizationScope.sql} AND ${selectedApplicationsAfterOrganization.sql.slice('WHERE '.length)}`,
        [...ownedOrganizationScope.values, ...selectedApplicationsAfterOrganization.values],
      )
    : { rows: [] };
  const clients: { readonly rows: readonly ImportClientRow[] } = includesClients
    ? await pool.query<ImportClientRow>(
        `SELECT c.id, c.organization_id, c.application_id, c.client_id,
            o.slug AS organization_slug, a.slug AS application_slug,
            c.client_name AS name, c.client_type, c.application_type, c.status,
            c.grant_types, c.response_types, c.scope, c.login_methods,
            c.token_endpoint_auth_method, c.redirect_uris,
            COALESCE(c.post_logout_redirect_uris, '{}') AS post_logout_redirect_uris,
            COALESCE(c.allowed_origins, '{}') AS allowed_origins, c.require_pkce
       FROM clients c
       JOIN organizations o ON o.id = c.organization_id
       JOIN applications a ON a.id = c.application_id
      WHERE c.client_id = ANY($1::text[])`,
        [manifest.clients.map((client) => client.client_id)],
      )
    : { rows: [] };

  return {
    organizations: organizations.rows,
    brandingAssets: brandingAssets.rows,
    applications: applications.rows,
    applicationModules: modules.rows,
    roles: roles.rows,
    permissions: permissions.rows,
    claimDefinitions: claims.rows,
    rolePermissions: rolePermissions.rows,
    users: users.rows.map((row) => ({
      ...row,
      status: row.status === 'inactive' ? 'inactive' : 'active',
    })),
    userRoles: userRoles.rows,
    userClaimValues: userClaimValues.rows,
    clients: clients.rows,
  };
}

/**
 * Insert or update one organization and its optional branding assets.
 *
 * @param record - Strict portable organization fields
 * @param destinationId - Existing identifier for update, or null for create
 * @param destinationAssetTypes - Branding slots which currently contain stored bytes
 * @returns Authoritative destination identifier
 */
export async function writePortabilityOrganization(
  record: PortabilityOrganization,
  destinationId: string | null,
  destinationAssetTypes: ReadonlySet<'logo' | 'favicon'>,
): Promise<string> {
  const pool = getPool();
  const authoritativeId = destinationId ?? randomUUID();
  const values = [
    record.name,
    record.status,
    record.default_locale,
    record.default_login_methods,
    record.two_factor_policy,
    record.branding.logo_url,
    record.branding.favicon_url,
    record.branding.primary_color,
    record.branding.company_name,
    record.branding.custom_css,
  ];
  const result =
    destinationId === null
      ? await pool.query<{ id: string }>(
          `INSERT INTO organizations
           (id, name, status, default_locale, default_login_methods, two_factor_policy,
            branding_logo_url, branding_favicon_url, branding_primary_color,
            branding_company_name, branding_custom_css, slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [authoritativeId, ...values, record.slug],
        )
      : await pool.query<{ id: string }>(
          `UPDATE organizations SET name = $1, status = $2, default_locale = $3,
                default_login_methods = $4, two_factor_policy = $5, branding_logo_url = $6,
                branding_favicon_url = $7, branding_primary_color = $8,
                branding_company_name = $9, branding_custom_css = $10, updated_at = NOW()
          WHERE id = $11 RETURNING id`,
          [...values, destinationId],
        );
  const organizationId = result.rows[0]?.id ?? authoritativeId;

  for (const assetType of ['logo', 'favicon'] as const) {
    const asset = assetType === 'logo' ? record.branding.logo_asset : record.branding.favicon_asset;
    if (asset === null) {
      if (!destinationAssetTypes.has(assetType)) continue;
      await pool.query(
        'DELETE FROM branding_assets WHERE organization_id = $1 AND asset_type = $2',
        [organizationId, assetType],
      );
    } else {
      const data = Buffer.from(asset.content_base64, 'base64');
      await pool.query(
        `INSERT INTO branding_assets
           (organization_id, asset_type, file_name, content_type, file_size, data)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, asset_type) DO UPDATE
         SET file_name = EXCLUDED.file_name, content_type = EXCLUDED.content_type,
             file_size = EXCLUDED.file_size, data = EXCLUDED.data, updated_at = NOW()`,
        [organizationId, assetType, `imported-${assetType}`, asset.media_type, data.length, data],
      );
    }
  }
  return organizationId;
}

/**
 * @param record - Strict portable application fields
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination identifier
 */
export async function writePortabilityApplication(
  record: PortabilityApplication,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO applications (id, slug, name, description, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [authoritativeId, record.slug, record.name, record.description, record.status],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE applications SET name = $1, description = $2, status = $3, updated_at = NOW()
          WHERE id = $4 RETURNING id`,
          [record.name, record.description, record.status, destinationId],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * @param record - Strict portable module fields
 * @param applicationId - Resolved parent application identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination identifier
 */
export async function writePortabilityModule(
  record: PortabilityApplicationModule,
  applicationId: string,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO application_modules (id, application_id, slug, name, description, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            authoritativeId,
            applicationId,
            record.slug,
            record.name,
            record.description,
            record.status,
          ],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE application_modules SET name = $1, description = $2, status = $3,
                updated_at = NOW() WHERE id = $4 RETURNING id`,
          [record.name, record.description, record.status, destinationId],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * @param record - Strict portable role fields
 * @param applicationId - Resolved parent application identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination identifier
 */
export async function writePortabilityRole(
  record: PortabilityRole,
  applicationId: string,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO roles (id, application_id, slug, name, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [authoritativeId, applicationId, record.slug, record.name, record.description],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE roles SET name = $1, description = $2, updated_at = NOW()
          WHERE id = $3 RETURNING id`,
          [record.name, record.description, destinationId],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * @param record - Strict portable permission fields
 * @param applicationId - Resolved parent application identifier
 * @param moduleId - Resolved optional module identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination identifier
 */
export async function writePortabilityPermission(
  record: PortabilityPermission,
  applicationId: string,
  moduleId: string | null,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO permissions (id, application_id, module_id, slug, name, description)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [authoritativeId, applicationId, moduleId, record.slug, record.name, record.description],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE permissions SET name = $1, description = $2
          WHERE id = $3 RETURNING id`,
          [record.name, record.description, destinationId],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * @param record - Strict portable claim-definition fields
 * @param applicationId - Resolved parent application identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination identifier
 */
export async function writePortabilityClaimDefinition(
  record: PortabilityClaimDefinition,
  applicationId: string,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO custom_claim_definitions
           (id, application_id, claim_name, claim_type, description, include_in_id_token,
            include_in_access_token, include_in_userinfo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            authoritativeId,
            applicationId,
            record.claim_name,
            record.claim_type,
            record.description,
            record.include_in_id_token,
            record.include_in_access_token,
            record.include_in_userinfo,
          ],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE custom_claim_definitions SET description = $1, include_in_id_token = $2,
                include_in_access_token = $3, include_in_userinfo = $4, updated_at = NOW()
          WHERE id = $5 RETURNING id`,
          [
            record.description,
            record.include_in_id_token,
            record.include_in_access_token,
            record.include_in_userinfo,
            destinationId,
          ],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * Add listed role-permission edges without removing destination-only edges.
 *
 * @param roleId - Resolved role identifier
 * @param permissionIds - Resolved permission identifiers listed by the manifest
 */
export async function writePortabilityRolePermissions(
  roleId: string,
  permissionIds: readonly string[],
): Promise<void> {
  for (const permissionId of permissionIds) {
    await getPool().query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionId],
    );
  }
}
