/**
 * Provision command — declarative tenant infrastructure from YAML/JSON.
 *
 * Reads a YAML (or JSON) provisioning file with a nested structure
 * (organizations → applications → clients/roles/permissions/claims),
 * transforms it into the flat import manifest format, and sends it
 * to the import API. All entities are created in a single transaction.
 *
 * Supports three modes:
 * - merge (default): skip existing entities, create new
 * - overwrite: update existing entities, create new
 * - dry-run: preview what would change without applying
 *
 * Usage:
 *   porta provision --file infrastructure.yaml
 *   porta provision --file infrastructure.yaml --dry-run
 *   porta provision --file infrastructure.yaml --mode overwrite
 *   porta provision --file infrastructure.yaml --json
 *
 * @module cli/commands/provision
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { ImportManifest, ImportResult, RolePermissionMappingInput } from '../../lib/data-import.js';
import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, printJson, success, warn, error } from '../output.js';
import { generateSlug } from '../../organizations/slugs.js';

// ============================================================================
// Provisioning YAML schema (nested user-facing format)
// ============================================================================

/** Client definition nested under an application */
const provisionClientSchema = z.object({
  client_name: z.string().min(1).max(255),
  client_type: z.enum(['confidential', 'public']),
  application_type: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  redirect_uris: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
  login_methods: z.array(z.string()).optional().nullable(),
});

/** Permission definition nested under an application */
const provisionPermissionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  description: z.string().max(1000).optional().nullable(),
});

/** Role definition with inline permission slug references */
const provisionRoleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).optional(), // auto-generated from name if omitted
  description: z.string().max(1000).optional().nullable(),
  permissions: z.array(z.string()).optional(), // permission slugs to link
});

/** Claim definition nested under an application */
const provisionClaimSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63),
  claim_type: z.enum(['string', 'number', 'boolean', 'json']),
  description: z.string().max(1000).optional().nullable(),
});

/** Application with nested children (clients, roles, permissions, claims) */
const provisionApplicationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).optional(), // auto-generated from name if omitted
  description: z.string().max(1000).optional().nullable(),
  clients: z.array(provisionClientSchema).optional().default([]),
  roles: z.array(provisionRoleSchema).optional().default([]),
  permissions: z.array(provisionPermissionSchema).optional().default([]),
  claim_definitions: z.array(provisionClaimSchema).optional().default([]),
});

/** Organization with nested applications */
const provisionOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).optional(), // auto-generated from name if omitted
  default_locale: z.string().max(10).optional().nullable(),
  default_login_methods: z.array(z.string()).optional(),
  applications: z.array(provisionApplicationSchema).optional().default([]),
});

/**
 * Top-level provisioning file schema.
 *
 * Requires at least one organization. Optionally includes system config overrides.
 * The version field must match the import engine's expected version.
 */
