/**
 * CLI client secret subcommands.
 *
 * Manages client secrets — generate, list, and revoke.
 * Secret generate displays the plaintext ONCE in a prominent warning box.
 *
 * Usage:
 *   porta client secret generate <client-id> [--label "production"]
 *   porta client secret list <client-id>
 *   porta client secret revoke <secret-id>
 *
 * @module cli/commands/client-secret
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

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
            await withBootstrap(args, async () => {
              const { generateSecret } = await import('../../clients/index.js');
              const secret = await generateSecret(args['client-id'], {
                label: args.label,
              });

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
            await withBootstrap(args, async () => {
              const { listSecretsByClient } = await import('../../clients/index.js');
              const secrets = await listSecretsByClient(args['client-id']);

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
        'revoke <secret-id>',
        'Revoke a client secret (permanent)',
        (y) =>
          y.positional('secret-id', {
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

            await withBootstrap(args, async () => {
              const { revokeSecret } = await import('../../clients/index.js');
              await revokeSecret(args['secret-id']);
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
