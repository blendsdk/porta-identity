-- Up Migration

-- OIDC clients — each represents a deployment type (web, mobile, SPA) of an app for an org
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id      UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    client_id           VARCHAR(255) NOT NULL UNIQUE,     -- OIDC client_id (public identifier)
    client_name         VARCHAR(255) NOT NULL,
    client_type         VARCHAR(20) NOT NULL
                        CHECK (client_type IN ('confidential', 'public')),
    application_type    VARCHAR(20) NOT NULL DEFAULT 'web'
                        CHECK (application_type IN ('web', 'native', 'spa')),

    -- OIDC Configuration
    redirect_uris       TEXT[] NOT NULL DEFAULT '{}',     -- Array of allowed redirect URIs
    post_logout_redirect_uris TEXT[] DEFAULT '{}',
    grant_types         TEXT[] NOT NULL DEFAULT '{authorization_code}',
    response_types      TEXT[] NOT NULL DEFAULT '{code}',
    scope               TEXT NOT NULL DEFAULT 'openid profile email',
    token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'client_secret_basic',

    -- CORS
    allowed_origins     TEXT[] DEFAULT '{}',               -- Allowed CORS origins

    -- PKCE
    require_pkce        BOOLEAN NOT NULL DEFAULT TRUE,

    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'revoked')),

    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_org ON clients(organization_id);
CREATE INDEX idx_clients_app ON clients(application_id);
CREATE INDEX idx_clients_client_id ON clients(client_id);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE clients IS 'OIDC clients — each represents a deployment (web/mobile/SPA) of an application for an organization';
COMMENT ON COLUMN clients.client_id IS 'Public OIDC client_id — used in authorization requests';
COMMENT ON COLUMN clients.require_pkce IS 'Whether PKCE is required for this client (recommended: always true)';

-- Client secrets — stored as Argon2id hashes
-- Multiple active secrets support zero-downtime rotation
CREATE TABLE client_secrets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    secret_hash     TEXT NOT NULL,                        -- Argon2id hash of the secret
    label           VARCHAR(255),                         -- Human-readable label
    expires_at      TIMESTAMPTZ,                          -- NULL = never expires
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_secrets_client ON client_secrets(client_id);
CREATE INDEX idx_client_secrets_active ON client_secrets(client_id) WHERE status = 'active';

COMMENT ON TABLE client_secrets IS 'Hashed client secrets — multiple active secrets allow zero-downtime rotation';
COMMENT ON COLUMN client_secrets.secret_hash IS 'Argon2id hash of the client secret (plaintext is never stored)';

-- Down Migration

DROP TABLE IF EXISTS client_secrets CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
