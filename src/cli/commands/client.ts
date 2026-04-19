/**
 * CLI client management commands.
 *
 * Provides CRUD and lifecycle management for OIDC clients, plus
 * nested secret subcommands. Delegates to the client service module.
 *
 * Usage:
 *   porta client create --app <app-id> --type confidential --redirect-uris "https://..." [--name "My Client"]
 *   porta client list --app <app-id> [--status active|inactive|revoked] [--page 1] [--page-size 20]
 *   porta client show <client-id>
 *   porta client update <client-id> --name "New Name" [--redirect-uris "..."]
 *   porta client revoke <client-id>
 *   porta client secret <subcommand> ...
 *
 * @module cli/commands/client
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { Client } from '../../clients/types.js';
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
import { parseLoginMethodsFlag } from '../parsers.js';
import { clientSecretCommand } from './client-secret.js';

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface ClientCreateArgs extends GlobalOptions {
  org: string;
  app: string;
  name?: string;
  type: 'confidential' | 'public';
  'application-type': 'web' | 'native' | 'spa';
  'redirect-uris': string;
  'login-methods'?: string;
}

interface ClientListArgs extends GlobalOptions {
  app: string;
  status?: string;
  page: number;
  'page-size': number;
}

interface ClientIdArgs extends GlobalOptions {
  'client-id': string;
}

interface ClientUpdateArgs extends ClientIdArgs {
  name?: string;
  'redirect-uris'?: string;
  'login-methods'?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID format regex — used to distinguish UUIDs from slugs */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check whether a value looks like a UUID */
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve an application identifier to its UUID.
 * If already a UUID, returns it directly; otherwise looks up by slug.
 */
async function resolveAppId(idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const { getApplicationBySlug, ApplicationNotFoundError } = await import(
    '../../applications/index.js'
  );
  const app = await getApplicationBySlug(idOrSlug);
  if (!app) throw new ApplicationNotFoundError(idOrSlug);
  return app.id;
}

/**
 * Parse comma-separated redirect URIs into an array.
 * Supports both comma-separated and space-separated values.
 */
