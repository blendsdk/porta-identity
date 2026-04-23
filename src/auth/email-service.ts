/**
 * High-level email service for auth workflow emails.
 *
 * Provides specific methods for each email type (magic link, password reset,
 * invitation, welcome, password-changed). Each method:
 *   1. Renders HTML + plaintext templates via the email renderer
 *   2. Sends via the email transport
 *   3. Writes an audit log entry
 *
 * All methods use fire-and-forget semantics: send failures are caught,
 * logged as warnings, and audit-logged — they never propagate to callers.
 * This ensures email delivery never blocks core authentication flows.
 *
 * @example
 *   await sendMagicLinkEmail(user, org, 'https://...', 'en');
 */

import type { EmailTransport } from './email-transport.js';
import { createSmtpTransport } from './email-transport.js';
import { renderEmail } from './email-renderer.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal user fields needed by email service */
export interface EmailUser {
  id: string;
  email: string;
  givenName?: string | null;
  familyName?: string | null;
}

/** Minimal org fields needed by email service */
export interface EmailOrganization {
  id: string;
  slug: string;
  brandingLogoUrl?: string | null;
  brandingPrimaryColor?: string | null;
  brandingCompanyName?: string | null;
}

// ---------------------------------------------------------------------------
// Module-level transport (lazy-initialized)
// ---------------------------------------------------------------------------

let transport: EmailTransport | null = null;

/**
 * Get or create the email transport singleton.
 * Lazy-initialized on first use to avoid startup dependency issues.
 */
function getTransport(): EmailTransport {
  if (!transport) {
    transport = createSmtpTransport();
  }
  return transport;
}

/**
 * Override the email transport (for testing).
 * Pass null to reset to the default SMTP transport.
 *
 * @param override - Custom transport or null to reset
 */
export function setEmailTransport(override: EmailTransport | null): void {
  transport = override;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build branding context object from organization data.
 *
 * @param org - Organization with branding fields
 * @returns Branding object for template context
 */
function buildBrandingContext(org: EmailOrganization) {
  return {
    logoUrl: org.brandingLogoUrl ?? '',
    primaryColor: org.brandingPrimaryColor ?? '#3B82F6',
    companyName: org.brandingCompanyName ?? org.slug,
  };
}

/**
 * Build the display name for a user.
 * Falls back to email prefix if no name is set.
 *
 * @param user - User with optional name fields
 * @returns Display name string
 */
function getUserDisplayName(user: EmailUser): string {
  if (user.givenName) {
    return user.familyName ? `${user.givenName} ${user.familyName}` : user.givenName;
  }
  // Fall back to email prefix (everything before @)
  return user.email.split('@')[0];
}

// ---------------------------------------------------------------------------
// Email methods (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Send a magic link email to a user.
 *
 * @param user - Recipient user
 * @param org - Organization (for branding and template override)
 * @param magicLinkUrl - Full URL the user clicks to authenticate
 * @param locale - Locale for i18n (e.g., 'en')
 */
export async function sendMagicLinkEmail(
  user: EmailUser,
  org: EmailOrganization,
  magicLinkUrl: string,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('magic-link', org.slug, {
      userName: getUserDisplayName(user),
      magicLinkUrl,
      expiresMinutes: 15,
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: 'Sign in to your account',
      html,
      text,
    });

    // Fire-and-forget audit log
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.magic_link',
      eventCategory: 'auth',
      description: `Magic link email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'Magic link email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send magic link email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send magic link email to ${user.email}`,
      metadata: { error: String(error), template: 'magic-link' },
    });
  }
}

/**
 * Send a password reset email to a user.
 *
 * @param user - Recipient user
 * @param org - Organization (for branding and template override)
 * @param resetUrl - Full URL the user clicks to reset their password
 * @param locale - Locale for i18n
 */
export async function sendPasswordResetEmail(
  user: EmailUser,
  org: EmailOrganization,
  resetUrl: string,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('password-reset', org.slug, {
      userName: getUserDisplayName(user),
      resetUrl,
      expiresMinutes: 60,
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: 'Reset your password',
      html,
      text,
    });

    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.password_reset',
      eventCategory: 'auth',
      description: `Password reset email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'Password reset email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send password reset email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send password reset email to ${user.email}`,
      metadata: { error: String(error), template: 'password-reset' },
    });
  }
}

/**
 * Optional parameters for enhanced invitation emails.
 *
 * Supports personal messages from the inviting admin and pre-assignment
 * metadata display in the invitation email.
 */
export interface InvitationEmailOptions {
  /** Optional personal message from the admin (HTML-escaped before rendering) */
  personalMessage?: string;
  /** Display name of the admin who sent the invitation */
  inviterName?: string;
}

/**
 * Build the template context for an invitation email.
 *
 * Shared between sendInvitationEmail() and renderInvitationEmail()
 * to ensure consistency between sent emails and preview renders.
 *
 * @param user - Recipient user
 * @param org - Organization for branding
 * @param inviteUrl - Full URL the user clicks to accept
 * @param locale - Locale for i18n
 * @param options - Optional personal message and inviter name
 * @returns Template context and computed subject line
 */
