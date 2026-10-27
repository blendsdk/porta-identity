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
 *   POST   /:userId/activate     — Activate (inactive → active)
 *   POST   /:userId/password     — Set/change password
 *   DELETE /:userId/password     — Clear password (passwordless)
 *   POST   /:userId/verify-email — Mark email as verified
 *   GET    /:userId/export       — GDPR data export (Article 20)
 *   DELETE /:userId              — Delete user
 *
 * Error mapping (shared with the tenant and standalone routers):
 *   UserNotFoundError → 404
 *   UserEmailConflictError → 400 (Admin only; tenant uses 409)
 *   UserValidationError → 400
 *   InviteOrganizationNotFoundError → 404
 *   InviteUserExistsError / InviteConflictError → 409
 *   InvitePreAssignmentError / RbacValidationError / ZodError → 400
 *   RoleDelegationError / SuperAdminProtectionError → 403
 *   RoleNotFoundError → 404
 */

import Router from '@koa/router';
import { z } from 'zod';
import type { InvitationEmailOptions } from '../auth/email-service.js';
import { renderInvitationEmail } from '../auth/email-service.js';
import { config } from '../config/index.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import type { AuditActor, AuditRequestContext } from '../lib/audit-log.js';
import { getEntityHistory } from '../lib/entity-history.js';
import { checkIfMatch, setETagHeader } from '../lib/etag.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { guardSuperAdmin } from '../lib/super-admin-protection.js';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { requireUserOrganization } from '../middleware/require-user-organization.js';
import { requireExistingOrganization } from '../middleware/require-existing-organization.js';
import { getOrganizationById } from '../organizations/service.js';
import { exportUserData } from '../users/gdpr.js';
import { inviteUser, inviteUserSchema } from '../users/invite-service.js';
import {
  createUserSchema,
  identifierSchema,
  listUsersCursorSchema,
  listUsersSchema,
  updateUserSchema,
} from '../users/schemas.js';
import * as userService from '../users/service.js';
import { handleUserRouteError } from './user-error-handler.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for setting a password */
const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(
  ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never },
  err: unknown,
): never {
  return handleUserRouteError(ctx, err);
}

/** Resolve the authenticated administrator as an audit actor. */
function adminAuditActor(ctx: { state: { adminUser?: { id: string } } }): AuditActor {
  const userId = ctx.state.adminUser?.id;
  if (!userId) throw new Error('Admin actor missing after authentication');
  return { kind: 'user', userId };
}

