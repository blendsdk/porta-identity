/**
 * Two-factor authentication module — barrel export.
 *
 * Public API for the 2FA module. Re-exports types, errors, and crypto
 * utilities. Additional exports (otp, totp, recovery, repository, cache,
 * service) will be added as they are implemented in subsequent phases.
 */

// Types
export type {
  TwoFactorMethod,
  TwoFactorPolicy,
  UserTotp,
  OtpCode,
  RecoveryCode,
  TwoFactorSetupResult,
  TwoFactorStatus,
  InsertTotpData,
  UserTotpRow,
  OtpCodeRow,
  RecoveryCodeRow,
} from './types.js';

export {
  mapRowToUserTotp,
  mapRowToOtpCode,
  mapRowToRecoveryCode,
} from './types.js';

// Errors
export {
  TwoFactorError,
  TwoFactorNotEnabledError,
  TotpNotConfiguredError,
  OtpExpiredError,
  OtpInvalidError,
  RecoveryCodeInvalidError,
  RecoveryCodesExhaustedError,
  TwoFactorRequiredError,
  TwoFactorAlreadyEnabledError,
  TwoFactorCryptoError,
} from './errors.js';

// Crypto
export { encryptTotpSecret, decryptTotpSecret } from './crypto.js';

// OTP
export { generateOtpCode, hashOtpCode, verifyOtpCode } from './otp.js';

// TOTP
export {
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUri,
  verifyTotpCode,
} from './totp.js';

// Recovery codes
export {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './recovery.js';
