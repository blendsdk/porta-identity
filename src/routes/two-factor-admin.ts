/**
 * Two-factor authentication admin API routes.
 *
 * Exports two router factories:
 *   - createTwoFactorUserAdminRouter() — user-level 2FA management
 *   - createTwoFactorOrgAdminRouter()  — org-level 2FA policy & statistics
 *
 * Both routers live in a single file because they share imports and concern (2FA admin),
 * but require different path prefixes (per AR #87).
 *
 * User-Level Routes (prefix: /api/admin/organizations/:orgId/users/:userId/two-factor):
 *   GET  /status                    — Get 2FA status for a user (MH-1)
 *   POST /disable                   — Disable 2FA for a user (MH-2)
 *   POST /reset                     — Reset 2FA (force re-enrollment) (MH-3)
 *   POST /recovery-codes/regenerate — Regenerate recovery codes (MH-4)
 *
 * Org-Level Routes (prefix: /api/admin/organizations/:orgId/two-factor):
 *   GET  /policy  — Get org 2FA policy (SH-1)
 *   PUT  /policy  — Update org 2FA policy (SH-2)
 *   GET  /summary — Get org 2FA enrollment summary (SH-3)
 *
 * Error mapping:
 *   TwoFactorNotEnabledError  → 400
 *   SuperAdminProtectionError → 403 (via global error handler)
 *   ZodError                  → 400 with validation details
 *   User not found / wrong org → 404
 *
 * @module routes/two-factor-admin
 */

