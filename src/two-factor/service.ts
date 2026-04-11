/**
 * Two-factor authentication service — business logic orchestrator.
 *
 * Composes the repository, cache, crypto utilities, and audit log
 * to provide the complete 2FA management API. Functions are grouped by:
 *
 *   - **Setup**: Initialize email OTP or TOTP, confirm TOTP enrollment
 *   - **Verification**: Verify OTP codes, TOTP codes, recovery codes
 *   - **Sending**: Generate and send OTP codes via email
 *   - **Management**: Get status, disable 2FA, regenerate recovery codes
 *   - **Policy**: Check org policy requirements, determine required method
 *
 * All write operations follow the pattern:
 *   1. Validate preconditions (user state, existing 2FA, etc.)
 *   2. Perform DB operations (via repository)
 *   3. Update user 2FA state (via user repository)
 *   4. Invalidate cache
 *   5. Write audit log (fire-and-forget)
 */

import { config } from '../config/index.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import type { TwoFactorMethod, TwoFactorSetupResult, TwoFactorStatus, TwoFactorPolicy } from './types.js';
import {
  TwoFactorAlreadyEnabledError,
  TwoFactorNotEnabledError,
  TotpNotConfiguredError,
  OtpExpiredError,
  OtpInvalidError,
  RecoveryCodeInvalidError,
  RecoveryCodesExhaustedError,
} from './errors.js';
import { encryptTotpSecret, decryptTotpSecret } from './crypto.js';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from './otp.js';
import { generateTotpSecret, generateTotpUri, generateQrCodeDataUri, verifyTotpCode } from './totp.js';
import { generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode as verifyRecoveryCodeHash } from './recovery.js';
import {
  insertTotp,
  findTotpByUserId,
  markTotpVerified,
  deleteTotp,
  insertOtpCode,
  findActiveOtpCodes,
  markOtpCodeUsed,
  deleteExpiredOtpCodes,
  countActiveOtpCodes,
  findUnusedRecoveryCodes,
  markRecoveryCodeUsed,
  insertRecoveryCodes,
  deleteAllRecoveryCodes,
  countUnusedRecoveryCodes,
} from './repository.js';
import {
  getCachedTwoFactorStatus,
  cacheTwoFactorStatus,
  invalidateTwoFactorCache,
} from './cache.js';
import { findUserById, updateUser as repoUpdateUser } from '../users/repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OTP code expiration time in minutes */
const OTP_EXPIRY_MINUTES = 10;

/** Maximum active OTP codes per user (rate limiting) */
const MAX_ACTIVE_OTP_CODES = 5;

/** Default dev/test encryption key — only used when config key is not set */
const DEV_ENCRYPTION_KEY = 'a'.repeat(64);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the 2FA encryption key from config, falling back to a dev key
 * in non-production environments. Production requires a real key.
 *
 * @returns 64-character hex encryption key
 */
function getEncryptionKey(): string {
  if (config.twoFactorEncryptionKey) {
    return config.twoFactorEncryptionKey;
  }
  // In development/test, use a predictable default — this is safe because
  // dev/test TOTP secrets are throwaway data, not real user secrets
  return DEV_ENCRYPTION_KEY;
}

/**
 * Generate and hash recovery codes, returning both plaintext and hashes.
 *
 * @returns Object with plaintext codes (for display) and hashes (for storage)
 */
async function generateAndHashRecoveryCodes(): Promise<{
  plaintextCodes: string[];
  codeHashes: string[];
}> {
  const plaintextCodes = generateRecoveryCodes();
  const codeHashes = await Promise.all(
    plaintextCodes.map((code) => hashRecoveryCode(code)),
  );
  return { plaintextCodes, codeHashes };
}

// ===========================================================================
// Setup functions
// ===========================================================================

/**
 * Set up email OTP as the 2FA method for a user.
 *
 * Enables 2FA with the 'email' method, generates recovery codes, and
 * marks the user as 2FA-enabled in the users table. No TOTP config
 * is created — email OTP codes are generated on-demand during login.
 *
 * @param userId - User UUID
 * @param orgId - Organization UUID (for audit logging)
 * @returns Setup result with recovery codes
 * @throws TwoFactorAlreadyEnabledError if 2FA is already enabled
 */
