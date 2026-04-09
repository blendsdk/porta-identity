/**
 * CLI application role subcommands.
 *
 * Manages roles within an application — CRUD plus permission assignment.
 *
 * Usage:
 *   porta app role create <app> --name "Admin" [--description "..."]
 *   porta app role list <app>
 *   porta app role show <role-id>
 *   porta app role update <role-id> --name "New Name"
 *   porta app role delete <role-id>
 *   porta app role assign-permissions <role-id> --permission-ids <id1>,<id2>
 *   porta app role remove-permissions <role-id> --permission-ids <id1>,<id2>
 *
 * @module cli/commands/app-role
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

interface RoleCreateArgs extends GlobalOptions { app: string; name: string; description?: string; }
interface RoleListArgs extends GlobalOptions { app: string; }
interface RoleIdArgs extends GlobalOptions { 'role-id': string; }
interface RoleUpdateArgs extends RoleIdArgs { name?: string; description?: string; }
interface RolePermArgs extends RoleIdArgs { 'permission-ids': string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve an app identifier to a UUID */
async function resolveAppId(idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const { getApplicationBySlug, ApplicationNotFoundError } = await import('../../applications/index.js');
  const app = await getApplicationBySlug(idOrSlug);
  if (!app) throw new ApplicationNotFoundError(idOrSlug);
  return app.id;
}

/** Parse comma-separated IDs into an array */
function parseIds(ids: string): string[] {
  return ids.split(',').map((id) => id.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app role subcommand group — registered under `app` */
export const appRoleCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'role',
  describe: 'Manage application roles',
  builder: (yargs) => {
    return yargs
      .command<RoleCreateArgs>(
        'create <app>',
        'Create a role',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .option('name', { type: 'string', demandOption: true, description: 'Role name' })
          .option('description', { type: 'string', description: 'Role description' }),
        async (argv) => {
          const args = argv as unknown as RoleCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createRole } = await import('../../rbac/index.js');
              const appId = await resolveAppId(args.app);
              const role = await createRole({ applicationId: appId, name: args.name, description: args.description });
              outputResult(args.json, () => { success(`Role created: ${role.name} (${role.slug})`); }, role);
            });
          }, args.verbose);
        },
      )
      .command<RoleListArgs>(
        'list <app>',
        'List roles for an application',
        (y) => y.positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as RoleListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listRolesByApplication } = await import('../../rbac/index.js');
              const appId = await resolveAppId(args.app);
              const roles = await listRolesByApplication(appId);
              if (roles.length === 0) { warn('No roles found'); return; }
              outputResult(args.json, () => {
                printTable(['ID', 'Name', 'Slug', 'Created'], roles.map((r) => [
                  truncateId(r.id), r.name, r.slug, formatDate(r.createdAt),
                ]));
                printTotal('roles', roles.length);
              }, roles);
            });
          }, args.verbose);
        },
      )
      .command<RoleIdArgs>(
        'show <role-id>',
        'Show role details with permissions',
        (y) => y.positional('role-id', { type: 'string', demandOption: true, description: 'Role UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { findRoleById, getPermissionsForRole, RoleNotFoundError } = await import('../../rbac/index.js');
              const role = await findRoleById(args['role-id']);
              if (!role) throw new RoleNotFoundError(args['role-id']);
              const perms = await getPermissionsForRole(role.id);
              outputResult(args.json, () => {
                printTable(['Field', 'Value'], [
                  ['ID', role.id], ['Name', role.name], ['Slug', role.slug],
                  ['Description', role.description ?? '—'],
                  ['Permissions', perms.length > 0 ? perms.map((p) => p.slug).join(', ') : '—'],
                  ['Created', formatDate(role.createdAt)],
                ]);
              }, { ...role, permissions: perms });
            });
          }, args.verbose);
        },
      )
      .command<RoleUpdateArgs>(
        'update <role-id>',
        'Update a role',
        (y) => y
          .positional('role-id', { type: 'string', demandOption: true, description: 'Role UUID' })
          .option('name', { type: 'string', description: 'New name' })
          .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          const args = argv as unknown as RoleUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updateRole } = await import('../../rbac/index.js');
              const role = await updateRole(args['role-id'], { name: args.name, description: args.description });
              outputResult(args.json, () => { success(`Role updated: ${role.name}`); }, role);
            });
          }, args.verbose);
        },
      )
      .command<RoleIdArgs>(
        'delete <role-id>',
        'Delete a role',
        (y) => y.positional('role-id', { type: 'string', demandOption: true, description: 'Role UUID' }),
        async (argv) => {
          const args = argv as unknown as RoleIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would delete role ${args['role-id']}`); return; }
            const confirmed = await confirm(`Delete role ${args['role-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { deleteRole } = await import('../../rbac/index.js');
              await deleteRole(args['role-id']);
              success(`Role deleted: ${args['role-id']}`);
            });
          }, args.verbose);
        },
      )
      .command<RolePermArgs>(
        'assign-permissions <role-id>',
        'Assign permissions to a role',
        (y) => y
          .positional('role-id', { type: 'string', demandOption: true, description: 'Role UUID' })
          .option('permission-ids', { type: 'string', demandOption: true, description: 'Comma-separated permission UUIDs' }),
        async (argv) => {
          const args = argv as unknown as RolePermArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { assignPermissionsToRole } = await import('../../rbac/index.js');
              const ids = parseIds(args['permission-ids']);
              await assignPermissionsToRole(args['role-id'], ids);
              success(`Assigned ${ids.length} permission(s) to role ${truncateId(args['role-id'])}`);
            });
          }, args.verbose);
        },
      )
      .command<RolePermArgs>(
        'remove-permissions <role-id>',
        'Remove permissions from a role',
        (y) => y
          .positional('role-id', { type: 'string', demandOption: true, description: 'Role UUID' })
          .option('permission-ids', { type: 'string', demandOption: true, description: 'Comma-separated permission UUIDs' }),
        async (argv) => {
          const args = argv as unknown as RolePermArgs;
          await withErrorHandling(async () => {
            const confirmed = await confirm(`Remove permissions from role ${args['role-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { removePermissionsFromRole } = await import('../../rbac/index.js');
              const ids = parseIds(args['permission-ids']);
              await removePermissionsFromRole(args['role-id'], ids);
              success(`Removed ${ids.length} permission(s) from role ${truncateId(args['role-id'])}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a role subcommand: create, list, show, update, delete, assign-permissions, remove-permissions');
  },
  handler: () => {},
};
