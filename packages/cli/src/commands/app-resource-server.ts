/**
 * CLI resource-server subcommands.
 *
 * @module commands/app-resource-server
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, formatDate } from '../output.js';
import { confirm } from '../prompt.js';

interface AppArgs extends GlobalOptions {
  app: string;
}

interface ResourceServerArgs extends AppArgs {
  'resource-server': string;
}

interface ResourceServerCreateArgs extends AppArgs {
  name: string;
  slug?: string;
  identifier: string;
  audience?: string;
  scope?: string[];
}

interface ResourceServerUpdateArgs extends ResourceServerArgs {
  name: string;
  slug: string;
  identifier: string;
  audience?: string;
  scope?: string[];
}

interface ResourceServerDeleteArgs extends ResourceServerArgs {
  yes?: boolean;
}

/** Print one resource server as a key/value table. */
function printResourceServer(resourceServer: {
  id: string;
  name: string;
  slug: string;
  identifier: string;
  audience: string;
  scopes: readonly string[];
  createdAt: string;
  updatedAt: string;
}): void {
  printTable(
    ['Field', 'Value'],
    [
      ['ID', resourceServer.id],
      ['Name', resourceServer.name],
      ['Slug', resourceServer.slug],
      ['Identifier', resourceServer.identifier],
      ['Audience', resourceServer.audience],
      ['Scopes', resourceServer.scopes.length > 0 ? resourceServer.scopes.join(', ') : '—'],
      ['Created', formatDate(resourceServer.createdAt)],
      ['Updated', formatDate(resourceServer.updatedAt)],
    ],
  );
}

/** Build the create input from command flags without inventing empty values. */
function resourceServerInput(argv: ResourceServerCreateArgs) {
  return {
    name: argv.name,
    ...(argv.slug !== undefined ? { slug: argv.slug } : {}),
    identifier: argv.identifier,
    ...(argv.audience !== undefined ? { audience: argv.audience } : {}),
    scopes: argv.scope ?? [],
  };
}

/** Build the full-replacement update input; slug and identifier are required flags. */
function resourceServerUpdateInput(argv: ResourceServerUpdateArgs) {
  return {
    name: argv.name,
    slug: argv.slug,
    identifier: argv.identifier,
    ...(argv.audience !== undefined ? { audience: argv.audience } : {}),
    scopes: argv.scope ?? [],
  };
}

export const appResourceServerCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'resource-server',
  describe: 'Manage application-owned resource servers',
  builder: (yargs) => {
    return yargs
      .command<AppArgs>(
        'list <app>',
        'List resource servers for an application',
        (y) =>
          y.positional('app', {
            type: 'string',
            demandOption: true,
            description: 'Application UUID or slug',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const resourceServers = await client.applications.listResourceServers(argv.app);

            if (argv.json) {
              printJson(resourceServers);
            } else if (resourceServers.length === 0) {
              warn('No resource servers found');
            } else {
              printTable(
                ['ID', 'Name', 'Slug', 'Identifier', 'Audience', 'Scopes'],
                resourceServers.map((resourceServer) => [
                  resourceServer.id,
                  resourceServer.name,
                  resourceServer.slug,
                  resourceServer.identifier,
                  resourceServer.audience,
                  resourceServer.scopes.length > 0 ? resourceServer.scopes.join(', ') : '—',
                ]),
              );
            }
          } catch (err) {
            if (argv.json) handleError(err, argv.verbose, true);
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ResourceServerArgs>(
        'get <app> <resource-server>',
        'Show one resource server',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .positional('resource-server', {
              type: 'string',
              demandOption: true,
              description: 'Resource-server UUID or slug',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const resourceServer = await client.applications.getResourceServer(
              argv.app,
              argv['resource-server'],
            );

            if (argv.json) {
              printJson(resourceServer);
            } else {
              printResourceServer(resourceServer);
            }
          } catch (err) {
            if (argv.json) handleError(err, argv.verbose, true);
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ResourceServerCreateArgs>(
        'create <app>',
        'Create a resource server',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .option('name', { type: 'string', demandOption: true, description: 'Resource-server name' })
            .option('slug', { type: 'string', description: 'Resource-server slug' })
            .option('identifier', { type: 'string', demandOption: true, description: 'Absolute resource identifier' })
            .option('audience', { type: 'string', description: 'Access-token audience (defaults to identifier)' })
            .option('scope', { type: 'string', array: true, description: 'Custom scope (repeatable)' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const resourceServer = await client.applications.createResourceServer(
              argv.app,
              resourceServerInput(argv),
            );

            if (argv.json) {
              printJson(resourceServer);
            } else {
              success(`Resource server created: ${resourceServer.name} (${resourceServer.slug})`);
              printResourceServer(resourceServer);
            }
          } catch (err) {
            if (argv.json) handleError(err, argv.verbose, true);
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ResourceServerUpdateArgs>(
        'update <app> <resource-server>',
        'Replace a resource server definition',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .positional('resource-server', {
              type: 'string',
              demandOption: true,
              description: 'Resource-server UUID or slug',
            })
            .option('name', { type: 'string', demandOption: true, description: 'Resource-server name' })
            .option('slug', { type: 'string', demandOption: true, description: 'Resource-server slug' })
            .option('identifier', { type: 'string', demandOption: true, description: 'Absolute resource identifier' })
            .option('audience', { type: 'string', description: 'Access-token audience (omitted resets to identifier)' })
            .option('scope', { type: 'string', array: true, description: 'Custom scope (repeatable; omitted clears)' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const resourceServer = await client.applications.updateResourceServer(
              argv.app,
              argv['resource-server'],
              resourceServerUpdateInput(argv),
            );

            if (argv.json) {
              printJson(resourceServer);
            } else {
              success(`Resource server updated: ${resourceServer.name} (${resourceServer.slug})`);
              printResourceServer(resourceServer);
            }
          } catch (err) {
            if (argv.json) handleError(err, argv.verbose, true);
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ResourceServerDeleteArgs>(
        'delete <app> <resource-server>',
        'Delete a resource server',
        (y) =>
          y
            .positional('app', {
              type: 'string',
              demandOption: true,
              description: 'Application UUID or slug',
            })
            .positional('resource-server', {
              type: 'string',
              demandOption: true,
              description: 'Resource-server UUID or slug',
            })
            .option('yes', { type: 'boolean', default: false, description: 'Skip confirmation' }),
        async (argv) => {
          try {
            if (!argv.yes) {
              const confirmed = await confirm(
                `Delete resource server ${argv['resource-server']} from ${argv.app}?`,
              );
              if (!confirmed) {
                warn('Deletion cancelled');
                return;
              }
            }

            const client = createClient(argv);
            await client.applications.deleteResourceServer(argv.app, argv['resource-server']);
            success(`Resource server deleted: ${argv['resource-server']}`);
          } catch (err) {
            if (argv.json) handleError(err, argv.verbose, true);
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a resource-server subcommand');
  },
  handler: () => {},
};