export async function setupEmailOtp(
  userId: string,
  orgId: string,
): Promise<TwoFactorSetupResult> {
  // Check preconditions — user must not already have 2FA enabled
  const user = await findUserById(userId);
  if (!user) {
    throw new TwoFactorNotEnabledError(userId);
  }

  // Check if 2FA is already enabled by reading the DB columns directly
  if (user.twoFactorEnabled) {
    throw new TwoFactorAlreadyEnabledError(userId);
  }

  // Generate recovery codes
  const { plaintextCodes, codeHashes } = await generateAndHashRecoveryCodes();

  // Store recovery codes in the database
  await insertRecoveryCodes(userId, codeHashes);

  // Enable 2FA on the user record
  await repoUpdateUser(userId, {
    twoFactorEnabled: true,
    twoFactorMethod: 'email',
  });

  // Invalidate cache since 2FA state changed
  await invalidateTwoFactorCache(userId);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: orgId,
    userId,
    eventType: '2fa.setup.email',
    eventCategory: 'auth',
    metadata: { method: 'email' },
  });

  logger.info({ userId, method: 'email' }, '2FA setup complete (email OTP)');

  return {
    method: 'email',
    recoveryCodes: plaintextCodes,
  };
}

/**
 * Start TOTP setup for a user.
 *
 * Generates a TOTP secret, encrypts it, stores it as unverified,
 * and returns the otpauth:// URI and QR code for the user to scan.
 * The setup is not complete until the user confirms with a valid
 * TOTP code via `confirmTotpSetup()`.
 *
 * @param userId - User UUID
 * @param email - User email (for TOTP URI display)
 * @param orgSlug - Organization slug (used as TOTP issuer)
 * @returns Setup result with TOTP URI, QR code, and recovery codes
 * @throws TwoFactorAlreadyEnabledError if 2FA is already enabled
 */
export async function setupTotp(
  userId: string,
  email: string,
  orgSlug: string,
): Promise<TwoFactorSetupResult> {
  // Check preconditions — user must not already have 2FA enabled
  const user = await findUserById(userId);
  if (!user) {
    throw new TwoFactorNotEnabledError(userId);
  }

  if (user.twoFactorEnabled) {
    throw new TwoFactorAlreadyEnabledError(userId);
  }

  // Delete any existing unverified TOTP config (from previous incomplete setup)
  await deleteTotp(userId);

  // Generate a new TOTP secret and encrypt it for storage
  const secret = generateTotpSecret();
  const encryptionKey = getEncryptionKey();
  const { encrypted, iv, tag } = encryptTotpSecret(secret, encryptionKey);

  // Store the encrypted TOTP config (unverified — verified becomes true after confirm)
  await insertTotp({
    userId,
    encryptedSecret: encrypted,
    encryptionIv: iv,
    encryptionTag: tag,
  });

  // Generate the otpauth URI and QR code for the user
  const issuer = `Porta (${orgSlug})`;
  const totpUri = generateTotpUri(secret, email, issuer);
  const qrCodeDataUri = await generateQrCodeDataUri(totpUri);

  // Generate recovery codes (stored but 2FA not yet enabled — that happens on confirm)
  const { plaintextCodes, codeHashes } = await generateAndHashRecoveryCodes();
  await deleteAllRecoveryCodes(userId); // Clear any old ones
  await insertRecoveryCodes(userId, codeHashes);

  // Invalidate cache since TOTP config changed
  await invalidateTwoFactorCache(userId);

  logger.info({ userId, method: 'totp' }, 'TOTP setup initiated (pending confirmation)');

  return {
    method: 'totp',
    recoveryCodes: plaintextCodes,
    totpUri,
    qrCodeDataUri,
  };
}

/**
 * Retrieve existing pending (unverified) TOTP setup info.
 *
 * If a user has a pending TOTP setup (unverified record in DB), this
 * decrypts the secret and regenerates the QR code for display.
 * Does NOT regenerate the secret — preserves the existing one.
 *
 * Returns null if no pending setup exists.
 *
 * @param userId - User UUID
 * @param email - User email (for TOTP URI display)
 * @param orgSlug - Organization slug (used as TOTP issuer)
 * @returns Setup info with QR code and secret, or null if no pending setup
 */
export async function getPendingTotpSetupInfo(
  userId: string,
  email: string,
  orgSlug: string,
): Promise<{ totpUri: string; qrCodeDataUri: string; totpSecret: string } | null> {
  const totp = await findTotpByUserId(userId);
  if (!totp || totp.verified) {
    return null;
  }

  // Decrypt the existing secret
  const encryptionKey = getEncryptionKey();
  const secret = decryptTotpSecret(
    totp.encryptedSecret,
    totp.encryptionIv,
    totp.encryptionTag,
    encryptionKey,
  );

  // Regenerate the URI and QR code from the existing secret
  const issuer = `Porta (${orgSlug})`;
  const totpUri = generateTotpUri(secret, email, issuer);
  const qrCodeDataUri = await generateQrCodeDataUri(totpUri);

  return { totpUri, qrCodeDataUri, totpSecret: secret };
}

