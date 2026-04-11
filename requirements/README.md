# Porta v5 — Requirements Documents

> **Project**: Porta v5 — Multi-Tenant OIDC Provider
> **Status**: Requirements In Progress (RD-14 through RD-17 added)
> **Created**: 2026-04-08
> **Architecture**: Koa + TypeScript + node-oidc-provider + PostgreSQL + Redis

---

## Overview

Porta v5 is a multi-tenant OIDC provider built on top of [node-oidc-provider](https://github.com/panva/node-oidc-provider). It serves as the centralized authentication and authorization system for a SaaS product, managing per-customer (organization) user pools, OIDC clients, roles, permissions, and custom claims.

## Document Index

| # | Document | Description | Depends On |
|---|----------|-------------|------------|
| **RD-01** | [Project Scaffolding & Infrastructure](RD-01-project-scaffolding.md) | Koa, TypeScript, yarn, Docker Compose, toolchain | — |
| **RD-02** | [Database Schema & Migrations](RD-02-database-schema.md) | Full PostgreSQL schema, migration system, seed data | RD-01 |
| **RD-03** | [OIDC Provider Core](RD-03-oidc-provider-core.md) | node-oidc-provider integration, adapters, token config, JWKS | RD-01, RD-02 |
| **RD-04** | [Organization (Tenant) Management](RD-04-organization-management.md) | Org CRUD, per-tenant issuer routing, super-admin, branding | RD-02, RD-03 |
| **RD-05** | [Application, Client & Secret Management](RD-05-application-client-management.md) | App registration, client types, secret lifecycle, CORS | RD-02, RD-04 |
| **RD-06** | [User Management](RD-06-user-management.md) | OIDC standard claims, org-scoped users, status lifecycle | RD-02, RD-04 |
| **RD-07** | [Authentication Workflows & Login UI](RD-07-auth-workflows-login-ui.md) | Password + magic link flows, Handlebars templates, i18n, email, rate limiting | RD-03, RD-04, RD-06 |
| **RD-08** | [Authorization (RBAC) & Custom Claims](RD-08-rbac-custom-claims.md) | Roles, permissions, user-role assignment, custom claims in tokens | RD-05, RD-06 |
| **RD-09** | [CLI (Administrative Interface)](RD-09-cli.md) | yargs CLI for all admin operations | RD-02–RD-08 |
| **RD-10** | [Testing Strategy](RD-10-testing-strategy.md) | Vitest, unit/integration/E2E tests, coverage | All |
| **RD-11** | [Deployment & Blue-Green](RD-11-deployment.md) | Production Docker, blue-green deployment, health checks | RD-01, All |
| **RD-12** | [Two-Factor Authentication (2FA)](RD-12-two-factor-authentication.md) | Email OTP, TOTP authenticator, recovery codes, org 2FA policy | RD-02, RD-04, RD-06, RD-07 |
| **RD-13** | [Admin Authentication & CLI v2](RD-13-admin-auth-cli-v2.md) | Secure admin API, CLI OIDC login, bootstrap command, HTTP migration | RD-03, RD-05, RD-08, RD-09 |
| **RD-14** | [Playground Application](RD-14-playground-application.md) | Vanilla HTML/JS SPA for testing all OIDC flows, token inspection, 2FA scenarios | RD-03, RD-07, RD-12 |
| **RD-15** | [Playground Infrastructure & Seed Data](RD-15-playground-infrastructure.md) | Enhanced seed script, multi-org/multi-user test data, one-command startup | RD-14, RD-04, RD-05, RD-06, RD-12 |
| **RD-16** | [Scope Translation & UI Polish](RD-16-scope-translation-ui-polish.md) | Fix consent scope display, scope translation system, template audit | RD-07 |
| **RD-17** | [Setup & Usage Documentation](RD-17-setup-documentation.md) | Quickstart guide, architecture overview, CLI cheat sheet, integration guide | RD-14, RD-15 |

## Dependency Graph

```
RD-01 (Scaffolding)
  │
  ├── RD-02 (Database Schema)
  │     │
  │     ├── RD-03 (OIDC Core)
  │     │     │
  │     │     ├── RD-04 (Organizations)
  │     │     │     │
  │     │     │     ├── RD-05 (Apps & Clients)
  │     │     │     │     │
  │     │     │     │     └── RD-08 (RBAC & Custom Claims)
  │     │     │     │
  │     │     │     └── RD-06 (Users)
  │     │     │           │
  │     │     │           └── RD-08 (RBAC & Custom Claims)
  │     │     │
  │     │     └── RD-07 (Auth Workflows & Login UI)
  │     │           │
  │     │           └── RD-16 (Scope Translation & UI Polish)
  │     │
  │     └── RD-09 (CLI) ─── depends on RD-04 through RD-08
  │
  ├── RD-10 (Testing) ─── cross-cutting, all RDs
  │
  ├── RD-11 (Deployment) ─── cross-cutting, all RDs
  │
  ├── RD-12 (2FA) ─── depends on RD-02, RD-04, RD-06, RD-07
  │
  └── RD-14 (Playground App) ─── depends on RD-03, RD-07, RD-12
        │
        └── RD-15 (Playground Infrastructure) ─── depends on RD-04, RD-05, RD-06, RD-12
              │
              └── RD-17 (Setup Documentation) ─── depends on RD-14, RD-15
```

## Suggested Implementation Order

| Phase | Documents | Description |
|-------|-----------|-------------|
| **A: Foundation** | RD-01 → RD-02 → RD-03 | Project setup, database, OIDC core |
| **B: Domain Model** | RD-04 → RD-05 → RD-06 | Organizations, applications, users |
| **C: Auth & Authz** | RD-07 → RD-08 → RD-12 | Login flows, RBAC, custom claims, 2FA |
| **D: Tooling** | RD-09 → RD-10 → RD-11 | CLI, testing, deployment |
| **E: Polish & Playground** | RD-16 → RD-14 → RD-15 → RD-17 | Scope fix, playground app, seed data, documentation |

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Web framework | Koa | Native integration with node-oidc-provider |
| OIDC engine | node-oidc-provider | Battle-tested, spec-compliant, Koa-native |
| Database | PostgreSQL 16+ | Robust, supports CITEXT, JSONB, arrays |
| Session store | Redis 7+ | Fast, TTL support, rate limiting |
| Token format | Opaque access tokens, JWT ID tokens | Secure (requires introspection), standard |
| Signing | ES256 (ECDSA P-256) | Modern, fast, small keys |
| Multi-tenant | Path-based (`/{org-slug}`) | Simple, single domain |
| Password hashing | Argon2id | OWASP recommended, memory-hard |
| Template engine | Handlebars | Pluggable, per-org overrides |
| i18n | i18next | Industry standard, fallback chains |
| Email | Nodemailer (SMTP, pluggable) | Universal, works with MailHog for dev |
| CLI | yargs | Flexible, hierarchical commands |
| Testing | Vitest | Fast, TypeScript-native |
| 2FA — TOTP | otpauth | Modern, RFC 6238, works with all authenticator apps |
| 2FA — QR codes | qrcode | Data URL generation for enrollment QR |
| 2FA — Secret encryption | AES-256-GCM | Encrypted at rest, decryptable for verification |
| Deployment | Blue-green (blendsdk/blue-green) | Zero-downtime, instant rollback |

## How to Use These Documents

Each requirements document is designed to be used with the `make_plan` protocol:

```
1. Pick a requirements document (e.g., RD-01)
2. Run: make_plan
3. The plan system will use the RD as input to create:
   - 01-requirements.md (from the RD)
   - 02-current-state.md (analyzed from codebase)
   - 03-XX-[component].md (technical specs)
   - 07-testing-strategy.md (test plan)
   - 99-execution-plan.md (task checklist)
4. Run: exec_plan [feature-name]
5. Implement iteratively
```