/** Capture the trusted request metadata used by mutation audit. */
function auditContext(ctx: { ip: string; get: (field: string) => string }): AuditRequestContext {
  const userAgent = ctx.get('user-agent');
  return {
    ...(ctx.ip ? { ipAddress: ctx.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the user management router.
 *
 * All routes require admin authorization with granular permissions.
 * Users are always scoped to an organization via the :orgId URL parameter.
 * Operations that cannot preserve bootstrap-administrator availability are rejected at their
 * owning service or repository boundary.
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
      const user = await userService.createUser(
        {
          organizationId: ctx.params.orgId,
          ...body,
        },
        adminAuditActor(ctx),
        auditContext(ctx),
      );
      setETagHeader(ctx, 'user', user.id, user.updatedAt);
      ctx.status = 201;
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List users (paginated)
  // -------------------------------------------------------------------------
  router.get(
    '/',
    requirePermission(ADMIN_PERMISSIONS.USER_READ),
    requireExistingOrganization(),
    async (ctx) => {
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
    },
  );

  // -------------------------------------------------------------------------
  // GET /:userId — Get user by ID
  // -------------------------------------------------------------------------
  router.get(
    '/:userId',
    requirePermission(ADMIN_PERMISSIONS.USER_READ),
    requireUserOrganization(),
    async (ctx) => {
      const user = await userService.getUserById(ctx.params.userId);
      if (!user) {
        ctx.throw(404, 'User not found');
        return; // unreachable — keeps TS narrowing happy
      }
      setETagHeader(ctx, 'user', user.id, user.updatedAt);
      ctx.body = { data: user };
    },
  );

  // -------------------------------------------------------------------------
  // PUT /:userId — Update user profile
  // -------------------------------------------------------------------------
  router.put(
    '/:userId',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const body = updateUserSchema.parse(ctx.request.body);
        // Check If-Match for optimistic concurrency (optional — backward compatible)
        const current = await userService.getUserById(ctx.params.userId);
        if (current && !checkIfMatch(ctx, 'user', current.id, current.updatedAt, current)) return;
        // Convert null address to undefined — Zod allows null for clearing,
        // but UpdateUserInput uses undefined to mean "no change"
        const input = { ...body, address: body.address ?? undefined };
        const user = await userService.updateUser(
          ctx.params.userId,
          input,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        setETagHeader(ctx, 'user', user.id, user.updatedAt);
        ctx.body = { data: user };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /:userId/deactivate — Deactivate user
  // Protected: super-admin user cannot be deactivated
  // -------------------------------------------------------------------------
  router.post(
    '/:userId/deactivate',
    requirePermission(ADMIN_PERMISSIONS.USER_LIFECYCLE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        await guardSuperAdmin(ctx.params.userId, 'deactivate');
        await userService.deactivateUser(
          ctx.params.userId,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /:userId/activate — Activate user
  // -------------------------------------------------------------------------
  router.post(
    '/:userId/activate',
    requirePermission(ADMIN_PERMISSIONS.USER_LIFECYCLE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        await userService.activateUser(
          ctx.params.userId,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /:userId/password — Set password
  // -------------------------------------------------------------------------
  router.post(
    '/:userId/password',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const body = setPasswordSchema.parse(ctx.request.body);
        await userService.setUserPassword(ctx.params.userId, body.password);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /:userId/password — Clear password (convert to passwordless)
  // -------------------------------------------------------------------------
  router.delete(
    '/:userId/password',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        await userService.clearUserPassword(ctx.params.userId);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /:userId/verify-email — Mark email as verified
  // -------------------------------------------------------------------------
  router.post(
    '/:userId/verify-email',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        await userService.markEmailVerified(ctx.params.userId);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /:userId/export — GDPR data export (Article 20)
  // -------------------------------------------------------------------------
  router.get(
    '/:userId/export',
    requirePermission(ADMIN_PERMISSIONS.USER_READ),
    requireUserOrganization(),
    async (ctx) => {
      const user = await userService.getUserById(ctx.params.userId);
      if (!user) {
        return ctx.throw(404, 'User not found');
      }
      const exportData = await exportUserData(user);
      ctx.body = { data: exportData };
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /:userId — Delete user
  // -------------------------------------------------------------------------
  router.delete(
    '/:userId',
    requirePermission(ADMIN_PERMISSIONS.USER_DELETE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        identifierSchema.parse(ctx.params);
        await userService.deleteUser(
          ctx.params.orgId,
          ctx.params.userId,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /:userId/history — User change history
  // -------------------------------------------------------------------------
  router.get(
    '/:userId/history',
    requirePermission(ADMIN_PERMISSIONS.USER_READ),
    requireUserOrganization(),
    async (ctx) => {
      const { limit, after, event_type } = ctx.query as Record<string, string>;
      const result = await getEntityHistory('user', ctx.params.userId, {
        limit: limit ? parseInt(limit, 10) : undefined,
        after: after || undefined,
        eventTypePrefix: event_type || undefined,
      });
      ctx.body = result;
    },
  );

  // -------------------------------------------------------------------------
  // POST /invite — Invite a new user
  //
  // Enhanced invitation with optional personal message, role/claim
  // pre-assignment, and inviter tracking. Stores an email/organization-keyed
  // invitation token and sends the invitation email. No account is created
  // until the recipient accepts. Existing organization email addresses are
  // rejected instead of silently resending an invitation.
  // -------------------------------------------------------------------------
  router.post('/invite', requirePermission(ADMIN_PERMISSIONS.USER_INVITE), async (ctx) => {
    try {
      const body = inviteUserSchema.parse(ctx.request.body);
      const adminUser = ctx.state.adminUser;
      if (!adminUser) {
        ctx.throw(401, 'Authentication required');
        return;
      }

      const result = await inviteUser({
        organizationId: ctx.params.orgId,
        input: body,
        actor: {
          kind: 'admin',
          userId: adminUser.id,
          displayName: adminUser.email ?? 'Admin',
        },
      });

      ctx.status = 201;
      ctx.body = { data: result };
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
      const adminUser = ctx.state.adminUser as {
        id: string;
        givenName?: string;
        familyName?: string;
        email?: string;
      };

      // Resolve the organization for branding
      const org = await getOrganizationById(orgId);
      if (!org) {
        ctx.throw(404, 'Organization not found');
        return;
      }

      // Build inviter display name
      const inviterName = adminUser.givenName
        ? adminUser.familyName
          ? `${adminUser.givenName} ${adminUser.familyName}`
          : adminUser.givenName
        : (adminUser.email ?? 'Admin');

      // Build a mock recipient for the preview; no account exists for a pending invitation.
      const previewUser = {
        email: body.email,
        givenName: body.givenName ?? null,
        familyName: body.familyName ?? null,
      };

      // Render the invitation email (without sending)
      const invitationTtl = await getSystemConfigNumber('invitation_ttl');
      const emailOptions: InvitationEmailOptions = { expiresInSeconds: invitationTtl };
      if (body.personalMessage) emailOptions.personalMessage = body.personalMessage;
      emailOptions.inviterName = inviterName;

      const result = await renderInvitationEmail(
        previewUser,
        org,
        // Absolute preview URL — same trusted issuerBaseUrl prefix as the real invite.
        `${config.issuerBaseUrl}/${org.slug}/auth/accept-invite/PREVIEW_TOKEN`,

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

/** Schema for the invitation preview request */
const invitePreviewSchema = z.object({
  email: z.string().email(),
  givenName: z.string().min(1).max(255).optional(),
  familyName: z.string().min(1).max(255).optional(),
  personalMessage: z.string().max(500).optional(),
  locale: z.string().max(10).optional(),
});

// ---------------------------------------------------------------------------
// Standalone user router (non-org-scoped)
// ---------------------------------------------------------------------------

/**
 * Create a standalone user admin router.
 *
 * Provides direct user access by userId at `/api/admin/users/:userId/*`
 * without requiring the organizationId in the URL path. This is used by
 * the Admin GUI SPA for user detail views and mutations where the user
 * detail page only has the userId (from the URL) and not the orgId.
 *
 * The handlers delegate to the same user service functions as the
 * org-scoped router. All routes require admin authentication and
 * granular permissions.
 *
 * Prefix: /api/admin/users
 */
export function createStandaloneUserRouter(): Router {
  const router = new Router({ prefix: '/api/admin/users' });

  router.use(requireAdminAuth());

  // GET /:userId — Get user by ID
  router.get('/:userId', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    const user = await userService.getUserById(ctx.params.userId);
    if (!user) {
      ctx.throw(404, 'User not found');
      return;
    }
    setETagHeader(ctx, 'user', user.id, user.updatedAt);
    ctx.body = { data: user };
  });

  // PUT /:userId — Update user profile
  router.put('/:userId', requirePermission(ADMIN_PERMISSIONS.USER_UPDATE), async (ctx) => {
    try {
      const body = updateUserSchema.parse(ctx.request.body);
      const current = await userService.getUserById(ctx.params.userId);
      if (current && !checkIfMatch(ctx, 'user', current.id, current.updatedAt, current)) return;
      const input = { ...body, address: body.address ?? undefined };
      const user = await userService.updateUser(
        ctx.params.userId,
        input,
        adminAuditActor(ctx),
        auditContext(ctx),
      );
      setETagHeader(ctx, 'user', user.id, user.updatedAt);
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // POST /:userId/deactivate — Deactivate user
  router.post(
    '/:userId/deactivate',
    requirePermission(ADMIN_PERMISSIONS.USER_LIFECYCLE),
    async (ctx) => {
      try {
        await guardSuperAdmin(ctx.params.userId, 'deactivate');
        await userService.deactivateUser(
          ctx.params.userId,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // POST /:userId/activate — Activate user (inactive → active)
  router.post(
    '/:userId/activate',
    requirePermission(ADMIN_PERMISSIONS.USER_LIFECYCLE),
    async (ctx) => {
      try {
        await userService.activateUser(
          ctx.params.userId,
          adminAuditActor(ctx),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // POST /:userId/password — Set password
  router.post(
    '/:userId/password',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    async (ctx) => {
      try {
        const body = setPasswordSchema.parse(ctx.request.body);
        await userService.setUserPassword(ctx.params.userId, body.password);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // DELETE /:userId/password — Clear password
  router.delete(
    '/:userId/password',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    async (ctx) => {
      try {
        await userService.clearUserPassword(ctx.params.userId);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // POST /:userId/verify-email — Mark email as verified
  router.post(
    '/:userId/verify-email',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    async (ctx) => {
      try {
        await userService.markEmailVerified(ctx.params.userId);
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // GET /:userId/history — Entity change history
  router.get('/:userId/history', requirePermission(ADMIN_PERMISSIONS.USER_READ), async (ctx) => {
    try {
      const history = await getEntityHistory('user', ctx.params.userId);
      ctx.body = { data: history };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
