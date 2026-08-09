/**
 * CLI user role assignment subcommands.
 *
 * Manages role assignments for users within an organization.
 *
 * Usage:
 *   porta user roles list --org <org-id> <user-id>
 *   porta user roles assign --org <org-id> <user-id> --role <role-id>
 *   porta user roles remove --org <org-id> <user-id> --role <role-id>
 *
 * @module commands/user-role
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface RoleListArgs extends GlobalOptions {
  org: string;
  'user-id': string;
}

interface RoleAssignArgs extends RoleListArgs {
  role: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** User roles subcommand group — registered under `user` */
export const userRolesCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'roles',
  describe: 'Manage user role assignments',
  builder: (yargs) => {
    return (
      yargs
        // ── list ───────────────────────────────────────────────────────
        .command<RoleListArgs>(
          'list <user-id>',
          'List roles assigned to a user',
          (y) =>
            y
              .positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              })
              .option('org', {
                type: 'string',
                demandOption: true,
                description: 'Organization UUID',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const roles = await sdkClient.userRoles.list(argv.org, argv['user-id']);

              if (roles.length === 0) {
                warn('No roles assigned');
                return;
              }

              if (argv.json) {
                printJson(roles);
              } else {
                printTable(
                  ['Role ID', 'Role Name', 'Assigned At'],
                  roles.map((r) => [
                    r.roleId,
                    r.roleName ?? '—',
                    r.assignedAt ? formatDate(r.assignedAt) : '—',
                  ]),
                );
                info(`Total: ${roles.length} roles`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── assign ─────────────────────────────────────────────────────
        .command<RoleAssignArgs>(
          'assign <user-id>',
          'Assign a role to a user',
          (y) =>
            y
              .positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              })
              .option('org', {
                type: 'string',
                demandOption: true,
                description: 'Organization UUID',
              })
              .option('role', {
                type: 'string',
                demandOption: true,
                description: 'Role UUID to assign',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.userRoles.assign(argv.org, argv['user-id'], argv.role);
              success(`Role ${argv.role} assigned to user ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── remove ─────────────────────────────────────────────────────
        .command<RoleAssignArgs>(
          'remove <user-id>',
          'Remove a role from a user',
          (y) =>
            y
              .positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              })
              .option('org', {
                type: 'string',
                demandOption: true,
                description: 'Organization UUID',
              })
              .option('role', {
                type: 'string',
                demandOption: true,
                description: 'Role UUID to remove',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.userRoles.remove(argv.org, argv['user-id'], argv.role);
              success(`Role ${argv.role} removed from user ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )
        .demandCommand(1, 'Specify a roles subcommand: list, assign, remove')
    );
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
