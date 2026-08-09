/**
 * Signing key management admin API routes.
 *
 * All routes are under `/api/admin/keys` and require admin
 * authorization with granular permissions.
 *
 * Route structure:
 *   GET    /                  — List all signing keys (status, dates, KID)
 *   POST   /generate          — Generate a new ES256 key pair
 *   POST   /rotate            — Rotate: retire current active key + generate new
 *
 * Private key material is NEVER returned in API responses. Only metadata
 * (id, kid, algorithm, status, timestamps) is exposed.
 *
 * @module routes/keys
 */

import Router from '@koa/router';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { getPool } from '../lib/database.js';
import { generateES256KeyPair } from '../lib/signing-keys.js';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the signing key admin API router.
 *
 * All routes require admin authorization with granular permissions.
 * Provides read access to key metadata and operations for generating /
 * rotating ES256 keys.
 *
 * @returns Koa router mounted at /api/admin/keys
 */
export function createKeysRouter(): Router {
  const router = new Router({ prefix: '/api/admin/keys' });

  // Apply admin auth to all key routes
  router.use(requireAdminAuth());

  // ── GET / — List all signing keys ─────────────────────────────────
  router.get('/', requirePermission(ADMIN_PERMISSIONS.KEY_READ), async (ctx) => {
    const result = await getPool().query(
      'SELECT id, kid, algorithm, status, created_at, retired_at FROM signing_keys ORDER BY created_at DESC',
    );

    const data = result.rows.map((r: {
      id: string;
      kid: string;
      algorithm: string;
      status: string;
      created_at: string;
      retired_at: string | null;
    }) => ({
      id: r.id,
      kid: r.kid,
      algorithm: r.algorithm,
      status: r.status,
      createdAt: r.created_at,
      retiredAt: r.retired_at,
    }));

    ctx.body = { data };
  });

  // ── POST /generate — Generate a new ES256 key pair ────────────────
  router.post('/generate', requirePermission(ADMIN_PERMISSIONS.KEY_GENERATE), async (ctx) => {
    const keyPair = generateES256KeyPair();

    const result = await getPool().query(
      `INSERT INTO signing_keys (kid, algorithm, public_key, private_key, status)
       VALUES ($1, 'ES256', $2, $3, 'active')
       RETURNING id, kid`,
      [keyPair.kid, keyPair.publicKeyPem, keyPair.privateKeyPem],
    );

    const row = result.rows[0] as { id: string; kid: string };
    ctx.status = 201;
    ctx.body = {
      data: {
        id: row.id,
        kid: row.kid,
        message: 'New signing key generated',
      },
    };
  });

  // ── POST /rotate — Retire active keys + generate new ──────────────
  router.post('/rotate', requirePermission(ADMIN_PERMISSIONS.KEY_ROTATE), async (ctx) => {
    const pool = getPool();

    // Retire all currently active keys
    const retired = await pool.query(
      `UPDATE signing_keys SET status = 'retired', retired_at = NOW() WHERE status = 'active'`,
    );

    // Generate and insert new active key
    const keyPair = generateES256KeyPair();
    const result = await pool.query(
      `INSERT INTO signing_keys (kid, algorithm, public_key, private_key, status)
       VALUES ($1, 'ES256', $2, $3, 'active')
       RETURNING id, kid`,
      [keyPair.kid, keyPair.publicKeyPem, keyPair.privateKeyPem],
    );

    const row = result.rows[0] as { id: string; kid: string };
    ctx.status = 201;
    ctx.body = {
      data: {
        id: row.id,
        kid: row.kid,
        retiredCount: retired.rowCount ?? 0,
        message: 'Keys rotated — new active key generated',
      },
    };
  });

  return router;
}
