/**
 * Two-factor authentication error types.
 *
 * Custom error classes for 2FA-specific business rule violations.
 * Route handlers map these to appropriate HTTP status codes:
 *   - TwoFactorNotEnabledError → 400
 *   - TotpNotConfiguredError → 400
 *   - OtpExpiredError → 400
 *   - OtpInvalidError → 400
 *   - RecoveryCodeInvalidError → 400
 *   - RecoveryCodesExhaustedError → 400
 *   - TwoFactorRequiredError → 403
 *   - TwoFactorAlreadyEnabledError → 409
 */

/**
 * Base error class for all 2FA errors.
 * Provides a common type for catch blocks and error mapping.
 */
export class TwoFactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

/**
 * Thrown when a 2FA operation is attempted but the user has not enabled 2FA.
 * Example: trying to verify a TOTP code without having 2FA set up.
 */
export class TwoFactorNotEnabledError extends TwoFactorError {
  constructor(userId: string) {
    super(`Two-factor authentication is not enabled for user: ${userId}`);
    this.name = 'TwoFactorNotEnabledError';
  }
}

/**
 * Thrown when a TOTP operation is attempted but no TOTP config exists.
 * Example: trying to verify a TOTP code without having configured TOTP.
 */
export class TotpNotConfiguredError extends TwoFactorError {
  constructor(userId: string) {
    super(`TOTP is not configured for user: ${userId}`);
    this.name = 'TotpNotConfiguredError';
  }
}

/**
 * Thrown when an OTP code has expired (past its expires_at timestamp).
 */
export class OtpExpiredError extends TwoFactorError {
  constructor() {
    super('OTP code has expired');
    this.name = 'OtpExpiredError';
  }
}

/**
 * Thrown when an OTP code does not match the stored hash.
 */
export class OtpInvalidError extends TwoFactorError {
  constructor() {
    super('Invalid OTP code');
    this.name = 'OtpInvalidError';
  }
}

/**
 * Thrown when a recovery code does not match any unused stored hash.
 */
export class RecoveryCodeInvalidError extends TwoFactorError {
  constructor() {
    super('Invalid recovery code');
    this.name = 'RecoveryCodeInvalidError';
  }
}

/**
 * Thrown when all recovery codes have been used and none remain.
 * The user must contact an admin or re-enroll 2FA.
 */
export class RecoveryCodesExhaustedError extends TwoFactorError {
  constructor(userId: string) {
    super(`All recovery codes have been used for user: ${userId}`);
    this.name = 'RecoveryCodesExhaustedError';
  }
}

/**
 * Thrown when the organization's 2FA policy requires 2FA but the user
 * has not yet set it up. Used during login flow to redirect to setup.
 */
export class TwoFactorRequiredError extends TwoFactorError {
  constructor(userId: string) {
    super(`Two-factor authentication is required for user: ${userId}`);
    this.name = 'TwoFactorRequiredError';
  }
}

/**
 * Thrown when a user tries to set up 2FA but already has it enabled.
 * They must disable existing 2FA first before re-enrolling.
 */
export class TwoFactorAlreadyEnabledError extends TwoFactorError {
  constructor(userId: string) {
    super(`Two-factor authentication is already enabled for user: ${userId}`);
    this.name = 'TwoFactorAlreadyEnabledError';
  }
}

/**
 * Thrown when a 2FA encryption/decryption operation fails.
 * Usually indicates a wrong or missing TWO_FACTOR_ENCRYPTION_KEY.
 */
export class TwoFactorCryptoError extends TwoFactorError {
  constructor(message: string) {
    super(`Two-factor crypto error: ${message}`);
    this.name = 'TwoFactorCryptoError';
  }
}
