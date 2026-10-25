-- Up Migration

-- Migration 034: First-class client actor attribution
--
-- A tenant service client is a principal without a Porta user account. Store
-- the client identity in first-class columns so tenant user mutations remain
-- queryable and accountable after the request ends.
--
-- Operational note: this migration updates every audit row to set actor_type
-- and applies SET NOT NULL while holding an ACCESS EXCLUSIVE lock. Deploy it
-- in a documented maintenance window with a verified pre-migration backup.
-- Historical rows whose actor user was deleted have actor_id NULL and are
-- classified as system. Future actor deletions retain actor_type = 'user'.

ALTER TABLE audit_log
  ADD COLUMN actor_type VARCHAR(20),
  ADD COLUMN actor_client_id VARCHAR(255),
  ADD COLUMN actor_client_name VARCHAR(255);

-- Existing service-client events are identifiable from the invite metadata.
UPDATE audit_log
SET actor_type = 'client',
    actor_client_id = metadata->>'serviceClientId',
    actor_client_name = NULLIF(metadata->>'serviceClientName', '')
WHERE actor_id IS NULL
  AND metadata->>'actorKind' = 'service'
  AND metadata->>'serviceClientId' IS NOT NULL;

-- Existing rows with a live actor_id become user. Rows whose actor user was
-- deleted have actor_id NULL and become system; this historical classification
-- is accepted.
UPDATE audit_log
SET actor_type = CASE
  WHEN actor_type IS NULL AND actor_id IS NOT NULL THEN 'user'
  WHEN actor_type IS NULL THEN 'system'
  ELSE actor_type
END;

-- Make user-entity history useful for historical rows. Only link users that
-- still exist; a deleted user's historical metadata must not violate the
-- user_id foreign key.
UPDATE audit_log AS audit
SET user_id = (audit.metadata->>'userId')::uuid
WHERE audit.user_id IS NULL
  AND audit.metadata->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (audit.metadata->>'userId')::uuid
  );

ALTER TABLE audit_log
  ALTER COLUMN actor_type SET NOT NULL,
  ADD CONSTRAINT audit_log_actor_shape CHECK (
    (actor_type = 'client' AND actor_id IS NULL AND actor_client_id IS NOT NULL)
    OR (actor_type = 'user' AND actor_client_id IS NULL)
    OR (actor_type = 'system' AND actor_id IS NULL AND actor_client_id IS NULL)
  );

CREATE INDEX idx_audit_log_actor_client
  ON audit_log(actor_client_id, created_at DESC)
  WHERE actor_client_id IS NOT NULL;

COMMENT ON COLUMN audit_log.actor_type IS
  'Actor class: user, client, or system';
COMMENT ON COLUMN audit_log.actor_client_id IS
  'OAuth client identifier for a service-client actor';
COMMENT ON COLUMN audit_log.actor_client_name IS
  'Human-readable OAuth client name captured at event time';

-- Down Migration

DROP INDEX IF EXISTS idx_audit_log_actor_client;

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_shape;

ALTER TABLE audit_log
  DROP COLUMN IF EXISTS actor_client_name,
  DROP COLUMN IF EXISTS actor_client_id,
  DROP COLUMN IF EXISTS actor_type;
