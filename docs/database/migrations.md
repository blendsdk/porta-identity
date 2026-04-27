# Migrations

Porta uses [node-pg-migrate](https://github.com/salsita/node-pg-migrate) for database schema management. All migrations are SQL files located in the `migrations/` directory.

## Running Migrations

### Via CLI

```bash
# Apply all pending migrations
porta migrate up

# Roll back the last migration
porta migrate down

# Check migration status
porta migrate status
```

### Via Yarn

```bash
# Apply migrations
yarn migrate

# Roll back
yarn migrate:rollback

# Check status
yarn migrate:status

# Create a new migration
yarn migrate:create my_migration_name
```

## Migration Files

Migrations are numbered sequentially and applied in order:

| # | File | Description |
|---|------|-------------|
| 001 | `001_extensions.sql` | PostgreSQL extensions (`pgcrypto`, `citext`) and `trigger_set_updated_at()` function |
| 002 | `002_organizations.sql` | Organizations table with branding, status, super-admin constraint |
| 003 | `003_applications.sql` | Applications and application_modules tables |
| 004 | `004_clients.sql` | OIDC clients table with full OIDC configuration fields |
| 005 | `005_users.sql` | Users table with OIDC Standard Claims profile fields |
| 006 | `006_roles_permissions.sql` | Roles, permissions, role_permissions, and user_roles tables |
| 007 | `007_custom_claims.sql` | Claim definitions and user_claim_values tables |
| 008 | `008_config.sql` | System configuration key-value table |
| 009 | `009_audit_log.sql` | Audit log table with indexes on action, entity, actor |
| 010 | `010_oidc_adapter.sql` | OIDC payload storage for long-lived tokens (PostgreSQL adapter) |
| 011 | `011_seed.sql` | Initial seed data (signing keys table) |
| 012 | `012_two_factor.sql` | Two-factor authentication tables (TOTP, email OTP, recovery codes) |
| 013 | `013_client_secret_sha256.sql` | SHA-256 pre-hash column for client secrets |
| 014 | `014_login_methods.sql` | Login methods columns on organizations and clients |
| 015 | `015_signing_key_encryption.sql` | Adds KEK encryption columns to signing_keys table (preparation for future at-rest encryption) |
| 016 | `016_failed_login_count.sql` | Adds `failed_login_count` and `last_failed_login_at` columns to users table for account lockout |
| 017 | `017_audit_retention.sql` | Adds `audit_retention_days` entry to system_config for configurable audit log cleanup |
| 018 | `018_admin_api_enhancements.sql` | Adds `branding_assets` table (org logo/favicon storage) and `admin_sessions` table (session tracking for admin viewer/revocation) |
| 019 | `019_invitation_details.sql` | Adds `details` JSONB column and `invited_by` UUID column to `invitation_tokens` for enhanced invitations with role/claim pre-assignment |

## Writing Migrations

### Conventions

- **File format:** `NNN_description.sql` (3-digit zero-padded number)
- **Language:** Pure SQL (no JavaScript migrations)
- **Idempotent:** Use `IF NOT EXISTS` where possible
- **Reversible:** Include both `UP` and `DOWN` sections

### Template

```sql
-- Up Migration
CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add auto-update trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON my_table
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration
DROP TRIGGER IF EXISTS set_updated_at ON my_table;
DROP TABLE IF EXISTS my_table;
```

### Creating a New Migration

```bash
yarn migrate:create add_my_feature
```

This creates a new file like `migrations/015_add_my_feature.sql` with `UP` and `DOWN` sections.

## Environment Configuration

Migrations require the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/porta
```

Or pass it directly via the CLI:

```bash
porta migrate up --database-url postgresql://user:password@localhost:5432/porta
```
