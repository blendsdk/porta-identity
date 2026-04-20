/**
 * CLI application management commands.
 *
 * Provides CRUD and lifecycle management for applications, plus nested
 * subcommand groups for modules, roles, permissions, and custom claims.
 * Core CRUD uses authenticated HTTP requests against the Admin API.
 * Nested subcommands (module, role, permission, claim) are migrated
 * separately in Phase 4.3.
 *
 * Usage:
 *   porta app create --name "My App"
 *   porta app list [--status active|inactive|archived] [--page 1] [--page-size 20]
 *   porta app show <id-or-slug>
 *   porta app update <id-or-slug> --name "New Name"
 *   porta app archive <id-or-slug>
 *   porta app module <subcommand> ...
 *   porta app role <subcommand> ...
 *   porta app permission <subcommand> ...
 *   porta app claim <subcommand> ...
 *
 * @module cli/commands/app
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import {
  printTable,
  success,
  warn,
  outputResult,
  truncateId,
  formatDate,
  printTotal,
} from '../output.js';
import { confirm } from '../prompt.js';
import { appModuleCommand } from './app-module.js';
import { appRoleCommand } from './app-role.js';
import { appPermissionCommand } from './app-permission.js';
import { appClaimCommand } from './app-claim.js';

// ---------------------------------------------------------------------------
// API response types (JSON-serialized shapes from the Admin API)
// ---------------------------------------------------------------------------

/** Application data as returned by the Admin API (dates are ISO strings) */
interface AppData {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response: { data: AppData } */
interface AppResponse {
  data: AppData;
}

/** Paginated list response: { data: AppData[], total, page, pageSize } */
interface AppListResponse {
  data: AppData[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID format regex — shared with app-module and other sub-files */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check whether a value looks like a UUID — exported for sub-command files */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve an application by ID or slug via the Admin API.
 *
 * The GET /api/admin/applications/:idOrSlug endpoint supports both
 * UUID and slug lookups. If the app doesn't exist, the API returns
 * 404 which propagates as HttpNotFoundError.
 *
 * @param client - Authenticated HTTP client
 * @param idOrSlug - UUID or slug string
 * @returns Application data from the API
 * @throws HttpNotFoundError if the application doesn't exist
 */
async function resolveApp(client: AdminHttpClient, idOrSlug: string): Promise<AppData> {
  const resp = await client.get<AppResponse>(
    `/api/admin/applications/${encodeURIComponent(idOrSlug)}`,
  );
  return resp.data.data;
}

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface AppCreateArgs extends GlobalOptions {
  name: string;
  slug?: string;
  description?: string;
}

interface AppListArgs extends GlobalOptions {
  status?: string;
  page: number;
  'page-size': number;
}

interface AppIdArgs extends GlobalOptions {
  'id-or-slug': string;
}

interface AppUpdateArgs extends AppIdArgs {
  name?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app command module — registered at the top level of the CLI */
export const appCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'app',
  describe: 'Manage applications',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<AppCreateArgs>(
        'create',
        'Create a new application',
        (y) =>
          y
            .option('name', {
              type: 'string',
              demandOption: true,
              description: 'Application name',
            })
            .option('slug', {
              type: 'string',
              description: 'URL-friendly slug (auto-generated from name if omitted)',
            })
            .option('description', {
              type: 'string',
              description: 'Application description',
            }),
        async (argv) => {
          const args = argv as unknown as AppCreateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const resp = await client.post<AppResponse>('/api/admin/applications', {
                name: args.name,
                slug: args.slug,
                description: args.description,
              });
              const app = resp.data.data;

              outputResult(
                args.json,
                () => {
                  success(`Application created: ${app.name} (${app.slug})`);
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', app.id],
                      ['Name', app.name],
                      ['Slug', app.slug],
                      ['Status', app.status],
                      ['Description', app.description ?? '—'],
                      ['Created', formatDate(app.createdAt)],
                    ],
                  );
                },
                app,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<AppListArgs>(
        'list',
        'List applications',
        (y) =>
          y
            .option('status', {
              type: 'string',
              choices: ['active', 'inactive', 'archived'],
              description: 'Filter by status',
            })
            .option('page', {
              type: 'number',
              default: 1,
              description: 'Page number',
            })
            .option('page-size', {
              type: 'number',
              default: 20,
              description: 'Items per page',
            }),
        async (argv) => {
          const args = argv as unknown as AppListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const params: Record<string, string> = {
                page: String(args.page),
                pageSize: String(args['page-size']),
              };
              if (args.status) params.status = args.status;

              const resp = await client.get<AppListResponse>(
                '/api/admin/applications',
                params,
              );
              const result = resp.data;

              if (result.data.length === 0) {
                warn('No applications found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Name', 'Slug', 'Status', 'Created'],
                    result.data.map((a) => [
                      truncateId(a.id),
                      a.name,
                      a.slug,
                      a.status,
                      formatDate(a.createdAt),
                    ]),
                  );
                  printTotal('applications', result.total);
                },
                { data: result.data, total: result.total, page: result.page, pageSize: result.pageSize },
              );
            });
          }, args.verbose);
        },
      )

      // ── show ────────────────────────────────────────────────────────
      .command<AppIdArgs>(
        'show <id-or-slug>',
        'Show application details',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as AppIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const app = await resolveApp(client, args['id-or-slug']);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', app.id],
                      ['Name', app.name],
                      ['Slug', app.slug],
                      ['Status', app.status],
                      ['Description', app.description ?? '—'],
                      ['Created', formatDate(app.createdAt)],
                      ['Updated', formatDate(app.updatedAt)],
                    ],
                  );
                },
                app,
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<AppUpdateArgs>(
        'update <id-or-slug>',
        'Update application fields',
        (y) =>
          y
            .positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('name', {
              type: 'string',
              description: 'New application name',
            })
            .option('description', {
              type: 'string',
              description: 'New description',
            }),
        async (argv) => {
          const args = argv as unknown as AppUpdateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              // Resolve to get UUID for the PUT endpoint
              const app = await resolveApp(client, args['id-or-slug']);

              const resp = await client.put<AppResponse>(
                `/api/admin/applications/${app.id}`,
                {
                  name: args.name,
                  description: args.description,
                },
              );
              const updated = resp.data.data;

              outputResult(
                args.json,
                () => { success(`Application updated: ${updated.name} (${updated.slug})`); },
                updated,
              );
            });
          }, args.verbose);
        },
      )

      // ── archive ─────────────────────────────────────────────────────
      .command<AppIdArgs>(
        'archive <id-or-slug>',
        'Archive an application (permanent)',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as AppIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const app = await resolveApp(client, args['id-or-slug']);
              const appName = `${app.name} (${app.slug})`;

              if (args['dry-run']) {
                warn(`[DRY RUN] Would archive application "${appName}"`);
                return;
              }

              const confirmed = await confirm(
                `Archive application "${appName}"? This is permanent and cannot be undone.`,
                args.force,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }

              await client.post(`/api/admin/applications/${app.id}/archive`);
              success(`Application archived: ${appName}`);
            });
          }, args.verbose);
        },
      )

      // ── nested subcommand groups ────────────────────────────────────
      // These are migrated to HTTP in Phase 4.3
      .command(appModuleCommand)
      .command(appRoleCommand)
      .command(appPermissionCommand)
      .command(appClaimCommand)
      .demandCommand(1, 'Specify an app subcommand: create, list, show, update, archive, module, role, permission, claim');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
