/**
 * CLI application management commands.
 *
 * Provides CRUD and lifecycle management for applications, plus nested
 * subcommand groups for modules, roles, permissions, and custom claims.
 * Delegates to the application service module for all business logic.
 *
 * Usage:
 *   porta app create --name "My App" --org <org-id-or-slug>
 *   porta app list [--status active|inactive|archived] [--page 1] [--page-size 20]
 *   porta app show <id-or-slug>
 *   porta app update <id-or-slug> --name "New Name"
 *   porta app archive <id-or-slug>
 *   porta app module <subcommand> ...
 *   porta app role <subcommand> ...        (Phase 4.2)
 *   porta app permission <subcommand> ...  (Phase 4.2)
 *   porta app claim <subcommand> ...       (Phase 4.2)
 *
 * @module cli/commands/app
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import {
  printTable,
  success,
  warn,
  outputResult,
  truncateId,
  formatDate,
  printTotal,
} from '../output.js';
import { confirm } from '../prompt.js';
import { appModuleCommand } from './app-module.js';
import { appRoleCommand } from './app-role.js';
import { appPermissionCommand } from './app-permission.js';
import { appClaimCommand } from './app-claim.js';

/** UUID format regex — shared with app-module and other sub-files */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check whether a value looks like a UUID — exported for sub-command files */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve an application by ID or slug.
 * If the value matches UUID format, fetches by ID; otherwise by slug.
 */
async function resolveApp(idOrSlug: string) {
  const { getApplicationById, getApplicationBySlug } = await import(
    '../../applications/index.js'
  );
  return isUuid(idOrSlug)
    ? getApplicationById(idOrSlug)
    : getApplicationBySlug(idOrSlug);
}

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface AppCreateArgs extends GlobalOptions {
  name: string;
  slug?: string;
  description?: string;
}

interface AppListArgs extends GlobalOptions {
  status?: string;
  page: number;
  'page-size': number;
}

interface AppIdArgs extends GlobalOptions {
  'id-or-slug': string;
}

interface AppUpdateArgs extends AppIdArgs {
  name?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app command module — registered at the top level of the CLI */
export const appCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'app',
  describe: 'Manage applications',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<AppCreateArgs>(
        'create',
        'Create a new application',
        (y) =>
          y
            .option('name', {
              type: 'string',
              demandOption: true,
              description: 'Application name',
            })
            .option('slug', {
              type: 'string',
              description: 'URL-friendly slug (auto-generated from name if omitted)',
            })
            .option('description', {
              type: 'string',
              description: 'Application description',
            }),
        async (argv) => {
          const args = argv as unknown as AppCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createApplication } = await import('../../applications/index.js');
              const app = await createApplication({
                name: args.name,
                slug: args.slug,
                description: args.description,
              });

              outputResult(
                args.json,
                () => {
                  success(`Application created: ${app.name} (${app.slug})`);
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', app.id],
                      ['Name', app.name],
                      ['Slug', app.slug],
                      ['Status', app.status],
                      ['Description', app.description ?? '—'],
                      ['Created', formatDate(app.createdAt)],
                    ],
                  );
                },
                app,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<AppListArgs>(
        'list',
        'List applications',
        (y) =>
          y
            .option('status', {
              type: 'string',
              choices: ['active', 'inactive', 'archived'],
              description: 'Filter by status',
            })
            .option('page', {
              type: 'number',
              default: 1,
              description: 'Page number',
            })
            .option('page-size', {
              type: 'number',
              default: 20,
              description: 'Items per page',
            }),
        async (argv) => {
          const args = argv as unknown as AppListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listApplications } = await import('../../applications/index.js');
              const result = await listApplications({
                page: args.page,
                pageSize: args['page-size'],
                status: args.status as 'active' | 'inactive' | 'archived' | undefined,
              });

              if (result.data.length === 0) {
                warn('No applications found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Name', 'Slug', 'Status', 'Created'],
                    result.data.map((a) => [
                      truncateId(a.id),
                      a.name,
                      a.slug,
                      a.status,
                      formatDate(a.createdAt),
                    ]),
                  );
                  printTotal('applications', result.total);
                },
                { data: result.data, total: result.total, page: result.page, pageSize: result.pageSize },
              );
            });
          }, args.verbose);
        },
      )

      // ── show ────────────────────────────────────────────────────────
      .command<AppIdArgs>(
        'show <id-or-slug>',
        'Show application details',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as AppIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { ApplicationNotFoundError } = await import('../../applications/index.js');
              const app = await resolveApp(args['id-or-slug']);
              if (!app) throw new ApplicationNotFoundError(args['id-or-slug']);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', app.id],
                      ['Name', app.name],
                      ['Slug', app.slug],
                      ['Status', app.status],
                      ['Description', app.description ?? '—'],
                      ['Created', formatDate(app.createdAt)],
                      ['Updated', formatDate(app.updatedAt)],
                    ],
                  );
                },
                app,
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<AppUpdateArgs>(
        'update <id-or-slug>',
        'Update application fields',
        (y) =>
          y
            .positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('name', {
              type: 'string',
              description: 'New application name',
            })
            .option('description', {
              type: 'string',
              description: 'New description',
            }),
        async (argv) => {
          const args = argv as unknown as AppUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updateApplication, ApplicationNotFoundError } = await import(
                '../../applications/index.js'
              );

              const app = await resolveApp(args['id-or-slug']);
              if (!app) throw new ApplicationNotFoundError(args['id-or-slug']);

              const updated = await updateApplication(app.id, {
                name: args.name,
                description: args.description,
              });

              outputResult(
                args.json,
                () => { success(`Application updated: ${updated.name} (${updated.slug})`); },
                updated,
              );
            });
          }, args.verbose);
        },
      )

      // ── archive ─────────────────────────────────────────────────────
      .command<AppIdArgs>(
        'archive <id-or-slug>',
        'Archive an application (permanent)',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as AppIdArgs;
          await withErrorHandling(async () => {
            // Resolve app first to show name in confirmation
            let appName = args['id-or-slug'];
            let appId = args['id-or-slug'];
            await withBootstrap(args, async () => {
              const { ApplicationNotFoundError } = await import('../../applications/index.js');
              const app = await resolveApp(args['id-or-slug']);
              if (!app) throw new ApplicationNotFoundError(args['id-or-slug']);
              appName = `${app.name} (${app.slug})`;
              appId = app.id;
            });

            if (args['dry-run']) {
              warn(`[DRY RUN] Would archive application "${appName}"`);
              return;
            }

            const confirmed = await confirm(
              `Archive application "${appName}"? This is permanent and cannot be undone.`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }

            await withBootstrap(args, async () => {
              const { archiveApplication } = await import('../../applications/index.js');
              await archiveApplication(appId);
              success(`Application archived: ${appName}`);
            });
          }, args.verbose);
        },
      )

      // ── nested subcommand groups ────────────────────────────────────
      .command(appModuleCommand)
      .command(appRoleCommand)
      .command(appPermissionCommand)
      .command(appClaimCommand)
      .demandCommand(1, 'Specify an app subcommand: create, list, show, update, archive, module, role, permission, claim');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
