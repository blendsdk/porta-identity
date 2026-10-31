-- Up Migration

-- Only the authenticated tenant application may revoke an invitation it issued.
-- Historical and control-plane invitations remain unowned: guessing an owner
-- would grant cancellation authority that the issuer never established.
ALTER TABLE invitation_tokens
  ADD COLUMN application_id UUID REFERENCES applications(id) ON DELETE SET NULL;

COMMENT ON COLUMN invitation_tokens.application_id IS
  'Authenticated tenant application that may revoke this invitation; null grants no tenant revocation authority';

-- Down Migration

-- Stop feature writers before downgrade. Ownership cannot be reconstructed
-- after dropping this column, even if the migration is applied again later.
ALTER TABLE invitation_tokens DROP COLUMN application_id;
