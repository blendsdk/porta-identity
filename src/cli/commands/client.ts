/**
 * CLI client management commands.
 *
 * Provides CRUD and lifecycle management for OIDC clients, plus
 * nested secret subcommands. All operations use authenticated HTTP
 * requests against the Admin API.
 *
 * Usage:
 *   porta client create --org <org-id> --app <app-id> --type confidential --redirect-uris "https://..." [--name "My Client"]
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
import { parseLoginMethodsFlag } from '../parsers.js';
import { clientSecretCommand } from './client-secret.js';

// ---------------------------------------------------------------------------
// API response types (JSON-serialized shapes from the Admin API)
// ---------------------------------------------------------------------------

/** Client data as returned by the Admin API (dates are ISO strings) */
interface ClientData {
  id: string;
  clientId: string;
  clientName: string;
  clientType: string;
  applicationType: string;
  organizationId: string;
  applicationId: string;
  status: string;
  redirectUris: string[];
  grantTypes: string[];
  scope: string;
  requirePkce: boolean;
  loginMethods: string[] | null;
  effectiveLoginMethods?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Secret data included in create response */
interface SecretData {
  id: string;
  clientId: string;
  label: string | null;
  plaintext: string;
  sha256Prefix: string;
  expiresAt: string | null;
  createdAt: string;
}

/** Wrapped single-entity response: { data: ClientData } */
interface ClientResponse {
  data: ClientData;
}

/** Create response with client + optional secret: { data: { client, secret } } */
interface ClientCreateResponse {
  data: {
    client: ClientData;
    secret: SecretData | null;
  };
  warning?: string;
}

/** Paginated list response: { data: ClientData[], total, page, pageSize } */
interface ClientListResponse {
  data: ClientData[];
  total: number;
  page: number;
  pageSize: number;
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
 * Resolve an application identifier to its UUID via the Admin API.
 * If already a UUID, returns it directly; otherwise looks up by slug.
 *
 * @param client - Authenticated HTTP client
 * @param idOrSlug - Application UUID or slug
 * @returns The application UUID
 * @throws HttpNotFoundError if the application doesn't exist
 */
async function resolveAppId(client: AdminHttpClient, idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  // The GET /api/admin/applications/:idOrSlug endpoint accepts both UUID and slug
  const resp = await client.get<{ data: { id: string } }>(
    `/api/admin/applications/${encodeURIComponent(idOrSlug)}`,
  );
  return resp.data.data.id;
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
            // Parse the tri-state flag before HTTP call — invalid input fails fast.
            // `allowInherit: true` permits the `inherit` sentinel which maps to `null`
            // (meaning "inherit org default"); omitting the flag maps to `undefined`
            // (leave the DB column at its NULL default → inherit).
            const loginMethods = parseLoginMethodsFlag(
              args['login-methods'],
              /* allowInherit */ true,
            );

            await withHttpClient(args, async (client) => {
              // Resolve app slug → UUID for the API payload
              const appId = await resolveAppId(client, args.app);

              const resp = await client.post<ClientCreateResponse>('/api/admin/clients', {
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
              const result = resp.data.data;

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
                resp.data,
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
            await withHttpClient(args, async (client) => {
              // Resolve app slug → UUID for the query param
              const appId = await resolveAppId(client, args.app);

              const params: Record<string, string> = {
                applicationId: appId,
                page: String(args.page),
                pageSize: String(args['page-size']),
              };
              if (args.status) params.status = args.status;

              const resp = await client.get<ClientListResponse>(
                '/api/admin/clients',
                params,
              );
              const result = resp.data;

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
            await withHttpClient(args, async (client) => {
              // The GET /api/admin/clients/:id endpoint returns the client with
              // effectiveLoginMethods already computed server-side
              const resp = await client.get<ClientResponse>(
                `/api/admin/clients/${args['client-id']}`,
              );
              const c = resp.data.data;

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', c.id],
                      ['Client ID', c.clientId],
                      ['Name', c.clientName],
                      ['Type', c.clientType],
                      ['App Type', c.applicationType],
                      ['Status', c.status],
                      ['Redirect URIs', c.redirectUris.join(', ') || '—'],
                      ['Grant Types', c.grantTypes.join(', ')],
                      ['Scope', c.scope],
                      ['PKCE Required', String(c.requirePkce)],
                      [
                        'Login Methods (client)',
                        c.loginMethods === null
                          ? 'inherit'
                          : c.loginMethods.join(', '),
                      ],
                      ['Login Methods (effective)', (c.effectiveLoginMethods ?? []).join(', ')],
                      ['Created', formatDate(c.createdAt)],
                      ['Updated', formatDate(c.updatedAt)],
                    ],
                  );
                },
                c,
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

            await withHttpClient(args, async (client) => {
              const resp = await client.put<ClientResponse>(
                `/api/admin/clients/${args['client-id']}`,
                {
                  clientName: args.name,
                  redirectUris: args['redirect-uris'] ? parseUris(args['redirect-uris']) : undefined,
                  // Three-state: omitted → leave alone; null → reset to inherit; array → override.
                  ...(loginMethods !== undefined && { loginMethods }),
                },
              );
              const updated = resp.data.data;

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
            await withHttpClient(args, async (client) => {
              // Fetch client details for confirmation message
              const resp = await client.get<ClientResponse>(
                `/api/admin/clients/${args['client-id']}`,
              );
              const c = resp.data.data;
              const clientName = `${c.clientName} (${c.clientId})`;

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

              await client.post(`/api/admin/clients/${c.id}/revoke`);
              success(`Client revoked: ${clientName}`);
            });
          }, args.verbose);
        },
      )

      // ── nested subcommand groups ────────────────────────────────────
      // client-secret is migrated to HTTP in Phase 4.3
      .command(clientSecretCommand)
      .demandCommand(1, 'Specify a client subcommand: create, list, show, update, revoke, secret');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
