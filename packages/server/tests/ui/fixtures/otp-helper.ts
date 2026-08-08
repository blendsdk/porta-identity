/**
 * OTP code extraction helper for Playwright UI tests.
 *
 * Extracts 6-digit OTP verification codes from MailHog email messages.
 * The server sends OTP codes in the email subject line in the format:
 *   "Your verification code: 123456"
 *
 * This helper is shared across `two-factor.spec.ts` and
 * `two-factor-edge-cases.spec.ts` to avoid duplication.
 *
 * @example
 * ```ts
 * import { extractOtpCode } from '../fixtures/otp-helper.js';
 *
 * const email = await mailCapture.waitForEmail(userEmail, { subject: 'verification' });
 * const code = extractOtpCode(email);
 * expect(code).toBeTruthy();
 * ```
 */

/**
 * Extract a 6-digit OTP code from an email message.
 *
 * Tries the subject line first (format: "Your verification code: XXXXXX"),
 * then falls back to searching the body for any standalone 6-digit number.
 *
 * @param message - Email message with subject and body fields
 * @returns The 6-digit OTP code string, or null if not found
 */
export function extractOtpCode(message: { subject: string; body: string }): string | null {
  // Try subject first — format: "Your verification code: XXXXXX"
  const subjectMatch = message.subject.match(/verification code:\s*(\d+)/i);
  if (subjectMatch) return subjectMatch[1];

  // Fallback: try the body for a standalone 6-digit code
  const bodyMatch = message.body.match(/\b(\d{6})\b/);
  return bodyMatch ? bodyMatch[1] : null;
}
