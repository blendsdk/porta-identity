/**
 * CLI application custom claim definition subcommands.
 *
 * Manages custom claim definitions within an application via the Admin API.
 *
 * Usage:
 *   porta app claim create <app> --name "department" --type string [--description "..."]
 *   porta app claim list <app>
 *   porta app claim update <app> <claim-id> --description "Updated description"
 *   porta app claim delete <app> <claim-id>
 *
 * @module cli/commands/app-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { resolveApp } from './app.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Claim definition data as returned by the Admin API */
interface ClaimData {
  id: string;
  claimName: string;
  claimType: string;
  description: string | null;
  applicationId: string;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response */
interface ClaimResponse { data: ClaimData; }

/** Array response for claim list */
interface ClaimListResponse { data: ClaimData[]; }

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
interface ClaimIdArgs extends GlobalOptions { app: string; 'claim-id': string; }
interface ClaimUpdateArgs extends ClaimIdArgs { description?: string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve app and build the claims API base path.
 *
 * @param client - Authenticated HTTP client
 * @param appIdOrSlug - Application UUID or slug
 * @returns API base path for claim definitions under this application
 */
async function claimsPath(client: AdminHttpClient, appIdOrSlug: string): Promise<string> {
  const app = await resolveApp(client, appIdOrSlug);
  return `/api/admin/applications/${app.id}/claims`;
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
      // ── create ──────────────────────────────────────────────────────
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
            await withHttpClient(args, async (client) => {
              const base = await claimsPath(client, args.app);
              const resp = await client.post<ClaimResponse>(base, {
                claimName: args.name,
                claimType: args.type,
                description: args.description,
              });
              const def = resp.data.data;
              outputResult(args.json, () => {
                success(`Claim definition created: ${def.claimName} (${def.claimType})`);
              }, def);
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<ClaimListArgs>(
        'list <app>',
        'List claim definitions for an application',
        (y) => y.positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as ClaimListArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await claimsPath(client, args.app);
              const resp = await client.get<ClaimListResponse>(base);
              const defs = resp.data.data;
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

      // ── update ──────────────────────────────────────────────────────
      .command<ClaimUpdateArgs>(
        'update <app> <claim-id>',
        'Update a claim definition',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' })
          .option('description', { type: 'string', description: 'New description' }),
        async (argv) => {
          const args = argv as unknown as ClaimUpdateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const base = await claimsPath(client, args.app);
              const resp = await client.put<ClaimResponse>(
                `${base}/${args['claim-id']}`,
                { description: args.description },
              );
              const def = resp.data.data;
              outputResult(args.json, () => { success(`Claim definition updated: ${def.claimName}`); }, def);
            });
          }, args.verbose);
        },
      )

      // ── delete ──────────────────────────────────────────────────────
      .command<ClaimIdArgs>(
        'delete <app> <claim-id>',
        'Delete a claim definition',
        (y) => y
          .positional('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
          .positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' }),
        async (argv) => {
          const args = argv as unknown as ClaimIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would delete claim definition ${args['claim-id']}`); return; }
            const confirmed = await confirm(`Delete claim definition ${args['claim-id']}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withHttpClient(args, async (client) => {
              const base = await claimsPath(client, args.app);
              await client.delete(`${base}/${args['claim-id']}`);
              success(`Claim definition deleted: ${args['claim-id']}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a claim subcommand: create, list, update, delete');
  },
  handler: () => {},
};
