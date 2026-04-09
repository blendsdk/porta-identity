/**
 * CLI application custom claim definition subcommands.
 *
 * Manages custom claim definitions within an application.
 *
 * Usage:
 *   porta app claim create <app> --name "department" --type string [--description "..."]
 *   porta app claim list <app>
 *   porta app claim update <claim-id> --description "Updated description"
 *   porta app claim delete <claim-id>
 *
 * @module cli/commands/app-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { isUuid } from './app.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimCreateArgs extends GlobalOptions {
  app: string;
  name: string;
  type: string;
  description?: string;
}
interface ClaimListArgs extends GlobalOptions { app: string; }
interface ClaimIdArgs extends GlobalOptions { 'claim-id': string; }
interface ClaimUpdateArgs extends ClaimIdArgs { description?: string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve an app identifier to a UUID */
async function resolveAppId(idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const { getApplicationBySlug, ApplicationNotFoundError } = await import('../../applications/index.js');
  const app = await getApplicationBySlug(idOrSlug);
  if (!app) throw new ApplicationNotFoundError(idOrSlug);
  return app.id;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The app claim subcommand group — registered under `app` */
export const appClaimCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'claim',
  describe: 'Manage custom claim definitions',
  builder: (yargs) => {
    return yargs
      .command<ClaimCreateArgs>(
        'create <app>',
        'Define a custom claim',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .option('name', { type: 'string', demandOption: true, description: 'Claim name (e.g., "department")' })
          .option('type', { type: 'string', demandOption: true, choices: ['string', 'number', 'boolean', 'json'], description: 'Claim value type' })
          .option('description', { type: 'string', description: 'Claim description' }),
        async (argv) => {
          const args = argv as unknown as ClaimCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createDefinition } = await import('../../custom-claims/index.js');
              const appId = await resolveAppId(args.app);
              const def = await createDefinition({
                applicationId: appId,
                claimName: args.name,
                claimType: args.type as 'string' | 'number' | 'boolean' | 'json',
                description: args.description,
              });
              outputResult(args.json, () => {
                success(`Claim definition created: ${def.claimName} (${def.claimType})`);
              }, def);
            });
          }, args.verbose);
        },
      )
      .command<ClaimListArgs>(
        'list <app>',
        'List claim definitions for an application',
        (y) => y.positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as ClaimListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listDefinitions } = await import('../../custom-claims/index.js');
              const appId = await resolveAppId(args.app);
              const defs = await listDefinitions(appId);
              if (defs.length === 0) { warn('No claim definitions found'); return; }
              outputResult(args.json, () => {
                printTable(['ID', 'Name', 'Type', 'Description', 'Created'], defs.map((d) => [
                  truncateId(d.id), d.claimName, d.claimType, d.description ?? '—', formatDate(d.createdAt),
                ]));
                printTotal('claim definitions', defs.length);
              }, defs);
            });
          }, args.verbose);
        },
      )
      .command<ClaimUpdateArgs>(
        'update <claim-id>',
        'Update a claim definition',
        (y) => y
          .positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' })
          .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          const args = argv as unknown as ClaimUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updateDefinition } = await import('../../custom-claims/index.js');
              const def = await updateDefinition(args['claim-id'], { description: args.description });
              outputResult(args.json, () => { success(`Claim definition updated: ${def.claimName}`); }, def);
            });
          }, args.verbose);
        },
      )
      .command<ClaimIdArgs>(
        'delete <claim-id>',
        'Delete a claim definition',
        (y) => y.positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' }),
        async (argv) => {
          const args = argv as unknown as ClaimIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would delete claim definition ${args['claim-id']}`); return; }
            const confirmed = await confirm(`Delete claim definition ${args['claim-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { deleteDefinition } = await import('../../custom-claims/index.js');
              await deleteDefinition(args['claim-id']);
              success(`Claim definition deleted: ${args['claim-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a claim subcommand: create, list, update, delete');
  },
  handler: () => {},
};
