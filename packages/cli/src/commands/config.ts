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
import type { ConfigEntry, ConfigValue } from '@portaidentity/sdk';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError, EXIT_VALIDATION_ERROR } from '../error-handler.js';
import { printTable, printJson, success, formatDate, error, info } from '../output.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

/** Arguments for an authoritative configuration read. */
interface ConfigGetArgs extends GlobalOptions {
  key: string;
}

/** Untrusted positional strings converted only after reading server metadata. */
interface ConfigSetArgs extends GlobalOptions {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/** Display the server's accepted range or exact string choices without copying policy. */
function allowedValues(entry: ConfigEntry): string {
  return entry.valueType === 'integer'
    ? `${entry.minimum}–${entry.maximum}`
    : (entry.allowedValues ?? []).join(', ');
}

/** Render native scalar values as text only at the existing terminal-output boundary. */
function entryRow(entry: ConfigEntry): string[] {
  return [
    entry.key,
    String(entry.value),
    entry.valueType,
    entry.unit,
    allowedValues(entry),
    entry.applicationMode,
    formatDate(entry.updatedAt),
  ];
}

/**
 * Parse a positional value using authoritative metadata, never JavaScript's permissive coercion.
 * Undefined means invalid; callers must not issue an update in that case.
 * Bounds are checked here for helpful feedback and again by the server for authorization safety.
 */
function parseValue(entry: ConfigEntry, text: string): ConfigValue | undefined {
  if (entry.valueType === 'string') {
    return entry.allowedValues?.some((allowed) => allowed === text) ? text : undefined;
  }
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const value = Number(text);
  if (
    !Number.isSafeInteger(value) ||
    entry.minimum === undefined ||
    entry.maximum === undefined ||
    value < entry.minimum ||
    value > entry.maximum
  )
    return undefined;
  return value;
}

/**
 * Existing list/get/set commands over the closed, metadata-driven operational catalog.
 * @example porta config set magic_link_ttl 1200
 */
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
              ['Key', 'Value', 'Type', 'Unit', 'Allowed', 'Application mode', 'Updated'],
              entries.map(entryRow),
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
              [
                'Key',
                'Value',
                'Type',
                'Unit',
                'Allowed',
                'Application mode',
                'Updated',
                'Description',
              ],
              [[...entryRow(entry), entry.description]],
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
            const entry = await client.config.get(argv.key);
            const value = parseValue(entry, argv.value);
            if (value === undefined) {
              error(`Expected ${entry.valueType} (${entry.unit}): ${allowedValues(entry)}.`);
              process.exitCode = EXIT_VALIDATION_ERROR;
              return;
            }
            const result = await client.config.set(entry.key, value);

            if (argv.json) {
              printJson(result);
              return;
            }

            success(`Set ${result.data.key} = ${result.data.value}`);
            if (result.restartRequired) {
              info('Restart every Porta server instance to apply this change.');
            }
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
