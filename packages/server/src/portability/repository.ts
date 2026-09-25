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
  PortabilityUser,
  PortabilityUserClaimValue,
  PortabilityUserRoleAssignment,
  PortabilityClient,
  PortabilityJsonValue,
} from './types.js';
import { PortabilityError } from './types.js';
import { validateImage, type AssetType } from '../lib/image-validator.js';

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

/** Stored branding bytes associated with one portable organization. */
interface BrandingAssetExportRow {
  readonly organization_slug: string;
  readonly asset_type: AssetType;
  readonly content_type: string;
  readonly data: Buffer;
}

/** User database fields that are explicitly portable. */
interface UserExportRow {
  readonly organization_slug: string;
  readonly email: string;
  readonly email_verified: boolean;
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
  readonly status: 'active' | 'inactive' | 'locked';
}

/** Custom-claim value row whose JSON value was decoded by PostgreSQL. */
interface UserClaimValueExportRow {
  readonly organization_slug: string;
  readonly email: string;
  readonly application_slug: string;
  readonly claim_name: string;
  readonly value: PortabilityJsonValue;
}

/** OIDC client database fields that are explicitly portable. */
interface ClientExportRow {
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
  readonly require_consent: boolean;
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

/** Portable users and application-qualified relationship collections. */
export interface PortabilityUserGraph {
  /** Every user in the selected organization scope. */
  readonly users: readonly PortabilityUser[];
  /** Role assignments retained by the application selection. */
  readonly userRoleAssignments: readonly PortabilityUserRoleAssignment[];
  /** Claim values retained by the application selection. */
  readonly userClaimValues: readonly PortabilityUserClaimValue[];
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

/** Convert a user row into the exact portable profile without operational account state. */
function portableUser(row: UserExportRow): PortabilityUser {
  return {
    organization_slug: row.organization_slug,
    email: row.email.toLowerCase(),
    email_verified: row.email_verified,
    given_name: row.given_name,
    family_name: row.family_name,
    middle_name: row.middle_name,
    nickname: row.nickname,
    preferred_username: row.preferred_username,
    profile_url: row.profile_url,
    picture_url: row.picture_url,
    website_url: row.website_url,
    gender: row.gender,
    birthdate: row.birthdate,
    zoneinfo: row.zoneinfo,
    locale: row.locale,
    phone_number: row.phone_number,
    phone_number_verified: row.phone_number_verified,
    address_street: row.address_street,
    address_locality: row.address_locality,
    address_region: row.address_region,
    address_postal_code: row.address_postal_code,
    address_country: row.address_country,
    status: row.status === 'locked' ? 'active' : row.status,
  };
}

/** Compare already-normalized text with stable code-point ordering. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Compare records by each natural-key component in order. */
function compareNaturalKey(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const result = compareText(left[index] ?? '', right[index] ?? '');
    if (result !== 0) return result;
  }
  return 0;
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
    organizations: result.rows
      .map(portableOrganization)
      .sort((left, right) => compareText(left.slug, right.slug)),
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
    applications: result.rows
      .map(({ slug, name, description, status }) => ({
        slug,
        name,
        description,
        status,
      }))
      .sort((left, right) => compareText(left.slug, right.slug)),
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

  const modules = await client.query<PortabilityApplicationModule>(
    `SELECT a.slug AS application_slug, m.slug, m.name, m.description, m.status
         FROM application_modules m
         JOIN applications a ON a.id = m.application_id
        WHERE m.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", m.slug COLLATE "C"`,
    [applicationIds],
  );
  const roles = await client.query<PortabilityRole>(
    `SELECT a.slug AS application_slug, r.slug, r.name, r.description
         FROM roles r
         JOIN applications a ON a.id = r.application_id
        WHERE r.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", BTRIM(r.slug) COLLATE "C"`,
    [applicationIds],
  );
  const permissions = await client.query<PortabilityPermission>(
    `SELECT a.slug AS application_slug, p.slug, m.slug AS module_slug,
              p.name, p.description
         FROM permissions p
         JOIN applications a ON a.id = p.application_id
         LEFT JOIN application_modules m ON m.id = p.module_id
        WHERE p.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", BTRIM(p.slug) COLLATE "C"`,
    [applicationIds],
  );
  const claims = await client.query<PortabilityClaimDefinition>(
    `SELECT a.slug AS application_slug, c.claim_name, c.claim_type, c.description,
              c.include_in_id_token, c.include_in_access_token, c.include_in_userinfo
         FROM custom_claim_definitions c
         JOIN applications a ON a.id = c.application_id
        WHERE c.application_id = ANY($1::uuid[])
        ORDER BY a.slug COLLATE "C", c.claim_name COLLATE "C"`,
    [applicationIds],
  );
  const mappings = await client.query<PortabilityRolePermissionMapping>(
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
  );

