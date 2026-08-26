-- Up Migration

-- A durable recovery job may create at most one token artifact. The plaintext token is derived
-- deterministically from the protected job identity, so a retry can safely reuse the same link.
ALTER TABLE magic_link_tokens
    ADD COLUMN recovery_job_id UUID REFERENCES auth_recovery_jobs(id) ON DELETE SET NULL;

ALTER TABLE password_reset_tokens
    ADD COLUMN recovery_job_id UUID REFERENCES auth_recovery_jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX magic_link_tokens_recovery_job
    ON magic_link_tokens (recovery_job_id)
    WHERE recovery_job_id IS NOT NULL;

CREATE UNIQUE INDEX password_reset_tokens_recovery_job
    ON password_reset_tokens (recovery_job_id)
    WHERE recovery_job_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS password_reset_tokens_recovery_job;
DROP INDEX IF EXISTS magic_link_tokens_recovery_job;

ALTER TABLE password_reset_tokens DROP COLUMN IF EXISTS recovery_job_id;
ALTER TABLE magic_link_tokens DROP COLUMN IF EXISTS recovery_job_id;
