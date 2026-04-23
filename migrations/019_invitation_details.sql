-- Up Migration

-- Migration 019: Add details JSONB column to invitation_tokens
--
-- Stores pre-assignment metadata (roles, claims, personal message, inviter)
-- in the invitation token so they can be applied when the invitation is accepted.
--
-- The details column is nullable — existing tokens without details continue
-- to work exactly as before (backward compatible).

ALTER TABLE invitation_tokens
  ADD COLUMN details JSONB;

-- Add invited_by column to track which admin user created the invitation
ALTER TABLE invitation_tokens
  ADD COLUMN invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN invitation_tokens.details IS
  'Optional JSONB storing pre-assignment metadata: roles, claims, personalMessage, inviterName';

COMMENT ON COLUMN invitation_tokens.invited_by IS
  'User ID of the admin who created this invitation';

-- Down Migration

ALTER TABLE invitation_tokens DROP COLUMN IF EXISTS invited_by;
ALTER TABLE invitation_tokens DROP COLUMN IF EXISTS details;
