/**
 * CLI organization management commands.
 *
 * Provides CRUD and lifecycle management for organizations (tenants).
 * All operations use the Porta SDK for Admin API communication.
 *
 * Usage:
 *   porta org create --name "Acme Corp" [--slug acme-corp] [--locale en]
 *   porta org list [--status active|suspended|archived] [--page 1] [--page-size 20]
 *   porta org show <id-or-slug>
 *   porta org update <id-or-slug> --name "New Name" [--default-locale fr]
 *   porta org suspend <id-or-slug>
 *   porta org activate <id-or-slug>
 *   porta org archive <id-or-slug>
 *   porta org restore <id-or-slug>
 *   porta org history <id-or-slug>
 *   porta org branding <id-or-slug> --primary-color "#..." [--company-name "..."]
 *   porta org destroy <id-or-slug>
 *
 * @module commands/org
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import {
  printTable,
  printJson,
  success,
  warn,
  error,
  info,
  formatDate,
  truncate,
} from '../output.js';
import { confirm, question } from '../prompt.js';
import { parseLoginMethods } from '../parsers.js';

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
  'primary-color'?: string;
  'company-name'?: string;
  'custom-css'?: string;
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
                'Comma-separated default login methods (password, magic_link)',
            }),
        async (argv) => {
          try {
            const defaultLoginMethods = argv['login-methods']
              ? parseLoginMethods(argv['login-methods'])
              : undefined;

            const client = createClient(argv);
            const org = await client.organizations.create({
              name: argv.name,
              slug: argv.slug,
              defaultLocale: argv.locale,
              ...(defaultLoginMethods !== undefined && { defaultLoginMethods }),
            });

            if (argv.json) {
              printJson(org);
            } else {
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
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const result = await client.organizations.list({
              page: argv.page,
              pageSize: argv['page-size'],
              ...(argv.status && { status: argv.status }),
            });

            if (result.data.length === 0) {
              warn('No organizations found');
              return;
            }

            if (argv.json) {
              printJson(result);
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Status', 'Created'],
                result.data.map((o) => [
                  truncate(o.id, 8),
                  o.name,
                  o.slug,
                  o.status,
                  formatDate(o.createdAt),
                ]),
              );
              info(`Total: ${result.total} organizations`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            if (argv.json) {
              printJson(org);
            } else {
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
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
                'Comma-separated default login methods (password, magic_link)',
            }),
        async (argv) => {
          try {
            const defaultLoginMethods = argv['login-methods']
              ? parseLoginMethods(argv['login-methods'])
              : undefined;

            const client = createClient(argv);
            const { data: current, etag } = await client.organizations.get(argv['id-or-slug']);

            const updated = await client.organizations.update(
              current.id,
              {
                name: argv.name,
                defaultLocale: argv['default-locale'],
                ...(defaultLoginMethods !== undefined && { defaultLoginMethods }),
              },
              etag ?? undefined,
            );

            if (argv.json) {
              printJson(updated);
            } else {
              success(`Organization updated: ${updated.name} (${updated.slug})`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            if (!argv.force) {
              const confirmed = await confirm(
                `Suspend organization "${org.name}" (${org.slug})?`,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }
            }

            await client.organizations.suspend(org.id);
            success(`Organization suspended: ${org.name} (${org.slug})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            await client.organizations.activate(org.id);
            success(`Organization activated: ${org.name} (${org.slug})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            if (!argv.force) {
              const confirmed = await confirm(
                `Archive organization "${org.name}" (${org.slug})? This cannot be easily undone.`,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }
            }

            await client.organizations.archive(org.id);
            success(`Organization archived: ${org.name} (${org.slug})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── restore (NEW) ──────────────────────────────────────────────
      .command<OrgIdArgs>(
        'restore <id-or-slug>',
        'Restore an archived organization',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            await client.organizations.restore(org.id);
            success(`Organization restored: ${org.name} (${org.slug})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── history (NEW) ──────────────────────────────────────────────
      .command<OrgIdArgs>(
        'history <id-or-slug>',
        'Show organization change history',
        (y) =>
          y.positional('id-or-slug', {
            type: 'string',
            demandOption: true,
            description: 'Organization UUID or slug',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const history = await client.organizations.getHistory(argv['id-or-slug']);

            if (history.length === 0) {
              warn('No history entries found');
              return;
            }

            if (argv.json) {
              printJson(history);
            } else {
              printTable(
                ['Date', 'Action', 'Actor', 'Changes'],
                history.map((h) => [
                  formatDate(h.createdAt),
                  h.action,
                  h.performedBy ?? '—',
                  h.changes ? JSON.stringify(h.changes).slice(0, 60) : '—',
                ]),
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
            .option('primary-color', {
              type: 'string',
              description: 'Primary brand color (hex)',
            })
            .option('company-name', {
              type: 'string',
              description: 'Company display name',
            })
            .option('custom-css', {
              type: 'string',
              description: 'Custom CSS for login pages',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const { data: org } = await client.organizations.get(argv['id-or-slug']);

            const result = await client.branding.updateSettings(org.id, {
              brandingPrimaryColor: argv['primary-color'],
              brandingCompanyName: argv['company-name'],
              brandingCustomCss: argv['custom-css'],
            });

            if (argv.json) {
              printJson(result);
            } else {
              success(`Branding updated for: ${org.name} (${org.slug})`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
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
          try {
            const client = createClient(argv);
            const idOrSlug = argv['id-or-slug'];

            // 1. Dry-run to get cascade counts
            const preview = await client.organizations.destroy(idOrSlug, { dryRun: true });
            const counts = preview.counts ?? {};

            // 2. Resolve the org for display
            const { data: org } = await client.organizations.get(idOrSlug);

            // 3. Display what will be destroyed
            console.log('');
            warn('This will PERMANENTLY destroy the following:');
            console.log('');
            console.log(`  Organization:      ${org.name} (${org.slug})`);
            for (const [entity, count] of Object.entries(counts)) {
              const label = entity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              console.log(`  ${label.padEnd(20)} ${count}`);
            }
            console.log('');

            // 4. Type-to-confirm (unless --force)
            if (!argv.force) {
              const confirmSlug = await question(
                `Type the organization slug "${org.slug}" to confirm destruction: `,
              );
              if (confirmSlug !== org.slug) {
                error('Slug does not match. Destruction cancelled.');
                return;
              }
            }

            // 5. Execute destruction
            await client.organizations.destroy(idOrSlug);
            success(`Organization "${org.name}" and all its data have been permanently destroyed.`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify an org subcommand: create, list, show, update, suspend, activate, archive, restore, history, branding, destroy');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
