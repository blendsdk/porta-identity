-- Up Migration

-- Custom claim definitions — per application
-- Controls which tokens include the claim (id_token, access_token, userinfo)
CREATE TABLE custom_claim_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    claim_name      VARCHAR(255) NOT NULL,               -- e.g., "department"
    claim_type      VARCHAR(20) NOT NULL DEFAULT 'string'
                    CHECK (claim_type IN ('string', 'number', 'boolean', 'json')),
    description     TEXT,
    include_in_id_token     BOOLEAN NOT NULL DEFAULT FALSE,
    include_in_access_token BOOLEAN NOT NULL DEFAULT TRUE,
    include_in_userinfo     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (application_id, claim_name)
);

CREATE INDEX idx_custom_claims_app ON custom_claim_definitions(application_id);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON custom_claim_definitions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE custom_claim_definitions IS 'Per-application custom claim definitions — controls token inclusion';

-- Custom claim values — per user
-- Stores the actual value as JSONB (supports any type: string, number, boolean, object)
CREATE TABLE custom_claim_values (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_id        UUID NOT NULL REFERENCES custom_claim_definitions(id) ON DELETE CASCADE,
    value           JSONB NOT NULL,                      -- Stores any type as JSONB
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, claim_id)
);

CREATE INDEX idx_custom_claim_values_user ON custom_claim_values(user_id);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON custom_claim_values
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE custom_claim_values IS 'Per-user custom claim values — JSONB supports any claim type';

-- Down Migration

DROP TABLE IF EXISTS custom_claim_values CASCADE;
DROP TABLE IF EXISTS custom_claim_definitions CASCADE;
