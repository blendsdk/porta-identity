/**
 * CLI application permission subcommands.
 *
 * Manages permissions within an application via the Admin API — CRUD operations.
 *
 * Usage:
 *   porta app permission create <app> --name "users:read" --slug "crm:users:read" [--description "..."]
 *   porta app permission list <app>
 *   porta app permission update <app> <permission-id> --description "New description"
 *   porta app permission delete <app> <permission-id>
 *
 * @module cli/commands/app-permission
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { resolveApp } from './app.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Permission data as returned by the Admin API */
interface PermissionData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId: string;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response */
interface PermissionResponse { data: PermissionData; }

/** Array response for permission list */
interface PermissionListResponse { data: PermissionData[]; }

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface PermCreateArgs extends GlobalOptions { app: string; name: string; slug: string; description?: string; }
interface PermListArgs extends GlobalOptions { app: string; }
interface PermIdArgs extends GlobalOptions { app: string; 'permission-id': string; }
interface PermUpdateArgs extends PermIdArgs { name?: string; description?: string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve app and build the permissions API base path.
 *
 * @param client - Authenticated HTTP client
 * @param appIdOrSlug - Application UUID or slug
 * @returns API base path for permissions under this application
 */
async function permsPath(client: AdminHttpClient, appIdOrSlug: string): Promise<string> {
  const app = await resolveApp(client, appIdOrSlug);
  return `/api/admin/applications/${app.id}/permissions`;
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
      // ── create ──────────────────────────────────────────────────────
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
            await withHttpClient(args, async (client) => {
              const base = await permsPath(client, args.app);
              const resp = await client.post<PermissionResponse>(base, {
                name: args.name,
                slug: args.slug,
                description: args.description,
              });
              const perm = resp.data.data;
              outputResult(args.json, () => { success(`Permission created: ${perm.name} (${perm.slug})`); }, perm);
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<PermListArgs>(
        'list <app>',
        'List permissions for an application',
        (y) => y.positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as PermListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await permsPath(client, args.app);
              const resp = await client.get<PermissionListResponse>(base);
              const perms = resp.data.data;
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

      // ── update ──────────────────────────────────────────────────────
      .command<PermUpdateArgs>(
        'update <app> <permission-id>',
        'Update a permission',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .positional('permission-id', { type: 'string', demandOption: true, description: 'Permission UUID' })
          .option('name', { type: 'string', description: 'New name' })
          .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          const args = argv as unknown as PermUpdateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await permsPath(client, args.app);
              const resp = await client.put<PermissionResponse>(
                `${base}/${args['permission-id']}`,
                { name: args.name, description: args.description },
              );
              const perm = resp.data.data;
              outputResult(args.json, () => { success(`Permission updated: ${perm.name}`); }, perm);
            });
          }, args.verbose);
        },
      )

      // ── delete ──────────────────────────────────────────────────────
      .command<PermIdArgs>(
        'delete <app> <permission-id>',
        'Delete a permission',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .positional('permission-id', { type: 'string', demandOption: true, description: 'Permission UUID' }),
        async (argv) => {
          const args = argv as unknown as PermIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would delete permission ${args['permission-id']}`); return; }
            const confirmed = await confirm(`Delete permission ${args['permission-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withHttpClient(args, async (client) => {
              const base = await permsPath(client, args.app);
              await client.delete(`${base}/${args['permission-id']}`);
              success(`Permission deleted: ${args['permission-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a permission subcommand: create, list, update, delete');
  },
  handler: () => {},
};