function parseUris(uris: string): string[] {
  return uris
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The client command module — registered at the top level of the CLI */
export const clientCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'client',
  describe: 'Manage OIDC clients',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<ClientCreateArgs>(
        'create',
        'Create a new OIDC client',
        (y) =>
          y
            .option('org', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID (owner of the client)',
            })
            .option('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('name', {
              type: 'string',
              description: 'Client display name',
            })
            .option('type', {
              type: 'string',
              choices: ['confidential', 'public'] as const,
              demandOption: true,
              description: 'Client type (confidential has secret, public does not)',
            })
            .option('application-type', {
              type: 'string',
              choices: ['web', 'native', 'spa'] as const,
              default: 'web' as const,
              description: 'Application deployment type',
            })
            .option('redirect-uris', {
              type: 'string',
              demandOption: true,
              description: 'Comma-separated redirect URIs',
            })
            .option('login-methods', {
              type: 'string',
              description:
                'Comma-separated login methods (password, magic_link) or "inherit" to use the org default',
            }),
        async (argv) => {
          const args = argv as unknown as ClientCreateArgs;
          await withErrorHandling(async () => {
            // Parse the tri-state flag before bootstrap — invalid input fails fast.
            // `allowInherit: true` permits the `inherit` sentinel which maps to `null`
            // (meaning "inherit org default"); omitting the flag maps to `undefined`
            // (leave the DB column at its NULL default → inherit).
            const loginMethods = parseLoginMethodsFlag(
              args['login-methods'],
              /* allowInherit */ true,
            );

            await withBootstrap(args, async () => {
              const { createClient } = await import('../../clients/index.js');
              const appId = await resolveAppId(args.app);

              const result = await createClient({
                organizationId: args.org,
                applicationId: appId,
                clientName: args.name ?? 'Unnamed Client',
                clientType: args.type,
                applicationType: args['application-type'],
                redirectUris: parseUris(args['redirect-uris']),
                // `undefined` → key omitted → DB DEFAULT NULL fires (inherit).
                // `null` → explicit inherit sentinel passed through.
                // `LoginMethod[]` → explicit override.
                ...(loginMethods !== undefined && { loginMethods }),
              });

              outputResult(
                args.json,
                () => {
                  success(`Client created: ${result.client.clientName} (${result.client.clientId})`);
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', result.client.id],
                      ['Client ID', result.client.clientId],
                      ['Name', result.client.clientName],
                      ['Type', result.client.clientType],
                      ['Status', result.client.status],
                      ['Redirect URIs', result.client.redirectUris.join(', ')],
                      ['Created', formatDate(result.client.createdAt)],
                    ],
                  );

                  // Show initial secret for confidential clients (one-time display)
                  if (result.secret) {
                    console.log('');
                    warn('⚠️  IMPORTANT: Copy this secret now. It will not be shown again!');
                    console.log('');
                    console.log('┌─────────────────────────────────────────────────────────────────┐');
                    console.log(`│ Secret: ${result.secret.plaintext.padEnd(55)}│`);
                    console.log('└─────────────────────────────────────────────────────────────────┘');
                    console.log('');
                  }
                },
                result,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<ClientListArgs>(
        'list',
        'List clients for an application',
        (y) =>
          y
            .option('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('status', {
              type: 'string',
              choices: ['active', 'inactive', 'revoked'],
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
          const args = argv as unknown as ClientListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listClientsByApplication } = await import('../../clients/index.js');
              const appId = await resolveAppId(args.app);

              const result = await listClientsByApplication(appId, {
                page: args.page,
                pageSize: args['page-size'],
                status: args.status as 'active' | 'inactive' | 'revoked' | undefined,
              });

              if (result.data.length === 0) {
                warn('No clients found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Client ID', 'Name', 'Type', 'Status', 'Created'],
                    result.data.map((c) => [
                      truncateId(c.id),
                      truncateId(c.clientId),
                      c.clientName,
                      c.clientType,
                      c.status,
                      formatDate(c.createdAt),
                    ]),
                  );
                  printTotal('clients', result.total);
                },
                { data: result.data, total: result.total, page: result.page, pageSize: result.pageSize },
              );
            });
          }, args.verbose);
        },
      )

      // ── show ────────────────────────────────────────────────────────
      .command<ClientIdArgs>(
        'show <client-id>',
        'Show client details',
        (y) =>
          y.positional('client-id', {
            type: 'string',
            demandOption: true,
            description: 'Client internal UUID',
          }),
        async (argv) => {
          const args = argv as unknown as ClientIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getClientById, ClientNotFoundError, resolveLoginMethods } = await import(
                '../../clients/index.js'
              );
              const { getOrganizationById } = await import('../../organizations/index.js');
              const client: Client | null = await getClientById(args['client-id']);
              if (!client) throw new ClientNotFoundError(args['client-id']);

              // Resolve effective methods by combining the client override (null or array)
              // with the owning org's default. Falls back to the raw override or the
              // hard-coded union when the org can't be loaded (defensive — shouldn't
              // happen in practice since FK prevents orphan clients).
              const org = await getOrganizationById(client.organizationId);
              const effectiveLoginMethods = org
                ? resolveLoginMethods(org, client)
                : (client.loginMethods ?? ['password', 'magic_link']);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', client.id],
                      ['Client ID', client.clientId],
                      ['Name', client.clientName],
                      ['Type', client.clientType],
                      ['App Type', client.applicationType],
                      ['Status', client.status],
                      ['Redirect URIs', client.redirectUris.join(', ') || '—'],
                      ['Grant Types', client.grantTypes.join(', ')],
                      ['Scope', client.scope],
                      ['PKCE Required', String(client.requirePkce)],
                      [
                        'Login Methods (client)',
                        client.loginMethods === null
                          ? 'inherit'
                          : client.loginMethods.join(', '),
                      ],
                      ['Login Methods (effective)', effectiveLoginMethods.join(', ')],
                      ['Created', formatDate(client.createdAt)],
                      ['Updated', formatDate(client.updatedAt)],
                    ],
                  );
                },
                { ...client, effectiveLoginMethods },
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<ClientUpdateArgs>(
        'update <client-id>',
        'Update client fields',
        (y) =>
          y
            .positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID',
            })
            .option('name', {
              type: 'string',
              description: 'New client display name',
            })
            .option('redirect-uris', {
              type: 'string',
              description: 'New comma-separated redirect URIs',
            })
            .option('login-methods', {
              type: 'string',
              description:
                'Comma-separated login methods (password, magic_link) or "inherit" to reset to org default',
            }),
        async (argv) => {
          const args = argv as unknown as ClientUpdateArgs;
          await withErrorHandling(async () => {
            const loginMethods = parseLoginMethodsFlag(
              args['login-methods'],
              /* allowInherit */ true,
            );

            await withBootstrap(args, async () => {
              const { updateClient } = await import('../../clients/index.js');
              const updated = await updateClient(args['client-id'], {
                clientName: args.name,
                redirectUris: args['redirect-uris'] ? parseUris(args['redirect-uris']) : undefined,
                // Three-state: omitted → leave alone; null → reset to inherit; array → override.
                ...(loginMethods !== undefined && { loginMethods }),
              });

              outputResult(
                args.json,
                () => {
                  success(`Client updated: ${updated.clientName} (${updated.clientId})`);
                },
                updated,
              );
            });
          }, args.verbose);
        },
      )

      // ── revoke ──────────────────────────────────────────────────────
      .command<ClientIdArgs>(
        'revoke <client-id>',
        'Revoke a client (permanent)',
        (y) =>
          y.positional('client-id', {
            type: 'string',
            demandOption: true,
            description: 'Client internal UUID',
          }),
        async (argv) => {
          const args = argv as unknown as ClientIdArgs;
          await withErrorHandling(async () => {
            // Resolve client name for confirmation message
            let clientName = args['client-id'];
            let clientDbId = args['client-id'];
            await withBootstrap(args, async () => {
              const { getClientById, ClientNotFoundError } = await import('../../clients/index.js');
              const client: Client | null = await getClientById(args['client-id']);
              if (!client) throw new ClientNotFoundError(args['client-id']);
              clientName = `${client.clientName} (${client.clientId})`;
              clientDbId = client.id;
            });

            if (args['dry-run']) {
              warn(`[DRY RUN] Would revoke client "${clientName}"`);
              return;
            }

            const confirmed = await confirm(
              `Revoke client "${clientName}"? This is permanent and cannot be undone.`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }

            await withBootstrap(args, async () => {
              const { revokeClient } = await import('../../clients/index.js');
              await revokeClient(clientDbId);
              success(`Client revoked: ${clientName}`);
            });
          }, args.verbose);
        },
      )

      // ── nested subcommand groups ────────────────────────────────────
      .command(clientSecretCommand)
      .demandCommand(1, 'Specify a client subcommand: create, list, show, update, revoke, secret');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
