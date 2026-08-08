/**
 * TOTP (Time-based One-Time Password) utilities.
 *
 * Implements RFC 6238 TOTP using the `otpauth` library. Provides secret
 * generation, otpauth:// URI construction, QR code generation for
 * authenticator app enrollment, and code verification with a ±1 step
 * time window to accommodate clock drift.
 *
 * QR code generation uses the `qrcode` library to produce data URIs
 * that can be displayed inline in Handlebars templates.
 */

import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';

/** Default TOTP parameters matching the user_totp table defaults. */
const DEFAULT_ALGORITHM = 'SHA1';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;

/**
 * Generate a new TOTP secret.
 *
 * Creates a 20-byte (160-bit) random secret, which is the standard
 * size for SHA-1-based TOTP as recommended by RFC 4226 §4.
 * The secret is returned as a base32-encoded string suitable for
 * storage (after encryption) and otpauth:// URI construction.
 *
 * @returns Base32-encoded TOTP secret
 */
export function generateTotpSecret(): string {
  // Secret.fromRaw generates using crypto.randomBytes internally
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

/**
 * Generate an otpauth:// URI for authenticator app enrollment.
 *
 * The URI encodes the secret, issuer, account name, and TOTP parameters
 * in a format understood by Google Authenticator, Authy, 1Password, etc.
 *
 * @param secret - Base32-encoded TOTP secret
 * @param userEmail - User's email address (displayed as account name)
 * @param issuer - Service name (e.g., "Porta" or org slug)
 * @returns otpauth:// URI string
 */
export function generateTotpUri(
  secret: string,
  userEmail: string,
  issuer: string,
): string {
  const totp = new TOTP({
    issuer,
    label: userEmail,
    algorithm: DEFAULT_ALGORITHM,
    digits: DEFAULT_DIGITS,
    period: DEFAULT_PERIOD,
    secret: Secret.fromBase32(secret),
  });

  return totp.toString();
}

/**
 * Generate a QR code data URI from an otpauth:// URI.
 *
 * The returned data URI can be used directly in an <img src="..."> tag
 * in Handlebars templates. Uses SVG format for crisp rendering at any size.
 *
 * @param uri - otpauth:// URI to encode
 * @returns Data URI string (data:image/svg+xml;base64,...)
 */
export async function generateQrCodeDataUri(uri: string): Promise<string> {
  // QRCode.toDataURL generates a PNG data URI by default
  // Using SVG would require toBuffer + manual base64, so PNG is simpler
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M', // Medium error correction — good balance
    margin: 2,
    width: 256,
  });
}

/**
 * Verify a TOTP code against a secret.
 *
 * Allows a ±1 step time window (i.e., the current 30-second window
 * plus one window before and one after) to accommodate minor clock
 * drift between the server and the user's authenticator app.
 *
 * @param code - The 6-digit TOTP code entered by the user
 * @param secret - Base32-encoded TOTP secret
 * @returns True if the code is valid within the time window
 */
export function verifyTotpCode(code: string, secret: string): boolean {
  const totp = new TOTP({
    algorithm: DEFAULT_ALGORITHM,
    digits: DEFAULT_DIGITS,
    period: DEFAULT_PERIOD,
    secret: Secret.fromBase32(secret),
  });

  // validate() returns the time step delta (0 for exact match, ±1 for adjacent)
  // or null if invalid. A window of 1 allows ±1 step.
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
