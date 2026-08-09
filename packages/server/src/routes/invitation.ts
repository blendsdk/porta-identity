/**
 * Invitation acceptance route handlers.
 *
 * Handles the flow when a new user clicks the invitation link in their
 * email to set up their account by choosing a password.
 *
 * Route structure:
 *   GET  /:orgSlug/auth/accept-invite/:token → showAcceptInvite
 *   POST /:orgSlug/auth/accept-invite/:token → processAcceptInvite
 *
 * The tenant resolver middleware runs before these routes, ensuring
 * ctx.state.organization is populated with the resolved organization.
 *
 * Security features:
 *   - Token is hashed (SHA-256) before DB lookup
 *   - Token is single-use (marked as used after acceptance)
 *   - Expired/used tokens show an "invitation expired" page
 *   - CSRF protection on the POST endpoint
 *   - Password validation (NIST SP 800-63B compliant)
 *   - Audit logging for invitation acceptance
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import { tenantResolver } from '../middleware/tenant-resolver.js';
import { generateCsrfToken, verifyCsrfToken, setCsrfCookie, getCsrfFromCookie } from '../auth/csrf.js';
import { hashToken } from '../auth/tokens.js';
import { findValidInvitationToken, markTokenUsed } from '../auth/token-repository.js';
import type { InvitationTokenRecord } from '../auth/token-repository.js';
import { getPool } from '../lib/database.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { setUserPassword, markEmailVerified } from '../users/service.js';
import { validatePassword } from '../users/password.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import type { Organization } from '../organizations/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended Koa context with organization from tenant resolver */
interface AuthContext extends Context {
  state: {
    organization: Organization;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build branding context from organization data.
 *
 * @param org - Organization with branding fields
 * @returns Branding context for templates
 */
function buildBrandingFromOrg(org: Organization) {
  return {
    logoUrl: org.brandingLogoUrl,
    faviconUrl: org.brandingFaviconUrl,
    primaryColor: org.brandingPrimaryColor ?? '#3B82F6',
    companyName: org.brandingCompanyName ?? org.name,
    customCss: org.brandingCustomCss,
  };
}

/**
 * Render an HTML page and send it as the response.
 *
 * @param ctx - Koa context
 * @param pageName - Page template name
 * @param context - Full template context
 * @param statusCode - HTTP status code (default: 200)
 */
async function renderAndRespond(
  ctx: Context,
  pageName: string,
  context: TemplateContext,
  statusCode = 200,
): Promise<void> {
  const html = await renderPage(pageName, context);
  ctx.status = statusCode;
  ctx.type = 'text/html';
  ctx.body = html;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the invitation auth router.
 *
 * Handles invitation acceptance at /:orgSlug/auth/accept-invite/:token.
 *
 * @returns Koa router with invitation routes
 */
export function createInvitationRouter(): Router {
  const router = new Router();

  // Tenant resolver — resolves orgSlug to organization and sets ctx.state.organization.
  // Applied at route level because this router is mounted directly on the Koa app
  // (not under the OIDC catch-all router which has its own tenant resolver).
  const resolve = tenantResolver();

  // GET /:orgSlug/auth/accept-invite/:token — Show accept invite form
  router.get('/:orgSlug/auth/accept-invite/:token', resolve, async (ctx) => {
    await showAcceptInvite(ctx as AuthContext);
  });

  // POST /:orgSlug/auth/accept-invite/:token — Process invitation acceptance
  router.post('/:orgSlug/auth/accept-invite/:token', resolve, async (ctx) => {
    await processAcceptInvite(ctx as AuthContext);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Show the accept-invite form.
 *
 * Validates the invitation token before showing the form. If the token
 * is invalid or expired, renders the "invite-expired" page instead.
 *
 * @param ctx - Koa context with organization state
 */
async function showAcceptInvite(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;

  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  // Validate the invitation token
  const tokenHash = hashToken(tokenPlaintext);
  const tokenRecord = await findValidInvitationToken(tokenHash);

  if (!tokenRecord) {
    // Token is invalid, expired, or already used — show expired page
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
    };

    await renderAndRespond(ctx, 'invite-expired', context, 400);
    return;
  }

  // Token is valid — show the accept invite form
  const csrfToken = generateCsrfToken();
  setCsrfCookie(ctx, csrfToken);
  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
    token: tokenPlaintext,
  };

  await renderAndRespond(ctx, 'accept-invite', context);
}

/**
 * Process an invitation acceptance form submission.
 *
 * 1. Verify CSRF token
 * 2. Re-validate the invitation token
 * 3. Validate password and confirm match
 * 4. Set the user's password
 * 5. Mark the user's email as verified
 * 6. Mark the invitation token as used
 * 7. Audit log the acceptance
 * 8. Render success page
 *
 * @param ctx - Koa context with organization state
 */
async function processAcceptInvite(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;
  const body = ctx.request.body as Record<string, string>;
  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';

  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  // Step 1: Verify CSRF token (cookie vs form field)
  if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
    logger.warn('CSRF token mismatch on accept-invite');
    await renderInviteFormWithError(ctx, org, locale, t, tokenPlaintext, t('errors.csrf_invalid'), 403);
    return;
  }

  // Step 2: Re-validate the invitation token
  const tokenHash = hashToken(tokenPlaintext);
  const tokenRecord = await findValidInvitationToken(tokenHash);

  if (!tokenRecord) {
    // Token expired between page load and form submission
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
    };

    await renderAndRespond(ctx, 'invite-expired', context, 400);
    return;
  }

  // Step 3: Validate passwords match
  if (password !== confirmPassword) {
    await renderInviteFormWithError(
      ctx, org, locale, t, tokenPlaintext,
      t('invitation.error_password_mismatch'),
    );
    return;
  }

  // Step 4: Validate password strength (NIST SP 800-63B)
  const validation = validatePassword(password);
  if (!validation.isValid) {
    await renderInviteFormWithError(ctx, org, locale, t, tokenPlaintext, validation.error!);
    return;
  }

  try {
    // Step 5: Set the user's password
    await setUserPassword(tokenRecord.userId, password);

    // Step 6: Mark email as verified (accepting invite proves email ownership)
    await markEmailVerified(tokenRecord.userId);

    // Step 7: Mark invitation token as used (single-use)
    await markTokenUsed('invitation_tokens', tokenRecord.id);

    // Step 7.5: Apply pre-assigned roles and claims from invitation details
    await applyPreAssignments(tokenRecord, org.id);

    // Step 8: Audit log
    writeAuditLog({
      organizationId: org.id,
      userId: tokenRecord.userId,
      eventType: 'user.invite.accepted',
      eventCategory: 'authentication',
      description: 'Invitation accepted — account set up successfully',
      ipAddress: ctx.ip,
      metadata: {
        preAssignedRoles: (tokenRecord.details?.roles as unknown[] | undefined)?.length ?? 0,
        preAssignedClaims: (tokenRecord.details?.claims as unknown[] | undefined)?.length ?? 0,
      },
    });

    // Step 9: Render success page
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
      flash: { success: t('invitation.success') },
    };

    await renderAndRespond(ctx, 'invite-success', context);
  } catch (error) {
    logger.error({ error }, 'Failed to process invitation acceptance');
    await renderInviteFormWithError(ctx, org, locale, t, tokenPlaintext, t('errors.generic'));
  }
}

// ---------------------------------------------------------------------------
// Helper: render invite form with error
// ---------------------------------------------------------------------------

/**
 * Render the accept-invite form with an error flash message.
 *
 * @param ctx - Koa context
 * @param org - Organization for branding
 * @param locale - Resolved locale
 * @param t - Translation function
 * @param token - Invitation token (to re-embed in the form)
 * @param errorMessage - Error message to display
 * @param statusCode - HTTP status code (default: 200)
 */
async function renderInviteFormWithError(
  ctx: Context,
  org: Organization,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  token: string,
  errorMessage: string,
  statusCode = 200,
): Promise<void> {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(ctx, csrfToken);
  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
    token,
    flash: { error: errorMessage },
  };

