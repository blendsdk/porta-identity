# Database Schema: Two-Factor Authentication

> **Document**: 03-database-schema.md
> **Parent**: [Index](00-index.md)

## Overview

Migration 012 adds 2FA support: new tables for TOTP config, OTP codes, and recovery codes, plus new columns on `organizations` and `users`.

## Migration: `migrations/012_two_factor.sql`

### Organization Changes

```sql
-- Add two_factor_policy to organizations
ALTER TABLE organizations
  ADD COLUMN two_factor_policy VARCHAR(20) NOT NULL DEFAULT 'optional'
  CHECK (two_factor_policy IN ('optional', 'required_email', 'required_totp', 'required_any'));
```

### User Changes

```sql
-- Add 2FA state columns to users
ALTER TABLE users
  ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN two_factor_method VARCHAR(10) DEFAULT NULL
  CHECK (two_factor_method IN ('email', 'totp') OR two_factor_method IS NULL);
```

### New Tables

```sql
-- TOTP configuration per user (encrypted secrets)
CREATE TABLE user_totp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,          -- AES-256-GCM encrypted TOTP secret
  encryption_iv TEXT NOT NULL,             -- Initialization vector (hex)
  encryption_tag TEXT NOT NULL,            -- Auth tag (hex)
  algorithm VARCHAR(10) NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  verified BOOLEAN NOT NULL DEFAULT false, -- true after first successful TOTP code
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)                         -- one TOTP config per user
);

-- Email OTP codes (SHA-256 hashed, short-lived)
CREATE TABLE two_factor_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,          -- SHA-256 hash of 6-digit code
  expires_at TIMESTAMPTZ NOT NULL,         -- 10 minute expiry
  used_at TIMESTAMPTZ DEFAULT NULL,        -- NULL = unused, set on verification
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by user + active codes
CREATE INDEX idx_otp_codes_user_active
  ON two_factor_otp_codes(user_id, expires_at)
  WHERE used_at IS NULL;

-- Recovery codes (Argon2id hashed, single-use)
CREATE TABLE two_factor_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                 -- Argon2id hash
  used_at TIMESTAMPTZ DEFAULT NULL,        -- NULL = unused
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_codes_user
  ON two_factor_recovery_codes(user_id)
  WHERE used_at IS NULL;

-- Auto-update trigger for user_totp
CREATE TRIGGER set_user_totp_updated_at
  BEFORE UPDATE ON user_totp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update seed data: set super-admin org to 'optional' (already default)
```

## Type Changes

### Organization Types (`src/organizations/types.ts`)

Add to `Organization` interface:
```typescript
twoFactorPolicy: 'optional' | 'required_email' | 'required_totp' | 'required_any';
```

Add to `OrganizationRow` and `mapRowToOrganization()`:
```typescript
two_factor_policy: string;
// maps to: twoFactorPolicy: row.two_factor_policy
```

### User Types (`src/users/types.ts`)

Add to `User` interface:
```typescript
twoFactorEnabled: boolean;
twoFactorMethod: 'email' | 'totp' | null;
```

Add to `UserRow` and `mapRowToUser()`:
```typescript
two_factor_enabled: boolean;
two_factor_method: string | null;
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Migration fails on existing data | All new columns have defaults — safe for existing rows |
| TOTP uniqueness violation | UNIQUE(user_id) — upsert or delete-then-insert |
| Orphan OTP codes | CASCADE delete when user is deleted |
| Recovery codes exhausted | User must contact admin or re-enroll 2FA |
