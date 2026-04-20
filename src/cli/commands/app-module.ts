/**
 * CLI application module subcommands.
 *
 * Manages modules within an application via the Admin API.
 * Modules are organizational units used for permission namespacing
 * (e.g., "CRM", "Invoicing").
 *
 * Usage:
 *   porta app module create <app-id-or-slug> --name "Users Module" [--slug users]
 *   porta app module list <app-id-or-slug>
 *   porta app module update <app-id-or-slug> <module-id> --name "New Name"
 *   porta app module deactivate <app-id-or-slug> <module-id>
 *
 * @module cli/commands/app-module
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { resolveApp } from './app.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Module data as returned by the Admin API */
interface ModuleData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  applicationId: string;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response */
interface ModuleResponse {
  data: ModuleData;
}

/** Array response for module list (route returns { data: [...] }) */
interface ModuleListResponse {
  data: ModuleData[];
}

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ModuleCreateArgs extends GlobalOptions {
  app: string;
  name: string;
  slug?: string;
  description?: string;
}

interface ModuleListArgs extends GlobalOptions {
  app: string;
}

interface ModuleUpdateArgs extends GlobalOptions {
  app: string;
  'module-id': string;
  name?: string;
  description?: string;
}

interface ModuleDeactivateArgs extends GlobalOptions {
  app: string;
  'module-id': string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve app by slug-or-UUID and build the modules API base path.
 *
 * @param client - Authenticated HTTP client
 * @param appIdOrSlug - Application UUID or slug
 * @returns API base path for modules under this application
 */
async function modulesPath(client: AdminHttpClient, appIdOrSlug: string): Promise<string> {
  const app = await resolveApp(client, appIdOrSlug);
  return `/api/admin/applications/${app.id}/modules`;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app module subcommand group — registered under `app` */
export const appModuleCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'module',
  describe: 'Manage application modules',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<ModuleCreateArgs>(
        'create <app>',
        'Create a module within an application',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('name', {
              type: 'string',
              demandOption: true,
              description: 'Module name',
            })
            .option('slug', {
              type: 'string',
              description: 'Module slug (auto-generated from name if omitted)',
            })
            .option('description', {
              type: 'string',
              description: 'Module description',
            }),
        async (argv) => {
          const args = argv as unknown as ModuleCreateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await modulesPath(client, args.app);
              const resp = await client.post<ModuleResponse>(base, {
                name: args.name,
                slug: args.slug,
                description: args.description,
              });
              const mod = resp.data.data;

              outputResult(
                args.json,
                () => { success(`Module created: ${mod.name} (${mod.slug})`); },
                mod,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<ModuleListArgs>(
        'list <app>',
        'List modules for an application',
        (y) =>
          y.positional('app', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as ModuleListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await modulesPath(client, args.app);
              const resp = await client.get<ModuleListResponse>(base);
              const modules = resp.data.data;

              if (modules.length === 0) {
                warn('No modules found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Name', 'Slug', 'Status', 'Created'],
                    modules.map((m) => [
                      truncateId(m.id),
                      m.name,
                      m.slug,
                      m.status,
                      formatDate(m.createdAt),
                    ]),
                  );
                  printTotal('modules', modules.length);
                },
                modules,
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<ModuleUpdateArgs>(
        'update <app> <module-id>',
        'Update a module',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .positional('module-id', {
              type: 'string',
              demandOption: true,
              description: 'Module UUID',
            })
            .option('name', {
              type: 'string',
              description: 'New module name',
            })
            .option('description', {
              type: 'string',
              description: 'New description',
            }),
        async (argv) => {
          const args = argv as unknown as ModuleUpdateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await modulesPath(client, args.app);
              const resp = await client.put<ModuleResponse>(
                `${base}/${args['module-id']}`,
                { name: args.name, description: args.description },
              );
              const mod = resp.data.data;

              outputResult(
                args.json,
                () => { success(`Module updated: ${mod.name} (${mod.slug})`); },
                mod,
              );
            });
          }, args.verbose);
        },
      )

      // ── deactivate ──────────────────────────────────────────────────
      .command<ModuleDeactivateArgs>(
        'deactivate <app> <module-id>',
        'Deactivate a module',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .positional('module-id', {
              type: 'string',
              demandOption: true,
              description: 'Module UUID',
            }),
        async (argv) => {
          const args = argv as unknown as ModuleDeactivateArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn(`[DRY RUN] Would deactivate module ${args['module-id']}`);
              return;
            }

            const confirmed = await confirm(
              `Deactivate module ${args['module-id']}?`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }

            await withHttpClient(args, async (client) => {
              const base = await modulesPath(client, args.app);
              await client.post(`${base}/${args['module-id']}/deactivate`);
              success(`Module deactivated: ${args['module-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a module subcommand: create, list, update, deactivate');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
