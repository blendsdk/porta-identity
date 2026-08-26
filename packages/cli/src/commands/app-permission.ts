/**
 * CLI application permission subcommands.
 *
 * @module commands/app-permission
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface PermCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug?: string;
  description?: string;
}

interface PermListArgs extends GlobalOptions {
  'app-id': string;
  page: number;
  'page-size': number;
}

interface PermShowArgs extends GlobalOptions {
  'app-id': string;
  'permission-id': string;
}

interface PermArchiveArgs extends GlobalOptions {
  'app-id': string;
  'permission-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const appPermissionCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'permission',
  describe: 'Manage application permissions',
  builder: (yargs) => {
    return yargs
      .command<PermCreateArgs>(
        'create <app-id>',
        'Create a permission',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .option('name', { type: 'string', demandOption: true, description: 'Permission name' })
            .option('slug', { type: 'string', description: 'Permission slug' })
            .option('description', { type: 'string', description: 'Permission description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const perm = await client.permissions.create(argv['app-id'], {
              applicationId: argv['app-id'],
              name: argv.name,
              slug: argv.slug,
              description: argv.description,
            });

            if (argv.json) {
              printJson(perm);
            } else {
              success(`Permission created: ${perm.name} (${perm.slug})`);
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', perm.id],
                  ['Name', perm.name],
                  ['Slug', perm.slug],
                  ['Created', formatDate(perm.createdAt)],
                ],
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<PermListArgs>(
        'list <app-id>',
        'List permissions for an application',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .option('page', { type: 'number', default: 1, description: 'Page number' })
            .option('page-size', { type: 'number', default: 20, description: 'Items per page' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const result = await client.permissions.list(argv['app-id'], {
              page: argv.page,
              pageSize: argv['page-size'],
            });

            if (result.data.length === 0) {
              warn('No permissions found');
              return;
            }

            if (argv.json) {
              printJson(result);
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Created'],
                result.data.map((p) => [p.id, p.name, p.slug, formatDate(p.createdAt)]),
              );
              info(`Total: ${result.total} permissions`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<PermShowArgs>(
        'show <app-id> <permission-id>',
        'Show permission details',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('permission-id', {
              type: 'string',
              demandOption: true,
              description: 'Permission ID',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const perm = await client.permissions.get(argv['app-id'], argv['permission-id']);

            if (argv.json) {
              printJson(perm);
            } else {
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', perm.id],
                  ['Name', perm.name],
                  ['Slug', perm.slug],
                  ['Description', perm.description ?? '—'],
                  ['Created', formatDate(perm.createdAt)],
                ],

              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<PermArchiveArgs>(
        'archive <app-id> <permission-id>',
        'Archive a permission',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('permission-id', {
              type: 'string',
              demandOption: true,
              description: 'Permission ID',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.permissions.archive(argv['app-id'], argv['permission-id']);
            success('Permission archived');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a permission subcommand: create, list, show, archive');
  },
  handler: () => {},
};
