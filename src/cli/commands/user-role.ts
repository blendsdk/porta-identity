/**
 * CLI user role subcommands.
 *
 * Manages role assignments for users — assign, remove, and list.
 *
 * Usage:
 *   porta user roles assign <user-id> --role-ids <id1>,<id2> --org <org-id>
 *   porta user roles remove <user-id> --role-ids <id1>,<id2> --org <org-id>
 *   porta user roles list <user-id> [--org <org-id>]
 *
 * @module cli/commands/user-role
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface RoleAssignArgs extends GlobalOptions {
  'user-id': string;
  'role-ids': string;
  org: string;
}

interface RoleRemoveArgs extends GlobalOptions {
  'user-id': string;
  'role-ids': string;
  org: string;
}

interface RoleListArgs extends GlobalOptions {
  'user-id': string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse comma-separated IDs into an array */
function parseIds(ids: string): string[] {
  return ids.split(',').map((id) => id.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user roles subcommand group — registered under `user` */
export const userRoleCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'roles',
  describe: 'Manage user role assignments',
  builder: (yargs) => {
    return yargs
      // ── assign ─────────────────────────────────────────────────────
      .command<RoleAssignArgs>(
        'assign <user-id>',
        'Assign roles to a user',
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('role-ids', { type: 'string', demandOption: true, description: 'Comma-separated role UUIDs' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleAssignArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { assignRolesToUser } = await import('../../rbac/index.js');
              const roleIds = parseIds(args['role-ids']);
              await assignRolesToUser(args['user-id'], roleIds, args.org);
              success(`Assigned ${roleIds.length} role(s) to user ${truncateId(args['user-id'])}`);
            });
          }, args.verbose);
        },
      )

      // ── remove ─────────────────────────────────────────────────────
      .command<RoleRemoveArgs>(
        'remove <user-id>',
        'Remove roles from a user',
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('role-ids', { type: 'string', demandOption: true, description: 'Comma-separated role UUIDs' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleRemoveArgs;
          await withErrorHandling(async () => {
            const roleIds = parseIds(args['role-ids']);
            const confirmed = await confirm(
              `Remove ${roleIds.length} role(s) from user ${args['user-id']}?`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            await withBootstrap(args, async () => {
              const { removeRolesFromUser } = await import('../../rbac/index.js');
              await removeRolesFromUser(args['user-id'], roleIds, args.org);
              success(`Removed ${roleIds.length} role(s) from user ${truncateId(args['user-id'])}`);
            });
          }, args.verbose);
        },
      )

      // ── list ───────────────────────────────────────────────────────
      .command<RoleListArgs>(
        'list <user-id>',
        "List a user's role assignments",
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getUserRoles } = await import('../../rbac/index.js');
              const roles = await getUserRoles(args['user-id']);

              if (roles.length === 0) {
                warn('No roles assigned');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Role ID', 'Name', 'Slug'],
                    roles.map((r) => [truncateId(r.id), r.name, r.slug]),
                  );
                  printTotal('roles', roles.length);
                },
                roles,
              );
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a roles subcommand: assign, remove, list');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
