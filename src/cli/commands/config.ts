/**
 * CLI system config commands.
 *
 * Manages system configuration values via the Admin API.
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
import type { AdminHttpClient } from '../http-client.js';
import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, printTotal } from '../output.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Config entry as returned by the Admin API */
interface ConfigEntry {
  key: string;
  value: string;
  valueType: string;
  description: string | null;
  isSensitive: boolean;
  updatedAt: string;
}

/** List response: { data: ConfigEntry[] } */
interface ConfigListResponse {
  data: ConfigEntry[];
}

/** Single entry response: { data: ConfigEntry } */
interface ConfigGetResponse {
  data: ConfigEntry;
}

/** Update response: { data: { key, value, valueType } } */
interface ConfigSetResponse {
  data: { key: string; value: string; valueType: string };
}

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ConfigGetArgs extends GlobalOptions {
  key: string;
}

interface ConfigSetArgs extends GlobalOptions {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

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
            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.get<ConfigListResponse>('/api/admin/config');

              if (data.data.length === 0) {
                warn('No config entries found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = data.data.map((r) => [
                    r.key,
                    r.value,
                    r.valueType,
                  ]);
                  printTable(['Key', 'Value', 'Type'], rows);
                  printTotal('config entries', data.data.length);
                },
                data.data,
              );
            });
          }, args.verbose);
        },
      )
      .command<ConfigGetArgs>(
        'get <key>',
        'Get a specific config value',
        (y) =>
          y.positional('key', {
            type: 'string',
            demandOption: true,
            description: 'Config key to retrieve',
          }),
        async (argv) => {
          const args = argv as unknown as ConfigGetArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.get<ConfigGetResponse>(
                `/api/admin/config/${encodeURIComponent(args.key)}`,
              );

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Key', 'Value', 'Type', 'Description'],
                    [[data.data.key, data.data.value, data.data.valueType, data.data.description || '—']],
                  );
                },
                data.data,
              );
            });
          }, args.verbose);
        },
      )
      .command<ConfigSetArgs>(
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
          const args = argv as unknown as ConfigSetArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) {
              warn(`Dry run — would set ${args.key} = ${args.value}`);
              return;
            }
            await withHttpClient(args, async (client: AdminHttpClient) => {
              const { data } = await client.put<ConfigSetResponse>(
                `/api/admin/config/${encodeURIComponent(args.key)}`,
                { value: args.value },
              );

              success(`Set ${data.data.key} = ${data.data.value}`);
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
