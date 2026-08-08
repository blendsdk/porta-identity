-- Up Migration

-- Roles are defined globally per application
-- Role assignments to users are per-organization (since users belong to one org)
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,               -- e.g., "CRM Editor"
    slug            VARCHAR(100) NOT NULL,               -- e.g., "crm-editor"
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (application_id, slug)
);

CREATE INDEX idx_roles_application ON roles(application_id);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE roles IS 'Global role definitions per application — assigned to users via user_roles';

-- Permissions are defined globally per application, optionally scoped to a module
CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    module_id       UUID REFERENCES application_modules(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,               -- e.g., "Read CRM Contacts"
    slug            VARCHAR(150) NOT NULL,               -- e.g., "crm:contacts:read"
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (application_id, slug)
);

CREATE INDEX idx_permissions_application ON permissions(application_id);
CREATE INDEX idx_permissions_module ON permissions(module_id);

COMMENT ON TABLE permissions IS 'Global permission definitions per application — optionally scoped to a module';
COMMENT ON COLUMN permissions.slug IS 'Namespaced permission slug (e.g., "crm:contacts:read")';

-- Many-to-many: which permissions does each role grant?
CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

COMMENT ON TABLE role_permissions IS 'Maps roles to permissions — many-to-many join table';

-- Many-to-many: which roles are assigned to each user?
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

COMMENT ON TABLE user_roles IS 'Maps users to roles — includes who assigned the role';
COMMENT ON COLUMN user_roles.assigned_by IS 'The admin user who assigned this role (NULL if system-assigned)';

-- Down Migration

DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
