-- Up Migration

-- The tenant table — each organization represents a customer with their own user pool
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,       -- URL-safe identifier, used in OIDC issuer path
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'archived')),
    is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,     -- Only one org can be super-admin

    -- Branding (per-tenant login page customization)
    branding_logo_url       TEXT,
    branding_favicon_url    TEXT,
    branding_primary_color  VARCHAR(7),                 -- Hex color, e.g., #3B82F6
    branding_company_name   VARCHAR(255),
    branding_custom_css     TEXT,                        -- Optional raw CSS override

    -- Locale
    default_locale  VARCHAR(10) DEFAULT 'en',           -- Fallback locale for this org

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensures only one super-admin org exists via partial unique index
CREATE UNIQUE INDEX idx_organizations_super_admin
    ON organizations (is_super_admin) WHERE is_super_admin = TRUE;

-- Auto-update updated_at on row modification
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE organizations IS 'Tenant table — each organization represents a customer with their own user pool';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier used in OIDC issuer path (e.g., /{slug}/.well-known/openid-configuration)';
COMMENT ON COLUMN organizations.is_super_admin IS 'Only one organization can be super-admin (enforced by partial unique index)';

-- Down Migration

DROP TABLE IF EXISTS organizations CASCADE;
