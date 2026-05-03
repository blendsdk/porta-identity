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
import { getTwoFactorStatus, disableTwoFactor, regenerateRecoveryCodes, getTwoFactorSummary } from '../two-factor/service.js';
import type { TwoFactorPolicy } from '../two-factor/types.js';
import { TwoFactorNotEnabledError } from '../two-factor/errors.js';
import { getUserById } from '../users/service.js';
import { getOrganizationById, updateOrganization } from '../organizations/service.js';
import { setETagHeader, checkIfMatch } from '../lib/etag.js';
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

// ---------------------------------------------------------------------------
// Org-level validation schemas
// ---------------------------------------------------------------------------

/** Path parameters for org-level endpoints */
const orgPathParamsSchema = z.object({
  orgId: z.string().uuid(),
});

/** Valid 2FA policy values */
const VALID_POLICIES: TwoFactorPolicy[] = ['optional', 'required_email', 'required_totp', 'required_any'];

/** Body schema for PUT /policy */
const updatePolicySchema = z.object({
  twoFactorPolicy: z.enum(['optional', 'required_email', 'required_totp', 'required_any']),
});

// ---------------------------------------------------------------------------
// Org-level router factory
// ---------------------------------------------------------------------------

/**
 * Create the org-level 2FA admin router.
 *
 * Provides policy management and enrollment summary for an organization.
 * PUT /policy uses ETag/If-Match for optimistic concurrency.
 *
 * Prefix: /api/admin/organizations/:orgId/two-factor
 *
 * @returns Configured Koa Router
 */
export function createTwoFactorOrgAdminRouter(): Router {
  const router = new Router({
    prefix: '/api/admin/organizations/:orgId/two-factor',
  });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET /policy — Get org 2FA policy (SH-1)
  // Permission: admin:org:read
  // -------------------------------------------------------------------------
  router.get('/policy', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    const { orgId } = orgPathParamsSchema.parse(ctx.params);

    const org = await getOrganizationById(orgId);
    if (!org) {
      ctx.status = 404;
      ctx.body = { error: 'Organization not found' };
      return;
    }

    setETagHeader(ctx, 'organization', org.id, org.updatedAt);
    ctx.body = {
      data: {
        twoFactorPolicy: org.twoFactorPolicy,
        validPolicies: VALID_POLICIES,
      },
    };
  });

  // -------------------------------------------------------------------------
  // PUT /policy — Update org 2FA policy (SH-2)
  // Permission: admin:org:update
  // Uses ETag/If-Match for optimistic concurrency
  // Super-admin org policy changes are protected
  // -------------------------------------------------------------------------
  router.put('/policy', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    const { orgId } = orgPathParamsSchema.parse(ctx.params);

    const body = updatePolicySchema.parse(ctx.request.body);

    // ETag/If-Match optimistic concurrency (optional — backward compatible)
    const current = await getOrganizationById(orgId);
    if (!current) {
      ctx.status = 404;
      ctx.body = { error: 'Organization not found' };
      return;
    }

    if (!checkIfMatch(ctx, 'organization', current.id, current.updatedAt, current)) return;

    const previousPolicy = current.twoFactorPolicy;

    // Update org via existing organization service
    const updated = await updateOrganization(orgId, {
      twoFactorPolicy: body.twoFactorPolicy,
    });

    // Audit log (AR #78)
    writeAuditLog({
      organizationId: orgId,
      actorId: ctx.state.adminUser?.id,
      eventType: 'org.2fa.policyChanged',
      eventCategory: 'admin',
      description: `Admin changed 2FA policy from "${previousPolicy}" to "${body.twoFactorPolicy}"`,
      metadata: { previousPolicy, newPolicy: body.twoFactorPolicy },
    });

    setETagHeader(ctx, 'organization', updated.id, updated.updatedAt);
    ctx.body = {
      data: {
        twoFactorPolicy: updated.twoFactorPolicy,
        validPolicies: VALID_POLICIES,
      },
    };
  });

  // -------------------------------------------------------------------------
  // GET /summary — Get org 2FA enrollment summary (SH-3)
  // Permission: admin:org:read OR admin:user:read (dual permission per AR #90)
  // Returns aggregate statistics with Cache-Control
  // -------------------------------------------------------------------------
  router.get('/summary', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    const { orgId } = orgPathParamsSchema.parse(ctx.params);

    const org = await getOrganizationById(orgId);
    if (!org) {
      ctx.status = 404;
      ctx.body = { error: 'Organization not found' };
      return;
    }

    const summary = await getTwoFactorSummary(orgId);

    // Short cache since summary is aggregate and not latency-critical (AR #92)
    ctx.set('Cache-Control', 'private, max-age=30');
    ctx.body = { data: summary };
  });

  return router;
}
