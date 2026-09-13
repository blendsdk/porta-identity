/** Explicit PostgreSQL reads used by selective portability export. */

import type { PoolClient } from 'pg';
import type {
  PortabilityApplication,
  PortabilityApplicationModule,
  PortabilityApplicationSelection,
  PortabilityClaimDefinition,
  PortabilityOrganization,
  PortabilityPermission,
  PortabilityRole,
  PortabilityRolePermissionMapping,
  PortabilityScope,
} from './types.js';
import { PortabilityError } from './types.js';

/** Organization row fields needed for export plus its internal relationship key. */
interface OrganizationExportRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: 'active' | 'suspended';
  readonly default_locale: string;
  readonly default_login_methods: readonly ('password' | 'magic_link')[];
  readonly two_factor_policy: 'optional' | 'required_email' | 'required_totp' | 'required_any';
  readonly branding_logo_url: string | null;
  readonly branding_favicon_url: string | null;
  readonly branding_primary_color: string | null;
  readonly branding_company_name: string | null;
  readonly branding_custom_css: string | null;
}

/** Application row fields needed for export plus its internal relationship key. */
interface ApplicationExportRow extends PortabilityApplication {
  readonly id: string;
}

/** Resolved organization scope with internal keys kept outside the manifest. */
export interface ResolvedOrganizationExportScope {
  /** Internal identifiers used only to qualify dependent reads. */
  readonly organizationIds: readonly string[];
  /** Portable organization records. */
  readonly organizations: readonly PortabilityOrganization[];
}

/** Resolved application selection with internal keys kept outside the manifest. */
export interface ResolvedApplicationExportSelection {
  /** Internal identifiers used only to qualify dependent reads. */
  readonly applicationIds: readonly string[];
  /** Portable selected applications. */
  readonly applications: readonly PortabilityApplication[];
}

/** Portable authorization collections owned by selected applications. */
export interface PortabilityAuthorizationGraph {
  /** Selected application modules. */
  readonly applicationModules: readonly PortabilityApplicationModule[];
  /** Selected application roles. */
  readonly roles: readonly PortabilityRole[];
  /** Selected application permissions. */
  readonly permissions: readonly PortabilityPermission[];
  /** Selected application claim definitions. */
  readonly claimDefinitions: readonly PortabilityClaimDefinition[];
  /** Selected role-to-permission mappings. */
  readonly rolePermissionMappings: readonly PortabilityRolePermissionMapping[];
}

/** Create the fixed safe rejection used for unavailable or protected export scope. */
function rejectedScope(): PortabilityError {
  return new PortabilityError(409, 'export_scope_rejected', 'Export scope rejected');
}

/** Convert an organization database row into its portable representation. */
function portableOrganization(row: OrganizationExportRow): PortabilityOrganization {
  return {
    slug: row.slug,
    name: row.name,
    status: row.status,
    default_locale: row.default_locale,
    default_login_methods: row.default_login_methods,
    two_factor_policy: row.two_factor_policy,
    branding: {
      logo_url: row.branding_logo_url,
      favicon_url: row.branding_favicon_url,
      primary_color: row.branding_primary_color,
      company_name: row.branding_company_name,
      custom_css: row.branding_custom_css,
      logo_asset: null,
      favicon_asset: null,
    },
  };
}

/**
 * Resolve an organization or environment export scope while excluding the control plane.
 *
 * @param client - Request-owned PostgreSQL client
 * @param scope - Validated public export scope
 * @param controlPlaneOrganizationId - Authenticated control-plane organization identifier
 * @returns Portable organizations and private identifiers for dependent reads
 * @throws PortabilityError when an organization scope is missing or protected
 */
export async function readOrganizationExportScope(
  client: PoolClient,
  scope: PortabilityScope,
  controlPlaneOrganizationId: string,
): Promise<ResolvedOrganizationExportScope> {
  const parameters =
    scope.kind === 'organization'
      ? [controlPlaneOrganizationId, scope.organization_slug]
      : [controlPlaneOrganizationId];
  const scopePredicate = scope.kind === 'organization' ? 'AND slug = $2' : '';
  const result = await client.query<OrganizationExportRow>(
    `SELECT id, slug, name, status, default_locale, default_login_methods,
            two_factor_policy, branding_logo_url, branding_favicon_url,
            branding_primary_color, branding_company_name, branding_custom_css
       FROM organizations
      WHERE is_super_admin = FALSE
        AND id <> $1
        ${scopePredicate}
      ORDER BY slug COLLATE "C"`,
    parameters,
  );

  if (scope.kind === 'organization' && result.rows.length !== 1) throw rejectedScope();
  return {
    organizationIds: result.rows.map((row) => row.id),
    organizations: result.rows.map(portableOrganization),
  };
}