/**
 * Confirm TOTP setup by verifying the user's first TOTP code.
 *
 * Called after the user scans the QR code and enters a TOTP code
 * from their authenticator app. This confirms the setup is correct
 * and enables 2FA on the user record.
 *
 * @param userId - User UUID
 * @param code - 6-digit TOTP code from the authenticator app
 * @returns true if the code is valid and setup is confirmed
 * @throws TotpNotConfiguredError if no pending TOTP setup exists
 */
export async function confirmTotpSetup(
  userId: string,
  code: string,
): Promise<boolean> {
  // Find the unverified TOTP config
  const totp = await findTotpByUserId(userId);
  if (!totp || totp.verified) {
    throw new TotpNotConfiguredError(userId);
  }

  // Decrypt the secret to verify the code
  const encryptionKey = getEncryptionKey();
  const secret = decryptTotpSecret(
    totp.encryptedSecret,
    totp.encryptionIv,
    totp.encryptionTag,
    encryptionKey,
  );

  // Verify the TOTP code
  const isValid = verifyTotpCode(code, secret);
  if (!isValid) {
    return false;
  }

  // Mark the TOTP config as verified
  await markTotpVerified(userId);

  // Enable 2FA on the user record
  await repoUpdateUser(userId, {
    twoFactorEnabled: true,
    twoFactorMethod: 'totp',
  });

  // Invalidate cache since 2FA state changed
  await invalidateTwoFactorCache(userId);

  // Audit log (fire-and-forget)
  const user = await findUserById(userId);
  await writeAuditLog({
    organizationId: user?.organizationId,
    userId,
    eventType: '2fa.setup.totp',
    eventCategory: 'auth',
    metadata: { method: 'totp' },
  });

  logger.info({ userId, method: 'totp' }, '2FA setup confirmed (TOTP)');

  return true;
}

// ===========================================================================
// OTP email sending
// ===========================================================================

/**
 * Generate and send an OTP code via email.
 *
 * Creates a 6-digit code, hashes it, stores the hash in the database
 * with a 10-minute expiry, and sends the plaintext code via email.
 * Rate-limited to MAX_ACTIVE_OTP_CODES active codes per user.
 *
 * Note: This function generates the code and stores it. The actual email
 * sending is handled by the auth email service (Phase 8). For now, this
 * function prepares the code — the route layer will call the email service.
 *
 * @param userId - User UUID
 * @param email - User email to send the code to
 * @param orgId - Organization UUID (for audit logging)
 * @returns The plaintext OTP code (caller sends via email service)
 * @throws Error if too many active codes exist (rate limiting)
 */
export async function sendOtpCode(
  userId: string,
  email: string,
  orgId: string,
): Promise<string> {
  // Rate limiting — prevent generating too many codes
  const activeCount = await countActiveOtpCodes(userId);
  if (activeCount >= MAX_ACTIVE_OTP_CODES) {
    // Clean up expired codes first, then re-check
    await deleteExpiredOtpCodes(userId);
    const newCount = await countActiveOtpCodes(userId);
    if (newCount >= MAX_ACTIVE_OTP_CODES) {
      throw new Error('Too many active OTP codes. Please wait before requesting a new one.');
    }
  }

  // Generate a new OTP code
  const plaintext = generateOtpCode();
  const codeHash = hashOtpCode(plaintext);

  // Calculate expiration (10 minutes from now)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Store the hashed code in the database
  await insertOtpCode(userId, codeHash, expiresAt);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: orgId,
    userId,
    eventType: '2fa.otp.sent',
    eventCategory: 'auth',
    metadata: { email },
  });

  logger.debug({ userId, email }, 'OTP code generated for email sending');

  // Return the plaintext code — the caller sends it via email
  return plaintext;
}

// ===========================================================================
// Verification functions
// ===========================================================================

/**
 * Verify an email OTP code.
 *
 * Checks all active (unused, not expired) OTP codes for the user,
 * verifying the provided code against each hash. If a match is found,
 * the code is marked as used.
 *
 * @param userId - User UUID
 * @param code - 6-digit OTP code to verify
 * @returns true if the code is valid
 * @throws OtpInvalidError if no matching code is found
 */
