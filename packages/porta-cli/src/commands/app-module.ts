/**
 * CLI application module subcommands.
 *
 * @module commands/app-module
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate, truncate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ModuleCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug?: string;
  description?: string;
}

interface ModuleListArgs extends GlobalOptions {
  'app-id': string;
}

interface ModuleUpdateArgs extends GlobalOptions {
  'app-id': string;
  'module-id': string;
  name?: string;
  description?: string;
}

interface ModuleRemoveArgs extends GlobalOptions {
  'app-id': string;
  'module-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const appModuleCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'module',
  describe: 'Manage application modules',
  builder: (yargs) => {
    return yargs
      .command<ModuleCreateArgs>(
        'add <app-id>',
        'Add a module to an application',
        (y) =>
          y
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .option('name', { type: 'string', demandOption: true, description: 'Module name' })
            .option('slug', { type: 'string', description: 'Module slug' })
            .option('description', { type: 'string', description: 'Module description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const mod = await client.applications.addModule(argv['app-id'], {
              name: argv.name,
              slug: argv.slug,
              description: argv.description,
            });

            if (argv.json) {
              printJson(mod);
            } else {
              success(`Module added: ${mod.name} (${mod.slug})`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ModuleListArgs>(
        'list <app-id>',
        'List modules for an application',
        (y) =>
          y.positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const modules = await client.applications.listModules(argv['app-id']);

            if (modules.length === 0) {
              warn('No modules found');
              return;
            }

            if (argv.json) {
              printJson(modules);
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Active', 'Created'],
                modules.map((m) => [
                  truncate(m.id, 8),
                  m.name,
                  m.slug,
                  String(m.isActive),
                  formatDate(m.createdAt),
                ]),
              );
              info(`Total: ${modules.length} modules`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ModuleUpdateArgs>(
        'update <app-id> <module-id>',
        'Update a module',
        (y) =>
          y
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .positional('module-id', { type: 'string', demandOption: true, description: 'Module ID' })
            .option('name', { type: 'string', description: 'New module name' })
            .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const updated = await client.applications.updateModule(argv['app-id'], argv['module-id'], {
              name: argv.name,
              description: argv.description,
            });

            if (argv.json) {
              printJson(updated);
            } else {
              success(`Module updated: ${updated.name}`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ModuleRemoveArgs>(
        'remove <app-id> <module-id>',
        'Remove a module from an application',
        (y) =>
          y
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .positional('module-id', { type: 'string', demandOption: true, description: 'Module ID' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.applications.removeModule(argv['app-id'], argv['module-id']);
            success('Module removed');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a module subcommand: add, list, update, remove');
  },
  handler: () => {},
};
