/**
 * CLI system config commands.
 *
 * Manages system configuration values stored in the `system_config` table.
 * Provides list, get, and set subcommands.
 *
 * Usage:
 *   porta config list                    # List all config values
 *   porta config get <key>               # Get a specific config value
 *   porta config set <key> <value>       # Set a config value
 *
 * @module cli/commands/config
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, printTotal } from '../output.js';

/** The config command module — registered at the top level of the CLI */
export const configCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'config',
  describe: 'Manage system configuration',
  builder: (yargs) => {
    return yargs
      .command(
        'list',
        'List all system config values',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getPool } = await import('../../lib/database.js');
              const result = await getPool().query(
                `SELECT key, value, value_type, description, is_sensitive, updated_at
                 FROM system_config ORDER BY key`,
              );

              if (result.rows.length === 0) {
                warn('No config entries found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = result.rows.map((r: { key: string; value: string; value_type: string; is_sensitive: boolean }) => [
                    r.key,
                    r.is_sensitive ? '***' : r.value,
                    r.value_type,
                  ]);
                  printTable(['Key', 'Value', 'Type'], rows);
                  printTotal('config entries', result.rows.length);
                },
                result.rows,
              );
            });
          }, args.verbose);
        },
      )
      .command(
        'get <key>',
        'Get a specific config value',
        (y) =>
          y.positional('key', {
            type: 'string',
            demandOption: true,
            description: 'Config key to retrieve',
          }),
        async (argv) => {
          const args = argv as unknown as GlobalOptions & { key: string };
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getPool } = await import('../../lib/database.js');
              const result = await getPool().query(
                'SELECT key, value, value_type, description, is_sensitive FROM system_config WHERE key = $1',
                [args.key],
              );

              if (result.rows.length === 0) {
                warn(`Config key not found: ${args.key}`);
                return;
              }

              const row = result.rows[0] as { key: string; value: string; value_type: string; description: string; is_sensitive: boolean };
              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Key', 'Value', 'Type', 'Description'],
                    [[row.key, row.is_sensitive ? '***' : row.value, row.value_type, row.description || '—']],
                  );
                },
                row,
              );
            });
          }, args.verbose);
        },
      )
      .command(
        'set <key> <value>',
        'Set a system config value',
        (y) =>
          y
            .positional('key', {
              type: 'string',
              demandOption: true,
              description: 'Config key to set',
            })
            .positional('value', {
              type: 'string',
              demandOption: true,
              description: 'New value',
            }),
        async (argv) => {
          const args = argv as unknown as GlobalOptions & { key: string; value: string };
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn(`Dry run — would set ${args.key} = ${args.value}`);
              return;
            }
            await withBootstrap(args, async () => {
              const { getPool } = await import('../../lib/database.js');
              const result = await getPool().query(
                'UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING key',
                [args.value, args.key],
              );

              if (result.rows.length === 0) {
                warn(`Config key not found: ${args.key}`);
                return;
              }

              success(`Set ${args.key} = ${args.value}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a config subcommand: list, get, set');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
