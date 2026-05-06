/**
 * Provision command — declarative tenant infrastructure from YAML/JSON.
 *
 * Reads a YAML (or JSON) provisioning file with a nested structure
 * (organizations → applications → clients/roles/permissions/claims),
 * transforms it into the flat import manifest format, and sends it
 * to the import API via the SDK. All entities are created in a single
 * transaction.
 *
 * Supports three modes:
 *   merge (default): skip existing entities, create new
 *   overwrite:       update existing entities, create new
 *   dry-run:         preview what would change without applying
 *
 * Usage:
 *   porta provision --file infrastructure.yaml
 *   porta provision --file infrastructure.yaml --dry-run
 *   porta provision --file infrastructure.yaml --mode overwrite
 *   porta provision --file infrastructure.yaml --json
 *
 * @module commands/provision
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import type { ImportManifest, ImportResult } from '@portaidentity/sdk';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, error as printError } from '../output.js';

// ============================================================================
// Slug generation — simple kebab-case conversion
// ============================================================================

/**
 * Generate a URL-safe slug from a name.
 *
 * Converts to lowercase, replaces non-alphanumeric chars with hyphens,
 * collapses multiple hyphens, and trims leading/trailing hyphens.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Duration parser — converts human-friendly durations to ISO dates
// ============================================================================

/**
 * Parse a duration string into a future Date.
 *
 * Supports: Nd (days), Nm (months), Ny (years), Nh (hours).
 * Examples: "90d" (90 days), "6m" (6 months), "1y" (1 year), "24h" (24 hours).
 */
