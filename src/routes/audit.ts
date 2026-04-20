/**
 * Audit log admin API routes.
 *
 * All routes are under `/api/admin/audit` and require admin
 * authentication (Bearer JWT via requireAdminAuth).
 *
 * Route structure:
 *   GET    /                  — List audit log events (filtered, paginated)
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
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { getPool } from '../lib/database.js';

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

  return router;
}
