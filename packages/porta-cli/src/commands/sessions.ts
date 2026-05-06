/**
 * Sessions command — manage admin sessions.
 *
 * Subcommands:
 *   list             List active admin sessions
 *   revoke           Revoke a specific session by ID
 *   revoke-user      Revoke all sessions for a user
 *
 * @module commands/sessions
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

interface SessionListArgs extends GlobalOptions {
  'user-id'?: string;
  page?: number;
  'page-size'?: number;
}

interface SessionRevokeArgs extends GlobalOptions {
  id: string;
}

interface SessionRevokeUserArgs extends GlobalOptions {
  'user-id': string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const sessionsCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'sessions',
  describe: 'Manage admin sessions',
  builder: (yargs) =>
    yargs
      // ── list ──────────────────────────────────────────────────────────
      .command<SessionListArgs>(
        'list',
        'List active admin sessions',
        (y) =>
          y
            .option('user-id', {
              type: 'string',
              describe: 'Filter by user ID',
            })
            .option('page', {
              type: 'number',
              describe: 'Page number',
            })
            .option('page-size', {
              type: 'number',
              describe: 'Results per page',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const result = await client.sessions.list({
              userId: argv['user-id'],
              page: argv.page,
              pageSize: argv['page-size'],
            });

            if (argv.json) {
              printJson(result);
              return;
            }

            const sessions = result.data;
            if (sessions.length === 0) {
              warn('No active sessions found');
              return;
            }

            printTable(
              ['ID', 'User', 'IP', 'Last Activity', 'Expires'],
              sessions.map((s) => [
                truncate(s.id, 12),
                s.userEmail,
                s.ipAddress ?? '—',
                formatDate(s.lastActivityAt),
                formatDate(s.expiresAt),
              ]),
            );
            success(`${sessions.length} session(s)`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── revoke ────────────────────────────────────────────────────────
      .command<SessionRevokeArgs>(
        'revoke <id>',
        'Revoke a specific session',
        (y) =>
          y.positional('id', {
            type: 'string',
            describe: 'Session ID to revoke',
            demandOption: true,
          }),
        async (argv) => {
          try {
            if (!argv.force) {
              const ok = await confirm(`Revoke session ${truncate(argv.id, 12)}?`);
              if (!ok) {
                warn('Aborted');
                return;
              }
            }

            const client = createClient(argv);
            await client.sessions.revoke(argv.id);

            if (argv.json) {
              printJson({ revoked: argv.id });
              return;
            }

            success(`Revoked session ${truncate(argv.id, 12)}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── revoke-user ───────────────────────────────────────────────────
      .command<SessionRevokeUserArgs>(
        'revoke-user <user-id>',
        'Revoke all sessions for a user',
        (y) =>
          y.positional('user-id', {
            type: 'string',
            describe: 'User ID',
            demandOption: true,
          }),
        async (argv) => {
          try {
            if (!argv.force) {
              const ok = await confirm(`Revoke all sessions for user ${truncate(argv['user-id'], 12)}?`);
              if (!ok) {
                warn('Aborted');
                return;
              }
            }

            const client = createClient(argv);
            await client.sessions.revokeForUser(argv['user-id']);

            if (argv.json) {
              printJson({ revokedForUser: argv['user-id'] });
              return;
            }

            success(`Revoked all sessions for user ${truncate(argv['user-id'], 12)}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify a sessions subcommand: list, revoke, revoke-user'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
