/**
 * Data import service.
 *
 * Imports configuration data from a JSON manifest with three modes:
 * - merge: skip existing (match by slug), create new
 * - overwrite: update existing, create new
 * - dry-run: show what would change without applying
 *
 * All changes are applied in a single PostgreSQL transaction for atomicity.
 * Entities are processed in 12 phases in dependency order:
 * 1. Organizations (+branding, 2FA), 2. Applications, 3. Clients + secrets,
 * 4. Roles, 5. Permissions, 6. Claim definitions, 7. Role-permission mappings,
 * 8. Application modules, 9. Users, 10. User-role assignments,
 * 11. User claim values, 12. System config overrides.
 *
 * Security: Passwords are pre-hashed by CLI (Argon2id). Never stores plaintext.
 *
 * @module data-import
 * @see 07-import-export-invitation.md
 */

import { z } from 'zod';
import { getPool } from './database.js';
import { logger } from './logger.js';
import { generateClientId, generateSecret, hashSecret, sha256Secret } from '../clients/crypto.js';

// ============================================================================
// Types
// ============================================================================

export type ImportMode = 'merge' | 'overwrite' | 'dry-run';

/** A single entity operation result */
export interface ImportEntityResult {
  type: string;
  slug: string;
  name: string;
  changes?: string[];
}

/** A skipped entity with reason */
export interface ImportSkippedResult {
  type: string;
  slug: string;
  reason: string;
}

/** An import error for a specific entity */
export interface ImportErrorResult {
  type: string;
  slug: string;
  error: string;
}

/** Client credentials generated during import (shown once, never stored in plaintext) */
export interface ImportClientCredentials {
  clientName: string;
  clientId: string;
  clientType: 'confidential' | 'public';
  /** Raw secret — only present on create for confidential clients */
  secretPlaintext?: string;
  /** DB row ID of the generated secret */
  secretId?: string;
  /** Optional label for the secret (Phase 2) */
  secretLabel?: string;
  /** Optional expiry for the secret (Phase 2) */
  secretExpiresAt?: string;
}

/** Full import result */
export interface ImportResult {
  mode: ImportMode;
  created: ImportEntityResult[];
  updated: ImportEntityResult[];
  skipped: ImportSkippedResult[];
  errors: ImportErrorResult[];
  /** Credentials for all processed clients (created, skipped, updated, dry-run) */
  credentials: ImportClientCredentials[];
}

// ============================================================================
// Manifest schema — validates the import payload structure
// ============================================================================

/** Current manifest version */
const MANIFEST_VERSION = '1.0';

const organizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  default_login_methods: z.array(z.string()).optional(),
  default_locale: z.string().max(10).optional().nullable(),
  // Phase 3: org-level fields
  two_factor_policy: z.enum(['optional', 'required_email', 'required_totp', 'required_any']).optional(),
  branding_primary_color: z.string().max(20).optional(),
  branding_company_name: z.string().max(255).optional(),
  branding_custom_css: z.string().max(10000).optional(),
  branding_logo_url: z.string().max(2048).optional(),
  branding_favicon_url: z.string().max(2048).optional(),
});

const applicationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  organization_slug: z.string().min(1),
  description: z.string().max(1000).optional().nullable(),
});

const clientSchema = z.object({
  client_name: z.string().min(1).max(255),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
  client_type: z.enum(['confidential', 'public']),
  application_type: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  redirect_uris: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
  login_methods: z.array(z.string()).optional().nullable(),
  token_endpoint_auth_method: z.string().optional(),
  // Phase 2: additional OIDC client fields matching the DB schema
  post_logout_redirect_uris: z.array(z.string()).optional(),
  allowed_origins: z.array(z.string()).optional(),
  require_pkce: z.boolean().optional(),
  // Phase 2: secret configuration — flattened from nested YAML secret block
  secret_label: z.string().max(255).optional().nullable(),
  secret_expires_at: z.string().optional().nullable(),
});

const roleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
  description: z.string().max(1000).optional().nullable(),
});

const permissionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
  description: z.string().max(1000).optional().nullable(),
});

const claimDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
  claim_type: z.enum(['string', 'number', 'boolean', 'json']),
  description: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for role-permission mappings.
 * Links roles to permissions after both are created during import.
 * Uses slug-based references resolved against the appMap.
 */
const rolePermissionMappingSchema = z.object({
  role_slug: z.string().min(1),
  permission_slugs: z.array(z.string().min(1)),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
});

export type RolePermissionMappingInput = z.infer<typeof rolePermissionMappingSchema>;

/** Phase 3: User schema (flat manifest format) */
const userSchema = z.object({
  email: z.string().min(1).email(),
  organization_slug: z.string().min(1),
  given_name: z.string().max(255).optional(),
  family_name: z.string().max(255).optional(),
  locale: z.string().max(10).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  email_verified: z.boolean().optional(),
  password_hash: z.string().optional(),
});

