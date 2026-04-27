/**
 * CLI organization management commands.
 *
 * Provides CRUD and lifecycle management for organizations (tenants).
 * All operations use authenticated HTTP requests against the Admin API.
 *
 * Usage:
 *   porta org create --name "Acme Corp" [--slug acme-corp] [--locale en]
 *   porta org list [--status active|suspended|archived] [--page 1] [--page-size 20]
 *   porta org show <id-or-slug>
 *   porta org update <id-or-slug> --name "New Name" [--default-locale fr]
 *   porta org suspend <id-or-slug>
 *   porta org activate <id-or-slug>
 *   porta org archive <id-or-slug>
 *   porta org branding <id-or-slug> --logo-url "..." [--primary-color "#..."]
 *
 * @module cli/commands/org
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';
import type { LoginMethod } from '../../clients/types.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import {
  printTable,
  success,
  warn,
  error,
  outputResult,
  truncateId,
  formatDate,
  printTotal,
} from '../output.js';
import { confirm, promptInput } from '../prompt.js';
import { parseLoginMethodsFlag } from '../parsers.js';

// ---------------------------------------------------------------------------
// API response types (JSON-serialized shapes from the Admin API)
// ---------------------------------------------------------------------------

/** Organization data as returned by the Admin API (dates are ISO strings) */
interface OrgData {
  id: string;
  name: string;
  slug: string;
  status: string;
  isSuperAdmin: boolean;
  defaultLocale: string;
  defaultLoginMethods: string[];
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response: { data: OrgData } */
interface OrgResponse {
  data: OrgData;
}

/** Paginated list response: { data: OrgData[], total, page, pageSize } */
interface OrgListResponse {
  data: OrgData[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an organization by ID or slug via the Admin API.
 *
 * The GET /api/admin/organizations/:idOrSlug endpoint supports both
 * UUID and slug lookups. If the org doesn't exist, the API returns
 * 404 which propagates as HttpNotFoundError.
 *
 * @param client - Authenticated HTTP client
 * @param idOrSlug - UUID or slug string
 * @returns Organization data from the API
 * @throws HttpNotFoundError if the organization doesn't exist
 */
async function resolveOrg(client: AdminHttpClient, idOrSlug: string): Promise<OrgData> {
  const resp = await client.get<OrgResponse>(
    `/api/admin/organizations/${encodeURIComponent(idOrSlug)}`,
  );
  return resp.data.data;
}

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface OrgCreateArgs extends GlobalOptions {
  name: string;
  slug?: string;
  locale?: string;
  'login-methods'?: string;
}

interface OrgListArgs extends GlobalOptions {
  status?: string;
  page: number;
  'page-size': number;
}

interface OrgIdArgs extends GlobalOptions {
  'id-or-slug': string;
}

interface OrgUpdateArgs extends OrgIdArgs {
  name?: string;
  'default-locale'?: string;
  'login-methods'?: string;
}

interface OrgBrandingArgs extends OrgIdArgs {
  'logo-url'?: string;
  'favicon-url'?: string;
  'primary-color'?: string;
  'company-name'?: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The org command module — registered at the top level of the CLI */
export const orgCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'org',
  describe: 'Manage organizations',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<OrgCreateArgs>(
        'create',
        'Create a new organization',
        (y) =>
          y
            .option('name', {
              type: 'string',
              demandOption: true,
              description: 'Organization name',
            })
            .option('slug', {
              type: 'string',
              description: 'URL-friendly slug (auto-generated from name if omitted)',
            })
            .option('locale', {
              type: 'string',
              description: 'Default locale (default: en)',
            })
            .option('login-methods', {
              type: 'string',
              description:
                'Comma-separated default login methods for the organization (password, magic_link)',
            }),
        async (argv) => {
          const args = argv as unknown as OrgCreateArgs;
          await withErrorHandling(async () => {
            // Parse --login-methods before HTTP call so invalid input fails fast.
            // The cast is safe: `allowInherit: false` guarantees the parser
            // never returns `null` (it throws on the "inherit" sentinel instead).
            const defaultLoginMethods = parseLoginMethodsFlag(
              args['login-methods'],
              /* allowInherit */ false,
            ) as LoginMethod[] | undefined;

            await withHttpClient(args, async (client) => {
              const resp = await client.post<OrgResponse>('/api/admin/organizations', {
                name: args.name,
                slug: args.slug,
                defaultLocale: args.locale,
                // Only include the field when the operator provided it — otherwise
                // the DB DEFAULT clause fires and stamps ['password', 'magic_link'].
                ...(defaultLoginMethods !== undefined && { defaultLoginMethods }),
              });
              const org = resp.data.data;

              outputResult(
                args.json,
                () => {
                  success(`Organization created: ${org.name} (${org.slug})`);
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', org.id],
                      ['Name', org.name],
                      ['Slug', org.slug],
                      ['Status', org.status],
                      ['Locale', org.defaultLocale],
                      ['Default Login Methods', org.defaultLoginMethods.join(', ')],
                      ['Created', formatDate(org.createdAt)],
                    ],
                  );
                },
                org,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<OrgListArgs>(
        'list',
        'List organizations',
        (y) =>
          y
            .option('status', {
              type: 'string',
              choices: ['active', 'suspended', 'archived'],
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
          const args = argv as unknown as OrgListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              // Build query params — all values must be strings for URLSearchParams
              const params: Record<string, string> = {
                page: String(args.page),
                pageSize: String(args['page-size']),
              };
              if (args.status) params.status = args.status;

              const resp = await client.get<OrgListResponse>(
                '/api/admin/organizations',
                params,
              );
              const result = resp.data;

              if (result.data.length === 0) {
                warn('No organizations found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Name', 'Slug', 'Status', 'Created'],
                    result.data.map((o) => [
                      truncateId(o.id),
                      o.name,
                      o.slug,
                      o.status,
                      formatDate(o.createdAt),
                    ]),
                  );
                  printTotal('organizations', result.total);
                },
                { data: result.data, total: result.total, page: result.page, pageSize: result.pageSize },
              );
            });
          }, args.verbose);
        },
      )

      // ── show ────────────────────────────────────────────────────────
      .command<OrgIdArgs>(
        'show <id-or-slug>',
        'Show organization details',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as OrgIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const org = await resolveOrg(client, args['id-or-slug']);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', org.id],
                      ['Name', org.name],
                      ['Slug', org.slug],
                      ['Status', org.status],
                      ['Super Admin', String(org.isSuperAdmin)],
                      ['Default Locale', org.defaultLocale],
                      ['Default Login Methods', org.defaultLoginMethods.join(', ')],
                      ['Logo URL', org.brandingLogoUrl ?? '—'],
                      ['Primary Color', org.brandingPrimaryColor ?? '—'],
                      ['Created', formatDate(org.createdAt)],
                      ['Updated', formatDate(org.updatedAt)],
                    ],
                  );
                },
                org,
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<OrgUpdateArgs>(
        'update <id-or-slug>',
        'Update organization fields',
        (y) =>
          y
            .positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID or slug',
            })
            .option('name', {
              type: 'string',
              description: 'New organization name',
            })
            .option('default-locale', {
              type: 'string',
              description: 'New default locale',
            })
            .option('login-methods', {
              type: 'string',
              description:
                'Comma-separated default login methods for the organization (password, magic_link)',
            }),
        async (argv) => {
          const args = argv as unknown as OrgUpdateArgs;
          await withErrorHandling(async () => {
            // See create-handler comment — `allowInherit: false` means the parser
            // cannot return `null`, so narrowing the return type here is sound.
            const defaultLoginMethods = parseLoginMethodsFlag(
              args['login-methods'],
              /* allowInherit */ false,
            ) as LoginMethod[] | undefined;

            await withHttpClient(args, async (client) => {
              // Resolve ID — update needs UUID for the PUT endpoint
              const org = await resolveOrg(client, args['id-or-slug']);

              const resp = await client.put<OrgResponse>(
                `/api/admin/organizations/${org.id}`,
                {
                  name: args.name,
                  defaultLocale: args['default-locale'],
                  // Only forward when the flag was provided — keeps the "unchanged" path pure
                  ...(defaultLoginMethods !== undefined && { defaultLoginMethods }),
                },
              );
              const updated = resp.data.data;

              outputResult(
                args.json,
                () => {
                  success(`Organization updated: ${updated.name} (${updated.slug})`);
                },
                updated,
              );
            });
          }, args.verbose);
        },
      )

      // ── suspend ─────────────────────────────────────────────────────
      .command<OrgIdArgs>(
        'suspend <id-or-slug>',
        'Suspend an organization',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as OrgIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              // Resolve org first to get name for confirmation prompt
              const org = await resolveOrg(client, args['id-or-slug']);

              if (args['dry-run']) {
                warn(`[DRY RUN] Would suspend organization "${org.name}" (${org.slug})`);
                return;
              }

              const confirmed = await confirm(
                `Suspend organization "${org.name}" (${org.slug})?`,
                args.force,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }

              await client.post(`/api/admin/organizations/${org.id}/suspend`);
              success(`Organization suspended: ${org.name} (${org.slug})`);
            });
          }, args.verbose);
        },
      )

      // ── activate ────────────────────────────────────────────────────
      .command<OrgIdArgs>(
        'activate <id-or-slug>',
        'Activate a suspended organization',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as OrgIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const org = await resolveOrg(client, args['id-or-slug']);

              await client.post(`/api/admin/organizations/${org.id}/activate`);
              success(`Organization activated: ${org.name} (${org.slug})`);
            });
          }, args.verbose);
        },
      )

      // ── archive ─────────────────────────────────────────────────────
      .command<OrgIdArgs>(
        'archive <id-or-slug>',
        'Archive an organization (soft-delete)',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as OrgIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const org = await resolveOrg(client, args['id-or-slug']);

              if (args['dry-run']) {
                warn(`[DRY RUN] Would archive organization "${org.name}" (${org.slug})`);
                return;
              }

              const confirmed = await confirm(
                `Archive organization "${org.name}" (${org.slug})? This cannot be easily undone.`,
                args.force,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }

              await client.post(`/api/admin/organizations/${org.id}/archive`);
              success(`Organization archived: ${org.name} (${org.slug})`);
            });
          }, args.verbose);
        },
      )

      // ── branding ────────────────────────────────────────────────────
      .command<OrgBrandingArgs>(
        'branding <id-or-slug>',
        'Update organization branding',
        (y) =>
          y
            .positional('id-or-slug', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID or slug',
            })
            .option('logo-url', {
              type: 'string',
              description: 'Logo URL',
            })
            .option('favicon-url', {
              type: 'string',
              description: 'Favicon URL',
            })
            .option('primary-color', {
              type: 'string',
              description: 'Primary brand color (hex)',
            })
            .option('company-name', {
              type: 'string',
              description: 'Company display name',
            }),
        async (argv) => {
          const args = argv as unknown as OrgBrandingArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const org = await resolveOrg(client, args['id-or-slug']);

              const resp = await client.put<OrgResponse>(
                `/api/admin/organizations/${org.id}/branding`,
                {
                  logoUrl: args['logo-url'],
                  faviconUrl: args['favicon-url'],
                  primaryColor: args['primary-color'],
                  companyName: args['company-name'],
                },
              );
              const updated = resp.data.data;

              outputResult(
                args.json,
                () => {
                  success(`Branding updated for: ${updated.name} (${updated.slug})`);
                },
                updated,
              );
            });
          }, args.verbose);
        },
      )
      // ── destroy ─────────────────────────────────────────────────────
      .command<OrgIdArgs>(
        'destroy <id-or-slug>',
        'Permanently destroy an organization and all its data (CASCADE)',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          const args = argv as unknown as OrgIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const idOrSlug = args['id-or-slug'];

              // 1. Always fetch cascade counts first (dry-run query)
              const preview = await client.delete<{
                dryRun: boolean;
                organization: OrgData;
                cascadeCounts: {
                  applications: number;
                  clients: number;
                  users: number;
                  roles: number;
                  permissions: number;
                  claim_definitions: number;
                };
              }>(
                `/api/admin/organizations/${encodeURIComponent(idOrSlug)}?dry-run=true`,
              );
              const { organization: org, cascadeCounts: counts } = preview.data;

              // 2. Display what will be destroyed
              console.log('');
              warn('This will PERMANENTLY destroy the following:');
              console.log('');
              console.log(`  Organization:      ${org.name} (${org.slug})`);
              console.log(`  Applications:      ${counts.applications}`);
              console.log(`  Clients:           ${counts.clients}`);
              console.log(`  Users:             ${counts.users}`);
              console.log(`  Roles:             ${counts.roles}`);
              console.log(`  Permissions:       ${counts.permissions}`);
              console.log(`  Claim Definitions: ${counts.claim_definitions}`);
              console.log('');

              // 3. If dry-run, stop here
              if (args['dry-run']) {
                warn('Dry run — no changes made.');
                return;
              }

              // 4. Type-to-confirm (unless --force)
              if (!args.force) {
                const confirmSlug = await promptInput(
                  `Type the organization slug "${org.slug}" to confirm destruction: `,
                );
                if (confirmSlug !== org.slug) {
                  error('Slug does not match. Destruction cancelled.');
                  return;
                }
              }

              // 5. Execute destruction
              await client.delete(
                `/api/admin/organizations/${encodeURIComponent(idOrSlug)}`,
              );

              success(`Organization "${org.name}" and all its data have been permanently destroyed.`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify an org subcommand: create, list, show, update, suspend, activate, archive, destroy, branding');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
