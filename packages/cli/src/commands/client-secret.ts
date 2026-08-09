/**
 * CLI client secret subcommands.
 *
 * Manages client secrets via the Porta SDK — generate, list, and revoke.
 * Secret generate displays the plaintext ONCE in a prominent warning box.
 *
 * Usage:
 *   porta client secret generate <client-id> [--label "production"]
 *   porta client secret list <client-id>
 *   porta client secret revoke <client-id> <secret-id>
 *
 * @module commands/client-secret
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';

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
    return (
      yargs
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
            try {
              const sdkClient = createClient(argv);
              const secret = await sdkClient.clients.generateSecret(argv['client-id'], {
                label: argv.label,
              });

              if (argv.json) {
                printJson(secret);
              } else {
                // One-time secret display — prominent warning box
                console.log('');
                warn('⚠️  IMPORTANT: Copy this secret now. It will not be shown again!');
                console.log('');
                console.log('┌─────────────────────────────────────────────────────────────────┐');
                console.log(`│ Secret: ${secret.secret.padEnd(55)}│`);
                console.log(`│ Label:  ${(secret.label ?? '—').padEnd(55)}│`);
                console.log(`│ ID:     ${secret.id.padEnd(55)}│`);

                console.log('└─────────────────────────────────────────────────────────────────┘');
                console.log('');
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
            try {
              const sdkClient = createClient(argv);
              const secrets = await sdkClient.clients.listSecrets(argv['client-id']);

              if (secrets.length === 0) {
                warn('No secrets found');
                return;
              }

              if (argv.json) {
                printJson(secrets);
              } else {
                printTable(
                  ['ID', 'Label', 'Last Used', 'Expires', 'Created'],
                  secrets.map((s) => [
                    s.id,
                    s.label ?? '—',
                    s.lastUsedAt ? formatDate(s.lastUsedAt) : '—',
                    s.expiresAt ? formatDate(s.expiresAt) : '—',
                    formatDate(s.createdAt),
                  ]),
                );
                info(`Total: ${secrets.length} secrets`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
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
            try {
              if (!argv.force) {
                const confirmed = await confirm(
                  `Revoke secret ${argv['secret-id']}? This is permanent and cannot be undone.`,
                );
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }

              const sdkClient = createClient(argv);
              await sdkClient.clients.revokeSecret(argv['client-id'], argv['secret-id']);
              success(`Secret revoked: ${argv['secret-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )
        .demandCommand(1, 'Specify a secret subcommand: generate, list, revoke')
    );
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
