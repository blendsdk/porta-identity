-- Migration 013: Add SHA-256 hash column to client_secrets
--
-- Adds a SHA-256 hex hash column used for oidc-provider client authentication.
-- SHA-256 is appropriate for machine-generated, high-entropy client secrets
-- (48 bytes / 384 bits). Argon2id hashes are retained for admin API verification.
--
-- Existing secrets cannot be backfilled (we don't have plaintexts).
-- New secrets will have both Argon2id hash and SHA-256 hash.

-- Up Migration
ALTER TABLE client_secrets ADD COLUMN secret_sha256 VARCHAR(64);

CREATE INDEX idx_client_secrets_sha256
  ON client_secrets(secret_sha256)
  WHERE secret_sha256 IS NOT NULL;

COMMENT ON COLUMN client_secrets.secret_sha256
  IS 'SHA-256 hex hash of the secret — used for oidc-provider client authentication';

-- Down Migration (in comments for reference)
-- DROP INDEX IF EXISTS idx_client_secrets_sha256;
-- ALTER TABLE client_secrets DROP COLUMN IF EXISTS secret_sha256;
