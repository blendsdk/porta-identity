/**
 * CLI signing key management commands.
 *
 * Manages ES256 signing keys via the Admin API.
 * Provides list, generate, and rotate subcommands.
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
import type { AdminHttpClient } from '../http-client.js';
import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Signing key metadata as returned by the Admin API */
interface KeyEntry {
  id: string;
  kid: string;
  algorithm: string;
  status: string;
  createdAt: string;
  retiredAt: string | null;
}

/** List response: { data: KeyEntry[] } */
interface KeyListResponse {
  data: KeyEntry[];
}

/** Generate/rotate response */
interface KeyActionResponse {
  data: {
    id: string;
    kid: string;
    message: string;
    retiredCount?: number;
  };
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

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
            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.get<KeyListResponse>('/api/admin/keys');

              if (data.data.length === 0) {
                warn('No signing keys found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = data.data.map((r) => [
                    truncateId(r.id),
                    r.kid,
                    r.status,
                    formatDate(r.createdAt),
                    formatDate(r.retiredAt),
                  ]);
                  printTable(['ID', 'KID', 'Status', 'Created', 'Retired'], rows);
                  printTotal('signing keys', data.data.length);
                },
                data.data,
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
            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.post<KeyActionResponse>('/api/admin/keys/generate');
              success(`Generated new signing key: ${data.data.kid} (${truncateId(data.data.id)})`);
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

            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.post<KeyActionResponse>('/api/admin/keys/rotate');
              success(`Rotated keys — new active key: ${data.data.kid} (${truncateId(data.data.id)})`);
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
