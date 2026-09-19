-- Up Migration

ALTER TABLE user_totp
  ADD COLUMN last_accepted_time_step BIGINT;

ALTER TABLE user_totp
  ADD CONSTRAINT user_totp_algorithm_check CHECK (algorithm = 'SHA1'),
  ADD CONSTRAINT user_totp_digits_check CHECK (digits = 6),
  ADD CONSTRAINT user_totp_period_check CHECK (period = 30);

-- Down Migration

ALTER TABLE user_totp
  DROP CONSTRAINT IF EXISTS user_totp_algorithm_check,
  DROP CONSTRAINT IF EXISTS user_totp_digits_check,
  DROP CONSTRAINT IF EXISTS user_totp_period_check,
  DROP COLUMN IF EXISTS last_accepted_time_step;
