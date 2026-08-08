/**
 * Two-factor authentication types and interfaces.
 *
 * Defines data structures for the 2FA module: method and policy enums,
 * TOTP configuration, email OTP codes, recovery codes, setup results,
 * and status tracking. Also provides row mapping functions for
 * converting snake_case PostgreSQL rows to camelCase TypeScript objects.
 *
 * These types are the foundation for all other two-factor modules
 * (repository, cache, service, routes, CLI).
 */

// ---------------------------------------------------------------------------
// 2FA method and policy
// ---------------------------------------------------------------------------

/** The 2FA method a user has configured. */
export type TwoFactorMethod = 'email' | 'totp';

/**
 * Organization-level 2FA policy — controls whether 2FA is required for members.
 * - 'optional': users may enable 2FA but it's not required
 * - 'required_email': all users must use email OTP
 * - 'required_totp': all users must use authenticator app (TOTP)
 * - 'required_any': all users must use any supported 2FA method
 */
export type TwoFactorPolicy = 'optional' | 'required_email' | 'required_totp' | 'required_any';

// ---------------------------------------------------------------------------
// TOTP configuration
// ---------------------------------------------------------------------------

/**
 * TOTP configuration record for a user.
 * Secrets are stored encrypted with AES-256-GCM; the IV and auth tag
 * are needed alongside the encryption key to decrypt.
 */
export interface UserTotp {
  id: string;
  userId: string;
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  algorithm: string;
  digits: number;
  period: number;
  /** True after the user has verified their first TOTP code. */
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Email OTP code
// ---------------------------------------------------------------------------

/**
 * Email OTP code record.
 * The actual 6-digit code is stored as a SHA-256 hash; the plaintext
 * is only ever sent via email and never stored.
 */
export interface OtpCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  /** Null if unused; set to a timestamp upon successful verification. */
  usedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Recovery code
// ---------------------------------------------------------------------------

/**
 * Recovery code record.
 * Each code is hashed with Argon2id and can only be used once.
 * Users receive 10 codes at 2FA setup time as a backup.
 */
export interface RecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  /** Null if unused; set to a timestamp upon successful verification. */
  usedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Setup and status
// ---------------------------------------------------------------------------

/**
 * Result returned after 2FA setup — contains everything the user needs
 * to complete enrollment. Recovery codes are shown only once.
 */
export interface TwoFactorSetupResult {
  method: TwoFactorMethod;
  /** Plaintext recovery codes — displayed once to the user. */
  recoveryCodes: string[];
  /** otpauth:// URI for authenticator app enrollment (TOTP only). */
  totpUri?: string;
  /** Data URI of QR code image for scanning (TOTP only). */
  qrCodeDataUri?: string;
}

/**
 * Current 2FA status for a user — used by the service layer and CLI.
 */
export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod | null;
  totpConfigured: boolean;
  recoveryCodesRemaining: number;
}

// ---------------------------------------------------------------------------
// Repository input types
// ---------------------------------------------------------------------------

/** Input data for inserting a new TOTP configuration. */
export interface InsertTotpData {
  userId: string;
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

// ---------------------------------------------------------------------------
// Database row mapping
// ---------------------------------------------------------------------------

/** Raw database row from the user_totp table (snake_case columns). */
export interface UserTotpRow {
  id: string;
  user_id: string;
  encrypted_secret: string;
  encryption_iv: string;
  encryption_tag: string;
  algorithm: string;
  digits: number;
  period: number;
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Raw database row from the two_factor_otp_codes table. */
export interface OtpCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

/** Raw database row from the two_factor_recovery_codes table. */
export interface RecoveryCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Date;
}

/**
 * Map a user_totp database row to a UserTotp object.
 *
 * @param row - Raw database row from the user_totp table
 * @returns Mapped UserTotp object with camelCase properties
 */
export function mapRowToUserTotp(row: UserTotpRow): UserTotp {
  return {
    id: row.id,
    userId: row.user_id,
    encryptedSecret: row.encrypted_secret,
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
    algorithm: row.algorithm,
    digits: row.digits,
    period: row.period,
    verified: row.verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a two_factor_otp_codes database row to an OtpCode object.
 *
 * @param row - Raw database row from the two_factor_otp_codes table
 * @returns Mapped OtpCode object with camelCase properties
 */
export function mapRowToOtpCode(row: OtpCodeRow): OtpCode {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

/**
 * Map a two_factor_recovery_codes database row to a RecoveryCode object.
 *
 * @param row - Raw database row from the two_factor_recovery_codes table
 * @returns Mapped RecoveryCode object with camelCase properties
 */
export function mapRowToRecoveryCode(row: RecoveryCodeRow): RecoveryCode {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}
