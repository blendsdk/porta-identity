/**
 * Config command — manage system configuration.
 *
 * Subcommands:
 *   list       List all configuration entries
 *   get        Get a specific configuration value
 *   set        Set a configuration value
 *
 * @module commands/config
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, formatDate } from '../output.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

interface ConfigGetArgs extends GlobalOptions {
  key: string;
}

interface ConfigSetArgs extends GlobalOptions {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const configCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'config',
  describe: 'Manage system configuration',
  builder: (yargs) =>
    yargs
      // ── list ──────────────────────────────────────────────────────────
      .command<GlobalOptions>(
        'list',
        'List all configuration entries',
        (y) => y,
        async (argv) => {
          try {
            const client = createClient(argv);
            const entries = await client.config.list();

            if (argv.json) {
              printJson(entries);
              return;
            }

            printTable(
              ['Key', 'Value', 'Updated'],
              entries.map((e) => [e.key, e.value, formatDate(e.updatedAt)]),
            );
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── get ───────────────────────────────────────────────────────────
      .command<ConfigGetArgs>(
        'get <key>',
        'Get a configuration value',
        (y) =>
          y.positional('key', {
            type: 'string',
            describe: 'Configuration key',
            demandOption: true,
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const entry = await client.config.get(argv.key);

            if (argv.json) {
              printJson(entry);
              return;
            }

            printTable(
              ['Key', 'Value', 'Description', 'Updated'],
              [[entry.key, entry.value, entry.description ?? '—', formatDate(entry.updatedAt)]],
            );
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── set ───────────────────────────────────────────────────────────
      .command<ConfigSetArgs>(
        'set <key> <value>',
        'Set a configuration value',
        (y) =>
          y
            .positional('key', {
              type: 'string',
              describe: 'Configuration key',
              demandOption: true,
            })
            .positional('value', {
              type: 'string',
              describe: 'New value',
              demandOption: true,
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const entry = await client.config.set(argv.key, argv.value);

            if (argv.json) {
              printJson(entry);
              return;
            }

            success(`Set ${entry.key} = ${entry.value}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify a config subcommand: list, get, set'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
