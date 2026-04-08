import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock nodemailer — createTransport returns a transporter with sendMail
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

// Mock config — provides SMTP settings
vi.mock('../../../src/config/index.js', () => ({
  config: {
    smtp: {
      host: 'smtp.test.local',
      port: 587,
      user: 'testuser',
      pass: 'testpass',
      from: 'noreply@test.local',
    },
  },
}));

// Mock logger — suppress output during tests
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import nodemailer from 'nodemailer';
import { config } from '../../../src/config/index.js';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import type { SendEmailOptions } from '../../../src/auth/email-transport.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock sendMail function with a default success response */
function mockSendMail(overrides: Partial<{
  messageId: string;
  accepted: string[];
  rejected: string[];
}> = {}) {
  const sendMail = vi.fn().mockResolvedValue({
    messageId: overrides.messageId ?? '<test-id@smtp.test.local>',
    accepted: overrides.accepted ?? ['user@example.com'],
    rejected: overrides.rejected ?? [],
  });
  (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail });
  return sendMail;
}

/** Standard email options for testing */
const TEST_OPTIONS: SendEmailOptions = {
  to: 'user@example.com',
  subject: 'Test Subject',
  html: '<h1>Hello</h1>',
  text: 'Hello',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('email-transport', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createSmtpTransport', () => {
    it('should create a nodemailer transport with config values', () => {
      mockSendMail();

      createSmtpTransport();

      // Verify createTransport was called with SMTP config
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.local',
          port: 587,
          secure: false, // Port 587 should NOT use implicit TLS
        }),
      );
    });

    it('should set secure=true when port is 465', () => {
      // Temporarily override port to 465 for TLS test
      const originalPort = config.smtp.port;
      (config.smtp as { port: number }).port = 465;

      mockSendMail();
      createSmtpTransport();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true,
        }),
      );

      // Restore original port
      (config.smtp as { port: number }).port = originalPort;
    });

    it('should include auth when smtp.user is configured', () => {
      mockSendMail();

      createSmtpTransport();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: 'testuser', pass: 'testpass' },
        }),
      );
    });

    it('should omit auth when smtp.user is empty (MailHog mode)', () => {
      // Temporarily clear user to simulate MailHog (no auth needed)
      const originalUser = config.smtp.user;
      (config.smtp as { user: string }).user = '';

      mockSendMail();
      createSmtpTransport();

      // Should NOT have auth property
      const callArgs = (nodemailer.createTransport as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.auth).toBeUndefined();

      // Restore
      (config.smtp as { user: string }).user = originalUser;
    });

    it('should return an object with a send method', () => {
      mockSendMail();

      const transport = createSmtpTransport();

      expect(transport).toHaveProperty('send');
      expect(typeof transport.send).toBe('function');
    });
  });

  describe('send', () => {
    it('should call sendMail with the correct options', async () => {
      const sendMail = mockSendMail();

      const transport = createSmtpTransport();
      await transport.send(TEST_OPTIONS);

      expect(sendMail).toHaveBeenCalledWith({
        from: 'noreply@test.local', // Falls back to config.smtp.from
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<h1>Hello</h1>',
        text: 'Hello',
        replyTo: undefined,
      });
    });

    it('should use custom from address when provided', async () => {
      const sendMail = mockSendMail();

      const transport = createSmtpTransport();
      await transport.send({ ...TEST_OPTIONS, from: 'custom@example.com' });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@example.com' }),
      );
    });

    it('should pass replyTo when provided', async () => {
      const sendMail = mockSendMail();

      const transport = createSmtpTransport();
      await transport.send({ ...TEST_OPTIONS, replyTo: 'reply@example.com' });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ replyTo: 'reply@example.com' }),
      );
    });

    it('should return messageId, accepted, and rejected arrays', async () => {
      mockSendMail({
        messageId: '<msg-123@smtp.test.local>',
        accepted: ['user@example.com'],
        rejected: ['bad@example.com'],
      });

      const transport = createSmtpTransport();
      const result = await transport.send(TEST_OPTIONS);

      expect(result).toEqual({
        messageId: '<msg-123@smtp.test.local>',
        accepted: ['user@example.com'],
        rejected: ['bad@example.com'],
      });
    });

    it('should handle non-array accepted/rejected gracefully', async () => {
      // Some SMTP servers may return non-array values
      const sendMail = vi.fn().mockResolvedValue({
        messageId: '<msg@test>',
        accepted: null,
        rejected: null,
      });
      (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail });

      const transport = createSmtpTransport();
      const result = await transport.send(TEST_OPTIONS);

      // Should return empty arrays when values are not arrays
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toEqual([]);
    });

    it('should propagate transport errors to the caller', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('SMTP connection refused'));
      (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail });

      const transport = createSmtpTransport();

      await expect(transport.send(TEST_OPTIONS)).rejects.toThrow('SMTP connection refused');
    });
  });
});
