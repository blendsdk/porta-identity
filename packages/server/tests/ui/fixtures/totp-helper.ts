/**
 * TOTP code generation helper for Playwright UI tests.
 *
 * Generates valid TOTP codes using the `otpauth` library (same as
 * the server-side `src/two-factor/totp.ts`). Used by 2FA test specs
 * to produce codes that the server will accept.
 *
 * The TOTP secret is captured during global-setup when seeding the
 * TOTP test user, and passed via `testData.totpSecret`.
 *
 * @example
 * ```ts
 * import { generateTotpCode } from '../fixtures/totp-helper.js';
 *
 * const code = generateTotpCode(testData.totpSecret);
 * await page.fill('#code', code);
 * ```
 */

import { TOTP, Secret } from 'otpauth';

/**
 * Generate a valid 6-digit TOTP code for the given secret.
 *
 * Uses the same parameters as the server (SHA1, 6 digits, 30s period)
 * so the generated code will be accepted by `verifyTotpCode()`.
 *
 * @param secret - Base32-encoded TOTP secret (from testData.totpSecret)
 * @returns 6-digit TOTP code string
 */
export function generateTotpCode(secret: string): string {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate();
}
