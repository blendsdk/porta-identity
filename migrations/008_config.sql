-- Up Migration

-- System configuration — key-value store with typed JSONB values
-- All configurable settings (token lifetimes, rate limits, etc.) are stored here
CREATE TABLE system_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(255) NOT NULL UNIQUE,        -- e.g., "access_token_ttl"
    value           JSONB NOT NULL,                      -- Typed value as JSON
    value_type      VARCHAR(20) NOT NULL DEFAULT 'string'
                    CHECK (value_type IN ('string', 'number', 'boolean', 'duration', 'json')),
    description     TEXT,
    is_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,      -- Hide from non-super-admin
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE system_config IS 'System-wide configuration — key-value store with typed JSONB values';
COMMENT ON COLUMN system_config.is_sensitive IS 'If true, value is hidden from non-super-admin users';

-- Signing keys for JWKS (JSON Web Key Sets)
-- Stores PEM-encoded key pairs with lifecycle management
CREATE TABLE signing_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kid             VARCHAR(255) NOT NULL UNIQUE,         -- Key ID (for JWKS)
    algorithm       VARCHAR(10) NOT NULL DEFAULT 'ES256',
    public_key      TEXT NOT NULL,                        -- PEM-encoded public key
    private_key     TEXT NOT NULL,                        -- PEM-encoded private key (encrypted at rest)
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'retired', 'revoked')),
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at      TIMESTAMPTZ,                          -- When marked as retired
    expires_at      TIMESTAMPTZ,                          -- Grace period expiry
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signing_keys_status ON signing_keys(status);
CREATE INDEX idx_signing_keys_active ON signing_keys(status) WHERE status = 'active';

COMMENT ON TABLE signing_keys IS 'JWKS signing key pairs — supports key rotation with active/retired/revoked lifecycle';
COMMENT ON COLUMN signing_keys.kid IS 'Key ID published in JWKS endpoint for token verification';
COMMENT ON COLUMN signing_keys.private_key IS 'PEM-encoded private key — should be encrypted at rest in production';

-- Down Migration

DROP TABLE IF EXISTS signing_keys CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
