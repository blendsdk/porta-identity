-- Up Migration

-- Migration 035: Audit metadata indexes for application and client history
--
-- Applications and clients are deployment-global records without audit FK columns. Their change
-- history reads the identifier from JSONB metadata instead. Add expression indexes matching the
-- history queries so an entity history does not scan the whole audit table.
--
-- Client secret events historically store the internal client UUID under the `clientId` key, while
-- other client events use `clientDbId`. The client index matches both keys through COALESCE.

CREATE INDEX idx_audit_log_application_history
  ON audit_log ((metadata->>'applicationId'), created_at DESC)
  WHERE metadata ? 'applicationId';

CREATE INDEX idx_audit_log_client_history
  ON audit_log (
    (COALESCE(metadata->>'clientDbId', metadata->>'clientId')),
    created_at DESC
  )
  WHERE metadata ? 'clientDbId' OR metadata ? 'clientId';

COMMENT ON INDEX idx_audit_log_application_history IS
  'Application history lookup by audit metadata applicationId';
COMMENT ON INDEX idx_audit_log_client_history IS
  'Client history lookup by clientDbId or legacy clientId metadata';

-- Down Migration

DROP INDEX IF EXISTS idx_audit_log_client_history;
DROP INDEX IF EXISTS idx_audit_log_application_history;
