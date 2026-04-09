/**
 * CLI application permission subcommands.
 *
 * Manages permissions within an application — CRUD operations.
 *
 * Usage:
 *   porta app permission create <app> --name "users:read" [--description "Read users"]
 *   porta app permission list <app>
 *   porta app permission update <permission-id> --description "New description"
 *   porta app permission delete <permission-id>
 *
 * @module cli/commands/app-permission
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

interface PermCreateArgs extends GlobalOptions { app: string; name: string; slug: string; description?: string; }
interface PermListArgs extends GlobalOptions { app: string; }
interface PermIdArgs extends GlobalOptions { 'permission-id': string; }
interface PermUpdateArgs extends PermIdArgs { name?: string; description?: string; }

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

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app permission subcommand group — registered under `app` */
export const appPermissionCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'permission',
  describe: 'Manage application permissions',
  builder: (yargs) => {
    return yargs
      .command<PermCreateArgs>(
        'create <app>',
        'Create a permission',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .option('name', { type: 'string', demandOption: true, description: 'Permission display name' })
          .option('slug', { type: 'string', demandOption: true, description: 'Permission slug (e.g., crm:contacts:read)' })
          .option('description', { type: 'string', description: 'Permission description' }),
        async (argv) => {
          const args = argv as unknown as PermCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createPermission } = await import('../../rbac/index.js');
              const appId = await resolveAppId(args.app);
              const perm = await createPermission({
                applicationId: appId, name: args.name, slug: args.slug, description: args.description,
              });
              outputResult(args.json, () => { success(`Permission created: ${perm.name} (${perm.slug})`); }, perm);
            });
          }, args.verbose);
        },
      )
      .command<PermListArgs>(
        'list <app>',
        'List permissions for an application',
        (y) => y.positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as PermListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listPermissionsByApplication } = await import('../../rbac/index.js');
              const appId = await resolveAppId(args.app);
              const perms = await listPermissionsByApplication(appId);
              if (perms.length === 0) { warn('No permissions found'); return; }
              outputResult(args.json, () => {
                printTable(['ID', 'Name', 'Slug', 'Created'], perms.map((p) => [
                  truncateId(p.id), p.name, p.slug, formatDate(p.createdAt),
                ]));
                printTotal('permissions', perms.length);
              }, perms);
            });
          }, args.verbose);
        },
      )
      .command<PermUpdateArgs>(
        'update <permission-id>',
        'Update a permission',
        (y) => y
          .positional('permission-id', { type: 'string', demandOption: true, description: 'Permission UUID' })
          .option('name', { type: 'string', description: 'New name' })
          .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          const args = argv as unknown as PermUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updatePermission } = await import('../../rbac/index.js');
              const perm = await updatePermission(args['permission-id'], {
                name: args.name, description: args.description,
              });
              outputResult(args.json, () => { success(`Permission updated: ${perm.name}`); }, perm);
            });
          }, args.verbose);
        },
      )
      .command<PermIdArgs>(
        'delete <permission-id>',
        'Delete a permission',
        (y) => y.positional('permission-id', { type: 'string', demandOption: true, description: 'Permission UUID' }),
        async (argv) => {
          const args = argv as unknown as PermIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would delete permission ${args['permission-id']}`); return; }
            const confirmed = await confirm(`Delete permission ${args['permission-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { deletePermission } = await import('../../rbac/index.js');
              await deletePermission(args['permission-id']);
              success(`Permission deleted: ${args['permission-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a permission subcommand: create, list, update, delete');
  },
  handler: () => {},
};
