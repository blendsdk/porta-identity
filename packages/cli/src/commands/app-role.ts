/**
 * CLI application role subcommands.
 *
 * @module commands/app-role
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

interface RoleCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug?: string;
  description?: string;
}

interface RoleListArgs extends GlobalOptions {
  'app-id': string;
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

interface RoleDeleteArgs extends GlobalOptions {
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
          y.positional('app-id', {
            type: 'string',
            demandOption: true,
            description: 'Application ID',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const roles = await client.roles.list(argv['app-id']);

            if (roles.length === 0) {
              warn('No roles found');
              return;
            }

            if (argv.json) {
              printJson(roles);
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Created'],
                roles.map((role) => [role.id, role.name, role.slug, formatDate(role.createdAt)]),
              );
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
              success(`Role updated: ${updated.role.name}`);
              if (updated.reauthenticationRequired) {
                warn('Authenticate again before the next command.');
              }
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<RoleDeleteArgs>(
        'delete <app-id> <role-id>',
        'Permanently delete a role and its assignments',
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
            const confirmed = await confirm(
              `Keep role "${role.name}" (${role.slug}), or Delete ${role.name}? This permanently deletes its assignments and permission links.`,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            const result = await client.roles.delete(argv['app-id'], argv['role-id']);
            if (argv.json) {
              printJson(result);
            } else {
              success(`Role deleted: ${role.name} (${role.slug})`);
              if (result.reauthenticationRequired) {
                warn('Authenticate again before the next command.');
              }
            }
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
            await client.roles.assignPermissions(argv['app-id'], argv['role-id'], [
              argv['permission-id'],
            ]);
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
            const result = await client.roles.removePermissions(argv['app-id'], argv['role-id'], [
              argv['permission-id'],
            ]);
            if (argv.json) {
              printJson(result);
            } else {
              success('Permission removed from role');
              if (result.reauthenticationRequired) {
                warn('Authenticate again before the next command.');
              }
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(
        1,
        'Specify a role subcommand: create, list, show, update, delete, assign-perm, remove-perm',
      );
  },
  handler: () => {},
};
