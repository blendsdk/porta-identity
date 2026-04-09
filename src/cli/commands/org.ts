/**
 * CLI organization management commands.
 *
 * Provides CRUD and lifecycle management for organizations (tenants).
 * Delegates to the organization service module for all business logic.
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
import type { Organization } from '../../organizations/types.js';
import { withBootstrap } from '../bootstrap.js';
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

/** UUID format regex — used to distinguish UUIDs from slugs */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check whether a value looks like a UUID */
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve an organization by ID or slug.
 * If the value matches UUID format, fetches by ID; otherwise by slug.
 *
 * @param idOrSlug - UUID or slug string
 * @returns Organization or null if not found
 */
async function resolveOrg(idOrSlug: string): Promise<Organization | null> {
  const { getOrganizationById, getOrganizationBySlug } = await import(
    '../../organizations/index.js'
  );
  return isUuid(idOrSlug)
    ? getOrganizationById(idOrSlug)
    : getOrganizationBySlug(idOrSlug);
}

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface OrgCreateArgs extends GlobalOptions {
  name: string;
  slug?: string;
  locale?: string;
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
            }),
        async (argv) => {
          const args = argv as unknown as OrgCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createOrganization } = await import('../../organizations/index.js');
              const org = await createOrganization({
                name: args.name,
                slug: args.slug,
                defaultLocale: args.locale,
              });

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
            await withBootstrap(args, async () => {
              const { listOrganizations } = await import('../../organizations/index.js');
              const result = await listOrganizations({
                page: args.page,
                pageSize: args['page-size'],
                status: args.status as 'active' | 'suspended' | 'archived' | undefined,
              });

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
            await withBootstrap(args, async () => {
              const { OrganizationNotFoundError } = await import('../../organizations/index.js');
              const org = await resolveOrg(args['id-or-slug']);
              if (!org) throw new OrganizationNotFoundError(args['id-or-slug']);

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
            }),
        async (argv) => {
          const args = argv as unknown as OrgUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updateOrganization, OrganizationNotFoundError } = await import(
                '../../organizations/index.js'
              );

              // Resolve ID — update needs UUID
              const org = await resolveOrg(args['id-or-slug']);
              if (!org) throw new OrganizationNotFoundError(args['id-or-slug']);

              const updated = await updateOrganization(org.id, {
                name: args.name,
                defaultLocale: args['default-locale'],
              });

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
            const org = await resolveOrgForLifecycle(args);
            if (!org) return;

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

            await withBootstrap(args, async () => {
              const { suspendOrganization } = await import('../../organizations/index.js');
              await suspendOrganization(org.id);
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
            await withBootstrap(args, async () => {
              const { activateOrganization, OrganizationNotFoundError } = await import(
                '../../organizations/index.js'
              );

              const org = await resolveOrg(args['id-or-slug']);
              if (!org) throw new OrganizationNotFoundError(args['id-or-slug']);

              await activateOrganization(org.id);
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
            const org = await resolveOrgForLifecycle(args);
            if (!org) return;

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

            await withBootstrap(args, async () => {
              const { archiveOrganization } = await import('../../organizations/index.js');
              await archiveOrganization(org.id);
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
            await withBootstrap(args, async () => {
              const { updateOrganizationBranding, OrganizationNotFoundError } = await import(
                '../../organizations/index.js'
              );

              const org = await resolveOrg(args['id-or-slug']);
              if (!org) throw new OrganizationNotFoundError(args['id-or-slug']);

              const updated = await updateOrganizationBranding(org.id, {
                logoUrl: args['logo-url'],
                faviconUrl: args['favicon-url'],
                primaryColor: args['primary-color'],
                companyName: args['company-name'],
              });

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
      .demandCommand(1, 'Specify an org subcommand: create, list, show, update, suspend, activate, archive, branding');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};

// ---------------------------------------------------------------------------
// Helper: resolve org for lifecycle operations that need pre-bootstrap resolve
// ---------------------------------------------------------------------------

/**
 * Resolve an org and bootstrap for destructive lifecycle commands.
 * Uses withBootstrap to connect, resolve the org, then returns it.
 * The caller handles confirmation and the actual operation in a second bootstrap call.
 *
 * This two-phase approach allows dry-run and confirmation checks between
 * resolving the entity and performing the operation.
 */
async function resolveOrgForLifecycle(args: OrgIdArgs): Promise<Organization | null> {
  let org: Organization | null = null;
  await withBootstrap(args, async () => {
    const { OrganizationNotFoundError } = await import('../../organizations/index.js');
    org = await resolveOrg(args['id-or-slug']);
    if (!org) throw new OrganizationNotFoundError(args['id-or-slug']);
  });
  return org;
}
