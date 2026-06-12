/**
 * CLI application role subcommands.
 *
 * @module commands/app-role
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface RoleCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug?: string;
  description?: string;
}

interface RoleListArgs extends GlobalOptions {
  'app-id': string;
  page: number;
  'page-size': number;
}

interface RoleShowArgs extends GlobalOptions {
  'app-id': string;
  'role-id': string;
}

interface RoleUpdateArgs extends GlobalOptions {
  'app-id': string;
  'role-id': string;
  name?: string;
  description?: string;
}

interface RoleArchiveArgs extends GlobalOptions {
  'app-id': string;
  'role-id': string;
}

interface RolePermArgs extends GlobalOptions {
  'app-id': string;
  'role-id': string;
  'permission-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const appRoleCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'role',
  describe: 'Manage application roles',
  builder: (yargs) => {
    return yargs
      .command<RoleCreateArgs>(
        'create <app-id>',
        'Create a role',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .option('name', { type: 'string', demandOption: true, description: 'Role name' })
            .option('slug', { type: 'string', description: 'Role slug' })
            .option('description', { type: 'string', description: 'Role description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const role = await client.roles.create(argv['app-id'], {
              applicationId: argv['app-id'],
              name: argv.name,
              slug: argv.slug,
              description: argv.description,
            });

            if (argv.json) {
              printJson(role);
            } else {
              success(`Role created: ${role.name} (${role.slug})`);
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', role.id],
                  ['Name', role.name],
                  ['Slug', role.slug],
                  ['Created', formatDate(role.createdAt)],
                ],
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RoleListArgs>(
        'list <app-id>',
        'List roles for an application',
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
            const result = await client.roles.list(argv['app-id'], {
              page: argv.page,
              pageSize: argv['page-size'],
            });

            if (result.data.length === 0) {
              warn('No roles found');
              return;
            }

            if (argv.json) {
              printJson(result);
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Created'],
                result.data.map((r) => [r.id, r.name, r.slug, formatDate(r.createdAt)]),
              );
              info(`Total: ${result.total} roles`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RoleShowArgs>(
        'show <app-id> <role-id>',
        'Show role details',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('role-id', { type: 'string', demandOption: true, description: 'Role ID' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const role = await client.roles.get(argv['app-id'], argv['role-id']);

            if (argv.json) {
              printJson(role);
            } else {
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', role.id],
                  ['Name', role.name],
                  ['Slug', role.slug],
                  ['Description', role.description ?? '—'],
                  ['Created', formatDate(role.createdAt)],
                  ['Updated', formatDate(role.updatedAt)],
                ],
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RoleUpdateArgs>(
        'update <app-id> <role-id>',
        'Update a role',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('role-id', { type: 'string', demandOption: true, description: 'Role ID' })
            .option('name', { type: 'string', description: 'New role name' })
            .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const updated = await client.roles.update(argv['app-id'], argv['role-id'], {
              name: argv.name,
              description: argv.description,
            });

            if (argv.json) {
              printJson(updated);
            } else {
              success(`Role updated: ${updated.name}`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RoleArchiveArgs>(
        'archive <app-id> <role-id>',
        'Archive a role',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('role-id', { type: 'string', demandOption: true, description: 'Role ID' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.roles.archive(argv['app-id'], argv['role-id']);
            success('Role archived');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RolePermArgs>(
        'assign-perm <app-id> <role-id> <permission-id>',
        'Assign a permission to a role',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('role-id', { type: 'string', demandOption: true, description: 'Role ID' })
            .positional('permission-id', {
              type: 'string',
              demandOption: true,
              description: 'Permission ID',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.roles.assignPermission(
              argv['app-id'],
              argv['role-id'],
              argv['permission-id'],
            );
            success('Permission assigned to role');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RolePermArgs>(
        'remove-perm <app-id> <role-id> <permission-id>',
        'Remove a permission from a role',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('role-id', { type: 'string', demandOption: true, description: 'Role ID' })
            .positional('permission-id', {
              type: 'string',
              demandOption: true,
              description: 'Permission ID',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.roles.removePermission(
              argv['app-id'],
              argv['role-id'],
              argv['permission-id'],
            );
            success('Permission removed from role');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(
        1,
        'Specify a role subcommand: create, list, show, update, archive, assign-perm, remove-perm',
      );
  },
  handler: () => {},
};
