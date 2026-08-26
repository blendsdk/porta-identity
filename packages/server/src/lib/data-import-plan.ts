/**
 * Pure import-manifest planning.
 *
 * The planner assigns every admitted entity a stable tenant-qualified natural key and explicit
 * parent references before database mutation begins. Database-backed planning later resolves the
 * returned external references against one consistent transaction snapshot.
 */

import type { ImportManifest } from './data-import.js';
import type { PoolClient } from 'pg';

/** Closed entity catalog accepted by the version 1.0 manifest. */
export type ImportEntityType =
  | 'organization'
  | 'application'
  | 'client'
  | 'role'
  | 'permission'
  | 'claim_definition'
  | 'role_permission_mapping'
  | 'application_module'
  | 'user'
  | 'user_role_assignment'
  | 'user_claim_value'
  | 'config';

/** Parent reference which must exist in the manifest or the database snapshot. */
export interface ImportPlanDependency {
  readonly entityType: ImportEntityType;
  readonly naturalKey: string;
  readonly source: 'manifest' | 'database';
}

/** One deterministic manifest entry prepared for database-backed action planning. */
export interface ImportPlanEntry {
  readonly entityType: ImportEntityType;
  readonly naturalKey: string;
  readonly mutableFields: readonly string[];
  readonly dependencies: readonly ImportPlanDependency[];
  readonly credentialWillBeGenerated: boolean;
}

/** Immutable mutation-free plan produced from a validated manifest. */
export interface ImportManifestPlan {
  readonly version: '1.0';
  readonly entries: readonly ImportPlanEntry[];
  readonly externalDependencies: readonly ImportPlanDependency[];
}

const MUTABLE_FIELDS: Readonly<Record<ImportEntityType, readonly string[]>> = Object.freeze({
  organization: [
    'name',
    'default_locale',
    'branding_primary_color',
    'branding_company_name',
    'branding_custom_css',
    'branding_logo_url',
    'branding_favicon_url',
  ],
  application: ['name', 'description'],
  client: ['client_name'],
  role: ['name', 'description'],
  permission: ['name', 'description'],
  claim_definition: ['name', 'description'],
  role_permission_mapping: [],
  application_module: ['name', 'description'],
  user: ['given_name', 'family_name', 'locale'],
  user_role_assignment: [],
  user_claim_value: ['value'],
  config: ['value'],
});

const PROHIBITED_CONFIG_KEY =
  /(^|_)(password|secret|private_key|signing_key|cookie_key|session_key|recovery_code|totp_secret)(_|$)/i;

/** Return whether a configuration key can carry authentication material. */
export function isProhibitedImportConfigKey(configKey: string): boolean {
  return PROHIBITED_CONFIG_KEY.test(configKey);
}

/** Join natural-key components without ambiguous concatenation. */
function key(...parts: readonly string[]): string {
  return parts.join('\u001f');
}

/** Split an internal natural key and reject malformed planner state. */
function keyParts(naturalKey: string, expectedParts: number): readonly string[] {
  const parts = naturalKey.split('\u001f');
  if (parts.length !== expectedParts || parts.some((part) => part.length === 0)) {
    throw new Error('Import plan contains an invalid natural key');
  }
  return parts;
}

/** Return a manifest/database reference for one required parent. */
function dependency(
  entityType: ImportEntityType,
  naturalKey: string,
  manifestKeys: ReadonlySet<string>,
): ImportPlanDependency {
  return Object.freeze({
    entityType,
    naturalKey,
    source: manifestKeys.has(naturalKey) ? 'manifest' : 'database',
  });
}

/** Add one immutable entry to the ordered plan. */
function addEntry(
  entries: ImportPlanEntry[],
  entityType: ImportEntityType,
  naturalKey: string,
  dependencies: readonly ImportPlanDependency[],
  credentialWillBeGenerated = false,
): void {
  entries.push(
    Object.freeze({
      entityType,
      naturalKey,
      mutableFields: MUTABLE_FIELDS[entityType],
      dependencies: Object.freeze([...dependencies]),
      credentialWillBeGenerated,
    }),
  );
}

