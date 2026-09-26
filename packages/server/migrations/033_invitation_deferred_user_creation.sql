-- Up Migration

-- Migration 033: Deferred invitation creation
--
-- An invitation is an offer, not an account. The invitation becomes an
-- email/organization-keyed token that can exist without a user; the account row
-- is created only when the recipient accepts. Tenant authority is stored on the
-- token itself, so acceptance no longer has to join the user account.
--
-- Invitation lifetime is unchanged: this migration does not touch system_config.

ALTER TABLE invitation_tokens
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN email CITEXT,
  ADD COLUMN given_name VARCHAR(255),
  ADD COLUMN family_name VARCHAR(255),
  ADD COLUMN locale VARCHAR(10);

-- Backfill existing rows from their owning account before enforcing NOT NULL.
UPDATE invitation_tokens AS token
   SET organization_id = account.organization_id,
       email = account.email
  FROM users AS account
 WHERE account.id = token.user_id
   AND token.organization_id IS NULL;

ALTER TABLE invitation_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE invitation_tokens ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE invitation_tokens ALTER COLUMN email SET NOT NULL;

-- At most one live invitation per organization and email. Replaced or accepted
-- invitations (used_at set) are excluded, so history is preserved.
CREATE UNIQUE INDEX idx_invitation_active_email
  ON invitation_tokens (organization_id, email)
  WHERE used_at IS NULL;

COMMENT ON COLUMN invitation_tokens.organization_id IS
  'Organization that owns the invitation; the tenant authority for acceptance';
COMMENT ON COLUMN invitation_tokens.email IS
  'Invited address; the account is created for this email at acceptance';

-- Down Migration

-- Refuse to revert while deferred invitations exist: their user link cannot be
-- restored without inventing an account.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM invitation_tokens WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot revert migration 033 while deferred invitations exist';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_invitation_active_email;
ALTER TABLE invitation_tokens ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invitation_tokens
  DROP COLUMN locale,
  DROP COLUMN family_name,
  DROP COLUMN given_name,
  DROP COLUMN email,
  DROP COLUMN organization_id;
