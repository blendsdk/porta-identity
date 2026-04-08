import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock email renderer — controls what renderEmail returns
vi.mock('../../../src/auth/email-renderer.js', () => ({
  renderEmail: vi.fn(),
}));

// Mock email transport — we'll use setEmailTransport instead of this
vi.mock('../../../src/auth/email-transport.js', () => ({
  createSmtpTransport: vi.fn(),
}));

// Mock audit log — verify fire-and-forget audit entries
vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

// Mock logger — suppress output and verify log calls
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { renderEmail } from '../../../src/auth/email-renderer.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { logger } from '../../../src/lib/logger.js';
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  setEmailTransport,
} from '../../../src/auth/email-service.js';
import type { EmailUser, EmailOrganization } from '../../../src/auth/email-service.js';
import type { EmailTransport } from '../../../src/auth/email-transport.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock email transport with a configurable send method */
function createMockTransport(): EmailTransport & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue({
      messageId: '<test-msg@mock>',
      accepted: ['user@example.com'],
      rejected: [],
    }),
  };
}

/** Standard test user */
const TEST_USER: EmailUser = {
  id: 'user-123',
  email: 'alice@example.com',
  givenName: 'Alice',
  familyName: 'Smith',
};

/** Standard test organization with branding */
const TEST_ORG: EmailOrganization = {
  id: 'org-456',
  slug: 'acme-corp',
  brandingLogoUrl: 'https://acme.com/logo.png',
  brandingPrimaryColor: '#FF5733',
  brandingCompanyName: 'Acme Corp',
};

