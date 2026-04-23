/**
 * User management API routes.
 *
 * All routes are under `/api/admin/organizations/:orgId/users` and
 * require admin authorization with granular permissions. User routes
 * are nested under an organization context because users are always
 * scoped to an org.
 *
 * Route structure:
 *   POST   /                     — Create a user in the organization
 *   GET    /                     — List users (paginated, searchable)
 *   GET    /:userId              — Get user by ID
 *   PUT    /:userId              — Update user profile
 *   POST   /:userId/deactivate   — Deactivate (active → inactive)
 *   POST   /:userId/reactivate   — Reactivate (inactive → active)
 *   POST   /:userId/suspend      — Suspend (active → suspended)
 *   POST   /:userId/unsuspend    — Unsuspend (suspended → active)
 *   POST   /:userId/lock         — Lock (active → locked)
 *   POST   /:userId/unlock       — Unlock (locked → active)
 *   POST   /:userId/password     — Set/change password
 *   DELETE /:userId/password     — Clear password (passwordless)
 *   POST   /:userId/verify-email — Mark email as verified
 *   GET    /:userId/export       — GDPR data export (Article 20)
 *   POST   /:userId/purge        — GDPR data purge (Article 17)
 *
 * Error mapping:
 *   UserNotFoundError → 404
 *   UserValidationError → 400
 *   SuperAdminProtectionError → 403
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { guardSuperAdmin, SuperAdminProtectionError } from '../lib/super-admin-protection.js';
import * as userService from '../users/service.js';
import { UserNotFoundError, UserValidationError } from '../users/errors.js';
import { exportUserData, purgeUserData } from '../users/gdpr.js';
import { setETagHeader, checkIfMatch } from '../lib/etag.js';
import { getEntityHistory } from '../lib/entity-history.js';
import { generateToken } from '../auth/tokens.js';
import { insertInvitationToken, invalidateUserTokens } from '../auth/token-repository.js';
import { sendInvitationEmail, renderInvitationEmail } from '../auth/email-service.js';
import type { InvitationEmailOptions } from '../auth/email-service.js';
import { getOrganizationById } from '../organizations/service.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { getPool } from '../lib/database.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new user */
const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128).optional(),
  givenName: z.string().max(255).optional(),
  familyName: z.string().max(255).optional(),
  middleName: z.string().max(255).optional(),
  nickname: z.string().max(255).optional(),
  preferredUsername: z.string().max(255).optional(),
  profileUrl: z.string().url().optional(),
  pictureUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  gender: z.string().max(50).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zoneinfo: z.string().max(50).optional(),
  locale: z.string().max(10).optional(),
  phoneNumber: z.string().max(50).optional(),
  phoneNumberVerified: z.boolean().optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
  }).optional(),
});

/** Schema for updating a user (all fields optional, nullable for clearing) */
const updateUserSchema = z.object({
  givenName: z.string().max(255).nullable().optional(),
  familyName: z.string().max(255).nullable().optional(),
  middleName: z.string().max(255).nullable().optional(),
  nickname: z.string().max(255).nullable().optional(),
  preferredUsername: z.string().max(255).nullable().optional(),
  profileUrl: z.string().url().nullable().optional(),
  pictureUrl: z.string().url().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  zoneinfo: z.string().max(50).nullable().optional(),
  locale: z.string().max(10).nullable().optional(),
  phoneNumber: z.string().max(50).nullable().optional(),
  phoneNumberVerified: z.boolean().optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
  }).nullable().optional(),
});

/** Schema for listing users with pagination */
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'suspended', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Schema for cursor-based listing (keyset pagination) */
const listUsersCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'inactive', 'suspended', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Schema for setting a password */
const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

/** Schema for locking a user (reason required) */
const lockUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

