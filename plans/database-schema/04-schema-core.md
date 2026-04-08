# Schema: Core Entities

> **Document**: 04-schema-core.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the SQL for the first four migration files: database extensions, organizations, applications (with modules), and clients (with secrets). These are the foundational entities that all other tables reference.

## Migration 001: Extensions

**File**: `migrations/001_extensions.sql`

Enables required PostgreSQL extensions and creates the shared `updated_at` trigger function.

### Up Migration

```sql
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() for UUID primary keys
CREATE EXTENSION IF NOT EXISTS "citext";      -- Case-insensitive text type for emails

-- Reusable trigger function to auto-update the updated_at column
-- Attach to any table: CREATE TRIGGER set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Down Migration

```sql
DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;
DROP EXTENSION IF EXISTS "citext";
DROP EXTENSION IF EXISTS "pgcrypto";
```

---

## Migration 002: Organizations

**File**: `migrations/002_organizations.sql`

The tenant table. Each organization represents a customer with their own user pool, branding, and configuration.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS organizations CASCADE;
```

---

## Migration 003: Applications & Modules

**File**: `migrations/003_applications.sql`

Applications represent SaaS products. Modules are logical groupings within an application (e.g., CRM, Invoicing). Permissions are namespaced by module.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS application_modules CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
```

---

## Migration 004: Clients & Client Secrets

**File**: `migrations/004_clients.sql`

OIDC clients represent specific deployment types (web, mobile, SPA) of an application for an organization. Secrets are stored hashed, with support for multiple active secrets to allow rotation.

### Up Migration

```sql
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
```

### Down Migration

```sql
DROP TABLE IF EXISTS client_secrets CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
```

## Testing Requirements

- Verify all four migrations run successfully on a fresh database
- Verify `organizations` table exists with all columns and constraints
- Verify unique partial index on `is_super_admin` (only one super-admin allowed)
- Verify `applications` and `application_modules` tables with FK constraint
- Verify `clients` table FK references to both `organizations` and `applications`
- Verify `client_secrets` table FK reference to `clients`
- Verify `ON DELETE CASCADE` behavior (deleting an org cascades to clients)
- Verify check constraints on status columns
- Verify `updated_at` trigger fires on updates
