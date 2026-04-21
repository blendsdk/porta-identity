-- Up Migration

-- Add audit_retention_days system config value.
-- Controls how long audit log entries are kept before cleanup.
-- Used by `porta audit cleanup` CLI command.
INSERT INTO system_config (key, value, value_type, description, is_sensitive) VALUES
    ('audit_retention_days', '90', 'number', 'Number of days to retain audit log entries (default: 90 days)', FALSE);

-- Down Migration

DELETE FROM system_config WHERE key = 'audit_retention_days';