/** Schema for suspending a user (reason optional) */
const suspendUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof SuperAdminProtectionError) {
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: err.message };
    return undefined as never;
  }
  if (err instanceof UserNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof UserValidationError) {
    ctx.throw(400, err.message);
  }
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
    return undefined as never;
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the user management router.
 *
 * All routes require admin authorization with granular permissions.
 * Users are always scoped to an organization via the :orgId URL parameter.
 * Destructive operations on the super-admin user are blocked by
 * guardSuperAdmin() checks.
 *
 * Prefix: /api/admin/organizations/:orgId/users
 *
 * @returns Configured Koa Router
 */
export function createUserRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations/:orgId/users' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create user
  // -------------------------------------------------------------------------
  router.post('/', requirePermission(ADMIN_PERMISSIONS.USER_CREATE), async (ctx) => {
    try {
      const body = createUserSchema.parse(ctx.request.body);
      const user = await userService.createUser({
        organizationId: ctx.params.orgId,
        ...body,
      });
      ctx.status = 201;
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List users (paginated)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    try {
      // Cursor-based pagination when `cursor` or `limit` param is present
      if (ctx.query.cursor !== undefined || ctx.query.limit !== undefined) {
        const query = listUsersCursorSchema.parse(ctx.query);
        const result = await userService.listUsersCursor({
          organizationId: ctx.params.orgId,
          ...query,
        });
        ctx.body = result;
        return;
      }
      // Default: offset-based pagination (backward compatible)
      const query = listUsersSchema.parse(ctx.query);
      const result = await userService.listUsersByOrganization({
        organizationId: ctx.params.orgId,
        ...query,
      });
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:userId — Get user by ID
  // -------------------------------------------------------------------------
  router.get('/:userId', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    const user = await userService.getUserById(ctx.params.userId);
    if (!user) {
      ctx.throw(404, 'User not found');
      return; // unreachable — keeps TS narrowing happy
    }
    setETagHeader(ctx, 'user', user.id, user.updatedAt);
    ctx.body = { data: user };
  });

  // -------------------------------------------------------------------------
  // PUT /:userId — Update user profile
  // -------------------------------------------------------------------------
  router.put('/:userId', requirePermission(ADMIN_PERMISSIONS.USER_UPDATE), async (ctx) => {
    try {
      const body = updateUserSchema.parse(ctx.request.body);
      // Check If-Match for optimistic concurrency (optional — backward compatible)
      const current = await userService.getUserById(ctx.params.userId);
      if (current && !checkIfMatch(ctx, 'user', current.id, current.updatedAt, current)) return;
      // Convert null address to undefined — Zod allows null for clearing,
      // but UpdateUserInput uses undefined to mean "no change"
      const input = { ...body, address: body.address ?? undefined };
      const user = await userService.updateUser(ctx.params.userId, input);
      setETagHeader(ctx, 'user', user.id, user.updatedAt);
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/deactivate — Deactivate user
  // Protected: super-admin user cannot be deactivated
  // -------------------------------------------------------------------------
  router.post('/:userId/deactivate', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await guardSuperAdmin(ctx.params.userId, 'deactivate');
      await userService.deactivateUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/reactivate — Reactivate user
  // -------------------------------------------------------------------------
  router.post('/:userId/reactivate', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await userService.reactivateUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/suspend — Suspend user
  // Protected: super-admin user cannot be suspended
  // -------------------------------------------------------------------------
  router.post('/:userId/suspend', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await guardSuperAdmin(ctx.params.userId, 'suspend');
      const body = suspendUserSchema.parse(ctx.request.body ?? {});
      await userService.suspendUser(ctx.params.userId, body.reason);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/unsuspend — Unsuspend user
  // -------------------------------------------------------------------------
  router.post('/:userId/unsuspend', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await userService.unsuspendUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/lock — Lock user
  // Protected: super-admin user cannot be locked
  // -------------------------------------------------------------------------
  router.post('/:userId/lock', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await guardSuperAdmin(ctx.params.userId, 'lock');
      const body = lockUserSchema.parse(ctx.request.body);
      await userService.lockUser(ctx.params.userId, body.reason);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/unlock — Unlock user
  // -------------------------------------------------------------------------
  router.post('/:userId/unlock', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    try {
      await userService.unlockUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/password — Set password
  // -------------------------------------------------------------------------
  router.post('/:userId/password', requirePermission(ADMIN_PERMISSIONS.USER_UPDATE), async (ctx) => {
    try {
      const body = setPasswordSchema.parse(ctx.request.body);
      await userService.setUserPassword(ctx.params.userId, body.password);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:userId/password — Clear password (convert to passwordless)
  // -------------------------------------------------------------------------
  router.delete('/:userId/password', requirePermission(ADMIN_PERMISSIONS.USER_UPDATE), async (ctx) => {
    try {
      await userService.clearUserPassword(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/verify-email — Mark email as verified
  // -------------------------------------------------------------------------
  router.post('/:userId/verify-email', requirePermission(ADMIN_PERMISSIONS.USER_UPDATE), async (ctx) => {
    try {
      await userService.markEmailVerified(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:userId/export — GDPR data export (Article 20)
  // -------------------------------------------------------------------------
  router.get('/:userId/export', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    const user = await userService.getUserById(ctx.params.userId);
    if (!user) {
      return ctx.throw(404, 'User not found');
    }
    const exportData = await exportUserData(user);
    ctx.body = { data: exportData };
  });

  // -------------------------------------------------------------------------
  // POST /:userId/purge — GDPR data purge (Article 17)
  //
  // Requires X-Confirm-Purge: true header for safety.
  // Irreversibly anonymizes user data and deletes related records.
  // Protected: super-admin user cannot be purged
  // -------------------------------------------------------------------------
  router.post('/:userId/purge', requirePermission(ADMIN_PERMISSIONS.USER_ARCHIVE), async (ctx) => {
    // Require explicit confirmation via header OR request body
    const confirmHeader = ctx.get('X-Confirm-Purge');
    const confirmBody = (ctx.request.body as Record<string, unknown> | undefined)?.confirmPurge;
    if (confirmHeader !== 'true' && confirmBody !== true) {
      ctx.status = 400;
      ctx.body = {
        error: 'Purge requires confirmation',
        message: 'Set X-Confirm-Purge: true header or send { "confirmPurge": true } in body',
      };
      return;
    }

    const user = await userService.getUserById(ctx.params.userId);
    if (!user) {
      return ctx.throw(404, 'User not found');
    }

    try {
      // Guard: super-admin user cannot be purged
      await guardSuperAdmin(ctx.params.userId, 'delete');

      // Use the admin user's ID as the actor for the audit trail
      const actorId = ctx.state.adminUser?.id ?? 'system';
      const result = await purgeUserData(user, actorId);
      ctx.body = { data: result };
    } catch (err) {
      if (err instanceof SuperAdminProtectionError) {
        ctx.status = 403;
        ctx.body = { error: err.message };
        return;
      }
      if (err instanceof Error && err.message.includes('super-admin')) {
        ctx.status = 403;
        ctx.body = { error: err.message };
        return;
      }
      throw err;
    }
  });

  // -------------------------------------------------------------------------
  // GET /:userId/history — User change history
  // -------------------------------------------------------------------------
  router.get('/:userId/history', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    const { limit, after, event_type } = ctx.query as Record<string, string>;
    const result = await getEntityHistory('user', ctx.params.userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      after: after || undefined,
      eventTypePrefix: event_type || undefined,
    });
    ctx.body = result;
  });

  // -------------------------------------------------------------------------
  // POST /invite — Send invitation to a new or existing user
  //
  // Enhanced invitation with optional personal message, role/claim
  // pre-assignment, and inviter tracking. Creates the user if they
  // don't exist, generates an invitation token with pre-assignment
  // details, and sends the invitation email.
  // -------------------------------------------------------------------------
  router.post('/invite', requirePermission(ADMIN_PERMISSIONS.USER_INVITE), async (ctx) => {
    try {
      const body = inviteUserSchema.parse(ctx.request.body);
      const orgId = ctx.params.orgId;
      const adminUser = ctx.state.adminUser as { id: string; givenName?: string; familyName?: string; email?: string };

      // Resolve the organization for branding and slug
      const org = await getOrganizationById(orgId);
      if (!org) {
        ctx.throw(404, 'Organization not found');
        return;
      }

      // Validate referenced applicationIds, roleIds, claimDefinitionIds exist
      if (body.roles?.length || body.claims?.length) {
        await validatePreAssignments(orgId, body.roles, body.claims);
      }

      // Find or create the user
      let user = await userService.getUserByEmail(orgId, body.email);
      let created = false;
      if (!user) {
        user = await userService.createUser({
          organizationId: orgId,
          email: body.email,
          givenName: body.displayName,
        });
        created = true;
      }

      // Invalidate any previous pending invitation tokens for this user
      await invalidateUserTokens('invitation_tokens', user.id);

      // Generate a new invitation token
      const { plaintext, hash } = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Build inviter display name
      const inviterName = adminUser.givenName
        ? (adminUser.familyName ? `${adminUser.givenName} ${adminUser.familyName}` : adminUser.givenName)
        : (adminUser.email ?? 'Admin');

      // Store pre-assignment details in the token
      const details: Record<string, unknown> = {};
      if (body.personalMessage) details.personalMessage = body.personalMessage;
      if (body.roles?.length) details.roles = body.roles;
      if (body.claims?.length) details.claims = body.claims;
      details.inviterName = inviterName;

      await insertInvitationToken(
        user.id,
        hash,
        expiresAt,
        Object.keys(details).length > 0 ? details : null,
        adminUser.id,
      );

      // Build the invitation URL
      const inviteUrl = `/${org.slug}/auth/accept-invite/${plaintext}`;

      // Send the invitation email
      const emailOptions: InvitationEmailOptions = {};
      if (body.personalMessage) emailOptions.personalMessage = body.personalMessage;
      emailOptions.inviterName = inviterName;

      await sendInvitationEmail(
        { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
        { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
        inviteUrl,
        body.locale ?? org.defaultLocale ?? 'en',
        emailOptions,
      );

      // Audit log the invitation
      writeAuditLog({
        organizationId: orgId,
        userId: user.id,
        actorId: adminUser.id,
        eventType: 'user.invited',
        eventCategory: 'admin',
        description: `User ${user.email} invited by ${inviterName}`,
        metadata: {
          hasPersonalMessage: !!body.personalMessage,
          preAssignedRoles: body.roles?.length ?? 0,
          preAssignedClaims: body.claims?.length ?? 0,
        },
      });

      ctx.status = created ? 201 : 200;
      ctx.body = {
        data: {
          userId: user.id,
          email: user.email,
          created,
          invitationSent: true,
          expiresAt: expiresAt.toISOString(),
        },
      };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /invite/preview — Preview invitation email without sending
  //
  // Renders the invitation email with the provided parameters and returns
  // the HTML, plain text, and subject line for admin review.
  // -------------------------------------------------------------------------
  router.post('/invite/preview', requirePermission(ADMIN_PERMISSIONS.USER_INVITE), async (ctx) => {
    try {
      const body = invitePreviewSchema.parse(ctx.request.body);
      const orgId = ctx.params.orgId;
      const adminUser = ctx.state.adminUser as { id: string; givenName?: string; familyName?: string; email?: string };

      // Resolve the organization for branding
      const org = await getOrganizationById(orgId);
      if (!org) {
        ctx.throw(404, 'Organization not found');
        return;
      }

      // Build inviter display name
      const inviterName = adminUser.givenName
        ? (adminUser.familyName ? `${adminUser.givenName} ${adminUser.familyName}` : adminUser.givenName)
        : (adminUser.email ?? 'Admin');

      // Build a mock user for the preview
      const previewUser = {
        id: '00000000-0000-0000-0000-000000000000',
        email: body.email,
        givenName: body.displayName ?? null,
      };

      // Render the invitation email (without sending)
      const emailOptions: InvitationEmailOptions = {};
      if (body.personalMessage) emailOptions.personalMessage = body.personalMessage;
      emailOptions.inviterName = inviterName;

      const result = await renderInvitationEmail(
        previewUser,
        { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
        `/${org.slug}/auth/accept-invite/PREVIEW_TOKEN`,
        body.locale ?? org.defaultLocale ?? 'en',
        emailOptions,
      );

      ctx.body = { data: result };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Invitation schemas
// ---------------------------------------------------------------------------

/** Schema for the enhanced invitation request */
const inviteUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255).optional(),
  personalMessage: z.string().max(500).optional(),
  roles: z.array(z.object({
    applicationId: z.string().uuid(),
    roleId: z.string().uuid(),
  })).optional(),
  claims: z.array(z.object({
    applicationId: z.string().uuid(),
    claimDefinitionId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
  locale: z.string().max(10).optional(),
});

/** Schema for the invitation preview request */
const invitePreviewSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255).optional(),
  personalMessage: z.string().max(500).optional(),
  locale: z.string().max(10).optional(),
});

// ---------------------------------------------------------------------------
// Pre-assignment validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that referenced roles and claims exist in the database.
 *
 * Checks that all applicationIds are valid within the org, all roleIds
 * belong to their specified application, and all claimDefinitionIds
 * belong to their specified application. Throws a ZodError-like 400
 * on validation failure.
 *
 * @param orgId - Organization ID for scoping
 * @param roles - Array of role pre-assignments to validate
 * @param claims - Array of claim pre-assignments to validate
 * @throws Error with 400 status if any reference is invalid
 */
async function validatePreAssignments(
  orgId: string,
  roles?: Array<{ applicationId: string; roleId: string }>,
  claims?: Array<{ applicationId: string; claimDefinitionId: string; value: unknown }>,
): Promise<void> {
  const pool = getPool();
  const errors: string[] = [];

  // Collect unique applicationIds from both roles and claims
  const appIds = new Set<string>();
  roles?.forEach(r => appIds.add(r.applicationId));
  claims?.forEach(c => appIds.add(c.applicationId));

  // Verify all applications exist within the org
  if (appIds.size > 0) {
    const appResult = await pool.query(
      `SELECT id FROM applications WHERE id = ANY($1) AND organization_id = $2`,
      [Array.from(appIds), orgId],
    );
    const foundIds = new Set(appResult.rows.map((r: { id: string }) => r.id));
    for (const appId of appIds) {
      if (!foundIds.has(appId)) {
        errors.push(`Application ${appId} not found in this organization`);
      }
    }
  }

  // Verify all roles exist within their application
  if (roles?.length) {
    for (const role of roles) {
      const result = await pool.query(
        `SELECT id FROM roles WHERE id = $1 AND application_id = $2`,
        [role.roleId, role.applicationId],
      );
      if (result.rows.length === 0) {
        errors.push(`Role ${role.roleId} not found in application ${role.applicationId}`);
      }
    }
  }

  // Verify all claim definitions exist within their application
  if (claims?.length) {
    for (const claim of claims) {
      const result = await pool.query(
        `SELECT id FROM claim_definitions WHERE id = $1 AND application_id = $2`,
        [claim.claimDefinitionId, claim.applicationId],
      );
      if (result.rows.length === 0) {
        errors.push(`Claim definition ${claim.claimDefinitionId} not found in application ${claim.applicationId}`);
      }
    }
  }

  if (errors.length > 0) {
    const err = new Error(`Pre-assignment validation failed: ${errors.join('; ')}`);
    (err as Error & { status: number }).status = 400;
    throw err;
  }
}
