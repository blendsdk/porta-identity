-- Up Migration

-- Magic-link authority is persisted when a new artifact is created. Existing rows receive their
-- durable user organization only so the column can become mandatory, but remain explicitly
-- unbound because their original interaction authority cannot be reconstructed safely.
ALTER TABLE magic_link_tokens
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ADD COLUMN interaction_uid VARCHAR(128),
    ADD COLUMN authority_bound BOOLEAN;

UPDATE magic_link_tokens AS token
SET organization_id = account.organization_id,
    authority_bound = FALSE
FROM users AS account
WHERE account.id = token.user_id;

ALTER TABLE magic_link_tokens
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN authority_bound SET DEFAULT TRUE,
    ALTER COLUMN authority_bound SET NOT NULL,
    ADD CONSTRAINT magic_link_tokens_interaction_uid
        CHECK (interaction_uid IS NULL OR char_length(interaction_uid) BETWEEN 1 AND 128),
    ADD CONSTRAINT magic_link_tokens_recovery_authority
        CHECK (recovery_job_id IS NULL OR authority_bound);

CREATE INDEX magic_link_tokens_authority_lookup
    ON magic_link_tokens (token_hash, organization_id)
    WHERE used_at IS NULL AND authority_bound;

-- Down Migration

DROP INDEX IF EXISTS magic_link_tokens_authority_lookup;

ALTER TABLE magic_link_tokens
    DROP CONSTRAINT IF EXISTS magic_link_tokens_recovery_authority,
    DROP CONSTRAINT IF EXISTS magic_link_tokens_interaction_uid,
    DROP COLUMN IF EXISTS authority_bound,
    DROP COLUMN IF EXISTS interaction_uid,
    DROP COLUMN IF EXISTS organization_id;
