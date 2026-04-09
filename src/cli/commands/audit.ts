/**
 * CLI audit log viewer command.
 *
 * Queries audit log entries from the database with optional filters.
 *
 * Usage:
 *   porta audit list                      # List recent events (default: 50)
 *   porta audit list --limit 100          # Increase limit
 *   porta audit list --event org.created  # Filter by event type
 *   porta audit list --since 2026-04-01   # Filter by date
 *   porta audit list --json               # JSON output
 *
 * @module cli/commands/audit
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, warn, outputResult, truncateId, formatDate, printTotal } from '../output.js';

/** Extended args for the audit list subcommand */
interface AuditListArgs extends GlobalOptions {
  limit: number;
  event?: string;
  org?: string;
  user?: string;
  since?: string;
}

/** The audit command module — registered at the top level of the CLI */
export const auditCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'audit',
  describe: 'View audit log',
  builder: (yargs) => {
    return yargs
      .command<AuditListArgs>(
        'list',
        'List recent audit log events',
        (y) =>
          y
            .option('limit', {
              type: 'number',
              default: 50,
              description: 'Maximum number of events to show',
            })
            .option('event', {
              type: 'string',
              description: 'Filter by event type',
            })
            .option('org', {
              type: 'string',
              description: 'Filter by organization ID',
            })
            .option('user', {
              type: 'string',
              description: 'Filter by user ID',
            })
            .option('since', {
              type: 'string',
              description: 'Show events since date (ISO 8601)',
            }),
        async (argv) => {
          const args = argv as unknown as AuditListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getPool } = await import('../../lib/database.js');

              // Build dynamic WHERE clause based on filters
              const conditions: string[] = [];
              const params: unknown[] = [];
              let paramIdx = 1;

              if (args.event) {
                conditions.push(`event_type = $${paramIdx++}`);
                params.push(args.event);
              }
              if (args.org) {
                conditions.push(`organization_id = $${paramIdx++}`);
                params.push(args.org);
              }
              if (args.user) {
                conditions.push(`user_id = $${paramIdx++}`);
                params.push(args.user);
              }
              if (args.since) {
                conditions.push(`created_at >= $${paramIdx++}`);
                params.push(args.since);
              }

              const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

              params.push(args.limit);
              const query = `SELECT id, event_type, event_category, actor_id, organization_id, description, created_at
                             FROM audit_log ${whereClause}
                             ORDER BY created_at DESC
                             LIMIT $${paramIdx}`;

              const result = await getPool().query(query, params);

              if (result.rows.length === 0) {
                warn('No audit log entries found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = result.rows.map((r: {
                    id: string;
                    event_type: string;
                    event_category: string;
                    actor_id: string | null;
                    organization_id: string | null;
                    description: string | null;
                    created_at: string;
                  }) => [
                    formatDate(r.created_at),
                    r.event_type,
                    r.event_category,
                    r.actor_id ? truncateId(r.actor_id) : '—',
                    r.description || '—',
                  ]);
                  printTable(['Date', 'Event', 'Category', 'Actor', 'Description'], rows);
                  printTotal('events', result.rows.length);
                },
                result.rows,
              );
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify an audit subcommand: list');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