export const provisioningSchema = z.object({
  version: z.string(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  organizations: z.array(provisionOrganizationSchema).min(1),
});

export type ProvisioningFile = z.infer<typeof provisioningSchema>;

// ============================================================================
// File parser — reads YAML or JSON based on extension
// ============================================================================

/**
 * Read and parse a provisioning file from disk or stdin.
 *
 * Detects format by file extension (.yaml/.yml for YAML, .json for JSON).
 * When reading from `/dev/stdin` (no extension), defaults to YAML parsing
 * which also handles valid JSON since YAML is a superset of JSON.
 *
 * @param filePath - Path to the provisioning file, or `/dev/stdin` for piped input
 * @returns Parsed file contents as a plain object
 * @throws Error if file not found, unreadable, or unsupported extension
 */
export function parseProvisioningFile(filePath: string): unknown {
  // /dev/stdin is a special file — skip the existence check since it may
  // not pass fs.existsSync on all platforms but is always readable when
  // stdin is piped.
  const isStdin = filePath === '/dev/stdin';
  if (!isStdin && !fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return parseYaml(content);
  } else if (ext === '.json') {
    return JSON.parse(content);
  } else if (isStdin || ext === '') {
    // No extension (stdin pipe or extensionless path) — parse as YAML.
    // YAML is a superset of JSON, so this handles both formats.
    return parseYaml(content);
  } else {
    throw new Error(
      `Unsupported file format: ${ext}. Use .yaml, .yml, or .json`,
    );
  }
}

// ============================================================================
// Transformer — nested provisioning format → flat import manifest
// ============================================================================

/** Result of transforming a provisioning file to flat manifest */
export interface TransformResult {
  /** Flat import manifest ready for the import API */
  manifest: ImportManifest;
  /** Number of role-permission mappings included */
  mappingCount: number;
  /** Whether config overrides are included */
  hasConfig: boolean;
}

/**
 * Transform a nested provisioning file into a flat import manifest.
 *
 * Walks the nested org → app → (clients, roles, permissions, claims) tree
 * and produces flat arrays with explicit organization_slug and application_slug
 * references for each entity.
 *
 * Role-permission mappings are extracted from inline `permissions` arrays
 * on roles and added to the manifest's `role_permission_mappings` field.
 *
 * System config overrides are passed through to the manifest's `config` field.
 *
 * @param input - Validated provisioning file structure
 * @returns Flat import manifest with role-permission mappings and config
 */
export function transformToManifest(input: ProvisioningFile): TransformResult {
  const manifest: ImportManifest = {
    version: input.version,
    organizations: [],
    applications: [],
    clients: [],
    roles: [],
    permissions: [],
    claim_definitions: [],
    role_permission_mappings: [],
  };

  const rolePermissionMappings: RolePermissionMappingInput[] = [];

  for (const org of input.organizations) {
    const orgSlug = org.slug ?? generateSlug(org.name);

    // Add organization to flat list
    manifest.organizations.push({
      name: org.name,
      slug: orgSlug,
      default_locale: org.default_locale,
      default_login_methods: org.default_login_methods,
    });

    for (const app of org.applications ?? []) {
      const appSlug = app.slug ?? generateSlug(app.name);

      // Add application to flat list with org reference
      manifest.applications.push({
        name: app.name,
        slug: appSlug,
        organization_slug: orgSlug,
        description: app.description,
      });

      // Flatten clients — add org + app slug references
      for (const client of app.clients ?? []) {
        manifest.clients.push({
          ...client,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }

      // Flatten permissions — add org + app slug references
      for (const perm of app.permissions ?? []) {
        manifest.permissions.push({
          ...perm,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }

      // Flatten roles + extract permission mappings
      for (const role of app.roles ?? []) {
        const roleSlug = role.slug ?? generateSlug(role.name);

        manifest.roles.push({
          name: role.name,
          slug: roleSlug,
          description: role.description,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });

        // Extract role → permission mappings for the import engine to process
        if (role.permissions && role.permissions.length > 0) {
          rolePermissionMappings.push({
            role_slug: roleSlug,
            permission_slugs: role.permissions,
            application_slug: appSlug,
            organization_slug: orgSlug,
          });
        }
      }

      // Flatten claim definitions — add org + app slug references
      for (const claim of app.claim_definitions ?? []) {
        manifest.claim_definitions.push({
          ...claim,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }
    }
  }

  // Attach role-permission mappings and config to the manifest
  // so the import engine processes them in the same transaction
  manifest.role_permission_mappings = rolePermissionMappings;
  if (input.config) {
    manifest.config = input.config;
  }

  return {
    manifest,
    mappingCount: rolePermissionMappings.length,
    hasConfig: !!input.config,
  };
}

// ============================================================================
// Result display helpers
// ============================================================================

/**
 * Display a summary of the import result as a human-readable table.
 *
 * Groups created/updated/skipped entities by type and shows counts.
 * Also displays errors if any occurred during import.
 *
 * @param result - Import result from the API
 * @param mode - The import mode used (merge, overwrite, dry-run)
 */
function displayResult(result: ImportResult, mode: string): void {
  const label = mode === 'dry-run' ? 'Dry-run preview' : 'Provisioning complete';
  success(`${label} (${mode} mode)`);
  console.log();

  // Count entities by type for created/skipped/updated
  const createdByType = countByType(result.created);
  const skippedByType = countByType(result.skipped);
  const updatedByType = countByType(result.updated);

  // Display created entities
  if (result.created.length > 0) {
    console.log('  Created:');
    for (const [type, count] of Object.entries(createdByType)) {
      console.log(`    ${formatTypeName(type)}: ${count}`);
    }
    console.log();
  }

  // Display updated entities
  if (result.updated.length > 0) {
    console.log('  Updated:');
    for (const [type, count] of Object.entries(updatedByType)) {
      console.log(`    ${formatTypeName(type)}: ${count}`);
    }
    console.log();
  }

  // Display skipped entities
  if (result.skipped.length > 0) {
    console.log('  Skipped (already exist):');
    for (const [type, count] of Object.entries(skippedByType)) {
      console.log(`    ${formatTypeName(type)}: ${count}`);
    }
    console.log();
  }

  // Display errors
  if (result.errors.length > 0) {
    error(`Errors: ${result.errors.length}`);
    printTable(
      ['Type', 'Slug', 'Error'],
      result.errors.map((e) => [e.type, e.slug, e.error]),
    );
  } else {
    console.log(`  Errors: 0`);
  }
}

/**
 * Count items grouped by their type field.
 * @param items - Array of items with a `type` property
 * @returns Record mapping type name to count
 */
function countByType(items: Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Format an entity type name for display (e.g., "claim_definition" → "Claim Definitions").
 * @param type - Raw entity type string
 * @returns Formatted display name
 */
function formatTypeName(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') + 's';
}

// ============================================================================
// Provision command options
// ============================================================================

interface ProvisionOptions extends GlobalOptions {
  file: string;
  mode: 'merge' | 'overwrite';
}

// ============================================================================
// Command definition
// ============================================================================

/**
 * The `porta provision` CLI command.
 *
 * Reads a YAML or JSON provisioning file, validates its schema,
 * transforms the nested structure to a flat import manifest,
 * and sends it to the import API.
 *
 * Supports `--dry-run` to preview changes, `--mode overwrite` to update
 * existing entities, and `--json` for machine-readable output.
 */
export const provisionCommand: CommandModule<GlobalOptions, ProvisionOptions> = {
  command: 'provision',
  describe: 'Provision tenant infrastructure from a YAML or JSON file',
  builder: (yargs) =>
    yargs
      .option('file', {
        alias: 'f',
        type: 'string',
        describe: 'Path to provisioning YAML or JSON file',
        demandOption: true,
      })
      .option('mode', {
        type: 'string',
        describe: 'Import mode: merge (skip existing) or overwrite (update existing)',
        choices: ['merge', 'overwrite'] as const,
        default: 'merge' as const,
      }),

  handler: async (argv) => {
    await withErrorHandling(async () => {
      await withHttpClient(argv, async (client) => {
        const isJson = argv.json;
        const isDryRun = argv['dry-run'];

        // 1. Read and parse provisioning file
        if (!isJson) {
          console.log(`Reading ${argv.file}...`);
        }
        const rawData = parseProvisioningFile(argv.file);

        // 2. Validate against provisioning schema
        const parseResult = provisioningSchema.safeParse(rawData);
        if (!parseResult.success) {
          const issues = parseResult.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
          throw new Error(`Invalid provisioning file:\n${issues}`);
        }

        // 3. Transform nested → flat manifest
        const { manifest, mappingCount, hasConfig } = transformToManifest(parseResult.data);

        if (!isJson) {
          const entityCount =
            manifest.organizations.length +
            manifest.applications.length +
            manifest.clients.length +
            manifest.roles.length +
            manifest.permissions.length +
            manifest.claim_definitions.length;
          console.log(`Found ${entityCount} entities, ${mappingCount} role-permission mappings${hasConfig ? ', config overrides' : ''}`);
          console.log();
        }

        // 4. Determine import mode (dry-run overrides the mode)
        const importMode = isDryRun ? 'dry-run' : argv.mode;

        // 5. Send to import API — wraps manifest in { mode, manifest } as expected
        // The engine processes everything in one transaction
        const response = await client.post<ImportResult>('/api/admin/import', {
          mode: importMode,
          manifest,
        });
        const result = response.data;

        // 6. Display results
        if (isJson) {
          printJson(result);
        } else {
          displayResult(result, importMode);
        }

        // 7. Show warnings for dry-run
        if (isDryRun && !isJson) {
          console.log();
          warn('Dry-run mode — no changes were applied. Remove --dry-run to apply.');
        }
      });
    });
  },
};
