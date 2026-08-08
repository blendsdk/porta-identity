-- Up Migration

-- Two-Factor Authentication (RD-12)
-- Adds per-org 2FA policy, per-user 2FA state, and tables for TOTP config,
-- email OTP codes, and recovery codes.

-- Add 2FA policy to organizations — controls whether 2FA is required for org members.
-- Values: 'optional' (default), 'required_email', 'required_totp', 'required_any'
ALTER TABLE organizations
  ADD COLUMN two_factor_policy VARCHAR(20) NOT NULL DEFAULT 'optional'
  CHECK (two_factor_policy IN ('optional', 'required_email', 'required_totp', 'required_any'));

-- Add 2FA state columns to users — tracks whether 2FA is enabled and which method.
ALTER TABLE users
  ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN two_factor_method VARCHAR(10) DEFAULT NULL
  CHECK (two_factor_method IN ('email', 'totp') OR two_factor_method IS NULL);

-- TOTP configuration per user (encrypted secrets)
-- Stores AES-256-GCM encrypted TOTP secret, one row per user.
CREATE TABLE user_totp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,          -- AES-256-GCM encrypted TOTP secret
  encryption_iv TEXT NOT NULL,             -- Initialization vector (hex)
  encryption_tag TEXT NOT NULL,            -- Authentication tag (hex)
  algorithm VARCHAR(10) NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  verified BOOLEAN NOT NULL DEFAULT false, -- true after first successful TOTP verification
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)                         -- one TOTP config per user
);

-- Email OTP codes (SHA-256 hashed, short-lived)
-- Stores hashed 6-digit codes sent via email for 2FA verification.
CREATE TABLE two_factor_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,          -- SHA-256 hex hash of 6-digit code
  expires_at TIMESTAMPTZ NOT NULL,         -- 10 minute expiry
  used_at TIMESTAMPTZ DEFAULT NULL,        -- NULL = unused, set on successful verification
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup of active (unused, not expired) OTP codes per user
CREATE INDEX idx_otp_codes_user_active
  ON two_factor_otp_codes(user_id, expires_at)
  WHERE used_at IS NULL;

-- Recovery codes (Argon2id hashed, single-use)
-- 10 codes generated during 2FA setup, each usable once as a backup.
CREATE TABLE two_factor_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                 -- Argon2id hash of recovery code
  used_at TIMESTAMPTZ DEFAULT NULL,        -- NULL = unused
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup of unused recovery codes per user
CREATE INDEX idx_recovery_codes_user
  ON two_factor_recovery_codes(user_id)
  WHERE used_at IS NULL;

-- Auto-update trigger for user_totp.updated_at
-- Uses the reusable trigger function defined in 001_extensions.sql
CREATE TRIGGER set_user_totp_updated_at
  BEFORE UPDATE ON user_totp
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

-- Drop tables and indexes (indexes are dropped automatically with tables)
DROP TRIGGER IF EXISTS set_user_totp_updated_at ON user_totp;
DROP TABLE IF EXISTS two_factor_recovery_codes;
DROP TABLE IF EXISTS two_factor_otp_codes;
DROP TABLE IF EXISTS user_totp;

-- Remove 2FA columns from users
ALTER TABLE users
  DROP COLUMN IF EXISTS two_factor_method,
  DROP COLUMN IF EXISTS two_factor_enabled;

-- Remove 2FA policy from organizations
ALTER TABLE organizations
  DROP COLUMN IF EXISTS two_factor_policy;
