# Two-Factor Module: Core Implementation

> **Document**: 04-two-factor-module.md
> **Parent**: [Index](00-index.md)

## Overview

New `src/two-factor/` module following the project's functional architecture pattern. Contains types, errors, crypto utilities, OTP/TOTP logic, repository, cache, and service layers.

## Architecture

```
src/two-factor/
  index.ts           # Barrel export
  types.ts           # TwoFactorMethod, UserTotp, OtpCode, RecoveryCode types
  errors.ts          # TwoFactorError, TotpNotConfiguredError, OtpExpiredError, etc.
  crypto.ts          # AES-256-GCM encrypt/decrypt for TOTP secrets
  otp.ts             # Email OTP: generate 6-digit code, SHA-256 hash, verify
  totp.ts            # TOTP: generate secret, generate URI, verify code (otpauth lib)
  recovery.ts        # Recovery codes: generate, hash (Argon2id), verify
  repository.ts      # PostgreSQL CRUD for all 3 tables
  cache.ts           # Redis cache for user 2FA state
  service.ts         # Business logic: setup, verify, disable, recovery
```

## Types (`types.ts`)

```typescript
export type TwoFactorMethod = 'email' | 'totp';
export type TwoFactorPolicy = 'optional' | 'required_email' | 'required_totp' | 'required_any';

export interface UserTotp {
  id: string;
  userId: string;
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  algorithm: string;
  digits: number;
  period: number;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtpCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface RecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
}

export interface TwoFactorSetupResult {
  method: TwoFactorMethod;
  recoveryCodes: string[];  // plaintext codes, shown once
  totpUri?: string;         // otpauth:// URI (TOTP only)
  qrCodeDataUri?: string;   // data:image/svg+xml (TOTP only)
}

export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod | null;
  totpConfigured: boolean;
  recoveryCodesRemaining: number;
}
```

## Crypto (`crypto.ts`)

```typescript
/** Encrypt a TOTP secret with AES-256-GCM using the app-level encryption key. */
export function encryptTotpSecret(plaintext: string, encryptionKey: string): { encrypted: string; iv: string; tag: string };

/** Decrypt a TOTP secret from its encrypted form. */
export function decryptTotpSecret(encrypted: string, iv: string, tag: string, encryptionKey: string): string;
```

Uses Node.js `crypto.createCipheriv('aes-256-gcm', key, iv)`. The `encryptionKey` comes from `TWO_FACTOR_ENCRYPTION_KEY` env var (32 bytes, hex-encoded = 64 chars).

## OTP (`otp.ts`)

```typescript
/** Generate a cryptographically random 6-digit code. */
export function generateOtpCode(): string;

/** SHA-256 hash an OTP code for storage. */
export function hashOtpCode(code: string): string;

/** Verify an OTP code against its hash. */
export function verifyOtpCode(code: string, hash: string): boolean;
```

## TOTP (`totp.ts`)

```typescript
/** Generate a new TOTP secret (20-byte, base32-encoded). */
export function generateTotpSecret(): string;

/** Generate an otpauth:// URI for authenticator app enrollment. */
export function generateTotpUri(secret: string, userEmail: string, issuer: string): string;

/** Generate a QR code data URI from an otpauth:// URI. */
export async function generateQrCodeDataUri(uri: string): Promise<string>;

/** Verify a TOTP code against a secret with ±1 step window. */
export function verifyTotpCode(code: string, secret: string): boolean;
```

Uses `otpauth` library for TOTP class and `qrcode` for QR generation.

## Recovery (`recovery.ts`)

```typescript
/** Generate N recovery codes (default 10) in XXXX-XXXX format. */
export function generateRecoveryCodes(count?: number): string[];

/** Hash a recovery code with Argon2id (same params as passwords). */
export async function hashRecoveryCode(code: string): Promise<string>;

/** Verify a recovery code against an Argon2id hash. */
export async function verifyRecoveryCode(code: string, hash: string): Promise<boolean>;
```

## Repository (`repository.ts`)

```typescript
// TOTP operations
export async function insertTotp(data: InsertTotpData): Promise<UserTotp>;
export async function findTotpByUserId(userId: string): Promise<UserTotp | null>;
export async function markTotpVerified(userId: string): Promise<void>;
export async function deleteTotp(userId: string): Promise<void>;

// OTP code operations
export async function insertOtpCode(userId: string, codeHash: string, expiresAt: Date): Promise<OtpCode>;
export async function findActiveOtpCodes(userId: string): Promise<OtpCode[]>;
export async function markOtpCodeUsed(codeId: string): Promise<void>;
export async function deleteExpiredOtpCodes(userId: string): Promise<number>;
export async function countActiveOtpCodes(userId: string): Promise<number>;

// Recovery code operations
export async function insertRecoveryCodes(userId: string, codeHashes: string[]): Promise<void>;
export async function findUnusedRecoveryCodes(userId: string): Promise<RecoveryCode[]>;
export async function markRecoveryCodeUsed(codeId: string): Promise<void>;
export async function deleteAllRecoveryCodes(userId: string): Promise<void>;
export async function countUnusedRecoveryCodes(userId: string): Promise<number>;
```

## Service (`service.ts`)

```typescript
// Setup
export async function setupEmailOtp(userId: string, orgId: string): Promise<TwoFactorSetupResult>;
export async function setupTotp(userId: string, email: string, orgSlug: string): Promise<TwoFactorSetupResult>;
export async function confirmTotpSetup(userId: string, code: string): Promise<boolean>;

// Verification
export async function sendOtpCode(userId: string, email: string, orgId: string): Promise<void>;
export async function verifyOtp(userId: string, code: string): Promise<boolean>;
export async function verifyTotp(userId: string, code: string): Promise<boolean>;
export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean>;

// Management
export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus>;
export async function disableTwoFactor(userId: string): Promise<void>;
export async function regenerateRecoveryCodes(userId: string): Promise<string[]>;

// Policy
export function requiresTwoFactor(org: Organization, user: User): boolean;
export function determineTwoFactorMethod(org: Organization, user: User): TwoFactorMethod | null;
```

## Testing Requirements

- Unit tests for crypto (encrypt/decrypt roundtrip, invalid key)
- Unit tests for OTP (generation, hashing, verification)
- Unit tests for TOTP (secret generation, URI format, code verification)
- Unit tests for recovery codes (generation, format, hashing)
- Unit tests for repository (mocked DB)
- Unit tests for service (mocked dependencies)
- Integration tests for repository (real DB)
