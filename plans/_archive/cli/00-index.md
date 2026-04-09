# CLI (Admin CLI Tooling) Implementation Plan

> **Feature**: yargs-based administrative CLI tool (`porta`) for all domain management operations
> **Status**: Planning Complete
> **Created**: 2026-04-09
> **Source**: [RD-09](../../requirements/RD-09-cli.md)

## Overview

Implement a yargs-based CLI tool (`porta`) that provides administrative commands for all domain entities in the Porta v5 OIDC provider. The CLI is the primary management interface until a web UI is built later. It invokes domain services directly (no HTTP API calls), supports both table and JSON output, includes confirmation prompts for destructive operations, and handles errors with clear, actionable messages.

The CLI reuses the existing service layer built in RD-04 through RD-08, making it a thin presentation layer over proven business logic. All domain operations — organizations, applications, clients, users, RBAC roles/permissions, custom claims, signing keys, system config, migrations, and audit logs — are exposed through a hierarchical command structure.

## Document Index

| #   | Document                                              | Description                                              |
| --- | ----------------------------------------------------- | -------------------------------------------------------- |
| 00  | [Index](00-index.md)                                  | This document — overview and navigation                  |
| 01  | [Requirements](01-requirements.md)                    | Feature requirements and scope                           |
| 02  | [Current State](02-current-state.md)                  | Analysis of current implementation                       |
| 03  | [CLI Foundation](03-cli-foundation.md)                | Entry point, bootstrap, output formatters, utilities     |
| 04  | [Infrastructure Commands](04-infrastructure-commands.md) | health, migrate, seed, keys, config commands          |
| 05  | [Domain Commands](05-domain-commands.md)              | org, app, client, user commands + nested subcommands     |
| 06  | [Testing Strategy](06-testing-strategy.md)            | Test cases and verification approach                     |
| 99  | [Execution Plan](99-execution-plan.md)                | Phases, sessions, and task checklist                     |

## Quick Reference

### Usage Examples

```bash
# Organization management
porta org create --name "Acme Corp"
porta org list --json
porta org show acme-corp
porta org suspend acme-corp

# Application management
porta app create --name "My App" --org acme-corp
porta app role create my-app --name "Admin" --description "Administrator role"
porta app permission create my-app --name "users:read" --description "Read users"

# Client management
porta client create --app my-app --type confidential --redirect-uris "https://app.example.com/callback"
porta client secret generate <client-id> --label "production"

# User management
porta user create --org acme-corp --email "john@example.com" --given-name "John" --family-name "Doe"
porta user roles assign <user-id> --role-ids <role-id-1>,<role-id-2> --org <org-id>
porta user claims set <user-id> --claim-id <claim-id> --value "some-value"

# Infrastructure
porta health check
porta migrate up
porta keys rotate
porta config list
porta audit list --org acme-corp --since 2026-04-01
```

### Key Decisions

| Decision            | Outcome                                                         |
| ------------------- | --------------------------------------------------------------- |
| CLI framework       | yargs — user requirement, flexible, well-maintained             |
| Output format       | Table (default) + JSON (`--json`) — human-readable + scriptable |
| Service access      | Direct invocation — no HTTP overhead, same codebase             |
| Confirmation prompts | For destructive ops, skip with `--force`                       |
| Table rendering     | cli-table3 — lightweight, customizable column widths            |
| Color output        | chalk — standard, widely used                                   |
| 2FA commands        | Stub only — depends on RD-12 (not yet implemented)              |

## Related Files

### New Files (to be created)

```
src/cli/
├── index.ts                    # CLI entry point (yargs setup + global options)
├── bootstrap.ts                # DB + Redis connection lifecycle
├── output.ts                   # Output helpers (table + JSON formatters, colors)
├── error-handler.ts            # CLI-specific error handling wrapper
├── prompt.ts                   # Confirmation prompt utility
├── commands/
│   ├── org.ts                  # Organization commands (8 subcommands)
│   ├── app.ts                  # Application commands (5 subcommands)
│   ├── app-module.ts           # Application module subcommands (4 subcommands)
│   ├── app-role.ts             # Role subcommands under app (7 subcommands)
│   ├── app-permission.ts       # Permission subcommands under app (4 subcommands)
│   ├── app-claim.ts            # Custom claim subcommands under app (4 subcommands)
│   ├── client.ts               # Client commands (5 subcommands)
│   ├── client-secret.ts        # Client secret subcommands (3 subcommands)
│   ├── user.ts                 # User commands (12 subcommands)
│   ├── user-role.ts            # User role subcommands (3 subcommands)
│   ├── user-claim.ts           # User custom claim subcommands (3 subcommands)
│   ├── keys.ts                 # Signing key commands (4 subcommands)
│   ├── config.ts               # System config commands (4 subcommands)
│   ├── migrate.ts              # Migration commands (4 subcommands)
│   ├── seed.ts                 # Seed data command (1 subcommand)
│   ├── health.ts               # Health check command (1 subcommand)
│   └── audit.ts                # Audit log viewer (1 subcommand)
tests/unit/cli/
├── bootstrap.test.ts           # Bootstrap utility tests
├── output.test.ts              # Output formatter tests
├── error-handler.test.ts       # Error handler tests
├── prompt.test.ts              # Prompt utility tests
├── commands/
│   ├── org.test.ts             # Organization command tests
│   ├── app.test.ts             # Application command tests
│   ├── client.test.ts          # Client command tests
│   ├── user.test.ts            # User command tests
│   ├── keys.test.ts            # Key management command tests
│   ├── config.test.ts          # Config command tests
│   ├── migrate.test.ts         # Migration command tests
│   ├── health.test.ts          # Health check command tests
│   └── audit.test.ts           # Audit log command tests
```

### Modified Files

- `package.json` — Add `bin` entry, yargs + cli-table3 + chalk dependencies, `porta` script
- `tsconfig.json` — Potentially add CLI entry to include paths