import Router from '@koa/router';
import type { RouterContext } from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { guardSuperAdmin } from '../lib/super-admin-protection.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { getTwoFactorStatus, disableTwoFactor, regenerateRecoveryCodes } from '../two-factor/service.js';
import { TwoFactorNotEnabledError } from '../two-factor/errors.js';
import { getUserById } from '../users/service.js';
import type { User } from '../users/types.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Path parameters for user-level endpoints */
const pathParamsSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a user exists and belongs to the specified organization.
 * Returns the user if valid. Returns null and sets 404 response if not.
 *
 * Uses 404 (not 403) for wrong-org to prevent organization enumeration (AR #75).
 *
 * @param ctx - Koa router context (reads params, sets response on failure)
 * @returns User object if valid, null if not found or wrong org
 */
async function validateUserBelongsToOrg(ctx: RouterContext): Promise<User | null> {
  const { orgId, userId } = pathParamsSchema.parse(ctx.params);

  const user = await getUserById(userId);
  if (!user || user.organizationId !== orgId) {
    ctx.status = 404;
    ctx.body = { error: 'User not found' };
    return null;
  }

  return user;
}

// ---------------------------------------------------------------------------
// User-level router factory
// ---------------------------------------------------------------------------

/**
 * Create the user-level 2FA admin router.
 *
 * All routes require admin authentication with granular permissions.
 * State-changing operations (disable, reset, regenerate) are protected
 * against targeting the super-admin user.
 *
 * Prefix: /api/admin/organizations/:orgId/users/:userId/two-factor
 *
 * @returns Configured Koa Router
 */
export function createTwoFactorUserAdminRouter(): Router {
  const router = new Router({
    prefix: '/api/admin/organizations/:orgId/users/:userId/two-factor',
  });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET /status — Get 2FA status for a user (MH-1)
  // Permission: admin:user:read
  // -------------------------------------------------------------------------
  router.get('/status', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    const user = await validateUserBelongsToOrg(ctx);
    if (!user) return;

    const status = await getTwoFactorStatus(user.id);
    ctx.body = { data: status };
  });

  // -------------------------------------------------------------------------
  // POST /disable — Disable 2FA for a user (MH-2)
  // Permission: admin:user:2fa
  // Returns: 204 No Content on success (AR #84)
  // -------------------------------------------------------------------------
  router.post('/disable', requirePermission(ADMIN_PERMISSIONS.USER_2FA), async (ctx) => {
    const user = await validateUserBelongsToOrg(ctx);
    if (!user) return;

    // Super-admin protection (AR #74)
    await guardSuperAdmin(user.id, 'manage-2fa');

    // Get current status for audit log before disabling
    const status = await getTwoFactorStatus(user.id);

    try {
      await disableTwoFactor(user.id);
    } catch (err) {
      if (err instanceof TwoFactorNotEnabledError) {
        ctx.status = 400;
        ctx.body = { error: 'Two-factor authentication is not enabled for this user' };
        return;
      }
      throw err;
    }

    // Admin-context audit entry (AR #78)
    writeAuditLog({
      organizationId: ctx.params.orgId,
      userId: user.id,
      actorId: ctx.state.adminUser?.id,
      eventType: 'user.2fa.disabled',
      eventCategory: 'admin',
      description: `Admin disabled 2FA for user ${user.id}`,
      metadata: { previousMethod: status.method },
    });

    ctx.status = 204;
  });

  // -------------------------------------------------------------------------
  // POST /reset — Reset 2FA for a user, forcing re-enrollment (MH-3)
  // Permission: admin:user:2fa
  // Same logic as disable but different audit event for compliance reporting
  // Returns: 204 No Content on success
  // -------------------------------------------------------------------------
  router.post('/reset', requirePermission(ADMIN_PERMISSIONS.USER_2FA), async (ctx) => {
    const user = await validateUserBelongsToOrg(ctx);
    if (!user) return;

    // Super-admin protection (AR #74)
    await guardSuperAdmin(user.id, 'manage-2fa');

    // Get current status for audit log before resetting
    const status = await getTwoFactorStatus(user.id);

    try {
      await disableTwoFactor(user.id);
    } catch (err) {
      if (err instanceof TwoFactorNotEnabledError) {
        ctx.status = 400;
        ctx.body = { error: 'Two-factor authentication is not enabled for this user' };
        return;
      }
      throw err;
    }

    // Different audit event type for compliance reporting (AR #78)
    writeAuditLog({
      organizationId: ctx.params.orgId,
      userId: user.id,
      actorId: ctx.state.adminUser?.id,
      eventType: 'user.2fa.reset',
      eventCategory: 'admin',
      description: `Admin reset 2FA for user ${user.id} (force re-enrollment)`,
      metadata: { previousMethod: status.method },
    });

    ctx.status = 204;
  });

  // -------------------------------------------------------------------------
  // POST /recovery-codes/regenerate — Regenerate recovery codes (MH-4)
  // Permission: admin:user:2fa
  // Recovery codes work for all 2FA methods (AR #83)
  // Returns: 200 with new codes (shown once, never again)
  // -------------------------------------------------------------------------
  router.post('/recovery-codes/regenerate', requirePermission(ADMIN_PERMISSIONS.USER_2FA), async (ctx) => {
    const user = await validateUserBelongsToOrg(ctx);
    if (!user) return;

    // Super-admin protection (AR #74)
    await guardSuperAdmin(user.id, 'manage-2fa');

    let codes: string[];
    try {
      codes = await regenerateRecoveryCodes(user.id);
    } catch (err) {
      if (err instanceof TwoFactorNotEnabledError) {
        ctx.status = 400;
        ctx.body = { error: 'Two-factor authentication is not enabled for this user' };
        return;
      }
      throw err;
    }

    // Audit log (AR #78)
    writeAuditLog({
      organizationId: ctx.params.orgId,
      userId: user.id,
      actorId: ctx.state.adminUser?.id,
      eventType: 'user.2fa.codesRegenerated',
      eventCategory: 'admin',
      description: `Admin regenerated recovery codes for user ${user.id}`,
      metadata: {},
    });

    ctx.body = {
      data: {
        recoveryCodes: codes,
        count: codes.length,
        warning: 'These codes will not be shown again. Provide them to the user securely.',
      },
    };
  });

  return router;
}
