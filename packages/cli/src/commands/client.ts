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
 *   porta client get <client-id>
 *   porta client update <client-id> --name "New Name" [--redirect-uris "..."]
 *   porta client revoke <client-id>
 *   porta client activate <client-id>
 *   porta client deactivate <client-id>
 *   porta client history <client-id>
 *   porta client login-methods get <client-id>
 *   porta client login-methods set <client-id> --methods "password,magic_link"
 *   porta client login-methods clear <client-id>
 *   porta client secret <subcommand> ...
 *   porta client service-account get|set|revoke <client-id>
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
import { clientServiceAccountCommand } from './client-service-account.js';

/** Full RFC 8628 device authorization grant value. */
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Grant values accepted by the CLI and the server contract. */
const ALLOWED_GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
  DEVICE_CODE_GRANT,
] as const;

/** One grant value accepted by the CLI. */
type AllowedGrantType = (typeof ALLOWED_GRANT_TYPES)[number];

/** Runtime allowlist used to narrow untrusted CLI input. */
const ALLOWED_GRANT_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_GRANT_TYPES);

/** Return true when a value is a supported grant type. */
function isAllowedGrantType(value: string): value is AllowedGrantType {
  return ALLOWED_GRANT_TYPE_SET.has(value);
}

/** Parse a comma-separated grant list and reject empty or unknown values. */
function parseGrantTypes(value: string | undefined): AllowedGrantType[] | undefined {
  if (value === undefined) return undefined;
  const grants = parseCommaSeparated(value);
  if (grants.length === 0) throw new Error('At least one grant type is required');
  const parsed: AllowedGrantType[] = [];
  for (const grant of grants) {
    if (!isAllowedGrantType(grant)) throw new Error(`Unsupported grant type: ${grant}`);
    parsed.push(grant);
  }
  return parsed;
}

