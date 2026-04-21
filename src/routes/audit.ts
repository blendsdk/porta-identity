/**
 * Audit log admin API routes.
 *
 * All routes are under `/api/admin/audit` and require admin
 * authentication (Bearer JWT via requireAdminAuth).
 *
 * Route structure:
 *   GET    /                  — List audit log events (filtered, paginated)
 *   POST   /cleanup           — Delete audit entries older than retention period
 *
 * Query parameters:
 *   limit  — Maximum number of events (default: 50, max: 500)
 *   event  — Filter by event_type (exact match)
 *   org    — Filter by organization_id (UUID)
 *   user   — Filter by user_id (UUID)
 *   since  — Filter events created after this ISO 8601 date
 *
 * @module routes/audit
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { getPool } from '../lib/database.js';
import { getSystemConfigNumber } from '../lib/system-config.js';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the audit log admin API router.
 *
 * All routes require admin authentication. Provides read-only access
 * to the `audit_log` table with optional filtering by event type,
 * organization, user, and date range.
 *
 * @returns Koa router mounted at /api/admin/audit
 */
export function createAuditRouter(): Router {
  const router = new Router({ prefix: '/api/admin/audit' });

  // Apply admin auth to all audit routes
  router.use(requireAdminAuth());

  // ── GET / — List audit log events ─────────────────────────────────
  router.get('/', async (ctx) => {
    // Parse and validate query parameters
    const limit = Math.min(
      Math.max(1, parseInt(ctx.query.limit as string, 10) || 50),
      500,
    );
    const event = ctx.query.event as string | undefined;
    const org = ctx.query.org as string | undefined;
    const user = ctx.query.user as string | undefined;
    const since = ctx.query.since as string | undefined;

    // Build dynamic WHERE clause based on filters
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (event) {
      conditions.push(`event_type = $${paramIdx++}`);
      params.push(event);
    }
    if (org) {
      conditions.push(`organization_id = $${paramIdx++}`);
      params.push(org);
    }
    if (user) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(user);
    }
    if (since) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(since);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const query = `SELECT id, event_type, event_category, actor_id, organization_id,
                          user_id, description, metadata, ip_address, created_at
                   FROM audit_log ${whereClause}
                   ORDER BY created_at DESC
                   LIMIT $${paramIdx}`;

    const result = await getPool().query(query, params);

    const data = result.rows.map(
      (r: {
        id: string;
        event_type: string;
        event_category: string;
        actor_id: string | null;
        organization_id: string | null;
        user_id: string | null;
        description: string | null;
        metadata: Record<string, unknown> | null;
        ip_address: string | null;
        created_at: string;
      }) => ({
        id: r.id,
        eventType: r.event_type,
        eventCategory: r.event_category,
        actorId: r.actor_id,
        organizationId: r.organization_id,
        userId: r.user_id,
        description: r.description,
        metadata: r.metadata,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      }),
    );

    ctx.body = { data, total: data.length };
  });

  // ── POST /cleanup — Delete old audit log entries ──────────────────
  //
  // Accepts optional JSON body:
  //   { retentionDays?: number, dryRun?: boolean }
  //
  // If retentionDays is not provided, reads `audit_retention_days` from
  // system_config (default: 90 days). In dry-run mode, returns the count
  // of entries that would be deleted without actually removing them.
  //
  // Designed to be called from `porta audit cleanup` or via cron/CronJob.

  /** Zod schema for the cleanup request body */
  const cleanupSchema = z.object({
    retentionDays: z.number().int().min(1).optional(),
    dryRun: z.boolean().optional().default(false),
  });

  router.post('/cleanup', async (ctx) => {
    // Parse and validate request body (all fields optional)
    const body = cleanupSchema.parse(ctx.request.body ?? {});

    // Resolve retention days: explicit param → system_config → default 90
    const retentionDays = body.retentionDays
      ?? await getSystemConfigNumber('audit_retention_days', 90);

    if (body.dryRun) {
      // Dry-run: count entries that would be deleted
      const countResult = await getPool().query(
        `SELECT COUNT(*) AS count FROM audit_log
         WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
        [retentionDays],
      );
      const count = parseInt(countResult.rows[0].count, 10);

      ctx.body = {
        dryRun: true,
        retentionDays,
        entriesFound: count,
        deleted: 0,
      };
    } else {
      // Delete entries older than retention period
      const deleteResult = await getPool().query(
        `DELETE FROM audit_log
         WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
        [retentionDays],
      );

      ctx.body = {
        dryRun: false,
        retentionDays,
        entriesFound: deleteResult.rowCount ?? 0,
        deleted: deleteResult.rowCount ?? 0,
      };
    }
  });

  return router;
}
