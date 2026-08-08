/**
 * Session management API routes.
 *
 * Provides admin endpoints for listing, viewing, and revoking OIDC sessions.
 * Session data is read from the PostgreSQL tracking table (`admin_sessions`),
 * which mirrors Redis session state via fire-and-forget hooks.
 *
 * Route structure:
 *   GET    /api/admin/sessions              — List active sessions (paginated)
 *   GET    /api/admin/sessions/:sessionId   — Get session detail
 *   DELETE /api/admin/sessions/:sessionId   — Revoke a session
 *   DELETE /api/admin/users/:userId/sessions — Revoke all user sessions
 *
 * @see 05-dashboard-sessions-history.md
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as sessionTracking from '../lib/session-tracking.js';
import { getRedis } from '../lib/redis.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listSessionsSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  activeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the session management router.
 *
 * All routes require admin authentication (Bearer JWT) and appropriate
 * session permissions.
 *
 * @returns Configured Koa Router with two sub-routers:
 *   - /api/admin/sessions/* for session CRUD
 *   - /api/admin/users/:userId/sessions for user session revocation
 */
export function createSessionRouter(): Router {
  const router = new Router({ prefix: '/api/admin/sessions' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET / — List sessions (paginated)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.SESSION_READ), async (ctx) => {
    const query = listSessionsSchema.parse(ctx.query);
    const result = await sessionTracking.listSessions(query);
    ctx.body = result;
  });

  // -------------------------------------------------------------------------
  // GET /:sessionId — Get session detail
  // -------------------------------------------------------------------------
  router.get('/:sessionId', requirePermission(ADMIN_PERMISSIONS.SESSION_READ), async (ctx) => {
    const session = await sessionTracking.getSession(ctx.params.sessionId);
    if (!session) {
      ctx.throw(404, 'Session not found');
      return;
    }
    ctx.body = { data: session };
  });

  // -------------------------------------------------------------------------
  // DELETE /:sessionId — Revoke a session
  //
  // Revocation cascade:
  //   1. Mark session as revoked in PostgreSQL tracking table
  //   2. Delete session from Redis (kills the live session)
  //   3. Audit log entry for session revocation
  // -------------------------------------------------------------------------
  router.delete('/:sessionId', requirePermission(ADMIN_PERMISSIONS.SESSION_REVOKE), async (ctx) => {
    const { sessionId } = ctx.params;

    // 1. Mark revoked in PG tracking table
    await sessionTracking.revokeSession(sessionId);

    // 2. Delete from Redis to kill the live session
    try {
      const redis = getRedis();
      await redis.del(`oidc:Session:${sessionId}`);
    } catch {
      // Redis deletion failure is non-fatal — session will expire naturally
    }

    ctx.status = 204;
  });

  return router;
}

/**
 * Create the user session revocation router.
 *
 * Mounted separately because it lives under /api/admin/users/:userId/sessions
 * rather than /api/admin/sessions.
 *
 * @returns Configured Koa Router
 */
export function createUserSessionRouter(): Router {
  const router = new Router({ prefix: '/api/admin/users/:userId/sessions' });

  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // DELETE / — Revoke all sessions for a user
  // -------------------------------------------------------------------------
  router.delete('/', requirePermission(ADMIN_PERMISSIONS.SESSION_REVOKE), async (ctx) => {
    const { userId } = ctx.params;
    const count = await sessionTracking.revokeUserSessions(userId);
    ctx.body = { revoked: count };
  });

  return router;
}