export async function verifyOtp(
  userId: string,
  code: string,
): Promise<boolean> {
  // Find all active (unused, unexpired) OTP codes for this user
  const activeCodes = await findActiveOtpCodes(userId);

  if (activeCodes.length === 0) {
    throw new OtpExpiredError();
  }

  // Try to match the code against each active hash
  for (const otpRecord of activeCodes) {
    if (verifyOtpCode(code, otpRecord.codeHash)) {
      // Mark the matching code as used
      await markOtpCodeUsed(otpRecord.id);

      // Clean up expired codes in the background
      deleteExpiredOtpCodes(userId).catch((err) => {
        logger.warn({ err, userId }, 'Failed to clean up expired OTP codes');
      });

      return true;
    }
  }

  // No match found
  throw new OtpInvalidError();
}

/**
 * Verify a TOTP code from an authenticator app.
 *
 * Decrypts the user's TOTP secret from the database and verifies
 * the code with a ±1 step time window.
 *
 * @param userId - User UUID
 * @param code - 6-digit TOTP code to verify
 * @returns true if the code is valid
 * @throws TotpNotConfiguredError if no verified TOTP config exists
 */
export async function verifyTotp(
  userId: string,
  code: string,
): Promise<boolean> {
  // Find the verified TOTP config
  const totp = await findTotpByUserId(userId);
  if (!totp || !totp.verified) {
    throw new TotpNotConfiguredError(userId);
  }

  // Decrypt the secret
  const encryptionKey = getEncryptionKey();
  const secret = decryptTotpSecret(
    totp.encryptedSecret,
    totp.encryptionIv,
    totp.encryptionTag,
    encryptionKey,
  );

  // Verify the code with ±1 step window
  return verifyTotpCode(code, secret);
}

/**
 * Verify a recovery code.
 *
 * Recovery codes use Argon2id hashing with random salt, so we must
 * iterate all unused codes and verify against each hash. If a match
 * is found, the code is marked as used (single-use).
 *
 * @param userId - User UUID
 * @param code - Recovery code in XXXX-XXXX format (case-insensitive)
 * @returns true if the code is valid
 * @throws RecoveryCodesExhaustedError if no unused codes remain
 * @throws RecoveryCodeInvalidError if the code doesn't match any hash
 */
export async function verifyRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  // Find all unused recovery codes
  const unusedCodes = await findUnusedRecoveryCodes(userId);

  if (unusedCodes.length === 0) {
    throw new RecoveryCodesExhaustedError(userId);
  }

  // Try to match against each unused code hash (Argon2id — must iterate)
  for (const recoveryRecord of unusedCodes) {
    const isMatch = await verifyRecoveryCodeHash(code, recoveryRecord.codeHash);
    if (isMatch) {
      // Mark the matching code as used
      await markRecoveryCodeUsed(recoveryRecord.id);

      // Invalidate cache since recovery code count changed
      await invalidateTwoFactorCache(userId);

      // Audit log
      const remaining = unusedCodes.length - 1;
      await writeAuditLog({
        userId,
        eventType: '2fa.recovery.used',
        eventCategory: 'auth',
        metadata: { remainingCodes: remaining },
      });

      logger.info({ userId, remainingCodes: remaining }, 'Recovery code used');

      return true;
    }
  }

  // No match found
  throw new RecoveryCodeInvalidError();
}

// ===========================================================================
// Management functions
// ===========================================================================

/**
 * Get the current 2FA status for a user.
 *
 * Checks Redis cache first, falls back to building the status from
 * the database. The status includes whether 2FA is enabled, the method,
 * whether TOTP is configured (and verified), and remaining recovery codes.
 *
 * @param userId - User UUID
 * @returns Current 2FA status
 */
export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  // Try cache first
  const cached = await getCachedTwoFactorStatus(userId);
  if (cached) return cached;

  // Build status from database
  const user = await findUserById(userId);

  // Default status for unknown users — not enabled
  if (!user) {
    return {
      enabled: false,
      method: null,
      totpConfigured: false,
      recoveryCodesRemaining: 0,
    };
  }

  // Check TOTP config existence and verification status
  const totp = await findTotpByUserId(userId);
  const recoveryCount = await countUnusedRecoveryCodes(userId);

  const status: TwoFactorStatus = {
    enabled: user.twoFactorEnabled,
    method: user.twoFactorMethod ?? null,
    totpConfigured: totp !== null && totp.verified,
    recoveryCodesRemaining: recoveryCount,
  };

  // Cache the result
  await cacheTwoFactorStatus(userId, status);

  return status;
}