/**
 * Build a deterministic, mutation-free plan from a schema-validated manifest.
 *
 * @param manifest - Strictly parsed version 1.0 manifest.
 * @returns Ordered entries and the exact parents that must be resolved from the database.
 * @throws Error when a system configuration key could carry authentication material.
 */
export function buildImportManifestPlan(manifest: ImportManifest): ImportManifestPlan {
  const entries: ImportPlanEntry[] = [];
  const organizationKeys = new Set(manifest.organizations.map((item) => item.slug));
  const applicationKeys = new Set(manifest.applications.map((item) => item.slug));
  const roleKeys = new Set(manifest.roles.map((item) => key(item.application_slug, item.slug)));
  const permissionKeys = new Set(
    manifest.permissions.map((item) => key(item.application_slug, item.slug)),
  );
  const claimKeys = new Set(
    manifest.claim_definitions.map((item) => key(item.application_slug, item.slug)),
  );
  const userKeys = new Set(
    manifest.users.map((item) => key(item.organization_slug, item.email.toLowerCase())),
  );

  for (const organization of manifest.organizations) {
    addEntry(entries, 'organization', organization.slug, []);
  }

  for (const application of manifest.applications) {
    addEntry(entries, 'application', application.slug, [
      dependency('organization', application.organization_slug, organizationKeys),
    ]);
  }

  for (const client of manifest.clients) {
    addEntry(
      entries,
      'client',
      key(client.organization_slug, client.application_slug, client.client_name),
      [
        dependency('organization', client.organization_slug, organizationKeys),
        dependency('application', client.application_slug, applicationKeys),
      ],
      client.client_type === 'confidential',
    );
  }

  for (const role of manifest.roles) {
    addEntry(entries, 'role', key(role.application_slug, role.slug), [
      dependency('organization', role.organization_slug, organizationKeys),
      dependency('application', role.application_slug, applicationKeys),
    ]);
  }

  for (const permission of manifest.permissions) {
    addEntry(entries, 'permission', key(permission.application_slug, permission.slug), [
      dependency('organization', permission.organization_slug, organizationKeys),
      dependency('application', permission.application_slug, applicationKeys),
    ]);
  }

  for (const claim of manifest.claim_definitions) {
    addEntry(entries, 'claim_definition', key(claim.application_slug, claim.slug), [
      dependency('organization', claim.organization_slug, organizationKeys),
      dependency('application', claim.application_slug, applicationKeys),
    ]);
  }

  for (const mapping of manifest.role_permission_mappings) {
    const dependencies: ImportPlanDependency[] = [
      dependency('organization', mapping.organization_slug, organizationKeys),
      dependency('application', mapping.application_slug, applicationKeys),
      dependency('role', key(mapping.application_slug, mapping.role_slug), roleKeys),
      ...mapping.permission_slugs.map((slug) =>
        dependency('permission', key(mapping.application_slug, slug), permissionKeys),
      ),
    ];
    addEntry(
      entries,
      'role_permission_mapping',
      key(mapping.application_slug, mapping.role_slug),
      dependencies,
    );
  }

  for (const module of manifest.application_modules) {
    addEntry(entries, 'application_module', key(module.application_slug, module.slug), [
      dependency('organization', module.organization_slug, organizationKeys),
      dependency('application', module.application_slug, applicationKeys),
    ]);
  }

  for (const user of manifest.users) {
    addEntry(entries, 'user', key(user.organization_slug, user.email.toLowerCase()), [
      dependency('organization', user.organization_slug, organizationKeys),
    ]);
  }

  for (const assignment of manifest.user_role_assignments) {
    addEntry(
      entries,
      'user_role_assignment',
      key(
        assignment.organization_slug,
        assignment.application_slug,
        assignment.email.toLowerCase(),
        assignment.role_slug,
      ),
      [
        dependency('organization', assignment.organization_slug, organizationKeys),
        dependency('application', assignment.application_slug, applicationKeys),
        dependency(
          'user',
          key(assignment.organization_slug, assignment.email.toLowerCase()),
          userKeys,
        ),
        dependency('role', key(assignment.application_slug, assignment.role_slug), roleKeys),
      ],
    );
  }

  for (const claimValue of manifest.user_claim_values) {
    addEntry(
      entries,
      'user_claim_value',
      key(
        claimValue.organization_slug,
        claimValue.application_slug,
        claimValue.email.toLowerCase(),
        claimValue.claim_slug,
      ),
      [
        dependency('organization', claimValue.organization_slug, organizationKeys),
        dependency('application', claimValue.application_slug, applicationKeys),
        dependency(
          'user',
          key(claimValue.organization_slug, claimValue.email.toLowerCase()),
          userKeys,
        ),
        dependency(
          'claim_definition',
          key(claimValue.application_slug, claimValue.claim_slug),
          claimKeys,
        ),
      ],
    );
  }

  for (const configKey of Object.keys(manifest.config ?? {}).sort()) {
    if (isProhibitedImportConfigKey(configKey)) {
      throw new Error('Import manifest contains prohibited authentication material');
    }
    addEntry(entries, 'config', configKey, []);
  }

  const externalByKey = new Map<string, ImportPlanDependency>();
  for (const entry of entries) {
    for (const required of entry.dependencies) {
      if (required.source === 'database') {
        externalByKey.set(key(required.entityType, required.naturalKey), required);
      }
    }
  }

  return Object.freeze({
    version: '1.0',
    entries: Object.freeze(entries),
    externalDependencies: Object.freeze([...externalByKey.values()]),
  });
}