/** Return true when the grant set is device-only. */
function isDeviceOnly(grants: readonly string[]): boolean {
  return grants.includes(DEVICE_CODE_GRANT) && !grants.includes('authorization_code');
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
  'redirect-uris'?: string;
  'grant-types'?: string;
  'login-methods'?: string;
  'require-consent'?: boolean;
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
  'grant-types'?: string;
  'login-methods'?: string;
  'require-consent'?: boolean;
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
                description:
                  'Comma-separated redirect URIs (optional only for a device-only client)',
              })
              .option('grant-types', {
                type: 'string',
                description:
                  'Comma-separated grant types (authorization_code, refresh_token, client_credentials, urn:ietf:params:oauth:grant-type:device_code)',
              })
              .option('login-methods', {
                type: 'string',
                description:
                  'Comma-separated login methods (password, magic_link) or "inherit" to use the org default',
              })
              .option('require-consent', {
                type: 'boolean',
                description:
                  'Show the consent page for this client (--no-require-consent disables it)',
              }),
          async (argv) => {
            try {
              const loginMethods = parseLoginMethodsFlag(
                argv['login-methods'],
                /* allowInherit */ true,
              );

              const sdkClient = createClient(argv);
              const grantTypes = parseGrantTypes(argv['grant-types']);
              const redirectUris =
                argv['redirect-uris'] === undefined
                  ? []
                  : parseCommaSeparated(argv['redirect-uris']);
              const deviceOnly = grantTypes !== undefined && isDeviceOnly(grantTypes);
              if (!deviceOnly && redirectUris.length === 0) {
                throw new Error(
                  'Redirect URIs are required unless the client selects only the device authorization grant',
                );
              }

              // Resolve app slug → UUID if needed via SDK get
              let appId = argv.app;
              const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!UUID_REGEX.test(appId)) {
                const { data: app } = await sdkClient.applications.get(appId);
                appId = app.id;
              }

              const result = await sdkClient.clients.create({
                organizationId: argv.org,
                applicationId: appId,
                clientName: argv.name ?? 'Unnamed Client',
                clientType: argv.type,
                applicationType: argv['application-type'],
                redirectUris,
                ...(grantTypes !== undefined && { grantTypes }),
                ...(deviceOnly && { responseTypes: [] }),
                ...(loginMethods !== undefined && { loginMethods }),
                ...(argv['require-consent'] !== undefined && {
                  requireConsent: argv['require-consent'],
                }),
              });

              if (argv.json) {
                printJson(result);
              } else {
                const created = result.client;
                success(`Client created: ${created.clientName} (${created.clientId})`);
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', created.id],
                    ['Client ID', created.clientId],
                    ['Name', created.clientName],
                    ['Type', created.clientType],
                    ['Status', created.status],
                    ['Redirect URIs', created.redirectUris.join(', ')],
                    ['Created', formatDate(created.createdAt)],
                  ],
                );
                if (result.secret) {
                  warn('Copy this initial secret now. It will not be shown again.');
                  printTable(
                    ['Secret ID', 'Label', 'Plaintext'],
                    [[result.secret.id, result.secret.label ?? '—', result.secret.plaintext]],
                  );
                }
              }
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
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
                description: 'Application UUID',
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
            try {
              const sdkClient = createClient(argv);
              const result = await sdkClient.clients.list({
                page: argv.page,
                pageSize: argv['page-size'],
                ...(argv.status && { status: argv.status }),
                ...(argv.app && { applicationId: argv.app }),
              });

              if (result.data.length === 0) {
                if (argv.json) {
                  printJson(result);
                } else {
                  warn('No clients found');
                }
                return;
              }

              if (argv.json) {
                printJson(result);
              } else {
                printTable(
                  ['ID', 'Client ID', 'Name', 'Type', 'Grants', 'Status', 'Created'],
                  result.data.map((c) => [
                    c.id,
                    c.clientId,
                    c.clientName,
                    c.clientType,
                    c.grantTypes.join(', '),
                    c.status,
                    formatDate(c.createdAt),
                  ]),
                );
                if (result.total !== undefined) {
                  info(`Total: ${result.total} clients`);
                }
              }
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
              handleError(err, argv.verbose);
            }
          },
        )

        // ── get ─────────────────────────────────────────────────────────
        .command<ClientIdArgs>(
          'get <client-id>',
          'Get client details',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID',
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
                    ['Name', c.clientName],
                    ['Organization ID', c.organizationId],
                    ['Application ID', c.applicationId],
                    ['Type', c.clientType],
                    ['Application Type', c.applicationType],
                    ['Status', c.status],
                    ['Redirect URIs', c.redirectUris.join(', ') || '—'],
                    ['Post-logout Redirect URIs', c.postLogoutRedirectUris.join(', ') || '—'],
                    ['Grant Types', c.grantTypes.join(', ')],
                    ['Response Types', c.responseTypes.length > 0 ? c.responseTypes.join(', ') : '[]'],
                    ['Scope', c.scope],
                    ['Token Endpoint Authentication', c.tokenEndpointAuthMethod],
                    ['Allowed Origins', c.allowedOrigins.join(', ') || '—'],
                    ['Require PKCE', String(c.requirePkce)],
                    ['Require Consent', String(c.requireConsent)],
                    [
                      'Login Method Override',
                      c.loginMethods === null ? 'inherit' : c.loginMethods.join(', '),
                    ],
                    ['Effective Login Methods', c.effectiveLoginMethods.join(', ')],
                    ['Created', formatDate(c.createdAt)],
                    ['Updated', formatDate(c.updatedAt)],
                  ],
                );
              }
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
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
                description: 'Client internal UUID',
              })
              .option('name', {
                type: 'string',
                description: 'New client display name',
              })
              .option('redirect-uris', {
                type: 'string',
                description:
                  'New comma-separated redirect URIs; pass an empty string to clear them',
              })
              .option('grant-types', {
                type: 'string',
                description:
                  'Replacement comma-separated grant types (including the full device URN)',
              })
              .option('login-methods', {
                type: 'string',
                description:
                  'Comma-separated login methods (password, magic_link) or "inherit" to reset to org default',
              })
              .option('require-consent', {
                type: 'boolean',
                description:
                  'Show the consent page for this client (--no-require-consent disables it)',
              }),
          async (argv) => {
            try {
              const loginMethods = parseLoginMethodsFlag(
                argv['login-methods'],
                /* allowInherit */ true,
              );

              const sdkClient = createClient(argv);
              const { data: current, etag } = await sdkClient.clients.get(argv['client-id']);

              const requestedGrants = parseGrantTypes(argv['grant-types']);
              const nextGrants = requestedGrants ?? current.grantTypes;
              const deviceOnly = isDeviceOnly(nextGrants);
              const redirectsProvided = argv['redirect-uris'] !== undefined;
              const nextRedirects = redirectsProvided
                ? parseCommaSeparated(argv['redirect-uris'] ?? '')
                : current.redirectUris;
              if (!deviceOnly && nextRedirects.length === 0) {
                throw new Error(
                  'Redirect URIs are required unless the resulting client is device-only',
                );
              }

              const updated = await sdkClient.clients.update(
                current.id,
                {
                  ...(argv.name !== undefined && { clientName: argv.name }),
                  ...(requestedGrants !== undefined && { grantTypes: requestedGrants }),
                  ...(redirectsProvided && { redirectUris: nextRedirects }),
                  ...(deviceOnly
                    ? { responseTypes: [] }
                    : requestedGrants !== undefined
                      ? { responseTypes: ['code'] }
                      : {}),
                  ...(loginMethods !== undefined && { loginMethods }),
                  ...(argv['require-consent'] !== undefined && {
                    requireConsent: argv['require-consent'],
                  }),
                },
                etag ?? undefined,
              );

              if (argv.json) {
                printJson(updated);
              } else {
                success(`Client updated: ${updated.clientName} (${updated.clientId})`);
              }
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
              handleError(err, argv.verbose);
            }
          },
        )

        // ── activate ────────────────────────────────────────────────────
        .command<ClientIdArgs>(
          'activate <client-id>',
          'Activate an OIDC client',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: current } = await sdkClient.clients.get(argv['client-id']);
              await sdkClient.clients.activate(current.id);
              success(`Client activated: ${current.clientName} (${current.clientId})`);
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
              handleError(err, argv.verbose);
            }
          },
        )

        // ── deactivate ──────────────────────────────────────────────────
        .command<ClientIdArgs>(
          'deactivate <client-id>',
          'Deactivate an OIDC client',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: current } = await sdkClient.clients.get(argv['client-id']);
              if (!argv.force) {
                const confirmed = await confirm(
                  `Deactivate client "${current.clientName}" (${current.clientId})?`,
                );
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }
              await sdkClient.clients.deactivate(current.id);
              success(`Client deactivated: ${current.clientName} (${current.clientId})`);
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
              handleError(err, argv.verbose);
            }
          },
        )

        // ── delete ──────────────────────────────────────────────────────
        .command<ClientIdArgs>(
          'delete <client-id>',
          'Permanently delete a client and its credentials',
          (y) =>
            y.positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client internal UUID',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: c } = await sdkClient.clients.get(argv['client-id']);
              const confirmed = await confirm(
                `Keep client "${c.clientName}" (${c.clientId}), or Delete ${c.clientName}? This permanently deletes its secrets and protocol authority.`,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }
              await sdkClient.clients.delete(c.id);
              success(`Client deleted: ${c.clientName} (${c.clientId})`);
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
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
              description: 'Client internal UUID',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const history = await sdkClient.clients.getHistory(argv['client-id']);

              if (history.data.length === 0) {
                warn('No history entries found');
                return;
              }

              if (argv.json) {
                printJson(history);
              } else {
                printTable(
                  ['Date', 'Event', 'Actor', 'Metadata'],
                  history.data.map((h) => [
                    formatDate(h.createdAt),
                    h.eventType,
                    h.actorId ?? '—',
                    h.metadata ? JSON.stringify(h.metadata) : '—',
                  ]),
                );
              }
            } catch (err) {
              if (argv.json) handleError(err, argv.verbose, true);
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
                    description: 'Client internal UUID',
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
                      info(`Login methods for ${c.clientName}: ${display}`);
                    }
                  } catch (err) {
                    if (argv.json) handleError(err, argv.verbose, true);
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
                      description: 'Client internal UUID',
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

                    success(`Login methods set for ${current.clientName}: ${argv.methods}`);
                  } catch (err) {
                    if (argv.json) handleError(err, argv.verbose, true);
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
                    description: 'Client internal UUID',
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

                    success(
                      `Login methods cleared for ${current.clientName} (will inherit from org)`,
                    );
                  } catch (err) {
                    if (argv.json) handleError(err, argv.verbose, true);
                    handleError(err, argv.verbose);
                  }
                },
              )
              .demandCommand(1, 'Specify a login-methods subcommand: get, set, clear')
          );
        })

        // ── nested subcommand groups ────────────────────────────────────
        .command(clientSecretCommand)
        .command(clientServiceAccountCommand)
        .demandCommand(
          1,
          'Specify a client subcommand: create, list, get, update, activate, deactivate, delete, history, login-methods, secret, service-account',
        )
    );
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