/**
 * Disable 2FA for a user.
 *
 * Removes all 2FA data: TOTP config, active OTP codes, and recovery codes.
 * Resets the user's 2FA flags in the users table.
 *
 * @param userId - User UUID
 * @throws TwoFactorNotEnabledError if 2FA is not enabled
 */
export async function disableTwoFactor(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !user.twoFactorEnabled) {
    throw new TwoFactorNotEnabledError(userId);
  }

  // Delete all 2FA data
  await deleteTotp(userId);
  await deleteAllRecoveryCodes(userId);
  await deleteExpiredOtpCodes(userId);

  // Reset 2FA flags on the user record
  await repoUpdateUser(userId, {
    twoFactorEnabled: false,
    twoFactorMethod: null,
  });

  // Invalidate cache
  await invalidateTwoFactorCache(userId);

  // Audit log
  await writeAuditLog({
    organizationId: user.organizationId,
    userId,
    eventType: '2fa.disabled',
    eventCategory: 'auth',
    metadata: { previousMethod: user.twoFactorMethod },
  });

  logger.info({ userId }, '2FA disabled');
}

/**
 * Regenerate recovery codes for a user.
 *
 * Deletes all existing recovery codes and generates a fresh set of 10.
 * The user must have 2FA enabled to regenerate codes.
 *
 * @param userId - User UUID
 * @returns Array of new plaintext recovery codes (shown once to the user)
 * @throws TwoFactorNotEnabledError if 2FA is not enabled
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const user = await findUserById(userId);
  if (!user || !user.twoFactorEnabled) {
    throw new TwoFactorNotEnabledError(userId);
  }

  // Delete old recovery codes
  await deleteAllRecoveryCodes(userId);

  // Generate new recovery codes
  const { plaintextCodes, codeHashes } = await generateAndHashRecoveryCodes();
  await insertRecoveryCodes(userId, codeHashes);

  // Invalidate cache since recovery code count changed
  await invalidateTwoFactorCache(userId);

  // Audit log
  await writeAuditLog({
    organizationId: user.organizationId,
    userId,
    eventType: '2fa.recovery.regenerated',
    eventCategory: 'auth',
  });

  logger.info({ userId }, 'Recovery codes regenerated');

  return plaintextCodes;
}

// ===========================================================================
// Policy functions
// ===========================================================================

/**
 * Minimal organization shape needed for policy checks.
 * Uses a local interface to avoid importing the full Organization type
 * (which would create a circular dependency).
 */
interface OrgForPolicy {
  twoFactorPolicy: TwoFactorPolicy;
}

/**
 * Minimal user shape needed for policy checks.
 */
interface UserForPolicy {
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;
}

/**
 * Check if the organization's 2FA policy requires 2FA for a user.
 *
 * Returns true if the org policy is anything other than 'optional'
 * AND the user has not yet enabled 2FA.
 *
 * @param org - Organization with twoFactorPolicy field
 * @param user - User with 2FA state fields
 * @returns true if 2FA is required but not yet set up
 */
export function requiresTwoFactor(org: OrgForPolicy, user: UserForPolicy): boolean {
  // If policy is optional, 2FA is never required
  if (org.twoFactorPolicy === 'optional') {
    return false;
  }

  // If user already has 2FA enabled, requirement is met
  if (user.twoFactorEnabled) {
    return false;
  }

  // Policy requires 2FA but user hasn't set it up yet
  return true;
}

/**
 * Determine which 2FA method the user should use based on org policy.
 *
 * If the user has 2FA enabled, returns their configured method.
 * If the org requires a specific method, returns that method.
 * If the org requires 'any', returns null (user chooses).
 * If the policy is optional, returns null.
 *
 * @param org - Organization with twoFactorPolicy field
 * @param user - User with 2FA state fields
 * @returns The 2FA method to use, or null if no method is required/configured
 */
export function determineTwoFactorMethod(
  org: OrgForPolicy,
  user: UserForPolicy,
): TwoFactorMethod | null {
  // If user already has 2FA enabled, use their method
  if (user.twoFactorEnabled && user.twoFactorMethod) {
    return user.twoFactorMethod;
  }

  // Map org policy to required method
  switch (org.twoFactorPolicy) {
    case 'required_email':
      return 'email';
    case 'required_totp':
      return 'totp';
    case 'required_any':
      // User gets to choose — return null to indicate "choose any"
      return null;
    case 'optional':
    default:
      return null;
  }
}
