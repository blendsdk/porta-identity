-- Up Migration

-- Generic OIDC adapter storage table for node-oidc-provider
-- Stores: AccessToken, AuthorizationCode, RefreshToken, DeviceCode,
-- ClientCredentials, InitialAccessToken, RegistrationAccessToken,
-- Interaction, ReplayDetection, PushedAuthorizationRequest, Grant,
-- Session, BackchannelAuthenticationRequest
CREATE TABLE oidc_payloads (
    id              VARCHAR(255) NOT NULL,
    type            VARCHAR(50) NOT NULL,                 -- Model name (e.g., "AccessToken")
    payload         JSONB NOT NULL,
    grant_id        VARCHAR(255),
    user_code       VARCHAR(255),
    uid             VARCHAR(255),
    expires_at      TIMESTAMPTZ,
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, type)
);

-- Partial indexes for efficient lookups on non-null columns
CREATE INDEX idx_oidc_payloads_grant ON oidc_payloads(grant_id) WHERE grant_id IS NOT NULL;
CREATE INDEX idx_oidc_payloads_user_code ON oidc_payloads(user_code) WHERE user_code IS NOT NULL;
CREATE INDEX idx_oidc_payloads_uid ON oidc_payloads(uid) WHERE uid IS NOT NULL;
CREATE INDEX idx_oidc_payloads_expires ON oidc_payloads(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE oidc_payloads IS 'Generic storage for node-oidc-provider — all OIDC artifact types share this table';
COMMENT ON COLUMN oidc_payloads.type IS 'OIDC model type (e.g., AccessToken, AuthorizationCode, Session)';
COMMENT ON COLUMN oidc_payloads.payload IS 'Full OIDC artifact payload as JSONB';

-- Down Migration

DROP TABLE IF EXISTS oidc_payloads CASCADE;
