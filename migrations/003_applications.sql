-- Up Migration

-- Applications represent SaaS products managed by Porta
CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,               -- e.g., "BusinessSuite"
    slug            VARCHAR(100) NOT NULL UNIQUE,         -- e.g., "business-suite"
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE applications IS 'SaaS application definitions — each org uses the same app but with their own users/roles';

-- Application modules are logical groupings (e.g., CRM, Invoicing, HR)
-- Permissions are namespaced by module
CREATE TABLE application_modules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,               -- e.g., "CRM"
    slug            VARCHAR(100) NOT NULL,               -- e.g., "crm"
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (application_id, slug)
);

CREATE INDEX idx_app_modules_application ON application_modules(application_id);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON application_modules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE application_modules IS 'Logical groupings within an application (e.g., CRM, Invoicing) — permissions are namespaced by module';

-- Down Migration

DROP TABLE IF EXISTS application_modules CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
