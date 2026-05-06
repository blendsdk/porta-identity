/**
 * Keys command — manage signing keys.
 *
 * Subcommands:
 *   list       List all signing keys
 *   generate   Generate a new ES256 key pair
 *   rotate     Rotate: generate new + retire current active
 *
 * @module commands/keys
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, formatDate, truncate } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

interface KeysBaseArgs extends GlobalOptions {}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const keysCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'keys',
  describe: 'Manage signing keys',
  builder: (yargs) =>
    yargs
      // ── list ──────────────────────────────────────────────────────────
      .command<KeysBaseArgs>(
        'list',
        'List all signing keys',
        (y) => y,
        async (argv) => {
          try {
            const client = createClient(argv);
            const keys = await client.keys.list();

            if (argv.json) {
              printJson(keys);
              return;
            }

            if (keys.length === 0) {
              warn('No signing keys found');
              return;
            }

            printTable(
              ['ID', 'KID', 'Algorithm', 'Status', 'Created', 'Rotated'],
              keys.map((k) => [
                truncate(k.id, 12),
                k.kid,
                k.algorithm,
                k.isActive ? 'active' : 'retired',
                formatDate(k.createdAt),
                formatDate(k.rotatedAt),
              ]),
            );
            success(`${keys.length} signing key(s)`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── generate ──────────────────────────────────────────────────────
      .command<KeysBaseArgs>(
        'generate',
        'Generate a new ES256 key pair',
        (y) => y,
        async (argv) => {
          try {
            const client = createClient(argv);
            const key = await client.keys.generate();

            if (argv.json) {
              printJson(key);
              return;
            }

            success(`Generated signing key: ${key.kid} (${truncate(key.id, 12)})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── rotate ────────────────────────────────────────────────────────
      .command<KeysBaseArgs>(
        'rotate',
        'Rotate signing keys (generate new + retire current active)',
        (y) => y,
        async (argv) => {
          try {
            if (!argv.force) {
              const ok = await confirm('Rotate signing keys? This will retire the current active key.');
              if (!ok) {
                warn('Aborted');
                return;
              }
            }

            const client = createClient(argv);
            const key = await client.keys.rotate();

            if (argv.json) {
              printJson(key);
              return;
            }

            success(`Rotated signing keys. New active key: ${key.kid}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify a keys subcommand: list, generate, rotate'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
