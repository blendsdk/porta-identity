# Requirements: Database Schema & Migrations

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-02 — Database Schema & Migrations](../../requirements/RD-02-database-schema.md)

## Feature Overview

Design and implement the complete PostgreSQL database schema for Porta v5, including all tables for organizations, applications, clients, secrets, users, roles, permissions, custom claims, configuration, audit logging, and OIDC provider adapter storage. Includes a SQL-based migration system for schema versioning and development seed data.

## Functional Requirements

### Must Have

- [ ] SQL-based migration system with up/down support
- [ ] Timestamped migration files (e.g., `001_initial_schema.sql`)
- [ ] Migration CLI commands: run, rollback, create, status
- [ ] All tables use UUIDs as primary keys (`gen_random_uuid()`)
- [ ] All tables include `created_at` and `updated_at` timestamps (auto-managed)
- [ ] Foreign key constraints with appropriate `ON DELETE` behavior
- [ ] Indexes on all foreign keys and commonly queried columns
- [ ] Configuration table with key-value pairs and typed defaults
- [ ] Audit log table for security events
- [ ] Seed data script for development (super-admin org, default config values)

### Should Have

- [ ] Database connection pooling configuration (min/max connections)
- [ ] Partial indexes for soft-deleted records where applicable
- [ ] Check constraints for enum-like columns
- [ ] Comments on tables and columns for documentation

### Won't Have (Out of Scope)

- Multi-database (database-per-tenant) — single shared database with `organization_id` scoping
- Automatic schema generation from ORM models — raw SQL migrations only
- Database replication or clustering configuration (infrastructure concern)

## Technical Requirements

### Migration System

- **Tool**: `node-pg-migrate` — SQL-based, lightweight, supports up/down migrations
- **Migration directory**: `migrations/` at project root
- **Naming convention**: `NNN_description.sql` (e.g., `001_extensions.sql`)
- **Execution**: Sequential, tracked in `pgmigrations` table

### Database Extensions Required

| Extension | Purpose |
|-----------|---------|
| `pgcrypto` | `gen_random_uuid()` for UUID primary keys |
| `citext` | Case-insensitive text type for email storage |

### Tables (19 total, 11 migrations)

| # | Migration | Tables | Description |
|---|-----------|--------|-------------|
| 001 | extensions | — | Enable pgcrypto and citext |
| 002 | organizations | `organizations` | Tenant table with branding |
| 003 | applications | `applications`, `application_modules` | SaaS apps and modules |
| 004 | clients | `clients`, `client_secrets` | OIDC clients and secret storage |
| 005 | users | `users` | User accounts with OIDC standard claims |
| 006 | roles_permissions | `roles`, `permissions`, `role_permissions`, `user_roles` | RBAC system |
| 007 | custom_claims | `custom_claim_definitions`, `custom_claim_values` | Per-app custom claims |
| 008 | config | `system_config`, `signing_keys` | System configuration and JWKS keys |
| 009 | audit_log | `audit_log` | Security event logging |
| 010 | oidc_adapter | `oidc_payloads` | node-oidc-provider adapter storage |
| 011 | seed | — | Development seed data (DML only) |

### Token Tables (within users migration context)

| Table | Purpose |
|-------|---------|
| `magic_link_tokens` | Passwordless login tokens |
| `password_reset_tokens` | Password reset flow tokens |
| `invitation_tokens` | Admin-created user invitation tokens |

**Note**: Token tables are in RD-02 schema but will be created in the `005_users.sql` migration since they reference the `users` table.

### Seed Data Requirements

1. **Super-admin organization**: `name: "Porta Admin"`, `slug: "porta-admin"`, `is_super_admin: true`
2. **Default system configuration**: All config keys with their default values (token TTLs, rate limits, etc.)
3. **Initial signing key**: Placeholder — actual key generation will be handled by RD-03 (OIDC Core)
4. **Super-admin user**: Deferred to RD-06 (User Management) — requires password hashing which is not yet available

### Entity Relationship Summary

```
organizations (1) ──── (N) clients
organizations (1) ──── (N) users

applications  (1) ──── (N) application_modules
applications  (1) ──── (N) clients
applications  (1) ──── (N) roles
applications  (1) ──── (N) permissions
applications  (1) ──── (N) custom_claim_definitions

roles         (N) ──── (N) permissions          (via role_permissions)
users         (N) ──── (N) roles                (via user_roles)

users         (1) ──── (N) custom_claim_values
users         (1) ──── (N) magic_link_tokens
users         (1) ──── (N) password_reset_tokens
users         (1) ──── (N) invitation_tokens
```

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Primary keys | Auto-increment, UUID v4, ULID | UUID v4 (`gen_random_uuid`) | No ordering leakage, standard, built-in |
| Email storage | VARCHAR, CITEXT | CITEXT | Case-insensitive comparisons without `lower()` everywhere |
| Migration tool | node-pg-migrate, postgres-migrations, umzug | node-pg-migrate | SQL-based, up/down support, well-maintained |
| Secret storage | Plaintext, bcrypt, argon2 | Argon2id hash | Current best practice (hashing done in app layer, RD-07) |
| Token storage | Separate tables per type, single table | Single `oidc_payloads` table | Standard pattern for node-oidc-provider |
| Config storage | ENV only, DB only, DB + ENV | DB with ENV fallback | Configurable at runtime, seed with defaults |
| Audit log | Application table, external service | Application table | Self-contained, can be externalized later |
| Seed data scope | Full seed (org+user+app), minimal seed (org+config) | Minimal seed + config defaults | Super-admin user requires password hashing (RD-06/07), signing key requires crypto (RD-03) |

## Acceptance Criteria

1. [ ] All migration files execute successfully on a fresh database
2. [ ] `yarn migrate` runs all pending migrations
3. [ ] `yarn migrate:rollback` reverses the last migration
4. [ ] `yarn migrate:status` shows migration state
5. [ ] All foreign key constraints are enforced
6. [ ] All indexes are created
7. [ ] Seed data creates super-admin org and default config
8. [ ] Schema supports all entity relationships described above
9. [ ] OIDC adapter table works with node-oidc-provider's adapter interface
10. [ ] System config table contains all default values after seeding
11. [ ] Audit log table accepts entries with all required fields
12. [ ] Email uniqueness is case-insensitive (CITEXT)