/** Phase 3: Application module schema */
const applicationModuleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  application_slug: z.string().min(1),
  organization_slug: z.string().min(1),
  description: z.string().max(1000).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/** Phase 3: User-role assignment schema */
const userRoleAssignmentSchema = z.object({
  email: z.string().min(1).email(),
  organization_slug: z.string().min(1),
  application_slug: z.string().min(1),
  role_slug: z.string().min(1),
});

/** Phase 3: User claim value schema */
const userClaimValueSchema = z.object({
  email: z.string().min(1).email(),
  organization_slug: z.string().min(1),
  application_slug: z.string().min(1),
  claim_slug: z.string().min(1),
  value: z.unknown(),
});

/** The full import manifest schema */
export const importManifestSchema = z.object({
  version: z.string(),
  exportedAt: z.string().optional(),
  organizations: z.array(organizationSchema).optional().default([]),
  applications: z.array(applicationSchema).optional().default([]),
  clients: z.array(clientSchema).optional().default([]),
  roles: z.array(roleSchema).optional().default([]),
  permissions: z.array(permissionSchema).optional().default([]),
  claim_definitions: z.array(claimDefinitionSchema).optional().default([]),
  // Phase 7: Role-permission mappings — applied after roles + permissions are created
  role_permission_mappings: z.array(rolePermissionMappingSchema).optional().default([]),
  // Phase 8: System config overrides — only updates existing keys
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  // Phase 3: Users, modules, assignments
  users: z.array(userSchema).optional().default([]),
  application_modules: z.array(applicationModuleSchema).optional().default([]),
  user_role_assignments: z.array(userRoleAssignmentSchema).optional().default([]),
  user_claim_values: z.array(userClaimValueSchema).optional().default([]),
});

export type ImportManifest = z.infer<typeof importManifestSchema>;

// ============================================================================
// Import service
// ============================================================================

/**
 * Import configuration from a JSON manifest.
 *
 * Processes entities in dependency order within a single transaction:
 * organizations → applications → clients → roles → permissions → claims.
 *
 * @param manifest - The validated import manifest
 * @param mode - Import mode: merge, overwrite, or dry-run
 * @param actorId - ID of the admin performing the import (for audit log)
 * @returns Import result with created/updated/skipped/error counts
 * @throws Error if manifest version is incompatible
 */