function buildInvitationContext(
  user: EmailUser,
  org: EmailOrganization,
  inviteUrl: string,
  locale: string,
  options?: InvitationEmailOptions,
): { context: Record<string, unknown>; subject: string } {
  const orgName = org.brandingCompanyName ?? org.slug;
  return {
    context: {
      userName: getUserDisplayName(user),
      inviteUrl,
      orgName,
      expiresDays: 7,
      branding: buildBrandingContext(org),
      locale,
      // Enhanced invitation fields — only included when provided
      personalMessage: options?.personalMessage ?? null,
      inviterName: options?.inviterName ?? null,
    },
    subject: options?.inviterName
      ? `${options.inviterName} has invited you to ${orgName}`
      : `You've been invited to ${orgName}`,
  };
}

/**
 * Send an invitation email to a newly created user.
 *
 * @param user - Recipient user (newly created)
 * @param org - Organization (for branding and template override)
 * @param inviteUrl - Full URL the user clicks to accept the invitation
 * @param locale - Locale for i18n
 * @param options - Optional personal message and inviter name
 */
export async function sendInvitationEmail(
  user: EmailUser,
  org: EmailOrganization,
  inviteUrl: string,
  locale: string,
  options?: InvitationEmailOptions,
): Promise<void> {
  try {
    const { context, subject } = buildInvitationContext(user, org, inviteUrl, locale, options);
    const { html, text } = await renderEmail('invitation', org.slug, context);

    await getTransport().send({
      to: user.email,
      subject,
      html,
      text,
    });

    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.invitation',
      eventCategory: 'auth',
      description: `Invitation email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'Invitation email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send invitation email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send invitation email to ${user.email}`,
      metadata: { error: String(error), template: 'invitation' },
    });
  }
}

/**
 * Render an invitation email without sending it (for preview).
 *
 * Returns the HTML, plain text, and subject line that would be sent,
 * allowing admins to preview the invitation before sending.
 *
 * @param user - Recipient user
 * @param org - Organization for branding
 * @param inviteUrl - Full URL (can be a placeholder for preview)
 * @param locale - Locale for i18n
 * @param options - Optional personal message and inviter name
 * @returns Rendered HTML, plain text, and subject line
 */
export async function renderInvitationEmail(
  user: EmailUser,
  org: EmailOrganization,
  inviteUrl: string,
  locale: string,
  options?: InvitationEmailOptions,
): Promise<{ html: string; text: string; subject: string }> {
  const { context, subject } = buildInvitationContext(user, org, inviteUrl, locale, options);
  const { html, text } = await renderEmail('invitation', org.slug, context);
  return { html, text, subject };
}

/**
 * Send a welcome email to a user (for passwordless users after first login).
 *
 * @param user - Recipient user
 * @param org - Organization (for branding and template override)
 * @param locale - Locale for i18n
 */
export async function sendWelcomeEmail(
  user: EmailUser,
  org: EmailOrganization,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('welcome', org.slug, {
      userName: getUserDisplayName(user),
      orgName: org.brandingCompanyName ?? org.slug,
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: `Welcome to ${org.brandingCompanyName ?? org.slug}`,
      html,
      text,
    });

    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.welcome',
      eventCategory: 'auth',
      description: `Welcome email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'Welcome email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send welcome email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send welcome email to ${user.email}`,
      metadata: { error: String(error), template: 'welcome' },
    });
  }
}

/**
 * Send a 2FA OTP verification code email.
 *
 * Used during login when the user's 2FA method is 'email'. The email
 * contains a 6-digit code that expires in the specified number of minutes.
 * Follows the same fire-and-forget pattern as other email methods.
 *
 * @param user - Recipient user
 * @param org - Organization (for branding and template override)
 * @param code - 6-digit OTP code to include in the email
 * @param expiresMinutes - Minutes until the code expires (e.g., 10)
 * @param locale - Locale for i18n
 */
export async function sendOtpCodeEmail(
  user: EmailUser,
  org: EmailOrganization,
  code: string,
  expiresMinutes: number,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('otp-code', org.slug, {
      userName: getUserDisplayName(user),
      code,
      expiresMinutes,
      orgName: org.brandingCompanyName ?? org.slug,
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: `Your verification code: ${code}`,
      html,
      text,
    });

    // Fire-and-forget audit log
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.otp_code',
      eventCategory: 'auth',
      description: `OTP code email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'OTP code email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send OTP code email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send OTP code email to ${user.email}`,
      metadata: { error: String(error), template: 'otp-code' },
    });
  }
}

/**
 * Send a password-changed confirmation email.
 *
 * @param user - Recipient user
 * @param org - Organization (for branding and template override)
 * @param locale - Locale for i18n
 */
export async function sendPasswordChangedEmail(
  user: EmailUser,
  org: EmailOrganization,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('password-changed', org.slug, {
      userName: getUserDisplayName(user),
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: 'Your password has been changed',
      html,
      text,
    });

    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.password_changed',
      eventCategory: 'auth',
      description: `Password changed email sent to ${user.email}`,
    });

    logger.debug({ userId: user.id, email: user.email }, 'Password changed email sent');
  } catch (error) {
    logger.warn({ error, userId: user.id, email: user.email }, 'Failed to send password changed email');
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'email.send.failed',
      eventCategory: 'auth',
      description: `Failed to send password changed email to ${user.email}`,
      metadata: { error: String(error), template: 'password-changed' },
    });
  }
}