/** Resolve one database-owned parent without exposing its identifier in an error. */
async function databaseDependencyExists(
  client: PoolClient,
  required: ImportPlanDependency,
): Promise<boolean> {
  if (required.entityType === 'organization') {
    const result = await client.query('SELECT 1 FROM organizations WHERE slug = $1', [
      required.naturalKey,
    ]);
    return result.rowCount === 1;
  }
  if (required.entityType === 'application') {
    const result = await client.query('SELECT 1 FROM applications WHERE slug = $1', [
      required.naturalKey,
    ]);
    return result.rowCount === 1;
  }
  if (
    required.entityType === 'role' ||
    required.entityType === 'permission' ||
    required.entityType === 'claim_definition'
  ) {
    const [applicationSlug, entitySlug] = keyParts(required.naturalKey, 2);
    const table =
      required.entityType === 'role'
        ? 'roles'
        : required.entityType === 'permission'
          ? 'permissions'
          : 'claim_definitions';
    const result = await client.query(
      `SELECT 1 FROM ${table} entity
       JOIN applications application ON application.id = entity.application_id
       WHERE application.slug = $1 AND entity.slug = $2`,
      [applicationSlug, entitySlug],
    );
    return result.rowCount === 1;
  }
  if (required.entityType === 'user') {
    const [organizationSlug, email] = keyParts(required.naturalKey, 2);
    const result = await client.query(
      `SELECT 1 FROM users user_account
       JOIN organizations organization ON organization.id = user_account.organization_id
       WHERE organization.slug = $1 AND user_account.email = $2`,
      [organizationSlug, email],
    );
    return result.rowCount === 1;
  }
  throw new Error('Import plan contains an unsupported external dependency');
}

/**
 * Resolve every external parent against the current transaction snapshot.
 *
 * @param client - Transaction client used by the later import execution.
 * @param plan - Pure manifest plan built before acquiring the client.
 * @throws Error when a parent is missing or storage contains an ambiguous natural key.
 */
export async function requireResolvedImportDependencies(
  client: PoolClient,
  plan: ImportManifestPlan,
): Promise<void> {
  for (const required of plan.externalDependencies) {
    if (!(await databaseDependencyExists(client, required))) {
      throw new Error('Import manifest contains a missing or unauthorized parent reference');
    }
  }

  for (const entry of plan.entries) {
    if (entry.entityType !== 'client') continue;
    const [organizationSlug, applicationSlug, clientName] = keyParts(entry.naturalKey, 3);
    const result = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM clients client
       JOIN organizations organization ON organization.id = client.organization_id
       JOIN applications application ON application.id = client.application_id
       WHERE organization.slug = $1
         AND application.slug = $2
         AND client.client_name = $3`,
      [organizationSlug, applicationSlug, clientName],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(count) || count > 1) {
      throw new Error('Import manifest natural key collides with ambiguous stored data');
    }
  }
}
