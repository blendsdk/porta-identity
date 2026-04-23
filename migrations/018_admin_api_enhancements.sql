-- Up Migration

-- Admin API Enhancements (RD-21)
-- Adds branding_assets table for organization logo/favicon image storage
-- and admin_sessions table for OIDC session tracking and management.

-- ============================================================================
-- Branding Assets: Organization logo/favicon storage
-- ============================================================================
-- Images stored as PostgreSQL bytea (simple deployment, images are small).
-- Unique constraint ensures one logo and one favicon per organization.

CREATE TABLE IF NOT EXISTS branding_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_type VARCHAR(20) NOT NULL,       -- 'logo', 'favicon'
    content_type VARCHAR(50) NOT NULL,     -- 'image/png', 'image/svg+xml', etc.
    data BYTEA NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT branding_assets_unique_org_type UNIQUE(organization_id, asset_type),
    CONSTRAINT branding_assets_valid_type CHECK (asset_type IN ('logo', 'favicon')),
    CONSTRAINT branding_assets_valid_size CHECK (file_size > 0 AND file_size <= 524288)
);

-- Index for looking up assets by organization
CREATE INDEX IF NOT EXISTS idx_branding_assets_org_id
    ON branding_assets(organization_id);

-- ============================================================================
-- Admin Sessions: OIDC session tracking for admin viewer/revocation
-- ============================================================================
-- PostgreSQL mirror of Redis OIDC sessions. Populated via adapter hooks
-- (fire-and-forget) for listing, filtering, and admin revocation.
-- Active sessions have revoked_at IS NULL.

CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    grant_id VARCHAR(128),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT admin_sessions_not_expired CHECK (expires_at > created_at)
);

-- Partial indexes for efficient querying of active sessions
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_active
    ON admin_sessions(user_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_org_active
    ON admin_sessions(organization_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_client_active
    ON admin_sessions(client_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
    ON admin_sessions(expires_at)
    WHERE revoked_at IS NULL;

-- Index for grant-based session lookup (used during revocation cascade)
CREATE INDEX IF NOT EXISTS idx_admin_sessions_grant_id
    ON admin_sessions(grant_id)
    WHERE grant_id IS NOT NULL;

-- Down Migration

DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS branding_assets;