export async function importData(
  manifest: ImportManifest,
  mode: ImportMode,
  actorId?: string,
): Promise<ImportResult> {
  // Validate manifest version
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported manifest version: ${manifest.version}. Expected: ${MANIFEST_VERSION}`,
    );
  }

  const result: ImportResult = {
    mode,
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    credentials: [],
  };

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Slug-to-ID maps built during import for resolving foreign key references.
    // Populated as entities are created/matched, used by dependent entities.
    const orgMap = new Map<string, string>();   // org slug → org ID
    const appMap = new Map<string, string>();   // "orgSlug:appSlug" → app ID

    // Phase 1: Organizations — no dependencies
    for (const org of manifest.organizations ?? []) {
      await processOrganization(client, org, mode, result, orgMap);
    }

    // Phase 2: Applications — depend on organizations
    for (const app of manifest.applications ?? []) {
      await processApplication(client, app, mode, result, appMap);
    }

    // Phase 3: Clients — depend on applications
    for (const clientDef of manifest.clients ?? []) {
      await processClient(client, clientDef, mode, result, orgMap, appMap);
    }

    // Phase 4: Roles — depend on applications
    for (const role of manifest.roles ?? []) {
      await processRole(client, role, mode, result, orgMap, appMap);
    }

    // Phase 5: Permissions — depend on applications
    for (const perm of manifest.permissions ?? []) {
      await processPermission(client, perm, mode, result, orgMap, appMap);
    }

    // Phase 6: Claim definitions — depend on applications
    for (const claim of manifest.claim_definitions ?? []) {
      await processClaimDefinition(client, claim, mode, result, orgMap, appMap);
    }

    // Phase 7: Role-permission mappings — depend on roles + permissions being created
    for (const mapping of manifest.role_permission_mappings ?? []) {
      await processRolePermissionMapping(client, mapping, mode, result, orgMap, appMap);
    }

    // Phase 8: Application modules — depend on applications
    for (const mod of manifest.application_modules ?? []) {
      await processApplicationModule(client, mod, mode, result, orgMap, appMap);
    }

    // Phase 9: Users — depend on organizations
    const userMap = new Map<string, string>(); // "orgSlug:email" → user ID
    for (const user of manifest.users ?? []) {
      await processUser(client, user, mode, result, orgMap, userMap);
    }

    // Phase 10: User-role assignments — depend on users + roles
    for (const assignment of manifest.user_role_assignments ?? []) {
      await processUserRoleAssignment(client, assignment, mode, result, orgMap, appMap, userMap);
    }

    // Phase 11: User claim values — depend on users + claim definitions
    for (const claimValue of manifest.user_claim_values ?? []) {
      await processUserClaimValue(client, claimValue, mode, result, orgMap, appMap, userMap);
    }

    // Phase 12: System config overrides — only updates existing keys
    for (const [key, value] of Object.entries(manifest.config ?? {})) {
      await processConfigOverride(client, key, value, mode, result);
    }

    // Dry-run: rollback (no actual changes)
    if (mode === 'dry-run') {
      await client.query('ROLLBACK');
    } else {
      // Write audit log entry for the import
      if (actorId) {
        await client.query(
          `INSERT INTO audit_log (event_type, event_category, actor_id, metadata)
           VALUES ($1, $2, $3, $4)`,
          [
            'admin.import',
            'admin',
            actorId,
            JSON.stringify({
              mode,
              created: result.created.length,
              updated: result.updated.length,
              skipped: result.skipped.length,
              errors: result.errors.length,
            }),
          ],
        );
      }
      await client.query('COMMIT');
    }

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, mode }, 'Import transaction failed');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// Entity processors
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Process a single organization from the manifest.
 * Looks up by slug; creates, updates, or skips based on mode.
 */
async function processOrganization(
  client: any,
  org: z.infer<typeof organizationSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
): Promise<void> {
  try {
    const { rows: existing } = await client.query(
      'SELECT id FROM organizations WHERE slug = $1',
      [org.slug],
    );

    if (existing.length > 0) {
      orgMap.set(org.slug, existing[0].id);

      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'organization', slug: org.slug, reason: 'Already exists (merge mode)' });
        return;
      }

      // Overwrite mode — update (COALESCE preserves DB default when not specified)
      await client.query(
        `UPDATE organizations SET name = $1, default_locale = $2,
         default_login_methods = COALESCE($3, default_login_methods),
         updated_at = NOW() WHERE slug = $4`,
        [org.name, org.default_locale ?? null, org.default_login_methods ?? null, org.slug],
      );
      result.updated.push({
        type: 'organization', slug: org.slug, name: org.name,
        changes: ['name', 'default_locale', 'default_login_methods'].filter(Boolean),
      });
    } else {
      // Create new organization
      if (mode === 'dry-run') {
        result.created.push({ type: 'organization', slug: org.slug, name: org.name });
        return;
      }

      // Build INSERT dynamically: omit default_login_methods when not specified
      // so the DB NOT NULL DEFAULT '{password,magic_link}' applies
      const columns = ['name', 'slug', 'default_locale', 'status'];
      const values: (string | string[] | null)[] = [org.name, org.slug, org.default_locale ?? null, 'active'];
      if (org.default_login_methods) {
        columns.splice(3, 0, 'default_login_methods');
        values.splice(3, 0, org.default_login_methods);
      }
      // Phase 3: Branding + 2FA policy columns
      if (org.two_factor_policy) {
        columns.push('two_factor_policy');
        values.push(org.two_factor_policy);
      }
      if (org.branding_primary_color) {
        columns.push('branding_primary_color');
        values.push(org.branding_primary_color);
      }
      if (org.branding_company_name) {
        columns.push('branding_company_name');
        values.push(org.branding_company_name);
      }
      if (org.branding_custom_css) {
        columns.push('branding_custom_css');
        values.push(org.branding_custom_css);
      }
      if (org.branding_logo_url) {
        columns.push('branding_logo_url');
        values.push(org.branding_logo_url);
      }
      if (org.branding_favicon_url) {
        columns.push('branding_favicon_url');
        values.push(org.branding_favicon_url);
      }
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO organizations (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values,
      );
      orgMap.set(org.slug, rows[0].id);
      result.created.push({ type: 'organization', slug: org.slug, name: org.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'organization', slug: org.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single application from the manifest.
 * Applications are global (no org FK); matched by slug.
 */
async function processApplication(
  client: any,
  app: z.infer<typeof applicationSchema>,
  mode: ImportMode,
  result: ImportResult,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const { rows: existing } = await client.query(
      'SELECT id FROM applications WHERE slug = $1',
      [app.slug],
    );

    const mapKey = `${app.organization_slug}:${app.slug}`;

    if (existing.length > 0) {
      appMap.set(mapKey, existing[0].id);

      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'application', slug: app.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE applications SET name = $1, description = $2, updated_at = NOW()
         WHERE id = $3`,
        [app.name, app.description ?? null, existing[0].id],
      );
      result.updated.push({
        type: 'application', slug: app.slug, name: app.name,
        changes: ['name', 'description'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'application', slug: app.slug, name: app.name });
        return;
      }

      const { rows } = await client.query(
        `INSERT INTO applications (name, slug, description, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [app.name, app.slug, app.description ?? null],
      );
      appMap.set(mapKey, rows[0].id);
      result.created.push({ type: 'application', slug: app.slug, name: app.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'application', slug: app.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single client from the manifest.
 * Clients are matched by client_name within the application scope.
 */
async function processClient(
  client: any,
  clientDef: z.infer<typeof clientSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const orgId = await resolveOrgId(client, clientDef.organization_slug, orgMap);
    if (!orgId) {
      result.errors.push({
        type: 'client', slug: clientDef.client_name,
        error: `Parent organization '${clientDef.organization_slug}' not found`,
      });
      return;
    }

    const appId = await resolveAppId(
      client, clientDef.organization_slug, clientDef.application_slug, orgMap, appMap,
    );
    if (!appId) {
      result.errors.push({
        type: 'client', slug: clientDef.client_name,
        error: `Parent application '${clientDef.application_slug}' not found`,
      });
      return;
    }

    // Fetch client_id + client_type for credential reporting on skip/update paths
    const { rows: existing } = await client.query(
      'SELECT id, client_id, client_type FROM clients WHERE client_name = $1 AND application_id = $2',
      [clientDef.client_name, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'client', slug: clientDef.client_name, reason: 'Already exists' });
        // Report existing credentials for skipped clients (no secret — already issued)
        result.credentials.push({
          clientName: clientDef.client_name,
          clientId: existing[0].client_id,
          clientType: existing[0].client_type,
        });
        return;
      }

      // Derive token_endpoint_auth_method from client_type if not explicitly set
      const updateAuthMethod = clientDef.token_endpoint_auth_method
        ?? (clientDef.client_type === 'public' ? 'none' : 'client_secret_post');

      await client.query(
        `UPDATE clients SET client_type = $1, application_type = $2, grant_types = $3, redirect_uris = $4,
         response_types = $5, scope = $6, login_methods = $7, token_endpoint_auth_method = $8,
         post_logout_redirect_uris = $9, allowed_origins = $10, require_pkce = $11,
         updated_at = NOW() WHERE id = $12`,
        [
          clientDef.client_type,
          clientDef.application_type ?? 'web',
          clientDef.grant_types ?? ['authorization_code'],
          clientDef.redirect_uris ?? [],
          clientDef.response_types ?? ['code'],
          clientDef.scope ?? 'openid',
          clientDef.login_methods ?? null,
          updateAuthMethod,
          clientDef.post_logout_redirect_uris ?? [],
          clientDef.allowed_origins ?? [],
          clientDef.require_pkce ?? true,
          existing[0].id,
        ],
      );
      result.updated.push({
        type: 'client', slug: clientDef.client_name, name: clientDef.client_name,
        changes: ['client_type', 'application_type', 'grant_types', 'redirect_uris', 'login_methods',
          'token_endpoint_auth_method', 'post_logout_redirect_uris', 'allowed_origins', 'require_pkce'],
      });
      // Report existing credentials for updated clients (no secret regeneration in overwrite)
      result.credentials.push({
        clientName: clientDef.client_name,
        clientId: existing[0].client_id,
        clientType: existing[0].client_type,
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'client', slug: clientDef.client_name, name: clientDef.client_name });
        // Dry-run credential indicators — show what would be generated
        result.credentials.push({
          clientName: clientDef.client_name,
          clientId: '(would be generated)',
          clientType: clientDef.client_type,
          ...(clientDef.client_type === 'confidential'
            ? { secretPlaintext: '(would be generated)' }
            : {}),
        });
        return;
      }

      // Generate base64url client_id using the standard crypto utility
      const clientId = generateClientId();

      // Derive token_endpoint_auth_method from client_type if not explicitly set
      const authMethod = clientDef.token_endpoint_auth_method
        ?? (clientDef.client_type === 'public' ? 'none' : 'client_secret_post');

      const { rows: insertedRows } = await client.query(
        `INSERT INTO clients (client_id, client_name, organization_id, application_id, client_type,
         application_type, grant_types, redirect_uris, response_types, scope, login_methods,
         token_endpoint_auth_method, post_logout_redirect_uris, allowed_origins, require_pkce, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active') RETURNING id`,
        [
          clientId, clientDef.client_name, orgId, appId,
          clientDef.client_type,
          clientDef.application_type ?? 'web',
          clientDef.grant_types ?? ['authorization_code'],
          clientDef.redirect_uris ?? [],
          clientDef.response_types ?? ['code'],
          clientDef.scope ?? 'openid',
          clientDef.login_methods ?? null,
          authMethod,
          clientDef.post_logout_redirect_uris ?? [],
          clientDef.allowed_origins ?? [],
          clientDef.require_pkce ?? true,
        ],
      );
      const clientDbId = insertedRows[0].id;

      // Generate secret for confidential clients within the same transaction
      let secretPlaintext: string | undefined;
      let secretId: string | undefined;

      if (clientDef.client_type === 'confidential') {
        const plaintext = generateSecret();
        const secretHash = await hashSecret(plaintext);
        const secretSha256 = sha256Secret(plaintext);

        const secretResult = await client.query(
          `INSERT INTO client_secrets (client_id, secret_hash, secret_sha256, label, expires_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [clientDbId, secretHash, secretSha256,
           clientDef.secret_label ?? null,
           clientDef.secret_expires_at ?? null],
        );
        secretPlaintext = plaintext;
        secretId = secretResult.rows[0].id;
      }

      result.created.push({ type: 'client', slug: clientDef.client_name, name: clientDef.client_name });
      // Report credentials — secret only present for newly created confidential clients
      result.credentials.push({
        clientName: clientDef.client_name,
        clientId,
        clientType: clientDef.client_type,
        ...(secretPlaintext ? { secretPlaintext } : {}),
        ...(secretId ? { secretId } : {}),
        ...(clientDef.secret_label ? { secretLabel: clientDef.secret_label } : {}),
        ...(clientDef.secret_expires_at ? { secretExpiresAt: clientDef.secret_expires_at } : {}),
      });
    }
  } catch (err) {
    result.errors.push({
      type: 'client', slug: clientDef.client_name,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single role from the manifest.
 */
async function processRole(
  client: any,
  role: z.infer<typeof roleSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const appId = await resolveAppId(
      client, role.organization_slug, role.application_slug, orgMap, appMap,
    );
    if (!appId) {
      result.errors.push({
        type: 'role', slug: role.slug,
        error: `Parent application '${role.application_slug}' not found`,
      });
      return;
    }

    const { rows: existing } = await client.query(
      'SELECT id FROM roles WHERE slug = $1 AND application_id = $2',
      [role.slug, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'role', slug: role.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE roles SET name = $1, description = $2, updated_at = NOW() WHERE id = $3`,
        [role.name, role.description ?? null, existing[0].id],
      );
      result.updated.push({ type: 'role', slug: role.slug, name: role.name, changes: ['name', 'description'] });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'role', slug: role.slug, name: role.name });
        return;
      }

      await client.query(
        `INSERT INTO roles (name, slug, application_id, description)
         VALUES ($1, $2, $3, $4)`,
        [role.name, role.slug, appId, role.description ?? null],
      );
      result.created.push({ type: 'role', slug: role.slug, name: role.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'role', slug: role.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single permission from the manifest.
 */
async function processPermission(
  client: any,
  perm: z.infer<typeof permissionSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const appId = await resolveAppId(
      client, perm.organization_slug, perm.application_slug, orgMap, appMap,
    );
    if (!appId) {
      result.errors.push({
        type: 'permission', slug: perm.slug,
        error: `Parent application '${perm.application_slug}' not found`,
      });
      return;
    }

    const { rows: existing } = await client.query(
      'SELECT id FROM permissions WHERE slug = $1 AND application_id = $2',
      [perm.slug, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'permission', slug: perm.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE permissions SET name = $1, description = $2 WHERE id = $3`,
        [perm.name, perm.description ?? null, existing[0].id],
      );
      result.updated.push({ type: 'permission', slug: perm.slug, name: perm.name, changes: ['name', 'description'] });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'permission', slug: perm.slug, name: perm.name });
        return;
      }

      await client.query(
        `INSERT INTO permissions (name, slug, application_id, description)
         VALUES ($1, $2, $3, $4)`,
        [perm.name, perm.slug, appId, perm.description ?? null],
      );
      result.created.push({ type: 'permission', slug: perm.slug, name: perm.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'permission', slug: perm.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single claim definition from the manifest.
 */
async function processClaimDefinition(
  client: any,
  claim: z.infer<typeof claimDefinitionSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const appId = await resolveAppId(
      client, claim.organization_slug, claim.application_slug, orgMap, appMap,
    );
    if (!appId) {
      result.errors.push({
        type: 'claim_definition', slug: claim.slug,
        error: `Parent application '${claim.application_slug}' not found`,
      });
      return;
    }

    // Table is custom_claim_definitions with claim_name column (unique per app)
    // The manifest slug maps to claim_name in the DB
    const { rows: existing } = await client.query(
      'SELECT id FROM custom_claim_definitions WHERE claim_name = $1 AND application_id = $2',
      [claim.slug, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'claim_definition', slug: claim.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE custom_claim_definitions SET description = $1, claim_type = $2,
         updated_at = NOW() WHERE id = $3`,
        [claim.description ?? null, claim.claim_type, existing[0].id],
      );
      result.updated.push({
        type: 'claim_definition', slug: claim.slug, name: claim.name,
        changes: ['description', 'claim_type'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'claim_definition', slug: claim.slug, name: claim.name });
        return;
      }

      await client.query(
        `INSERT INTO custom_claim_definitions (claim_name, application_id, claim_type, description)
         VALUES ($1, $2, $3, $4)`,
        [claim.slug, appId, claim.claim_type, claim.description ?? null],
      );
      result.created.push({ type: 'claim_definition', slug: claim.slug, name: claim.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'claim_definition', slug: claim.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ============================================================================
// Phase 7 & 8 processors (role-permission mappings + system config)
// ============================================================================

/**
 * Process a single role-permission mapping from the manifest.
 *
 * Resolves the role and each permission by slug within the application,
 * then inserts the mapping rows. Uses ON CONFLICT DO NOTHING for
 * idempotent merge-mode behavior.
 *
 * @param client - Database client within the transaction
 * @param mapping - The role-permission mapping definition
 * @param mode - Import mode (merge, overwrite, dry-run)
 * @param result - Accumulator for import results
 * @param _orgMap - Organization slug→ID map (unused but kept for signature consistency)
 * @param appMap - Application "orgSlug:appSlug"→ID map
 */
async function processRolePermissionMapping(
  client: any,
  mapping: RolePermissionMappingInput,
  mode: ImportMode,
  result: ImportResult,
  _orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    // Resolve application ID from the composite key
    const appKey = `${mapping.organization_slug}:${mapping.application_slug}`;
    const appId = appMap.get(appKey);

    if (!appId) {
      result.errors.push({
        type: 'role_permission_mapping',
        slug: mapping.role_slug,
        error: `Application not found: ${appKey}`,
      });
      return;
    }

    // Find role by slug within the application
    const roleResult = await client.query(
      'SELECT id FROM roles WHERE slug = $1 AND application_id = $2',
      [mapping.role_slug, appId],
    );
    if (roleResult.rowCount === 0) {
      result.errors.push({
        type: 'role_permission_mapping',
        slug: mapping.role_slug,
        error: `Role not found: ${mapping.role_slug}`,
      });
      return;
    }
    const roleId = roleResult.rows[0].id;

    // Process each permission in the mapping
    for (const permSlug of mapping.permission_slugs) {
      const permResult = await client.query(
        'SELECT id FROM permissions WHERE slug = $1 AND application_id = $2',
        [permSlug, appId],
      );
      if (permResult.rowCount === 0) {
        result.errors.push({
          type: 'role_permission_mapping',
          slug: `${mapping.role_slug}→${permSlug}`,
          error: `Permission not found: ${permSlug}`,
        });
        continue;
      }
      const permId = permResult.rows[0].id;

      if (mode === 'dry-run') {
        result.created.push({
          type: 'role_permission_mapping',
          slug: `${mapping.role_slug}→${permSlug}`,
          name: `${mapping.role_slug} → ${permSlug}`,
        });
        continue;
      }

      // Insert mapping with ON CONFLICT DO NOTHING for idempotent merge behavior
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, permId],
      );

      result.created.push({
        type: 'role_permission_mapping',
        slug: `${mapping.role_slug}→${permSlug}`,
        name: `${mapping.role_slug} → ${permSlug}`,
      });
    }
  } catch (err) {
    result.errors.push({
      type: 'role_permission_mapping',
      slug: mapping.role_slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single system config override from the manifest.
 *
 * Only updates existing config keys — does not create new ones.
 * This prevents typos from silently creating invalid config entries.
 * Only keys seeded by migration 011 (or added by future migrations) can be set.
 *
 * @param client - Database client within the transaction
 * @param key - Config key to update
 * @param value - New value (string, number, or boolean — stored as JSONB)
 * @param mode - Import mode (merge, overwrite, dry-run)
 * @param result - Accumulator for import results
 */
async function processConfigOverride(
  client: any,
  key: string,
  value: string | number | boolean,
  mode: ImportMode,
  result: ImportResult,
): Promise<void> {
  try {
    // Check if config key exists — we only update, never create
    const existing = await client.query(
      'SELECT id FROM system_config WHERE key = $1',
      [key],
    );

    if (existing.rowCount === 0) {
      result.errors.push({
        type: 'config',
        slug: key,
        error: `Config key not found: ${key} (only existing keys can be updated)`,
      });
      return;
    }

    if (mode === 'dry-run') {
      result.updated.push({
        type: 'config',
        slug: key,
        name: key,
        changes: [`value → ${String(value)}`],
      });
      return;
    }

    // Update existing config value — cast to JSONB via text
    await client.query(
      `UPDATE system_config SET value = to_jsonb($1::text), updated_at = NOW() WHERE key = $2`,
      [String(value), key],
    );

    result.updated.push({
      type: 'config',
      slug: key,
      name: key,
      changes: [`value → ${String(value)}`],
    });
  } catch (err) {
    result.errors.push({
      type: 'config',
      slug: key,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ============================================================================
// Phase 3 processors (users, modules, assignments)
// ============================================================================

/**
 * Process a single user from the manifest.
 * Users are matched by email + org. Password hash is pre-computed by CLI.
 */
async function processUser(
  client: any,
  user: z.infer<typeof userSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  userMap: Map<string, string>,
): Promise<void> {
  try {
    const orgId = await resolveOrgId(client, user.organization_slug, orgMap);
    if (!orgId) {
      result.errors.push({
        type: 'user', slug: user.email,
        error: `Parent organization '${user.organization_slug}' not found`,
      });
      return;
    }

    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1 AND organization_id = $2',
      [user.email, orgId],
    );

    const userMapKey = `${user.organization_slug}:${user.email}`;

    if (existing.length > 0) {
      userMap.set(userMapKey, existing[0].id);

      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'user', slug: user.email, reason: 'Already exists' });
        return;
      }

      // Overwrite mode — update user fields
      await client.query(
        `UPDATE users SET given_name = $1, family_name = $2, locale = $3,
         email_verified = COALESCE($4, email_verified),
         status = COALESCE($5, status),
         updated_at = NOW() WHERE id = $6`,
        [
          user.given_name ?? null, user.family_name ?? null,
          user.locale ?? null, user.email_verified ?? null,
          user.status ?? null, existing[0].id,
        ],
      );
      result.updated.push({
        type: 'user', slug: user.email, name: user.email,
        changes: ['given_name', 'family_name', 'locale', 'email_verified', 'status'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'user', slug: user.email, name: user.email });
        return;
      }

      const { rows } = await client.query(
        `INSERT INTO users (email, organization_id, given_name, family_name, locale,
         email_verified, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          user.email, orgId,
          user.given_name ?? null, user.family_name ?? null,
          user.locale ?? null, user.email_verified ?? false,
          user.password_hash ?? null, user.status ?? 'active',
        ],
      );
      userMap.set(userMapKey, rows[0].id);
      result.created.push({ type: 'user', slug: user.email, name: user.email });
    }
  } catch (err) {
    result.errors.push({
      type: 'user', slug: user.email,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a single application module from the manifest.
 * Matched by slug + application.
 */
async function processApplicationModule(
  client: any,
  mod: z.infer<typeof applicationModuleSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<void> {
  try {
    const appId = await resolveAppId(
      client, mod.organization_slug, mod.application_slug, orgMap, appMap,
    );
    if (!appId) {
      result.errors.push({
        type: 'application_module', slug: mod.slug,
        error: `Parent application '${mod.application_slug}' not found`,
      });
      return;
    }

    const { rows: existing } = await client.query(
      'SELECT id FROM application_modules WHERE slug = $1 AND application_id = $2',
      [mod.slug, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'application_module', slug: mod.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE application_modules SET name = $1, description = $2, status = COALESCE($3, status),
         updated_at = NOW() WHERE id = $4`,
        [mod.name, mod.description ?? null, mod.status ?? null, existing[0].id],
      );
      result.updated.push({
        type: 'application_module', slug: mod.slug, name: mod.name,
        changes: ['name', 'description', 'status'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'application_module', slug: mod.slug, name: mod.name });
        return;
      }

      await client.query(
        `INSERT INTO application_modules (name, slug, application_id, description, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [mod.name, mod.slug, appId, mod.description ?? null, mod.status ?? 'active'],
      );
      result.created.push({ type: 'application_module', slug: mod.slug, name: mod.name });
    }
  } catch (err) {
    result.errors.push({
      type: 'application_module', slug: mod.slug,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a user-role assignment. Resolves user + role by slug/email.
 * Uses ON CONFLICT DO NOTHING for idempotent behavior.
 */
async function processUserRoleAssignment(
  client: any,
  assignment: z.infer<typeof userRoleAssignmentSchema>,
  mode: ImportMode,
  result: ImportResult,
  _orgMap: Map<string, string>,
  appMap: Map<string, string>,
  userMap: Map<string, string>,
): Promise<void> {
  try {
    const userMapKey = `${assignment.organization_slug}:${assignment.email}`;
    const userId = userMap.get(userMapKey);
    if (!userId) {
      result.errors.push({
        type: 'user_role_assignment',
        slug: `${assignment.email}→${assignment.role_slug}`,
        error: `User not found: ${assignment.email} in org ${assignment.organization_slug}`,
      });
      return;
    }

    const appKey = `${assignment.organization_slug}:${assignment.application_slug}`;
    const appId = appMap.get(appKey);
    if (!appId) {
      result.errors.push({
        type: 'user_role_assignment',
        slug: `${assignment.email}→${assignment.role_slug}`,
        error: `Application not found: ${assignment.application_slug}`,
      });
      return;
    }

    const { rows: roleRows } = await client.query(
      'SELECT id FROM roles WHERE slug = $1 AND application_id = $2',
      [assignment.role_slug, appId],
    );
    if (roleRows.length === 0) {
      result.errors.push({
        type: 'user_role_assignment',
        slug: `${assignment.email}→${assignment.role_slug}`,
        error: `Role not found: ${assignment.role_slug}`,
      });
      return;
    }

    if (mode === 'dry-run') {
      result.created.push({
        type: 'user_role_assignment',
        slug: `${assignment.email}→${assignment.role_slug}`,
        name: `${assignment.email} → ${assignment.role_slug}`,
      });
      return;
    }

    await client.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleRows[0].id, null],
    );
    result.created.push({
      type: 'user_role_assignment',
      slug: `${assignment.email}→${assignment.role_slug}`,
      name: `${assignment.email} → ${assignment.role_slug}`,
    });
  } catch (err) {
    result.errors.push({
      type: 'user_role_assignment',
      slug: `${assignment.email}→${assignment.role_slug}`,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Process a user claim value. Resolves user + claim definition by slug.
 * Uses ON CONFLICT DO UPDATE for upsert behavior.
 */
async function processUserClaimValue(
  client: any,
  claimValue: z.infer<typeof userClaimValueSchema>,
  mode: ImportMode,
  result: ImportResult,
  _orgMap: Map<string, string>,
  appMap: Map<string, string>,
  userMap: Map<string, string>,
): Promise<void> {
  try {
    const userMapKey = `${claimValue.organization_slug}:${claimValue.email}`;
    const userId = userMap.get(userMapKey);
    if (!userId) {
      result.errors.push({
        type: 'user_claim_value',
        slug: `${claimValue.email}:${claimValue.claim_slug}`,
        error: `User not found: ${claimValue.email} in org ${claimValue.organization_slug}`,
      });
      return;
    }

    const appKey = `${claimValue.organization_slug}:${claimValue.application_slug}`;
    const appId = appMap.get(appKey);
    if (!appId) {
      result.errors.push({
        type: 'user_claim_value',
        slug: `${claimValue.email}:${claimValue.claim_slug}`,
        error: `Application not found: ${claimValue.application_slug}`,
      });
      return;
    }

    const { rows: claimRows } = await client.query(
      'SELECT id, claim_type FROM custom_claim_definitions WHERE claim_name = $1 AND application_id = $2',
      [claimValue.claim_slug, appId],
    );
    if (claimRows.length === 0) {
      result.errors.push({
        type: 'user_claim_value',
        slug: `${claimValue.email}:${claimValue.claim_slug}`,
        error: `Claim definition not found: ${claimValue.claim_slug}`,
      });
      return;
    }

    if (mode === 'dry-run') {
      result.created.push({
        type: 'user_claim_value',
        slug: `${claimValue.email}:${claimValue.claim_slug}`,
        name: `${claimValue.email} → ${claimValue.claim_slug}`,
      });
      return;
    }

    await client.query(
      `INSERT INTO custom_claim_values (user_id, claim_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, claim_id) DO UPDATE SET value = $3`,
      [userId, claimRows[0].id, JSON.stringify(claimValue.value)],
    );
    result.created.push({
      type: 'user_claim_value',
      slug: `${claimValue.email}:${claimValue.claim_slug}`,
      name: `${claimValue.email} → ${claimValue.claim_slug}`,
    });
  } catch (err) {
    result.errors.push({
      type: 'user_claim_value',
      slug: `${claimValue.email}:${claimValue.claim_slug}`,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve an organization slug to its ID.
 * First checks the in-memory map (for entities created during this import),
 * then falls back to a database lookup (for pre-existing entities).
 */
async function resolveOrgId(
  client: any,
  slug: string,
  orgMap: Map<string, string>,
): Promise<string | null> {
  if (orgMap.has(slug)) return orgMap.get(slug)!;

  const { rows } = await client.query(
    'SELECT id FROM organizations WHERE slug = $1',
    [slug],
  );
  if (rows.length > 0) {
    orgMap.set(slug, rows[0].id);
    return rows[0].id;
  }
  return null;
}

/**
 * Resolve an application by org slug + app slug to its ID.
 */
async function resolveAppId(
  client: any,
  orgSlug: string,
  appSlug: string,
  orgMap: Map<string, string>,
  appMap: Map<string, string>,
): Promise<string | null> {
  const mapKey = `${orgSlug}:${appSlug}`;
  if (appMap.has(mapKey)) return appMap.get(mapKey)!;

  const orgId = await resolveOrgId(client, orgSlug, orgMap);
  if (!orgId) return null;

  const { rows } = await client.query(
    'SELECT id FROM applications WHERE slug = $1',
    [appSlug],
  );
  if (rows.length > 0) {
    appMap.set(mapKey, rows[0].id);
    return rows[0].id;
  }
  return null;
}
