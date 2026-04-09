# Schema: Users & Auth Tokens

> **Document**: 05-schema-users-auth.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the SQL for migration 005: the `users` table with full OIDC Standard Claims (§5.1), plus the three auth token tables (`magic_link_tokens`, `password_reset_tokens`, `invitation_tokens`). The users table is the largest single table in the schema with ~30 columns covering authentication, profile, address, and lifecycle data.

## Migration 005: Users & Auth Tokens

**File**: `migrations/005_users.sql`

### Up Migration

```sql
-- Users belong to exactly one organization
-- Profile fields follow OIDC Standard Claims (OpenID Connect Core 1.0, §5.1)
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Authentication
    email                   CITEXT NOT NULL,              -- Case-insensitive via citext extension
    email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash           TEXT,                          -- NULL for passwordless-only users
    password_changed_at     TIMESTAMPTZ,

    -- OIDC Standard Claims (OpenID Connect Core 1.0, §5.1)
    given_name              VARCHAR(255),
    family_name             VARCHAR(255),
    middle_name             VARCHAR(255),
    nickname                VARCHAR(255),
    preferred_username      VARCHAR(255),
    profile_url             TEXT,                          -- "profile" claim
    picture_url             TEXT,                          -- "picture" claim
    website_url             TEXT,                          -- "website" claim
    gender                  VARCHAR(50),
    birthdate               DATE,                         -- ISO 8601 (YYYY-MM-DD)
    zoneinfo                VARCHAR(50),                  -- e.g., "Europe/Amsterdam"
    locale                  VARCHAR(10),                  -- e.g., "nl-NL"
    phone_number            VARCHAR(50),
    phone_number_verified   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Address (structured, OIDC §5.1.1)
    address_street          TEXT,
    address_locality        VARCHAR(255),                 -- City
    address_region          VARCHAR(255),                 -- State/Province
    address_postal_code     VARCHAR(20),
    address_country         VARCHAR(2),                   -- ISO 3166-1 alpha-2

    -- Status & Lifecycle
    status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive', 'suspended', 'locked')),
    locked_at               TIMESTAMPTZ,
    locked_reason           TEXT,
    last_login_at           TIMESTAMPTZ,
    login_count             INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints: email is unique per organization (case-insensitive via CITEXT)
    UNIQUE (organization_id, email)
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(organization_id, status);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE users IS 'User accounts — each user belongs to exactly one organization';
COMMENT ON COLUMN users.email IS 'Case-insensitive email (CITEXT) — unique per organization';
COMMENT ON COLUMN users.password_hash IS 'Argon2id hash — NULL for passwordless-only users';
COMMENT ON COLUMN users.status IS 'User lifecycle: active → inactive/suspended/locked';

-- Magic link tokens for passwordless authentication
CREATE TABLE magic_link_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,                 -- SHA-256 hash of the token
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,                          -- NULL = not yet used
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_magic_link_user ON magic_link_tokens(user_id);
CREATE INDEX idx_magic_link_token ON magic_link_tokens(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE magic_link_tokens IS 'Passwordless login tokens — SHA-256 hashed, single-use with expiry';

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,                 -- SHA-256 hash of the token
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pwd_reset_user ON password_reset_tokens(user_id);
CREATE INDEX idx_pwd_reset_token ON password_reset_tokens(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens — SHA-256 hashed, single-use with expiry';

-- Invitation tokens — sent when admin creates a user account
-- User clicks link to set their initial password
CREATE TABLE invitation_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,                 -- SHA-256 hash of the token
    expires_at      TIMESTAMPTZ NOT NULL,                 -- Default: 7 days from creation
    used_at         TIMESTAMPTZ,                          -- NULL = not yet accepted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitation_user ON invitation_tokens(user_id);
CREATE INDEX idx_invitation_token ON invitation_tokens(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE invitation_tokens IS 'User invitation tokens — sent by admin, user clicks to set initial password';
```

### Down Migration

```sql
DROP TABLE IF EXISTS invitation_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS magic_link_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

## Design Notes

### Why CITEXT for Email?

Using PostgreSQL's `citext` extension means email comparisons are automatically case-insensitive without needing `LOWER()` or functional indexes. The `UNIQUE (organization_id, email)` constraint works correctly with CITEXT — `User@Example.com` and `user@example.com` are considered the same.

### Why Nullable `password_hash`?

Some users may authenticate only via magic links (passwordless). A NULL `password_hash` indicates the user has never set a password and can only use passwordless flows.

### Token Table Pattern

All three token tables follow the same pattern:
- `token_hash` — SHA-256 hash of the actual token (plaintext token is sent via email, never stored)
- `expires_at` — Expiration timestamp
- `used_at` — NULL until the token is consumed (prevents reuse)
- Partial index on `token_hash WHERE used_at IS NULL` — Fast lookup of unused tokens only

### Address as Flat Columns vs JSONB

RD-02 specifies flat columns for address fields (matching OIDC §5.1.1 structured address claim). This makes individual field queries efficient and allows column-level constraints. The application layer will assemble the OIDC `address` claim JSON from these columns.

## Testing Requirements

- Verify `users` table exists with all ~30 columns
- Verify CITEXT email behavior: inserting `USER@EXAMPLE.COM` and `user@example.com` for same org should conflict
- Verify `UNIQUE (organization_id, email)` allows same email in different orgs
- Verify `ON DELETE CASCADE` from organizations to users
- Verify all three token tables exist with proper FK to users
- Verify partial indexes on token tables (unused tokens only)
- Verify `updated_at` trigger on users table
- Verify check constraint on `status` column
