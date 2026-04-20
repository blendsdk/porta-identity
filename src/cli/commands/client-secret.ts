/**
 * CLI client secret subcommands.
 *
 * Manages client secrets via the Admin API — generate, list, and revoke.
 * Secret generate displays the plaintext ONCE in a prominent warning box.
 *
 * Usage:
 *   porta client secret generate <client-id> [--label "production"]
 *   porta client secret list <client-id>
 *   porta client secret revoke <client-id> <secret-id>
 *
 * @module cli/commands/client-secret
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Secret data returned after generation (includes plaintext) */
interface SecretGenerateData {
  id: string;
  plaintext: string;
  label: string | null;
  status: string;
  createdAt: string;
}

/** Secret metadata (no plaintext — used in list) */
interface SecretListItem {
  id: string;
  label: string | null;
  status: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Wrapped single-entity response for generate */
interface SecretGenerateResponse { data: SecretGenerateData; }

/** Array response for secret list */
interface SecretListResponse { data: SecretListItem[]; }

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface SecretGenerateArgs extends GlobalOptions {
  'client-id': string;
  label?: string;
}

interface SecretListArgs extends GlobalOptions {
  'client-id': string;
}

interface SecretRevokeArgs extends GlobalOptions {
  'client-id': string;
  'secret-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The client secret subcommand group — registered under `client` */
export const clientSecretCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'secret',
  describe: 'Manage client secrets',
  builder: (yargs) => {
    return yargs
      // ── generate ───────────────────────────────────────────────────
      .command<SecretGenerateArgs>(
        'generate <client-id>',
        'Generate a new client secret',
        (y) =>
          y
            .positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client UUID',
            })
            .option('label', {
              type: 'string',
              description: 'Label for the secret (e.g., "production")',
            }),
        async (argv) => {
          const args = argv as unknown as SecretGenerateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const resp = await client.post<SecretGenerateResponse>(
                `/api/admin/clients/${args['client-id']}/secrets`,
                { label: args.label },
              );
              const secret = resp.data.data;

              outputResult(
                args.json,
                () => {
                  // One-time secret display — prominent warning box
                  console.log('');
                  warn('⚠️  IMPORTANT: Copy this secret now. It will not be shown again!');
                  console.log('');
                  console.log('┌─────────────────────────────────────────────────────────────────┐');
                  console.log(`│ Secret: ${secret.plaintext.padEnd(55)}│`);
                  console.log(`│ Label:  ${(secret.label ?? '—').padEnd(55)}│`);
                  console.log(`│ ID:     ${truncateId(secret.id).padEnd(55)}│`);
                  console.log('└─────────────────────────────────────────────────────────────────┘');
                  console.log('');
                },
                secret,
              );
            });
          }, args.verbose);
        },
      )

      // ── list ───────────────────────────────────────────────────────
      .command<SecretListArgs>(
        'list <client-id>',
        'List secrets for a client (metadata only)',
        (y) =>
          y.positional('client-id', {
            type: 'string',
            demandOption: true,
            description: 'Client UUID',
          }),
        async (argv) => {
          const args = argv as unknown as SecretListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const resp = await client.get<SecretListResponse>(
                `/api/admin/clients/${args['client-id']}/secrets`,
              );
              const secrets = resp.data.data;

              if (secrets.length === 0) {
                warn('No secrets found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Label', 'Status', 'Last Used', 'Expires', 'Created'],
                    secrets.map((s) => [
                      truncateId(s.id),
                      s.label ?? '—',
                      s.status,
                      s.lastUsedAt ? formatDate(s.lastUsedAt) : '—',
                      s.expiresAt ? formatDate(s.expiresAt) : '—',
                      formatDate(s.createdAt),
                    ]),
                  );
                  printTotal('secrets', secrets.length);
                },
                secrets,
              );
            });
          }, args.verbose);
        },
      )

      // ── revoke ─────────────────────────────────────────────────────
      .command<SecretRevokeArgs>(
        'revoke <client-id> <secret-id>',
        'Revoke a client secret (permanent)',
        (y) =>
          y
            .positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client UUID',
            })
            .positional('secret-id', {
              type: 'string',
              demandOption: true,
              description: 'Secret UUID',
            }),
        async (argv) => {
          const args = argv as unknown as SecretRevokeArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn(`[DRY RUN] Would revoke secret ${args['secret-id']}`);
              return;
            }

            const confirmed = await confirm(
              `Revoke secret ${args['secret-id']}? This is permanent and cannot be undone.`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }

            await withHttpClient(args, async (client) => {
              await client.post(
                `/api/admin/clients/${args['client-id']}/secrets/${args['secret-id']}/revoke`,
              );
              success(`Secret revoked: ${args['secret-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a secret subcommand: generate, list, revoke');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
