/**
 * CLI application module subcommands.
 *
 * Manages modules within an application. Modules are organizational
 * units used for permission namespacing (e.g., "CRM", "Invoicing").
 *
 * Usage:
 *   porta app module create <app-id-or-slug> --name "Users Module" [--slug users]
 *   porta app module list <app-id-or-slug>
 *   porta app module update <module-id> --name "New Name"
 *   porta app module deactivate <module-id>
 *
 * @module cli/commands/app-module
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { isUuid } from './app.js';

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
  'module-id': string;
  name?: string;
  description?: string;
}

interface ModuleDeactivateArgs extends GlobalOptions {
  'module-id': string;
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
            await withBootstrap(args, async () => {
              const { createModule } = await import('../../applications/index.js');
              const appId = await resolveAppId(args.app);
              const mod = await createModule(appId, {
                name: args.name,
                slug: args.slug,
                description: args.description,
              });

              outputResult(
                args.json,
                () => { success(`Module created: ${mod.name} (${mod.slug})`); },
                mod,
              );
            });
          }, args.verbose);
        },
      )
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
            await withBootstrap(args, async () => {
              const { listModules } = await import('../../applications/index.js');
              const appId = await resolveAppId(args.app);
              const modules = await listModules(appId);

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
      .command<ModuleUpdateArgs>(
        'update <module-id>',
        'Update a module',
        (y) =>
          y
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
            await withBootstrap(args, async () => {
              const { updateModule } = await import('../../applications/index.js');
              const mod = await updateModule(args['module-id'], {
                name: args.name,
                description: args.description,
              });

              outputResult(
                args.json,
                () => { success(`Module updated: ${mod.name} (${mod.slug})`); },
                mod,
              );
            });
          }, args.verbose);
        },
      )
      .command<ModuleDeactivateArgs>(
        'deactivate <module-id>',
        'Deactivate a module',
        (y) =>
          y.positional('module-id', {
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

            await withBootstrap(args, async () => {
              const { deactivateModule } = await import('../../applications/index.js');
              await deactivateModule(args['module-id']);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an application identifier to a UUID.
 * If the input looks like a UUID, returns it directly.
 * Otherwise, looks up the application by slug and returns its ID.
 *
 * @param idOrSlug - Application UUID or slug
 * @returns Application UUID
 * @throws ApplicationNotFoundError if not found by slug
 */
async function resolveAppId(idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;

  const { getApplicationBySlug, ApplicationNotFoundError } = await import(
    '../../applications/index.js'
  );
  const app = await getApplicationBySlug(idOrSlug);
  if (!app) throw new ApplicationNotFoundError(idOrSlug);
  return app.id;
}
