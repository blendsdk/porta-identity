-- Up Migration

-- Add failed login tracking columns for account lockout.
-- Tracks consecutive failed password attempts per user and enables
-- automatic account lockout after exceeding the configured threshold
-- (system_config: max_failed_logins, lockout_duration_seconds).
--
-- The counter resets to 0 on successful login. Auto-locked accounts
-- (locked_reason = 'auto_lockout') auto-unlock after the cooldown.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

-- Partial index for efficient auto-unlock queries: find locked users
-- whose cooldown has elapsed. Only indexes auto-locked rows.
CREATE INDEX IF NOT EXISTS idx_users_locked_auto
  ON users (locked_at)
  WHERE status = 'locked' AND locked_reason = 'auto_lockout';

-- Down Migration

DROP INDEX IF EXISTS idx_users_locked_auto;

ALTER TABLE users
  DROP COLUMN IF EXISTS last_failed_login_at,
  DROP COLUMN IF EXISTS failed_login_count;
