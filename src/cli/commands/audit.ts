/**
 * CLI audit log viewer command.
 *
 * Queries audit log entries via the Admin API with optional filters.
 *
 * Usage:
 *   porta audit list                      # List recent events (default: 50)
 *   porta audit list --limit 100          # Increase limit
 *   porta audit list --event org.created  # Filter by event type
 *   porta audit list --since 2026-04-01   # Filter by date
 *   porta audit list --json               # JSON output
 *   porta audit cleanup                   # Delete entries older than retention period
 *   porta audit cleanup --dry-run         # Preview without deleting
 *   porta audit cleanup --retention-days 30  # Custom retention period
 *
 * @module cli/commands/audit
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';
import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, warn, success, outputResult, truncateId, formatDate, printTotal } from '../output.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Audit log entry as returned by the Admin API */
interface AuditEntry {
  id: string;
  eventType: string;
  eventCategory: string;
  actorId: string | null;
  organizationId: string | null;
  userId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** List response: { data: AuditEntry[], total: number } */
interface AuditListResponse {
  data: AuditEntry[];
  total: number;
}

/** Cleanup response from POST /api/admin/audit/cleanup */
interface AuditCleanupResponse {
  dryRun: boolean;
  retentionDays: number;
  entriesFound: number;
  deleted: number;
}

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

/** Extended args for the audit list subcommand */
interface AuditListArgs extends GlobalOptions {
  limit: number;
  event?: string;
  org?: string;
  user?: string;
  since?: string;
}

/** Extended args for the audit cleanup subcommand */
interface AuditCleanupArgs extends GlobalOptions {
  'dry-run': boolean;
  'retention-days'?: number;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

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
            await withHttpClient(args, async (client: AdminHttpClient) => {
              // Build query parameters from CLI flags
              const params: Record<string, string> = {};
              params.limit = String(args.limit);
              if (args.event) params.event = args.event;
              if (args.org) params.org = args.org;
              if (args.user) params.user = args.user;
              if (args.since) params.since = args.since;

              const { data } = await client.get<AuditListResponse>(
                '/api/admin/audit',
                params,
              );

              if (data.data.length === 0) {
                warn('No audit log entries found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  const rows = data.data.map((r) => [
                    formatDate(r.createdAt),
                    r.eventType,
                    r.eventCategory,
                    r.actorId ? truncateId(r.actorId) : '—',
                    r.description || '—',
                  ]);
                  printTable(['Date', 'Event', 'Category', 'Actor', 'Description'], rows);
                  printTotal('events', data.data.length);
                },
                data.data,
              );
            });
          }, args.verbose);
        },
      )
      .command<AuditCleanupArgs>(
        'cleanup',
        'Delete audit log entries older than the retention period',
        (y) =>
          y
            .option('dry-run', {
              type: 'boolean',
              default: false,
              description: 'Preview how many entries would be deleted without actually deleting',
            })
            .option('retention-days', {
              type: 'number',
              description: 'Override retention period in days (default: from system config, fallback 90)',
            }),
        async (argv) => {
          const args = argv as unknown as AuditCleanupArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client: AdminHttpClient) => {
              // Build request body for the cleanup endpoint
              const body: Record<string, unknown> = {};
              if (args['dry-run']) body.dryRun = true;
              if (args['retention-days'] !== undefined) body.retentionDays = args['retention-days'];

              const { data } = await client.post<AuditCleanupResponse>(
                '/api/admin/audit/cleanup',
                body,
              );

              outputResult(
                args.json,
                () => {
                  if (data.dryRun) {
                    // Dry-run mode: show what would be deleted
                    warn(
                      `Dry run: ${data.entriesFound} entries older than ${data.retentionDays} days would be deleted`,
                    );
                  } else if (data.deleted === 0) {
                    success(`No entries older than ${data.retentionDays} days found`);
                  } else {
                    success(
                      `Deleted ${data.deleted} audit log entries older than ${data.retentionDays} days`,
                    );
                  }
                },
                data,
              );
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify an audit subcommand: list, cleanup');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
