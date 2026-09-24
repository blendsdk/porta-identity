-- Up Migration

-- Per-client consent requirement.
--
-- Every client is bound to one organization. A client that must ask the end
-- user for consent (an external or partner application) sets this flag, and
-- the consent gate in the interaction handler renders the consent page instead
-- of auto-consenting. Existing clients default to false, which preserves the
-- first-party auto-consent behavior.
ALTER TABLE clients
    ADD COLUMN require_consent BOOLEAN NOT NULL DEFAULT FALSE;

-- Down Migration

ALTER TABLE clients DROP COLUMN require_consent;
