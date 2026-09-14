/** Conventional command for exporting selective Porta portability manifests. */

import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ExportManifestRequest,
  PortabilityCategory,
  PortabilityManifest,
} from '@portaidentity/sdk';
import type { CommandModule } from 'yargs';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import type { GlobalOptions } from '../global-options.js';
import { info, printJson, success } from '../output.js';
import { confirm } from '../prompt.js';

/** Manifest categories accepted by the public portability contract. */
const CATEGORIES = [
  'organizations',
  'applications_authorization',
  'users_assignments',
  'oidc_clients',
] as const satisfies readonly PortabilityCategory[];

/** Categories whose records and relationships require an application selection. */
const APPLICATION_CATEGORIES: ReadonlySet<PortabilityCategory> = new Set([
  'applications_authorization',
  'users_assignments',
  'oidc_clients',
]);

/** Application slugs rejected by the server's application domain. */
const RESERVED_APPLICATION_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'system',
  'internal',
  'default',
  'health',
  'status',
]);

/** Parsed arguments for one selective manifest export. */
interface ExportManifestArguments extends GlobalOptions {
  readonly organization?: string;
  readonly environment: boolean;
  readonly category: readonly PortabilityCategory[];
  readonly application?: readonly string[];
  readonly 'all-applications': boolean;
  readonly output: string;
  readonly yes: boolean;
}

/** Return whether a Node filesystem error represents an absent path. */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Return whether a slug follows the application identifier contract. */
function isApplicationSlug(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 100 &&
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) &&
    !RESERVED_APPLICATION_SLUGS.has(value)
  );
}

/** Reject ambiguous or incomplete export selections before any SDK request. */
function validateSelection(arguments_: ExportManifestArguments): true {
  if (Boolean(arguments_.organization) === arguments_.environment) {
    throw new Error('Choose exactly one of --organization or --environment.');
  }
  if (new Set(arguments_.category).size !== arguments_.category.length) {
    throw new Error('Each --category value may be selected only once.');
  }

  const applications = arguments_.application ?? [];
  if (new Set(applications).size !== applications.length) {
    throw new Error('Each --application value may be selected only once.');
  }
  if (!applications.every(isApplicationSlug)) {
    throw new Error('Every --application value must be a valid application slug.');
  }

  const needsApplications = arguments_.category.some((category) =>
    APPLICATION_CATEGORIES.has(category),
  );
  const hasExplicitApplications = applications.length > 0;
  if (needsApplications && hasExplicitApplications === arguments_['all-applications']) {
    throw new Error('Choose exactly one of --application or --all-applications.');
  }
  if (!needsApplications && (hasExplicitApplications || arguments_['all-applications'])) {
    throw new Error('Application selection requires an application-related category.');
  }
  return true;
}

/** Return whether the output path already exists without hiding unrelated filesystem failures. */
async function outputExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

/** Count records in every manifest collection for concise command output. */
function manifestCounts(manifest: PortabilityManifest): Record<string, number> {
  return {
    organizations: manifest.organizations.length,
    applications: manifest.applications.length,
    application_modules: manifest.application_modules.length,
    roles: manifest.roles.length,
    permissions: manifest.permissions.length,
    claim_definitions: manifest.claim_definitions.length,
    role_permission_mappings: manifest.role_permission_mappings.length,
    users: manifest.users.length,
    user_role_assignments: manifest.user_role_assignments.length,
    user_claim_values: manifest.user_claim_values.length,
    clients: manifest.clients.length,
  };
}

/** Build the exact server request from validated command arguments. */
function manifestRequest(arguments_: ExportManifestArguments): ExportManifestRequest {
  return {
    scope: arguments_.organization
      ? { kind: 'organization', organization_slug: arguments_.organization }
      : { kind: 'environment' },
    categories: arguments_.category,
    application_selection: {
      all_applications: arguments_['all-applications'],
      application_slugs: arguments_.application ?? [],
    },
  };
}

/** Export selected Porta data to one local JSON file. */
export const exportCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'export',
  describe: 'Export a selective Porta manifest',
  builder: (yargs) =>
    yargs
      .command<ExportManifestArguments>(
        'manifest',
        'Export a portability manifest',
        (command) =>
          command
            .option('organization', {
              type: 'string',
              describe: 'Export one organization by slug',
            })
            .option('environment', {
              type: 'boolean',
              default: false,
              describe: 'Export the complete non-control-plane environment',
            })
            .option('category', {
              type: 'string',
              array: true,
              choices: CATEGORIES,
              demandOption: true,
              describe: 'Manifest category to include; repeat to select more than one',
            })
            .option('application', {
              type: 'string',
              array: true,
              describe: 'Application slug to include; repeat to select more than one',
            })
            .option('all-applications', {
              type: 'boolean',
              default: false,
              describe: 'Include every eligible application',
            })
            .option('output', {
              alias: 'o',
              type: 'string',
              demandOption: true,
              describe: 'Local JSON file to write',
            })
            .option('yes', {
              type: 'boolean',
              default: false,
              describe: 'Replace an existing output file without confirmation',
            })
            .check(validateSelection),
        async (arguments_) => {
          try {
            const outputPath = resolve(arguments_.output);
            if ((await outputExists(outputPath)) && !arguments_.yes) {
              const replace = await confirm(`Replace existing file ${outputPath}?`);
              if (!replace) return;
            }

            const response = await createClient(arguments_).exports.manifest(
              manifestRequest(arguments_),
            );
            await writeFile(outputPath, JSON.stringify(response.manifest, null, 2), 'utf-8');
            const status = {
              path: outputPath,
              filename: response.filename,
              counts: manifestCounts(response.manifest),
            };
            if (arguments_.json) {
              printJson(status);
              return;
            }
            success(`Wrote portability manifest to ${outputPath}`);
            for (const [category, count] of Object.entries(status.counts)) {
              info(`${category}: ${count}`);
            }
          } catch (error) {
            handleError(error, arguments_.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify the export subcommand: manifest'),
  handler: () => undefined,
};
