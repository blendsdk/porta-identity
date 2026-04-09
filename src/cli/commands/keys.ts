/**
 * CLI signing key management commands.
 *
 * Manages ES256 signing keys used by the OIDC provider for token signing.
 * Provides list, generate, rotate, and cleanup subcommands.
 *
 * Usage:
 *   porta keys list              # List all signing keys and their status
 *   porta keys generate          # Generate a new key pair
 *   porta keys rotate            # Generate new + retire current active key
 *   porta keys rotate --force    # Skip confirmation
 *
 * @module cli/commands/keys
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

/** The keys command module — registered at the top level of the CLI */
export const keysCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'keys',
  describe: 'Manage signing keys',
  builder: (yargs) => {
    return yargs
      .command(
        'list',
        'List all signing keys',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getPool } = await import('../../lib/database.js');
              const result = await getPool().query(
                'SELECT id, kid, algorithm, status, created_at, retired_at FROM signing_keys ORDER BY created_at DESC',
              );

              if (result.rows.length === 0) {
                warn('No signing keys found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = result.rows.map((r: { id: string; kid: string; status: string; created_at: string; retired_at: string | null }) => [
                    truncateId(r.id),
                    r.kid,
                    r.status,
                    formatDate(r.created_at),
                    formatDate(r.retired_at),
                  ]);
                  printTable(['ID', 'KID', 'Status', 'Created', 'Retired'], rows);
                  printTotal('signing keys', result.rows.length);
                },
                result.rows,
              );
            });
          }, args.verbose);
        },
      )
      .command(
        'generate',
        'Generate a new ES256 key pair',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn('Dry run — would generate a new ES256 signing key');
              return;
            }
            await withBootstrap(args, async () => {
              const { generateES256KeyPair } = await import('../../lib/signing-keys.js');
              const { getPool } = await import('../../lib/database.js');

              const keyPair = generateES256KeyPair();
              const result = await getPool().query(
                `INSERT INTO signing_keys (kid, algorithm, public_key, private_key, status)
                 VALUES ($1, 'ES256', $2, $3, 'active')
                 RETURNING id, kid`,
                [keyPair.kid, keyPair.publicKeyPem, keyPair.privateKeyPem],
              );

              const row = result.rows[0] as { id: string; kid: string };
              success(`Generated new signing key: ${row.kid} (${truncateId(row.id)})`);
            });
          }, args.verbose);
        },
      )
      .command(
        'rotate',
        'Rotate: generate new key + retire current active',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn('Dry run — would rotate signing keys (retire current, generate new)');
              return;
            }

            const confirmed = await confirm(
              'This will retire the current active key and generate a new one. Continue?',
              args.force,
            );
            if (!confirmed) {
              warn('Key rotation cancelled');
              return;
            }

            await withBootstrap(args, async () => {
              const { generateES256KeyPair } = await import('../../lib/signing-keys.js');
              const { getPool } = await import('../../lib/database.js');
              const pool = getPool();

              // Retire all currently active keys
              await pool.query(
                `UPDATE signing_keys SET status = 'retired', retired_at = NOW() WHERE status = 'active'`,
              );

              // Generate and insert new active key
              const keyPair = generateES256KeyPair();
              const result = await pool.query(
                `INSERT INTO signing_keys (kid, algorithm, public_key, private_key, status)
                 VALUES ($1, 'ES256', $2, $3, 'active')
                 RETURNING id, kid`,
                [keyPair.kid, keyPair.publicKeyPem, keyPair.privateKeyPem],
              );

              const row = result.rows[0] as { id: string; kid: string };
              success(`Rotated keys — new active key: ${row.kid} (${truncateId(row.id)})`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a keys subcommand: list, generate, rotate');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