  await renderAndRespond(ctx, 'accept-invite', context, statusCode);
}

// ---------------------------------------------------------------------------
// Pre-assignment application
// ---------------------------------------------------------------------------

/** Role pre-assignment shape stored in invitation token details */
interface RolePreAssignment {
  applicationId: string;
  roleId: string;
}

/** Claim pre-assignment shape stored in invitation token details */
interface ClaimPreAssignment {
  applicationId: string;
  claimDefinitionId: string;
  value: unknown;
}

/**
 * Apply pre-assigned roles and claims from the invitation token details.
 *
 * This runs after the invitation is accepted (password set, email verified,
 * token marked as used). Pre-assignments are best-effort: if a role or claim
 * no longer exists (admin deleted it between invitation and acceptance), the
 * individual assignment is skipped and logged, but does not fail the overall
 * invitation acceptance.
 *
 * Uses parameterized SQL — no string interpolation for security.
 *
 * @param tokenRecord - The invitation token record with details
 * @param orgId - Organization ID for audit logging
 */
async function applyPreAssignments(
  tokenRecord: InvitationTokenRecord,
  orgId: string,
): Promise<void> {
  if (!tokenRecord.details) return;

  const pool = getPool();
  const userId = tokenRecord.userId;
  const roles = tokenRecord.details.roles as RolePreAssignment[] | undefined;
  const claims = tokenRecord.details.claims as ClaimPreAssignment[] | undefined;

  // Apply role pre-assignments
  if (roles?.length) {
    for (const role of roles) {
      try {
        // Verify role still exists before assigning (defensive)
        const roleCheck = await pool.query(
          `SELECT id FROM roles WHERE id = $1 AND application_id = $2`,
          [role.roleId, role.applicationId],
        );
        if (roleCheck.rows.length === 0) {
          logger.warn({ roleId: role.roleId, userId }, 'Pre-assigned role no longer exists, skipping');
          continue;
        }

        // Insert user-role mapping (ON CONFLICT DO NOTHING for idempotency)
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [userId, role.roleId],
        );

        logger.debug({ userId, roleId: role.roleId }, 'Pre-assigned role applied');
      } catch (err) {
        logger.warn({ err, userId, roleId: role.roleId }, 'Failed to apply pre-assigned role');
      }
    }
  }

  // Apply claim pre-assignments
  if (claims?.length) {
    for (const claim of claims) {
      try {
        // Verify claim definition still exists
        const defCheck = await pool.query(
          `SELECT id FROM claim_definitions WHERE id = $1 AND application_id = $2`,
          [claim.claimDefinitionId, claim.applicationId],
        );
        if (defCheck.rows.length === 0) {
          logger.warn({ claimDefinitionId: claim.claimDefinitionId, userId }, 'Pre-assigned claim definition no longer exists, skipping');
          continue;
        }

        // Upsert user claim value
        await pool.query(
          `INSERT INTO user_claim_values (user_id, claim_definition_id, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, claim_definition_id) DO UPDATE SET value = EXCLUDED.value`,
          [userId, claim.claimDefinitionId, JSON.stringify(claim.value)],
        );

        logger.debug({ userId, claimDefinitionId: claim.claimDefinitionId }, 'Pre-assigned claim applied');
      } catch (err) {
        logger.warn({ err, userId, claimDefinitionId: claim.claimDefinitionId }, 'Failed to apply pre-assigned claim');
      }
    }
  }

  // Audit log pre-assignment application
  if ((roles?.length ?? 0) > 0 || (claims?.length ?? 0) > 0) {
    writeAuditLog({
      organizationId: orgId,
      userId,
      eventType: 'user.invite.pre_assignments_applied',
      eventCategory: 'authentication',
      description: `Pre-assignments applied: ${roles?.length ?? 0} roles, ${claims?.length ?? 0} claims`,
      metadata: {
        roles: roles?.map(r => r.roleId) ?? [],
        claims: claims?.map(c => c.claimDefinitionId) ?? [],
      },
    });
  }
}