/** Set up renderEmail to return predictable HTML/text */
function mockRender(html = '<p>Rendered</p>', text = 'Rendered') {
  (renderEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ html, text });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('email-service', () => {
  let mockTransport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport = createMockTransport();
    // Inject mock transport to avoid SMTP initialization
    setEmailTransport(mockTransport);
    mockRender();
  });

  afterEach(() => {
    // Reset transport to prevent test leakage
    setEmailTransport(null);
  });

  // -------------------------------------------------------------------------
  // setEmailTransport
  // -------------------------------------------------------------------------

  describe('setEmailTransport', () => {
    it('should allow overriding the email transport for testing', async () => {
      const customTransport = createMockTransport();
      setEmailTransport(customTransport);

      await sendWelcomeEmail(TEST_USER, TEST_ORG, 'en');

      expect(customTransport.send).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendMagicLinkEmail
  // -------------------------------------------------------------------------

  describe('sendMagicLinkEmail', () => {
    it('should render and send magic link email', async () => {
      await sendMagicLinkEmail(TEST_USER, TEST_ORG, 'https://acme.com/magic?token=abc', 'en');

      // Verify renderEmail was called with correct template and context
      expect(renderEmail).toHaveBeenCalledWith(
        'magic-link',
        'acme-corp',
        expect.objectContaining({
          userName: 'Alice Smith',
          magicLinkUrl: 'https://acme.com/magic?token=abc',
          expiresMinutes: 15,
          locale: 'en',
          branding: expect.objectContaining({
            logoUrl: 'https://acme.com/logo.png',
            primaryColor: '#FF5733',
            companyName: 'Acme Corp',
          }),
        }),
      );

      // Verify transport.send was called
      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: 'Sign in to your account',
        }),
      );

      // Verify audit log was written
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'email.send.magic_link',
          userId: 'user-123',
          organizationId: 'org-456',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendPasswordResetEmail
  // -------------------------------------------------------------------------

  describe('sendPasswordResetEmail', () => {
    it('should render and send password reset email', async () => {
      await sendPasswordResetEmail(TEST_USER, TEST_ORG, 'https://acme.com/reset?token=xyz', 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'password-reset',
        'acme-corp',
        expect.objectContaining({
          userName: 'Alice Smith',
          resetUrl: 'https://acme.com/reset?token=xyz',
          expiresMinutes: 60,
        }),
      );

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: 'Reset your password',
        }),
      );

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'email.send.password_reset' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendInvitationEmail
  // -------------------------------------------------------------------------

  describe('sendInvitationEmail', () => {
    it('should render and send invitation email', async () => {
      await sendInvitationEmail(TEST_USER, TEST_ORG, 'https://acme.com/invite?token=inv', 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'invitation',
        'acme-corp',
        expect.objectContaining({
          userName: 'Alice Smith',
          inviteUrl: 'https://acme.com/invite?token=inv',
          orgName: 'Acme Corp',
          expiresDays: 7,
        }),
      );

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: "You've been invited to Acme Corp",
        }),
      );

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'email.send.invitation' }),
      );
    });

    it('should fall back to org slug when brandingCompanyName is null', async () => {
      const orgNoBranding: EmailOrganization = {
        ...TEST_ORG,
        brandingCompanyName: null,
      };

      await sendInvitationEmail(TEST_USER, orgNoBranding, 'https://invite.url', 'en');

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "You've been invited to acme-corp",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendWelcomeEmail
  // -------------------------------------------------------------------------

  describe('sendWelcomeEmail', () => {
    it('should render and send welcome email', async () => {
      await sendWelcomeEmail(TEST_USER, TEST_ORG, 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'welcome',
        'acme-corp',
        expect.objectContaining({
          userName: 'Alice Smith',
          orgName: 'Acme Corp',
        }),
      );

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: 'Welcome to Acme Corp',
        }),
      );

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'email.send.welcome' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendPasswordChangedEmail
  // -------------------------------------------------------------------------

  describe('sendPasswordChangedEmail', () => {
    it('should render and send password changed email', async () => {
      await sendPasswordChangedEmail(TEST_USER, TEST_ORG, 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'password-changed',
        'acme-corp',
        expect.objectContaining({
          userName: 'Alice Smith',
        }),
      );

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: 'Your password has been changed',
        }),
      );

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'email.send.password_changed' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fire-and-forget (error handling)
  // -------------------------------------------------------------------------

  describe('fire-and-forget error handling', () => {
    it('should catch and log send failures without throwing', async () => {
      // Make the transport fail
      mockTransport.send.mockRejectedValue(new Error('SMTP timeout'));

      // Should NOT throw — fire-and-forget semantics
      await expect(
        sendMagicLinkEmail(TEST_USER, TEST_ORG, 'https://link.url', 'en'),
      ).resolves.toBeUndefined();

      // Should log a warning about the failure
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Failed to send magic link email'),
      );

      // Should write a failure audit log
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'email.send.failed',
          metadata: expect.objectContaining({ template: 'magic-link' }),
        }),
      );
    });

    it('should catch render failures without throwing', async () => {
      // Make the renderer fail
      (renderEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Template not found'),
      );

      // Should NOT throw
      await expect(
        sendPasswordResetEmail(TEST_USER, TEST_ORG, 'https://reset.url', 'en'),
      ).resolves.toBeUndefined();

      // Transport should NOT have been called (render failed first)
      expect(mockTransport.send).not.toHaveBeenCalled();

      // Should log a warning
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // User display name resolution
  // -------------------------------------------------------------------------

  describe('user display name resolution', () => {
    it('should use full name when both given and family name exist', async () => {
      await sendWelcomeEmail(TEST_USER, TEST_ORG, 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'welcome',
        'acme-corp',
        expect.objectContaining({ userName: 'Alice Smith' }),
      );
    });

    it('should use given name only when family name is null', async () => {
      const userNoFamily: EmailUser = { ...TEST_USER, familyName: null };

      await sendWelcomeEmail(userNoFamily, TEST_ORG, 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'welcome',
        'acme-corp',
        expect.objectContaining({ userName: 'Alice' }),
      );
    });

    it('should fall back to email prefix when no name is set', async () => {
      const userNoName: EmailUser = {
        ...TEST_USER,
        givenName: null,
        familyName: null,
      };

      await sendWelcomeEmail(userNoName, TEST_ORG, 'en');

      // Should use 'alice' (prefix of alice@example.com)
      expect(renderEmail).toHaveBeenCalledWith(
        'welcome',
        'acme-corp',
        expect.objectContaining({ userName: 'alice' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Branding context
  // -------------------------------------------------------------------------

  describe('branding context', () => {
    it('should use default primary color when org has none', async () => {
      const orgNoBranding: EmailOrganization = {
        ...TEST_ORG,
        brandingPrimaryColor: null,
        brandingLogoUrl: null,
        brandingCompanyName: null,
      };

      await sendWelcomeEmail(TEST_USER, orgNoBranding, 'en');

      expect(renderEmail).toHaveBeenCalledWith(
        'welcome',
        'acme-corp',
        expect.objectContaining({
          branding: expect.objectContaining({
            primaryColor: '#3B82F6', // Default blue
            logoUrl: '',
            companyName: 'acme-corp', // Falls back to slug
          }),
        }),
      );
    });
  });
});
