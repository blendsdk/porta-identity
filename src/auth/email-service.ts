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
 * Send an invitation email to a newly created user.
 *
 * @param user - Recipient user (newly created)
 * @param org - Organization (for branding and template override)
 * @param inviteUrl - Full URL the user clicks to accept the invitation
 * @param locale - Locale for i18n
 */
export async function sendInvitationEmail(
  user: EmailUser,
  org: EmailOrganization,
  inviteUrl: string,
  locale: string,
): Promise<void> {
  try {
    const { html, text } = await renderEmail('invitation', org.slug, {
      userName: getUserDisplayName(user),
      inviteUrl,
      orgName: org.brandingCompanyName ?? org.slug,
      expiresDays: 7,
      branding: buildBrandingContext(org),
      locale,
    });

    await getTransport().send({
      to: user.email,
      subject: `You've been invited to ${org.brandingCompanyName ?? org.slug}`,
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
