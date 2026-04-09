# Database Schema & Migrations Implementation Plan

> **Feature**: Complete PostgreSQL schema, migration system, and seed data for Porta v5
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Source**: [RD-02 — Database Schema & Migrations](../../requirements/RD-02-database-schema.md)

## Overview

This plan implements the complete database layer for Porta v5. It introduces `node-pg-migrate` as the SQL-based migration tool, creates 11 sequential migration files covering all 19 tables (organizations, applications, clients, users, RBAC, custom claims, config, audit log, OIDC adapter), seeds development data, and adds yarn scripts for migration management.

After this plan is complete, the project will have a fully versioned PostgreSQL schema with all tables, indexes, constraints, and seed data needed for subsequent feature development (RD-03 through RD-12).

## Document Index

| #  | Document | Description |
|----|----------|-------------|
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Feature requirements and scope (from RD-02) |
| 02 | [Current State](02-current-state.md) | Analysis of current database implementation |
| 03 | [Migration System](03-migration-system.md) | node-pg-migrate setup, configuration, CLI scripts |
| 04 | [Schema: Core Entities](04-schema-core.md) | Extensions, organizations, applications, modules, clients, secrets |
| 05 | [Schema: Users & Auth Tokens](05-schema-users-auth.md) | Users, magic links, password resets, invitation tokens |
| 06 | [Schema: RBAC, Config & OIDC](06-schema-rbac-config.md) | Roles, permissions, custom claims, system config, signing keys, audit log, OIDC payloads |
| 07 | [Testing Strategy](07-testing-strategy.md) | Test cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### After Implementation

```bash
# Start infrastructure
yarn docker:up

# Run all migrations
yarn migrate

# Check migration status
yarn migrate:status

# Rollback last migration
yarn migrate:rollback

# Create a new migration
yarn migrate:create my_migration_name

# Run tests
yarn test

# Full verification
yarn verify
```

### Key Decisions

| Decision | Outcome |
|----------|---------|
| Migration tool | node-pg-migrate (SQL-based, up/down support) |
| Primary keys | UUID v4 via `gen_random_uuid()` |
| Email storage | CITEXT (case-insensitive) |
| Secret hashing | Argon2id (referenced, hashing in application layer — RD-07) |
| OIDC token storage | Single `oidc_payloads` table (node-oidc-provider pattern) |
| Config storage | `system_config` table with JSONB values |
| Audit log | Application table with JSONB metadata |
| Timestamps | `TIMESTAMPTZ` with auto-managed `created_at`/`updated_at` |

## Key Files Created/Modified

```
porta/
├── migrations/
│   ├── 001_extensions.sql
│   ├── 002_organizations.sql
│   ├── 003_applications.sql
│   ├── 004_clients.sql
│   ├── 005_users.sql
│   ├── 006_roles_permissions.sql
│   ├── 007_custom_claims.sql
│   ├── 008_config.sql
│   ├── 009_audit_log.sql
│   ├── 010_oidc_adapter.sql
│   └── 011_seed.sql
├── src/
│   └── lib/
│       └── migrator.ts              # Migration runner utility
├── package.json                      # + node-pg-migrate, + migration scripts
├── .env.example                      # (unchanged, DATABASE_URL already present)
└── tests/
    └── integration/
        └── migrations.test.ts        # Migration integration tests
```
