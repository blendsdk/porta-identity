/**
 * Email service integration tests with MailHog.
 *
 * Verifies that email sending works end-to-end against a real SMTP server
 * (MailHog). Tests send actual emails and verify delivery via MailHog's
 * HTTP API. Covers: magic link, password reset, invitation emails,
 * correct from address, and correct recipient.
 *
 * Requires MailHog to be running (docker compose up).
 * Each test clears the MailHog inbox before running.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  setEmailTransport,
} from '../../../src/auth/email-service.js';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import type { EmailUser, EmailOrganization } from '../../../src/auth/email-service.js';

const mailhog = new MailHogClient();

describe('Email Service (Integration)', () => {
  /** Shared test user and org for email tests */
  let testUser: EmailUser;
  let testOrg: EmailOrganization;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await mailhog.clearAll();

    // Create test org and user for email context
    const org = await createTestOrganization({
      name: 'Email Test Org',
      brandingCompanyName: 'EmailCo',
    });
    const user = await createTestUser(org.id, {
      email: `emailtest-${Date.now()}@test.example.com`,
      givenName: 'Email',
      familyName: 'Tester',
    });

    testOrg = {
      id: org.id,
      slug: org.slug,
      brandingCompanyName: org.brandingCompanyName,
      brandingLogoUrl: org.brandingLogoUrl,
      brandingPrimaryColor: org.brandingPrimaryColor,
    };
    testUser = {
      id: user.id,
      email: user.email,
      givenName: user.givenName,
      familyName: user.familyName,
    };

    // Ensure the email transport uses the real SMTP (MailHog)
    setEmailTransport(createSmtpTransport());
  });

  afterAll(() => {
    // Reset transport to avoid affecting other tests
    setEmailTransport(null);
  });

  // ── Magic Link Email ───────────────────────────────────────────

  it('should send a magic link email received by MailHog', async () => {
    const magicUrl = 'http://localhost:3000/test-org/auth/magic/token-abc123';

    await sendMagicLinkEmail(testUser, testOrg, magicUrl, 'en');

    // Wait for email to arrive in MailHog
    const message = await mailhog.waitForMessage(testUser.email, 5000);
    expect(message).toBeDefined();
    expect(message.subject).toContain('Sign in');
    // Body should contain the magic link URL
    const bodyText = message.body || message.html;
    expect(bodyText).toContain(magicUrl);
  });

  // ── Password Reset Email ───────────────────────────────────────

  it('should send a password reset email received by MailHog', async () => {
    const resetUrl = 'http://localhost:3000/test-org/auth/reset/token-def456';

    await sendPasswordResetEmail(testUser, testOrg, resetUrl, 'en');

    const message = await mailhog.waitForMessage(testUser.email, 5000);
    expect(message).toBeDefined();
    expect(message.subject).toContain('Reset');
    const bodyText = message.body || message.html;
    expect(bodyText).toContain(resetUrl);
  });

  // ── Invitation Email ───────────────────────────────────────────

  it('should send an invitation email received by MailHog', async () => {
    const inviteUrl = 'http://localhost:3000/test-org/auth/invite/token-ghi789';

    await sendInvitationEmail(testUser, testOrg, inviteUrl, 'en');

    const message = await mailhog.waitForMessage(testUser.email, 5000);
    expect(message).toBeDefined();
    expect(message.subject).toContain('invited');
    const bodyText = message.body || message.html;
    expect(bodyText).toContain(inviteUrl);
  });

  // ── Email From Address ─────────────────────────────────────────

  it('should use configured SMTP_FROM as sender address', async () => {
    const magicUrl = 'http://localhost:3000/from-test';

    await sendMagicLinkEmail(testUser, testOrg, magicUrl, 'en');

    const message = await mailhog.waitForMessage(testUser.email, 5000);
    expect(message).toBeDefined();
    // SMTP_FROM is configured as 'test@porta.local' in test env
    expect(message.from).toContain('test@porta.local');
  });

  // ── Correct Recipient ──────────────────────────────────────────

  it('should deliver to the correct recipient email address', async () => {
    const magicUrl = 'http://localhost:3000/recipient-test';

    await sendMagicLinkEmail(testUser, testOrg, magicUrl, 'en');

    const message = await mailhog.waitForMessage(testUser.email, 5000);
    expect(message).toBeDefined();
    // To should include the test user's email
    expect(message.to.some((to) => to.includes(testUser.email))).toBe(true);
  });

  // ── No Cross-Contamination ─────────────────────────────────────

  it('should not have messages for an unrelated recipient', async () => {
    const magicUrl = 'http://localhost:3000/isolation-test';

    await sendMagicLinkEmail(testUser, testOrg, magicUrl, 'en');

    // Wait for the actual email to arrive
    await mailhog.waitForMessage(testUser.email, 5000);

    // An unrelated address should have no messages
    const unrelated = await mailhog.getLatestFor('nobody@nowhere.example.com');
    expect(unrelated).toBeNull();
  });
});
