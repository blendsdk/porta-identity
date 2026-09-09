/**
 * CLI application permission subcommands.
 *
 * @module commands/app-permission
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, formatDate } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface PermCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug: string;
  description?: string;
}

interface PermListArgs extends GlobalOptions {
  'app-id': string;
}

interface PermShowArgs extends GlobalOptions {
  'app-id': string;
  'permission-id': string;
}

interface PermDeleteArgs extends GlobalOptions {
  'app-id': string;
  'permission-id': string;
}

interface PermUpdateArgs extends PermDeleteArgs {
  name?: string;
  description?: string;
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
            .option('slug', {
              type: 'string',
              demandOption: true,
              description: 'Permission slug',
            })
            .option('description', { type: 'string', description: 'Permission description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const perm = await client.permissions.create(argv['app-id'], {
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
          y.positional('app-id', {
            type: 'string',
            demandOption: true,
            description: 'Application ID',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const permissions = await client.permissions.list(argv['app-id']);

            if (argv.json) {
              printJson(permissions);
              return;
            }

            if (permissions.length === 0) {
              warn('No permissions found');
              return;
            }

            printTable(
              ['ID', 'Name', 'Slug', 'Created'],
              permissions.map((permission) => [
                permission.id,
                permission.name,
                permission.slug,
                formatDate(permission.createdAt),
              ]),
            );
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

      .command<PermUpdateArgs>(
        'update <app-id> <permission-id>',
        'Update permission metadata',
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
            })
            .option('name', { type: 'string', description: 'New permission name' })
            .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const permission = await client.permissions.update(
              argv['app-id'],
              argv['permission-id'],
              { name: argv.name, description: argv.description },
            );
            if (argv.json) {
              printJson(permission);
            } else {
              success(`Permission updated: ${permission.name}`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<PermDeleteArgs>(
        'delete <app-id> <permission-id>',
        'Permanently delete a permission and its role links',
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
            const permission = await client.permissions.get(argv['app-id'], argv['permission-id']);
            const confirmed = await confirm(
              `Keep permission "${permission.name}" (${permission.slug}), or Delete ${permission.name}? This permanently deletes its role links.`,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            const result = await client.permissions.delete(argv['app-id'], argv['permission-id']);
            if (argv.json) {
              printJson(result);
            } else {
              success(`Permission deleted: ${permission.name} (${permission.slug})`);
              if (result.reauthenticationRequired) {
                warn('Authenticate again before the next command.');
              }
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a permission subcommand: create, list, show, update, delete');
  },
  handler: () => {},
};
