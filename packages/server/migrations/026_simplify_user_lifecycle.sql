-- Up Migration

UPDATE users
SET status = 'inactive'
WHERE status = 'suspended';

UPDATE users
SET status = 'inactive',
    locked_at = NULL,
    locked_reason = NULL,
    failed_login_count = 0,
    last_failed_login_at = NULL
WHERE status = 'locked'
  AND locked_reason IS DISTINCT FROM 'auto_lockout';

ALTER TABLE users
  DROP CONSTRAINT users_status_check,
  ADD CONSTRAINT users_status_check
    CHECK (status IN ('active', 'inactive', 'locked'));

COMMENT ON COLUMN users.status IS
  'User lifecycle: active/inactive by administrator; locked by automatic login protection';

UPDATE permissions
SET slug = 'admin:user:lifecycle',
    name = 'Manage user lifecycle',
    description = 'Activate and deactivate users'
WHERE slug = 'admin:user:suspend';

-- Down Migration

-- Deliberate no-op: removed manual suspension and lock operations are not restored.
SELECT 1;
