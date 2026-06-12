/**
 * CLI client management commands.
 *
 * Provides CRUD and lifecycle management for OIDC clients, plus
 * nested secret subcommands. All operations use the Porta SDK for
 * Admin API communication.
 *
 * Usage:
 *   porta client create --org <org-id> --app <app-id> --type confidential --redirect-uris "https://..." [--name "My Client"]
 *   porta client list --app <app-id> [--status active|revoked] [--page 1] [--page-size 20]
 *   porta client show <client-id>
 *   porta client update <client-id> --name "New Name" [--redirect-uris "..."]
 *   porta client revoke <client-id>
 *   porta client restore <client-id>
 *   porta client history <client-id>
 *   porta client login-methods get <client-id>
 *   porta client login-methods set <client-id> --methods "password,magic_link"
 *   porta client login-methods clear <client-id>
 *   porta client secret <subcommand> ...
 *
 * @module commands/client
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';
import { confirm } from '../prompt.js';
import { parseLoginMethodsFlag, parseCommaSeparated } from '../parsers.js';
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

interface LoginMethodsSetArgs extends ClientIdArgs {
  methods: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The client command module — registered at the top level of the CLI */
export const clientCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'client',
  describe: 'Manage OIDC clients',
  builder: (yargs) => {
    return (
      yargs
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
            try {
              const loginMethods = parseLoginMethodsFlag(
                argv['login-methods'],
                /* allowInherit */ true,
              );

              const sdkClient = createClient(argv);

              // Resolve app slug → UUID if needed via SDK get
              let appId = argv.app;
              const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!UUID_REGEX.test(appId)) {
                const { data: app } = await sdkClient.applications.get(appId);
                appId = app.id;
              }

              const result = await sdkClient.clients.create({
                applicationId: appId,
                name: argv.name ?? 'Unnamed Client',
                clientType: argv.type,
                redirectUris: parseCommaSeparated(argv['redirect-uris']),
                ...(loginMethods !== undefined && { loginMethods }),
              });

              if (argv.json) {
                printJson(result);
              } else {
                success(`Client created: ${result.name} (${result.clientId})`);
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', result.id],
                    ['Client ID', result.clientId],
                    ['Name', result.name],
                    ['Type', result.clientType],
                    ['Status', result.status],
                    ['Redirect URIs', result.redirectUris.join(', ')],
                    ['Created', formatDate(result.createdAt)],
                  ],
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
                choices: ['active', 'revoked'],
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
              const sdkClient = createClient(argv);
              const result = await sdkClient.clients.list({
                page: argv.page,
                pageSize: argv['page-size'],
                ...(argv.status && { status: argv.status }),
                ...(argv.app && { applicationId: argv.app }),
              });

              if (result.data.length === 0) {
                warn('No clients found');
                return;
              }

              if (argv.json) {
                printJson(result);
              } else {
                printTable(
                  ['ID', 'Client ID', 'Name', 'Type', 'Status', 'Created'],
                  result.data.map((c) => [
                    c.id,
                    c.clientId,
                    c.name,
                    c.clientType,
                    c.status,
                    formatDate(c.createdAt),
                  ]),
                );
                info(`Total: ${result.total} clients`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
              description: 'Client internal UUID or client_id',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: c } = await sdkClient.clients.get(argv['client-id']);

              if (argv.json) {
                printJson(c);
              } else {
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', c.id],
                    ['Client ID', c.clientId],
                    ['Name', c.name],
                    ['Type', c.clientType],
                    ['Status', c.status],
                    ['Redirect URIs', c.redirectUris.join(', ') || '—'],
                    ['Grant Types', c.grantTypes.join(', ')],
                    [
                      'Login Methods',
                      c.loginMethods === null ? 'inherit' : c.loginMethods.join(', '),
                    ],
                    ['Created', formatDate(c.createdAt)],
                    ['Updated', formatDate(c.updatedAt)],
                  ],
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
                description: 'Client internal UUID or client_id',
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
            try {
              const loginMethods = parseLoginMethodsFlag(
                argv['login-methods'],
                /* allowInherit */ true,
              );

              const sdkClient = createClient(argv);
              const { data: current, etag } = await sdkClient.clients.get(argv['client-id']);

              const updated = await sdkClient.clients.update(
                current.id,
                {
                  name: argv.name,
                  redirectUris: argv['redirect-uris']
                    ? parseCommaSeparated(argv['redirect-uris'])
                    : undefined,
                  ...(loginMethods !== undefined && { loginMethods }),
                },
                etag ?? undefined,
              );

              if (argv.json) {
                printJson(updated);
              } else {
                success(`Client updated: ${updated.name} (${updated.clientId})`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
              description: 'Client internal UUID or client_id',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: c } = await sdkClient.clients.get(argv['client-id']);

              if (!argv.force) {
                const confirmed = await confirm(
                  `Revoke client "${c.name}" (${c.clientId})? This is permanent and cannot be undone.`,
                );
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }

              await sdkClient.clients.revoke(c.id);
              success(`Client revoked: ${c.name} (${c.clientId})`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── restore (NEW) ───────────────────────────────────────────────
        .command<ClientIdArgs>(
          'restore <client-id>',
          'Restore a revoked client',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID or client_id',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: c } = await sdkClient.clients.get(argv['client-id']);

              await sdkClient.clients.restore(c.id);
              success(`Client restored: ${c.name} (${c.clientId})`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── history (NEW) ───────────────────────────────────────────────
        .command<ClientIdArgs>(
          'history <client-id>',
          'Show client change history',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID or client_id',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const history = await sdkClient.clients.getHistory(argv['client-id']);

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
                    h.changes ? JSON.stringify(h.changes) : '—',
                  ]),
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── login-methods ───────────────────────────────────────────────
        .command('login-methods', 'Manage client login method overrides', (loginYargs) => {
          return (
            loginYargs
              // ── login-methods get ──
              .command<ClientIdArgs>(
                'get <client-id>',
                'Show current login methods for a client',
                (y) =>
                  y.positional('client-id', {
                    type: 'string',
                    demandOption: true,
                    description: 'Client internal UUID or client_id',
                  }),
                async (argv) => {
                  try {
                    const sdkClient = createClient(argv);
                    const { data: c } = await sdkClient.clients.get(argv['client-id']);

                    if (argv.json) {
                      printJson({
                        clientId: c.clientId,
                        loginMethods: c.loginMethods,
                      });
                    } else {
                      const display =
                        c.loginMethods === null
                          ? 'inherit (using org default)'
                          : c.loginMethods.join(', ');
                      info(`Login methods for ${c.name}: ${display}`);
                    }
                  } catch (err) {
                    handleError(err, argv.verbose);
                  }
                },
              )

              // ── login-methods set ──
              .command<LoginMethodsSetArgs>(
                'set <client-id>',
                'Set login method overrides for a client',
                (y) =>
                  y
                    .positional('client-id', {
                      type: 'string',
                      demandOption: true,
                      description: 'Client internal UUID or client_id',
                    })
                    .option('methods', {
                      type: 'string',
                      demandOption: true,
                      description: 'Comma-separated login methods (password, magic_link)',
                    }),
                async (argv) => {
                  try {
                    const loginMethods = parseLoginMethodsFlag(argv.methods, false);
                    const sdkClient = createClient(argv);
                    const { data: current, etag } = await sdkClient.clients.get(argv['client-id']);

                    await sdkClient.clients.update(
                      current.id,
                      { loginMethods: loginMethods ?? undefined },
                      etag ?? undefined,
                    );

                    success(`Login methods set for ${current.name}: ${argv.methods}`);
                  } catch (err) {
                    handleError(err, argv.verbose);
                  }
                },
              )

              // ── login-methods clear ──
              .command<ClientIdArgs>(
                'clear <client-id>',
                'Clear login method overrides (inherit from org)',
                (y) =>
                  y.positional('client-id', {
                    type: 'string',
                    demandOption: true,
                    description: 'Client internal UUID or client_id',
                  }),
                async (argv) => {
                  try {
                    const sdkClient = createClient(argv);
                    const { data: current, etag } = await sdkClient.clients.get(argv['client-id']);

                    await sdkClient.clients.update(
                      current.id,
                      { loginMethods: null },
                      etag ?? undefined,
                    );

                    success(`Login methods cleared for ${current.name} (will inherit from org)`);
                  } catch (err) {
                    handleError(err, argv.verbose);
                  }
                },
              )
              .demandCommand(1, 'Specify a login-methods subcommand: get, set, clear')
          );
        })

        // ── nested subcommand groups ────────────────────────────────────
        .command(clientSecretCommand)
        .demandCommand(
          1,
          'Specify a client subcommand: create, list, show, update, revoke, restore, history, login-methods, secret',
        )
    );
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