export function parseDuration(duration: string): Date {
  const match = duration.match(/^(\d+)([dmyh])$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Use Nd, Nm, Ny, or Nh (e.g., 90d, 6m, 1y, 24h).`,
    );
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const date = new Date();

  switch (unit) {
    case 'd': date.setDate(date.getDate() + amount); break;
    case 'm': date.setMonth(date.getMonth() + amount); break;
    case 'y': date.setFullYear(date.getFullYear() + amount); break;
    case 'h': date.setHours(date.getHours() + amount); break;
  }
  return date;
}

// ============================================================================
// File parser — reads YAML or JSON based on extension
// ============================================================================

/**
 * Read and parse a provisioning file from disk or stdin.
 *
 * Detects format by file extension (.yaml/.yml for YAML, .json for JSON).
 * When reading from `/dev/stdin` (no extension), defaults to YAML parsing
 * which also handles valid JSON since YAML is a superset of JSON.
 */
export function parseProvisioningFile(filePath: string): unknown {
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
    return parseYaml(content);
  } else {
    throw new Error(
      `Unsupported file format: ${ext}. Use .yaml, .yml, or .json`,
    );
  }
}

// ============================================================================
// Manifest types — flat structure expected by the import API
// ============================================================================

interface FlatOrganization {
  name: string;
  slug: string;
  default_locale?: string | null;
  default_login_methods?: string[];
  two_factor_policy?: string;
  branding_primary_color?: string;
  branding_company_name?: string;
  branding_custom_css?: string;
  branding_logo_url?: string;
  branding_favicon_url?: string;
}

interface FlatApplication {
  name: string;
  slug: string;
  organization_slug: string;
  description?: string | null;
}

interface FlatClient {
  client_name: string;
  client_type: string;
  application_slug: string;
  organization_slug: string;
  [key: string]: unknown;
}

interface FlatRole {
  name: string;
  slug: string;
  description?: string | null;
  application_slug: string;
  organization_slug: string;
}

interface FlatPermission {
  name: string;
  slug: string;
  description?: string | null;
  application_slug: string;
  organization_slug: string;
}

interface FlatClaimDefinition {
  name: string;
  slug: string;
  claim_type: string;
  description?: string | null;
  application_slug: string;
  organization_slug: string;
}

interface FlatUser {
  email: string;
  organization_slug: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  status?: string;
  email_verified?: boolean;
  password?: string;
}

interface FlatModule {
  name: string;
  slug: string;
  description?: string;
  status?: string;
  application_slug: string;
  organization_slug: string;
}

interface RolePermissionMapping {
  role_slug: string;
  permission_slugs: string[];
  application_slug: string;
  organization_slug: string;
}

interface UserRoleAssignment {
  email: string;
  organization_slug: string;
  application_slug: string;
  role_slug: string;
}

interface UserClaimValue {
  email: string;
  organization_slug: string;
  application_slug: string;
  claim_slug: string;
  value: unknown;
}

interface FlatManifest {
  version: string;
  organizations: FlatOrganization[];
  applications: FlatApplication[];
  clients: FlatClient[];
  roles: FlatRole[];
  permissions: FlatPermission[];
  claim_definitions: FlatClaimDefinition[];
  users: FlatUser[];
  application_modules: FlatModule[];
  role_permission_mappings: RolePermissionMapping[];
  user_role_assignments: UserRoleAssignment[];
  user_claim_values: UserClaimValue[];
  config?: Record<string, string | number | boolean>;
}

// ============================================================================
// Transformer — nested provisioning format → flat import manifest
// ============================================================================

interface ProvisioningFile {
  version: string;
  config?: Record<string, string | number | boolean>;
  allow_passwords?: boolean;
  organizations: ProvisioningOrg[];
}

interface ProvisioningOrg {
  name: string;
  slug?: string;
  default_locale?: string | null;
  default_login_methods?: string[];
  two_factor_policy?: string;
  branding?: {
    primary_color?: string;
    company_name?: string;
    custom_css?: string;
    logo_url?: string;
    favicon_url?: string;
  };
  applications?: ProvisioningApp[];
  users?: ProvisioningUser[];
}

interface ProvisioningApp {
  name: string;
  slug?: string;
  description?: string | null;
  clients?: ProvisioningClient[];
  roles?: ProvisioningRole[];
  permissions?: ProvisioningPermission[];
  claim_definitions?: ProvisioningClaim[];
  modules?: ProvisioningModule[];
}

interface ProvisioningClient {
  client_name: string;
  client_type: string;
  application_type?: string;
  grant_types?: string[];
  redirect_uris?: string[];
  response_types?: string[];
  scope?: string;
  login_methods?: string[] | null;
  post_logout_redirect_uris?: string[];
  allowed_origins?: string[];
  require_pkce?: boolean;
  token_endpoint_auth_method?: string;
  secret?: {
    label?: string;
    expires_at?: string;
    expires_in?: string;
  };
}

interface ProvisioningRole {
  name: string;
  slug?: string;
  description?: string | null;
  permissions?: string[];
}

interface ProvisioningPermission {
  name: string;
  slug: string;
  description?: string | null;
}

interface ProvisioningClaim {
  name: string;
  slug: string;
  claim_type: string;
  description?: string | null;
}

interface ProvisioningUser {
  email: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  status?: string;
  email_verified?: boolean;
  password?: string;
  roles?: Array<{ app: string; role: string }>;
  claims?: Array<{ app: string; claim: string; value: unknown }>;
}

interface ProvisioningModule {
  name: string;
  slug: string;
  description?: string;
  status?: string;
}

/**
 * Transform a nested provisioning file into a flat import manifest.
 *
 * Walks the nested org → app → (clients, roles, permissions, claims) tree
 * and produces flat arrays with explicit organization_slug and application_slug
 * references for each entity.
 */
function transformToManifest(input: ProvisioningFile): FlatManifest {
  const manifest: FlatManifest = {
    version: input.version,
    organizations: [],
    applications: [],
    clients: [],
    roles: [],
    permissions: [],
    claim_definitions: [],
    users: [],
    application_modules: [],
    role_permission_mappings: [],
    user_role_assignments: [],
    user_claim_values: [],
  };

  // Validate allow_passwords enforcement
  if (!input.allow_passwords) {
    for (const org of input.organizations) {
      for (const user of org.users ?? []) {
        if (user.password) {
          throw new Error(
            `User "${user.email}": password field requires "allow_passwords: true" at top level. ` +
            'Password provisioning is for development/testing only.',
          );
        }
      }
    }
  }

  for (const org of input.organizations) {
    const orgSlug = org.slug ?? slugify(org.name);

    // Add organization
    manifest.organizations.push({
      name: org.name,
      slug: orgSlug,
      default_locale: org.default_locale,
      default_login_methods: org.default_login_methods,
      two_factor_policy: org.two_factor_policy,
      branding_primary_color: org.branding?.primary_color,
      branding_company_name: org.branding?.company_name,
      branding_custom_css: org.branding?.custom_css,
      branding_logo_url: org.branding?.logo_url,
      branding_favicon_url: org.branding?.favicon_url,
    });

    // Flatten users + extract role/claim assignments
    for (const user of org.users ?? []) {
      manifest.users.push({
        email: user.email,
        organization_slug: orgSlug,
        given_name: user.given_name,
        family_name: user.family_name,
        locale: user.locale,
        status: user.status,
        email_verified: user.email_verified,
        password: user.password,
      });

      for (const roleRef of user.roles ?? []) {
        manifest.user_role_assignments.push({
          email: user.email,
          organization_slug: orgSlug,
          application_slug: roleRef.app,
          role_slug: roleRef.role,
        });
      }

      for (const claimRef of user.claims ?? []) {
        manifest.user_claim_values.push({
          email: user.email,
          organization_slug: orgSlug,
          application_slug: claimRef.app,
          claim_slug: claimRef.claim,
          value: claimRef.value,
        });
      }
    }

    for (const app of org.applications ?? []) {
      const appSlug = app.slug ?? slugify(app.name);

      // Add application
      manifest.applications.push({
        name: app.name,
        slug: appSlug,
        organization_slug: orgSlug,
        description: app.description,
      });

      // Flatten clients
      for (const clientDef of app.clients ?? []) {
        // Validate and flatten secret block
        if (clientDef.secret) {
          if (clientDef.client_type === 'public') {
            throw new Error(
              `Client "${clientDef.client_name}": secret block not allowed on public clients`,
            );
          }
          if (clientDef.secret.expires_at && clientDef.secret.expires_in) {
            throw new Error(
              `Client "${clientDef.client_name}": expires_at and expires_in are mutually exclusive`,
            );
          }
        }

        let secretLabel: string | undefined;
        let secretExpiresAt: string | undefined;

        if (clientDef.secret) {
          secretLabel = clientDef.secret.label;
          if (clientDef.secret.expires_at) {
            secretExpiresAt = clientDef.secret.expires_at;
          } else if (clientDef.secret.expires_in) {
            secretExpiresAt = parseDuration(clientDef.secret.expires_in).toISOString();
          }
        }

        const { secret: _secretBlock, ...clientFields } = clientDef;

        manifest.clients.push({
          ...clientFields,
          application_slug: appSlug,
          organization_slug: orgSlug,
          ...(secretLabel !== undefined ? { secret_label: secretLabel } : {}),
          ...(secretExpiresAt !== undefined ? { secret_expires_at: secretExpiresAt } : {}),
        });
      }

      // Flatten permissions
      for (const perm of app.permissions ?? []) {
        manifest.permissions.push({
          ...perm,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }

      // Flatten roles + extract permission mappings
      for (const role of app.roles ?? []) {
        const roleSlug = role.slug ?? slugify(role.name);

        manifest.roles.push({
          name: role.name,
          slug: roleSlug,
          description: role.description,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });

        if (role.permissions && role.permissions.length > 0) {
          manifest.role_permission_mappings.push({
            role_slug: roleSlug,
            permission_slugs: role.permissions,
            application_slug: appSlug,
            organization_slug: orgSlug,
          });
        }
      }

      // Flatten claim definitions
      for (const claim of app.claim_definitions ?? []) {
        manifest.claim_definitions.push({
          ...claim,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }

      // Flatten application modules
      for (const mod of app.modules ?? []) {
        manifest.application_modules.push({
          name: mod.name,
          slug: mod.slug,
          description: mod.description,
          status: mod.status,
          application_slug: appSlug,
          organization_slug: orgSlug,
        });
      }
    }
  }

  // Attach config overrides
  if (input.config) {
    manifest.config = input.config;
  }

  return manifest;
}

// ============================================================================
// Result display helpers
// ============================================================================

/**
 * Display a summary of the import result.
 */
function displayResult(result: ImportResult, mode: string): void {
  const label = mode === 'dry-run' ? 'Dry-run preview' : 'Provisioning complete';

  if (result.dryRun) {
    success(`${label} (dry-run mode)`);
  } else {
    success(`${label} (${mode} mode)`);
  }

  console.log();

  // Display entity counts
  const countEntries = Object.entries(result.counts);
  if (countEntries.length > 0) {
    printTable(
      ['Entity Type', 'Count'],
      countEntries.map(([type, count]) => [
        formatTypeName(type),
        String(count),
      ]),
    );
  }

  // Display errors
  if (result.errors.length > 0) {
    console.log();
    printError(`${result.errors.length} error(s):`);
    printTable(
      ['Entity Type', 'Identifier', 'Error'],
      result.errors.map((e) => [e.entityType, e.identifier, e.error]),
    );
  } else {
    console.log(`  Errors: 0`);
  }
}

/**
 * Format an entity type name for display (e.g., "claim_definitions" → "Claim Definitions").
 */
function formatTypeName(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// Command definition
// ============================================================================

interface ProvisionOptions extends GlobalOptions {
  file: string;
  mode: string;
  'dry-run'?: boolean;
}

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
      })
      .option('dry-run', {
        type: 'boolean',
        describe: 'Preview what would change without applying',
        default: false,
      }),

  handler: async (argv) => {
    try {
      const isJson = argv.json;
      const isDryRun = argv['dry-run'];

      // 1. Read and parse provisioning file
      if (!isJson) {
        console.log(`Reading ${argv.file}...`);
      }
      const rawData = parseProvisioningFile(argv.file);

      // 2. Basic validation
      const data = rawData as ProvisioningFile;
      if (!data.version || !data.organizations || !Array.isArray(data.organizations)) {
        throw new Error(
          'Invalid provisioning file: must contain "version" and "organizations" array',
        );
      }

      // 3. Transform nested → flat manifest
      const manifest = transformToManifest(data);

      if (!isJson) {
        const entityCount =
          manifest.organizations.length +
          manifest.applications.length +
          manifest.clients.length +
          manifest.roles.length +
          manifest.permissions.length +
          manifest.claim_definitions.length +
          manifest.users.length;
        const mappingCount = manifest.role_permission_mappings.length;
        const hasConfig = !!manifest.config;
        console.log(
          `Found ${entityCount} entities, ${mappingCount} role-permission mappings${hasConfig ? ', config overrides' : ''}`,
        );
        console.log();
      }

      // 4. Determine import mode
      const importMode = isDryRun ? 'dry-run' : argv.mode;

      // 5. Send via SDK imports.provision()
      const client = createClient(argv);
      const sdkManifest: ImportManifest = {
        data: manifest as unknown as Record<string, unknown>,
        mode: isDryRun ? undefined : (argv.mode as 'merge' | 'overwrite'),
        dryRun: isDryRun,
      };
      const result = await client.imports.provision(sdkManifest);

      // 6. Display results
      if (isJson) {
        printJson(result);
      } else {
        displayResult(result, importMode);
      }

      // 7. Show dry-run warning
      if (isDryRun && !isJson) {
        console.log();
        warn('Dry-run mode — no changes were applied. Remove --dry-run to apply.');
      }
    } catch (err) {
      handleError(err, argv.verbose);
    }
  },
};
