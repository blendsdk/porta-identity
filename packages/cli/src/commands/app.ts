/**
 * CLI application management commands.
 *
 * Provides CRUD and lifecycle management for applications.
 * All operations use the Porta SDK for Admin API communication.
 *
 * @module commands/app
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';
import { confirm } from '../prompt.js';
import { appModuleCommand } from './app-module.js';
import { appRoleCommand } from './app-role.js';
import { appPermissionCommand } from './app-permission.js';
import { appClaimCommand } from './app-claim.js';

// ---------------------------------------------------------------------------
// Argument types
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

export const appCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'app',
  describe: 'Manage applications',
  builder: (yargs) => {
    return (
      yargs
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
            try {
              const client = createClient(argv);
              const app = await client.applications.create({
                name: argv.name,
                slug: argv.slug,
                description: argv.description,
              });

              if (argv.json) {
                printJson(app);
              } else {
                success(`Application created: ${app.name} (${app.slug})`);
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', app.id],
                    ['Name', app.name],
                    ['Slug', app.slug],
                    ['Status', app.status],
                    ['Created', formatDate(app.createdAt)],
                  ],
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

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
            try {
              const client = createClient(argv);
              const result = await client.applications.list({
                page: argv.page,
                pageSize: argv['page-size'],
                ...(argv.status && { status: argv.status }),
              });

              if (result.data.length === 0) {
                if (argv.json) {
                  printJson(result);
                } else {
                  warn('No applications found');
                }
                return;
              }

              if (argv.json) {
                printJson(result);
              } else {
                printTable(
                  ['ID', 'Name', 'Slug', 'Status', 'Created'],
                  result.data.map((a) => [a.id, a.name, a.slug, a.status, formatDate(a.createdAt)]),
                );
                info(`Total: ${result.total} applications`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<AppIdArgs>(
          'get <id-or-slug>',
          'Get application details',
          (y) =>
            y.positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            }),
          async (argv) => {
            try {
              const client = createClient(argv);
              const { data: app } = await client.applications.get(argv['id-or-slug']);

              if (argv.json) {
                printJson(app);
              } else {
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
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

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
            try {
              const client = createClient(argv);
              const { data: application, etag } = await client.applications.get(argv['id-or-slug']);

              const updated = await client.applications.update(
                application.id,
                {
                  name: argv.name,
                  description: argv.description,
                },
                etag ?? undefined,
              );

              if (argv.json) {
                printJson(updated);
              } else {
                success(`Application updated: ${updated.name} (${updated.slug})`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<AppIdArgs>(
          'activate <id-or-slug>',
          'Activate an application',
          (y) =>
            y.positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            }),
          async (argv) => {
            try {
              const client = createClient(argv);
              const { data: app } = await client.applications.get(argv['id-or-slug']);
              await client.applications.activate(app.id);
              success(`Application activated: ${app.name} (${app.slug})`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<AppIdArgs>(
          'deactivate <id-or-slug>',
          'Deactivate an application',
          (y) =>
            y.positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            }),
          async (argv) => {
            try {
              const client = createClient(argv);
              const { data: app } = await client.applications.get(argv['id-or-slug']);
              if (!argv.force) {
                const confirmed = await confirm(
                  `Deactivate application "${app.name}" (${app.slug})?`,
                );
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }
              await client.applications.deactivate(app.id);
              success(`Application deactivated: ${app.name} (${app.slug})`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<AppIdArgs>(
          'archive <id-or-slug>',
          'Archive an application',
          (y) =>
            y.positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            }),
          async (argv) => {
            try {
              const client = createClient(argv);
              const { data: app } = await client.applications.get(argv['id-or-slug']);

              if (!argv.force) {
                const confirmed = await confirm(`Archive application "${app.name}" (${app.slug})?`);
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }

              await client.applications.archive(app.id);
              success(`Application archived: ${app.name} (${app.slug})`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<AppIdArgs>(
          'history <id-or-slug>',
          'Show application change history',
          (y) =>
            y.positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            }),
          async (argv) => {
            try {
              const client = createClient(argv);
              const history = await client.applications.getHistory(argv['id-or-slug']);

              if (history.length === 0) {
                warn('No history entries found');
                return;
              }

              if (argv.json) {
                printJson(history);
              } else {
                printTable(
                  ['Date', 'Event', 'Actor', 'Metadata'],
                  history.map((h) => [
                    formatDate(h.createdAt),
                    h.eventType,
                    h.actorId ?? '—',
                    h.metadata ? JSON.stringify(h.metadata) : '—',
                  ]),
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // Nested subcommand groups
        .command(appModuleCommand)
        .command(appRoleCommand)
        .command(appPermissionCommand)
        .command(appClaimCommand)
        .demandCommand(1, 'Specify an app subcommand')
    );
  },
  handler: () => {},
};
