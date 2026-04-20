/**
 * CLI user role subcommands.
 *
 * Manages role assignments for users via the Admin API — assign, remove, list.
 *
 * Usage:
 *   porta user roles assign <user-id> --role-ids <id1>,<id2> --org <org-id>
 *   porta user roles remove <user-id> --role-ids <id1>,<id2> --org <org-id>
 *   porta user roles list <user-id> --org <org-id>
 *
 * @module cli/commands/user-role
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Role data returned in user role list */
interface UserRoleData {
  id: string;
  name: string;
  slug: string;
}

/** Array response for role list */
interface UserRoleListResponse { data: UserRoleData[]; }

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
  org: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse comma-separated IDs into an array */
function parseIds(ids: string): string[] {
  return ids.split(',').map((id) => id.trim()).filter(Boolean);
}

/**
 * Build the user-roles API base path.
 *
 * @param orgId - Organization UUID
 * @param userId - User UUID
 * @returns API base path for user roles
 */
function userRolesPath(orgId: string, userId: string): string {
  return `/api/admin/organizations/${orgId}/users/${userId}/roles`;
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
            await withHttpClient(args, async (client) => {
              const roleIds = parseIds(args['role-ids']);
              const path = userRolesPath(args.org, args['user-id']);
              // PUT / expects { roleIds: [...] }
              await client.put(path, { roleIds });
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
            await withHttpClient(args, async (client) => {
              const path = userRolesPath(args.org, args['user-id']);
              // DELETE / expects { roleIds: [...] } in request body
              await client.delete(path);
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
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const path = userRolesPath(args.org, args['user-id']);
              const resp = await client.get<UserRoleListResponse>(path);
              const roles = resp.data.data;

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
