/**
 * Data import service.
 *
 * Imports configuration data from a JSON manifest with three modes:
 * - merge: skip existing (match by slug), create new
 * - overwrite: update existing, create new
 * - dry-run: show what would change without applying
 *
 * All changes are applied in a single PostgreSQL transaction for atomicity.
 * Entities are processed in dependency order to satisfy foreign key constraints.
 *
 * Security: Never imports sensitive data (passwords, secrets, keys).
 *
 * @module data-import
 * @see 07-import-export-invitation.md
 */

import { z } from 'zod';
import { getPool } from './database.js';
import { logger } from './logger.js';

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

/** Full import result */
export interface ImportResult {
  mode: ImportMode;
  created: ImportEntityResult[];
  updated: ImportEntityResult[];
  skipped: ImportSkippedResult[];
  errors: ImportErrorResult[];
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
  application_type: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  redirect_uris: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
  login_methods: z.array(z.string()).optional().nullable(),
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
      await processApplication(client, app, mode, result, orgMap, appMap);
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

      // Overwrite mode — update
      await client.query(
        `UPDATE organizations SET name = $1, default_locale = $2,
         updated_at = NOW() WHERE slug = $3`,
        [org.name, org.default_locale ?? null, org.slug],
      );
      result.updated.push({
        type: 'organization', slug: org.slug, name: org.name,
        changes: ['name', 'default_locale'].filter(Boolean),
      });
    } else {
      // Create new organization
      if (mode === 'dry-run') {
        result.created.push({ type: 'organization', slug: org.slug, name: org.name });
        return;
      }

      const { rows } = await client.query(
        `INSERT INTO organizations (name, slug, default_locale, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [org.name, org.slug, org.default_locale ?? null],
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
 * Resolves the parent organization from orgMap.
 */
async function processApplication(
  client: any,
  app: z.infer<typeof applicationSchema>,
  mode: ImportMode,
  result: ImportResult,
  orgMap: Map<string, string>,
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

    const { rows: existing } = await client.query(
      'SELECT id FROM clients WHERE client_name = $1 AND application_id = $2',
      [clientDef.client_name, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'client', slug: clientDef.client_name, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE clients SET application_type = $1, grant_types = $2, redirect_uris = $3,
         response_types = $4, scope = $5, updated_at = NOW() WHERE id = $6`,
        [
          clientDef.application_type ?? 'web',
          clientDef.grant_types ?? ['authorization_code'],
          clientDef.redirect_uris ?? [],
          clientDef.response_types ?? ['code'],
          clientDef.scope ?? 'openid',
          existing[0].id,
        ],
      );
      result.updated.push({
        type: 'client', slug: clientDef.client_name, name: clientDef.client_name,
        changes: ['application_type', 'grant_types', 'redirect_uris'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'client', slug: clientDef.client_name, name: clientDef.client_name });
        return;
      }

      // Generate a new client_id for the imported client
      const { randomBytes } = await import('node:crypto');
      const clientId = randomBytes(16).toString('hex');

      await client.query(
        `INSERT INTO clients (client_id, client_name, organization_id, application_id, application_type,
         grant_types, redirect_uris, response_types, scope, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
        [
          clientId, clientDef.client_name, orgId, appId,
          clientDef.application_type ?? 'web',
          clientDef.grant_types ?? ['authorization_code'],
          clientDef.redirect_uris ?? [],
          clientDef.response_types ?? ['code'],
          clientDef.scope ?? 'openid',
        ],
      );
      result.created.push({ type: 'client', slug: clientDef.client_name, name: clientDef.client_name });
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
        `UPDATE permissions SET name = $1, description = $2, updated_at = NOW() WHERE id = $3`,
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

    const { rows: existing } = await client.query(
      'SELECT id FROM claim_definitions WHERE slug = $1 AND application_id = $2',
      [claim.slug, appId],
    );

    if (existing.length > 0) {
      if (mode === 'merge' || mode === 'dry-run') {
        result.skipped.push({ type: 'claim_definition', slug: claim.slug, reason: 'Already exists' });
        return;
      }

      await client.query(
        `UPDATE claim_definitions SET name = $1, description = $2, claim_type = $3,
         updated_at = NOW() WHERE id = $4`,
        [claim.name, claim.description ?? null, claim.claim_type, existing[0].id],
      );
      result.updated.push({
        type: 'claim_definition', slug: claim.slug, name: claim.name,
        changes: ['name', 'description', 'claim_type'],
      });
    } else {
      if (mode === 'dry-run') {
        result.created.push({ type: 'claim_definition', slug: claim.slug, name: claim.name });
        return;
      }

      await client.query(
        `INSERT INTO claim_definitions (name, slug, application_id, claim_type, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [claim.name, claim.slug, appId, claim.claim_type, claim.description ?? null],
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
