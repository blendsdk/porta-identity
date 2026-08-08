-- Up Migration

-- Add encryption metadata columns to signing_keys table.
-- These support AES-256-GCM envelope encryption of private keys at rest.
-- Existing rows keep encrypted = false (plaintext) for backward compatibility.
ALTER TABLE signing_keys
  ADD COLUMN private_key_iv  VARCHAR(24),
  ADD COLUMN private_key_tag VARCHAR(32),
  ADD COLUMN encrypted       BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN signing_keys.private_key_iv IS 'AES-256-GCM initialization vector (hex) — NULL for unencrypted legacy keys';
COMMENT ON COLUMN signing_keys.private_key_tag IS 'AES-256-GCM authentication tag (hex) — NULL for unencrypted legacy keys';
COMMENT ON COLUMN signing_keys.encrypted IS 'Whether private_key is AES-256-GCM encrypted (false = plaintext legacy)';

-- Down Migration

ALTER TABLE signing_keys
  DROP COLUMN IF EXISTS private_key_iv,
  DROP COLUMN IF EXISTS private_key_tag,
  DROP COLUMN IF EXISTS encrypted;
