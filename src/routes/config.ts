/**
 * System configuration admin API routes.
 *
 * All routes are under `/api/admin/config` and require admin
 * authorization with granular permissions.
 *
 * Route structure:
 *   GET    /                  — List all config entries
 *   GET    /:key              — Get a specific config value
 *   PUT    /:key              — Set (update) a config value
 *
 * Sensitive values (is_sensitive=true) are masked in GET responses
 * with '***' to prevent accidental exposure in CLI output / logs.
 *
 * @module routes/config
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { getPool } from '../lib/database.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for updating a config value */
const updateConfigSchema = z.object({
  value: z.string().min(1, 'Value must not be empty'),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the system config admin API router.
 *
 * All routes require admin authorization with granular permissions.
 * Provides read and write access to the `system_config` table via
 * a RESTful interface.
 *
 * @returns Koa router mounted at /api/admin/config
 */
export function createConfigRouter(): Router {
  const router = new Router({ prefix: '/api/admin/config' });

  // Apply admin auth to all config routes
  router.use(requireAdminAuth());

  // ── GET / — List all config entries ───────────────────────────────
  router.get('/', requirePermission(ADMIN_PERMISSIONS.CONFIG_READ), async (ctx) => {
    const result = await getPool().query(
      `SELECT key, value, value_type, description, is_sensitive, updated_at
       FROM system_config ORDER BY key`,
    );

    // Mask sensitive values to prevent accidental exposure
    const data = result.rows.map((r: {
      key: string;
      value: string;
      value_type: string;
      description: string | null;
      is_sensitive: boolean;
      updated_at: string;
    }) => ({
      key: r.key,
      value: r.is_sensitive ? '***' : r.value,
      valueType: r.value_type,
      description: r.description,
      isSensitive: r.is_sensitive,
      updatedAt: r.updated_at,
    }));

    ctx.body = { data };
  });

  // ── GET /:key — Get a specific config value ───────────────────────
  router.get('/:key', requirePermission(ADMIN_PERMISSIONS.CONFIG_READ), async (ctx) => {
    const { key } = ctx.params;

    const result = await getPool().query(
      'SELECT key, value, value_type, description, is_sensitive, updated_at FROM system_config WHERE key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      ctx.status = 404;
      ctx.body = { error: `Config key not found: ${key}` };
      return;
    }

    const row = result.rows[0] as {
      key: string;
      value: string;
      value_type: string;
      description: string | null;
      is_sensitive: boolean;
      updated_at: string;
    };

    ctx.body = {
      data: {
        key: row.key,
        value: row.is_sensitive ? '***' : row.value,
        valueType: row.value_type,
        description: row.description,
        isSensitive: row.is_sensitive,
        updatedAt: row.updated_at,
      },
    };
  });

  // ── PUT /:key — Update a config value ─────────────────────────────
  router.put('/:key', requirePermission(ADMIN_PERMISSIONS.CONFIG_UPDATE), async (ctx) => {
    const { key } = ctx.params;
    const body = ctx.request.body as Record<string, unknown>;

    // Validate request body with Zod
    const parsed = updateConfigSchema.safeParse(body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        error: 'Validation failed',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      };
      return;
    }

    const result = await getPool().query(
      'UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING key, value, value_type',
      [parsed.data.value, key],
    );

    if (result.rows.length === 0) {
      ctx.status = 404;
      ctx.body = { error: `Config key not found: ${key}` };
      return;
    }

    const row = result.rows[0] as { key: string; value: string; value_type: string };
    ctx.body = {
      data: {
        key: row.key,
        value: row.value,
        valueType: row.value_type,
      },
    };
  });

  return router;
}