/**
 * Resolve the explicit global application selection and exclude Porta's Admin application.
 *
 * @param client - Request-owned PostgreSQL client
 * @param selection - Validated all-or-explicit application choice
 * @returns Portable applications and private identifiers for dependent reads
 * @throws PortabilityError when an explicit slug is missing or selects the Admin application
 */
export async function readApplicationExportSelection(
  client: PoolClient,
  selection: PortabilityApplicationSelection,
): Promise<ResolvedApplicationExportSelection> {
  if (selection.application_slugs.includes('porta-admin')) throw rejectedScope();
  const result = await client.query<ApplicationExportRow>(
    `SELECT id, slug, name, description, status
       FROM applications
      WHERE slug <> 'porta-admin'
        AND ($1::boolean OR slug = ANY($2::text[]))
      ORDER BY slug COLLATE "C"`,
    [selection.all_applications, selection.application_slugs],
  );
  if (!selection.all_applications && result.rows.length !== selection.application_slugs.length) {
    throw rejectedScope();
  }
  return {
    applicationIds: result.rows.map((row) => row.id),
    applications: result.rows.map(({ slug, name, description, status }) => ({
      slug,
      name,
      description,
      status,
    })),
  };
}

/**
 * Read the complete portable authorization graph for selected applications.
 *
 * @param client - Request-owned PostgreSQL client
 * @param applicationIds - Resolved internal application identifiers
 * @returns All portable child collections for those applications
 */
export async function readAuthorizationExportGraph(
  client: PoolClient,
  applicationIds: readonly string[],
): Promise<PortabilityAuthorizationGraph> {
  if (applicationIds.length === 0) {
    return {
      applicationModules: [],
      roles: [],
      permissions: [],
      claimDefinitions: [],
      rolePermissionMappings: [],
    };
  }

  const [modules, roles, permissions, claims, mappings] = await Promise.all([
    client.query<PortabilityApplicationModule>(
      `SELECT a.slug AS application_slug, m.slug, m.name, m.description, m.status
         FROM application_modules m
         JOIN applications a ON a.id = m.application_id
        WHERE m.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", m.slug COLLATE "C"`,
      [applicationIds],
    ),
    client.query<PortabilityRole>(
      `SELECT a.slug AS application_slug, r.slug, r.name, r.description
         FROM roles r
         JOIN applications a ON a.id = r.application_id
        WHERE r.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", BTRIM(r.slug) COLLATE "C"`,
      [applicationIds],
    ),
    client.query<PortabilityPermission>(
      `SELECT a.slug AS application_slug, p.slug, m.slug AS module_slug,
              p.name, p.description
         FROM permissions p
         JOIN applications a ON a.id = p.application_id
         LEFT JOIN application_modules m ON m.id = p.module_id
        WHERE p.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", BTRIM(p.slug) COLLATE "C"`,
      [applicationIds],
    ),
    client.query<PortabilityClaimDefinition>(
      `SELECT a.slug AS application_slug, c.claim_name, c.claim_type, c.description,
              c.include_in_id_token, c.include_in_access_token, c.include_in_userinfo
         FROM custom_claim_definitions c
         JOIN applications a ON a.id = c.application_id
        WHERE c.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", c.claim_name COLLATE "C"`,
      [applicationIds],
    ),
    client.query<PortabilityRolePermissionMapping>(
      `SELECT a.slug AS application_slug, r.slug AS role_slug,
              ARRAY_AGG(p.slug ORDER BY BTRIM(p.slug) COLLATE "C") AS permission_slugs
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         JOIN applications a ON a.id = r.application_id
        WHERE r.application_id = ANY($1::uuid[])
          AND p.application_id = r.application_id
        GROUP BY a.slug, r.slug
        ORDER BY a.slug COLLATE "C", BTRIM(r.slug) COLLATE "C"`,
      [applicationIds],
    ),
  ]);

  return {
    applicationModules: modules.rows,
    roles: roles.rows,
    permissions: permissions.rows,
    claimDefinitions: claims.rows,
    rolePermissionMappings: mappings.rows,
  };
}
