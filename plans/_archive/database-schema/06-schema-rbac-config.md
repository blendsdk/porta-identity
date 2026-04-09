# Schema: RBAC, Config & OIDC

> **Document**: 06-schema-rbac-config.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the SQL for migrations 006 through 010: the RBAC system (roles, permissions, mappings), custom claims, system configuration, signing keys, audit log, and the OIDC provider adapter table. These are the remaining tables that complete the full Porta v5 schema.

## Migration 006: Roles & Permissions

**File**: `migrations/006_roles_permissions.sql`

Roles and permissions are defined globally per application. Role assignments are per-user (and implicitly per-organization since users belong to exactly one org).

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
```

---

## Migration 007: Custom Claims

**File**: `migrations/007_custom_claims.sql`

Custom claims allow applications to define additional claims that are included in tokens. Each user can have values for these custom claims.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS custom_claim_values CASCADE;
DROP TABLE IF EXISTS custom_claim_definitions CASCADE;
```

---

## Migration 008: System Config & Signing Keys

**File**: `migrations/008_config.sql`

System configuration uses a key-value table with typed JSONB values. Signing keys store PEM-encoded key pairs for JWKS.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS signing_keys CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
```

---

## Migration 009: Audit Log

**File**: `migrations/009_audit_log.sql`

Security event logging with structured metadata. References organizations and users with `SET NULL` on delete (audit entries are preserved even if the actor is removed).

### Up Migration

```sql
-- Audit log for security events
-- Uses SET NULL on delete to preserve audit entries when users/orgs are removed
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
    event_type      VARCHAR(100) NOT NULL,                -- e.g., "user.login.success"
    event_category  VARCHAR(50) NOT NULL,                 -- e.g., "authentication", "admin", "security"
    description     TEXT,
    metadata        JSONB DEFAULT '{}',                   -- Additional context (IP, user-agent, etc.)
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite indexes for common query patterns (org+time, user+time, event+time)
CREATE INDEX idx_audit_log_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_event ON audit_log(event_type, created_at DESC);
CREATE INDEX idx_audit_log_category ON audit_log(event_category, created_at DESC);

COMMENT ON TABLE audit_log IS 'Security event audit log — append-only, preserved on user/org deletion';
COMMENT ON COLUMN audit_log.actor_id IS 'The user who performed the action (may differ from user_id for admin actions)';
COMMENT ON COLUMN audit_log.metadata IS 'Structured additional context (e.g., IP address, user-agent, request details)';
```

### Down Migration

```sql
DROP TABLE IF EXISTS audit_log CASCADE;
```

---

## Migration 010: OIDC Provider Adapter

**File**: `migrations/010_oidc_adapter.sql`

Generic storage table for `node-oidc-provider`. The provider stores various OIDC artifacts (access tokens, authorization codes, sessions, etc.) through an adapter interface. All types share a single table keyed by `(id, type)`.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS oidc_payloads CASCADE;
```

## Design Notes

### RBAC Model

The RBAC model uses a classic role-permission pattern:
- **Roles** are defined per-application (e.g., "CRM Editor" for the BusinessSuite app)
- **Permissions** are per-application, optionally scoped to a module (e.g., "crm:contacts:read")
- **Role-Permission mapping** is many-to-many (a role grants multiple permissions)
- **User-Role assignment** is per-user (and since users belong to one org, it's implicitly per-org)
- **`assigned_by`** tracks which admin assigned the role (auditing)

### Audit Log Retention

The `audit_log` table uses `ON DELETE SET NULL` for FK references — when a user or organization is deleted, the audit entries remain with NULL references. This preserves the security audit trail. For production, consider partitioning by month or automatic archival to prevent unbounded growth.

### OIDC Payloads Table

This follows the standard `node-oidc-provider` adapter pattern. The composite primary key `(id, type)` allows different OIDC model types to share the same table. The provider handles all CRUD operations through its adapter interface (implemented in RD-03).

## Testing Requirements

- Verify roles and permissions tables with FK to applications
- Verify `role_permissions` join table with composite PK
- Verify `user_roles` join table with `assigned_by` reference
- Verify `custom_claim_definitions` unique constraint on `(application_id, claim_name)`
- Verify `custom_claim_values` unique constraint on `(user_id, claim_id)`
- Verify `system_config` table with unique key constraint
- Verify `signing_keys` table with partial index on active keys
- Verify `audit_log` table with `ON DELETE SET NULL` behavior
- Verify `oidc_payloads` composite primary key `(id, type)`
- Verify all indexes are created