  return {
    applicationModules: modules.rows
      .map(({ application_slug, slug, name, description, status }) => ({
        application_slug,
        slug,
        name,
        description,
        status,
      }))
      .sort((left, right) =>
        compareNaturalKey([left.application_slug, left.slug], [right.application_slug, right.slug]),
      ),
    roles: roles.rows
      .map(({ application_slug, slug, name, description }) => ({
        application_slug,
        slug: slug.trim(),
        name,
        description,
      }))
      .sort((left, right) =>
        compareNaturalKey([left.application_slug, left.slug], [right.application_slug, right.slug]),
      ),
    permissions: permissions.rows
      .map(({ application_slug, slug, module_slug, name, description }) => ({
        application_slug,
        slug: slug.trim(),
        module_slug,
        name,
        description,
      }))
      .sort((left, right) =>
        compareNaturalKey([left.application_slug, left.slug], [right.application_slug, right.slug]),
      ),
    claimDefinitions: claims.rows
      .map(
        ({
          application_slug,
          claim_name,
          claim_type,
          description,
          include_in_id_token,
          include_in_access_token,
          include_in_userinfo,
        }) => ({
          application_slug,
          claim_name,
          claim_type,
          description,
          include_in_id_token,
          include_in_access_token,
          include_in_userinfo,
        }),
      )
      .sort((left, right) =>
        compareNaturalKey(
          [left.application_slug, left.claim_name],
          [right.application_slug, right.claim_name],
        ),
      ),
    rolePermissionMappings: mappings.rows
      .map(({ application_slug, role_slug, permission_slugs }) => ({
        application_slug,
        role_slug: role_slug.trim(),
        permission_slugs: permission_slugs.map((slug) => slug.trim()).sort(compareText),
      }))
      .sort((left, right) =>
        compareNaturalKey(
          [left.application_slug, left.role_slug],
          [right.application_slug, right.role_slug],
        ),
      ),
  };
}

/**
 * Attach validated stored branding bytes to portable organization records.
 *
 * @param client - Request-owned PostgreSQL client
 * @param organizations - Portable organizations in the selected scope
 * @param organizationIds - Matching private organization identifiers
 * @returns Organization records with validated logo and favicon content
 * @throws Error when stored bytes no longer satisfy the branding validation boundary
 */
export async function attachOrganizationBrandingAssets(
  client: PoolClient,
  organizations: readonly PortabilityOrganization[],
  organizationIds: readonly string[],
): Promise<readonly PortabilityOrganization[]> {
  if (organizationIds.length === 0) return organizations;
  const assets = await client.query<BrandingAssetExportRow>(
    `SELECT o.slug AS organization_slug, b.asset_type, b.content_type, b.data
       FROM branding_assets b
       JOIN organizations o ON o.id = b.organization_id
      WHERE b.organization_id = ANY($1::uuid[])
      ORDER BY o.slug COLLATE "C", b.asset_type COLLATE "C"`,
    [organizationIds],
  );
  const byOrganization = new Map<string, Partial<Record<AssetType, BrandingAssetExportRow>>>();
  for (const asset of assets.rows) {
    const validation = validateImage(asset.data, asset.content_type, asset.asset_type);
    if (!validation.valid || validation.data === undefined) {
      throw new Error('Stored branding asset is invalid');
    }
    const organizationAssets = byOrganization.get(asset.organization_slug) ?? {};
    organizationAssets[asset.asset_type] = { ...asset, data: validation.data };
    byOrganization.set(asset.organization_slug, organizationAssets);
  }
  return organizations.map((organization) => {
    const organizationAssets = byOrganization.get(organization.slug);
    const logo = organizationAssets?.logo;
    const favicon = organizationAssets?.favicon;
    return {
      ...organization,
      branding: {
        ...organization.branding,
        logo_asset:
          logo === undefined
            ? null
            : { media_type: logo.content_type, content_base64: logo.data.toString('base64') },
        favicon_asset:
          favicon === undefined
            ? null
            : { media_type: favicon.content_type, content_base64: favicon.data.toString('base64') },
      },
    };
  });
}

/**
 * Read every scoped user and only relationships owned by selected applications.
 *
 * @param client - Request-owned PostgreSQL client
 * @param organizationIds - Resolved organization scope identifiers
 * @param applicationIds - Resolved application selection identifiers
 * @returns Portable users, role assignments, and claim values
 */
export async function readUserExportGraph(
  client: PoolClient,
  organizationIds: readonly string[],
  applicationIds: readonly string[],
): Promise<PortabilityUserGraph> {
  if (organizationIds.length === 0) {
    return { users: [], userRoleAssignments: [], userClaimValues: [] };
  }
  const users = await client.query<UserExportRow>(
    `SELECT o.slug AS organization_slug, u.email::text AS email, u.email_verified,
            u.given_name, u.family_name, u.middle_name, u.nickname, u.preferred_username,
            u.profile_url, u.picture_url, u.website_url, u.gender, u.birthdate::text AS birthdate,
            u.zoneinfo, u.locale, u.phone_number, u.phone_number_verified, u.address_street,
            u.address_locality, u.address_region, u.address_postal_code, u.address_country,
            u.status
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.organization_id = ANY($1::uuid[])
      ORDER BY o.slug COLLATE "C", LOWER(u.email::text) COLLATE "C"`,
    [organizationIds],
  );
  const assignments =
    applicationIds.length === 0
      ? { rows: [] }
      : await client.query<PortabilityUserRoleAssignment>(
          `SELECT o.slug AS organization_slug, u.email::text AS email,
                    a.slug AS application_slug, r.slug AS role_slug
               FROM user_roles ur
               JOIN users u ON u.id = ur.user_id
               JOIN organizations o ON o.id = u.organization_id
               JOIN roles r ON r.id = ur.role_id
               JOIN applications a ON a.id = r.application_id
              WHERE u.organization_id = ANY($1::uuid[])
                AND r.application_id = ANY($2::uuid[])
              ORDER BY o.slug COLLATE "C", LOWER(u.email::text) COLLATE "C",
                       a.slug COLLATE "C", BTRIM(r.slug) COLLATE "C"`,
          [organizationIds, applicationIds],
        );
  const claimValues =
    applicationIds.length === 0
      ? { rows: [] }
      : await client.query<UserClaimValueExportRow>(
          `SELECT o.slug AS organization_slug, u.email::text AS email,
                    a.slug AS application_slug, c.claim_name, v.value
               FROM custom_claim_values v
               JOIN users u ON u.id = v.user_id
               JOIN organizations o ON o.id = u.organization_id
               JOIN custom_claim_definitions c ON c.id = v.claim_id
               JOIN applications a ON a.id = c.application_id
              WHERE u.organization_id = ANY($1::uuid[])
                AND c.application_id = ANY($2::uuid[])
              ORDER BY o.slug COLLATE "C", LOWER(u.email::text) COLLATE "C",
                       a.slug COLLATE "C", c.claim_name COLLATE "C"`,
          [organizationIds, applicationIds],
        );
  return {
    users: users.rows
      .map(portableUser)
      .sort((left, right) =>
        compareNaturalKey(
          [left.organization_slug, left.email],
          [right.organization_slug, right.email],
        ),
      ),
    userRoleAssignments: assignments.rows
      .map(({ organization_slug, email, application_slug, role_slug }) => ({
        organization_slug,
        email: email.toLowerCase(),
        application_slug,
        role_slug: role_slug.trim(),
      }))
      .sort((left, right) =>
        compareNaturalKey(
          [left.organization_slug, left.email, left.application_slug, left.role_slug],
          [right.organization_slug, right.email, right.application_slug, right.role_slug],
        ),
      ),
    userClaimValues: claimValues.rows
      .map(({ organization_slug, email, application_slug, claim_name, value }) => ({
        organization_slug,
        email: email.toLowerCase(),
        application_slug,
        claim_name,
        value,
      }))
      .sort((left, right) =>
        compareNaturalKey(
          [left.organization_slug, left.email, left.application_slug, left.claim_name],
          [right.organization_slug, right.email, right.application_slug, right.claim_name],
        ),
      ),
  };
}

/**
 * Read OIDC clients owned by both the selected organization and application scopes.
 *
 * @param client - Request-owned PostgreSQL client
 * @param organizationIds - Resolved organization scope identifiers
 * @param applicationIds - Resolved application selection identifiers
 * @returns Portable clients without credential material
 */
export async function readClientExportRecords(
  client: PoolClient,
  organizationIds: readonly string[],
  applicationIds: readonly string[],
): Promise<readonly PortabilityClient[]> {
  if (organizationIds.length === 0 || applicationIds.length === 0) return [];
  const result = await client.query<ClientExportRow>(
    `SELECT c.client_id, o.slug AS organization_slug, a.slug AS application_slug,
            c.client_name AS name, c.client_type, c.application_type, c.status,
            c.grant_types, c.response_types, c.scope, c.login_methods,
            c.token_endpoint_auth_method, c.redirect_uris,
            COALESCE(c.post_logout_redirect_uris, '{}') AS post_logout_redirect_uris,
            COALESCE(c.allowed_origins, '{}') AS allowed_origins, c.require_pkce,
            c.require_consent
       FROM clients c
       JOIN organizations o ON o.id = c.organization_id
       JOIN applications a ON a.id = c.application_id
      WHERE c.organization_id = ANY($1::uuid[])
        AND c.application_id = ANY($2::uuid[])
      ORDER BY c.client_id COLLATE "C"`,
    [organizationIds, applicationIds],
  );
  return result.rows
    .map(
      ({
        client_id,
        organization_slug,
        application_slug,
        name,
        client_type,
        application_type,
        status,
        grant_types,
        response_types,
        scope,
        login_methods,
        token_endpoint_auth_method,
        redirect_uris,
        post_logout_redirect_uris,
        allowed_origins,
        require_pkce,
        require_consent,
      }) => ({
        client_id,
        organization_slug,
        application_slug,
        name,
        client_type,
        application_type,
        status,
        grant_types,
        response_types,
        scope,
        login_methods,
        token_endpoint_auth_method,
        redirect_uris,
        post_logout_redirect_uris,
        allowed_origins,
        require_pkce,
        require_consent,
      }),
    )
    .sort((left, right) => compareText(left.client_id, right.client_id));
}
