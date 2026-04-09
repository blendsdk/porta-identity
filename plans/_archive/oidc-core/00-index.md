# OIDC Provider Core Implementation Plan

> **Feature**: Integrate node-oidc-provider as the OIDC protocol engine for Porta v5
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Source**: [RD-03 — OIDC Provider Core](../../requirements/RD-03-oidc-provider-core.md)

## Overview

This plan integrates `node-oidc-provider` into the Porta v5 Koa application. It implements a hybrid PostgreSQL/Redis adapter strategy for OIDC artifact storage, ES256 signing key management loaded from the database, a system config service for runtime-configurable TTLs, multi-tenant issuer resolution (one OIDC issuer per organization slug), dynamic client lookup, and CORS support.

After this plan is complete, the OIDC provider will be mounted on the Koa app with all core endpoints functional: authorization, token, userinfo, JWKS, discovery, introspection, revocation, and end-session. The provider will support Authorization Code + PKCE, Client Credentials, and Refresh Token flows. Stub implementations are provided for `findAccount` and `findClient` — these will be completed in RD-05 (clients) and RD-06 (users).

## Document Index

| #  | Document | Description |
|----|----------|-------------|
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Feature requirements and scope (from RD-03) |
| 02 | [Current State](02-current-state.md) | Analysis of current codebase and infrastructure |
| 03 | [Provider Setup & Config](03-provider-setup.md) | node-oidc-provider installation, config expansion, system config service |
| 04 | [Adapters](04-adapters.md) | PostgreSQL adapter, Redis adapter, hybrid adapter factory |
| 05 | [Keys & Crypto](05-keys-and-crypto.md) | Signing key management, ES256 key generation, cookie keys |
| 06 | [Tenant, Clients & Mounting](06-tenant-and-mounting.md) | Multi-tenant issuer, client/account finders, CORS, Koa mounting |
| 07 | [Testing Strategy](07-testing-strategy.md) | Test cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### After Implementation

```bash
# Start infrastructure (Postgres + Redis)
yarn docker:up

# Run migrations (creates oidc_payloads, signing_keys, system_config, etc.)
yarn migrate

# Start dev server (OIDC provider mounted at /:org-slug/*)
yarn dev

# Discovery endpoint
curl http://localhost:3000/porta-admin/.well-known/openid-configuration

# JWKS endpoint
curl http://localhost:3000/porta-admin/jwks

# Health check (unchanged)
curl http://localhost:3000/health

# Full verification
yarn verify
```

### Key Decisions

| Decision | Outcome |
|----------|---------|
| Provider engine | `node-oidc-provider` (battle-tested OIDC Certified implementation) |
| Adapter strategy | Hybrid: Redis for short-lived (Session, Interaction, AuthorizationCode), PostgreSQL for long-lived (AccessToken, RefreshToken, Grant) |
| Access token format | Opaque (requires introspection, more secure, instant revocation) |
| ID token format | JWT (standard, client-readable) |
| Signing algorithm | ES256 (ECDSA P-256 — fast, small, widely supported) |
| PKCE | Required for ALL authorization code flows (OAuth 2.1 best practice) |
| Multi-tenant model | Path-based: `/{org-slug}` prefix for all OIDC endpoints |
| TTL source | `system_config` table with hardcoded fallback defaults |
| Client lookup | Dynamic from `clients` table (stub in RD-03, completed in RD-05) |
| Account finder | Dynamic from `users` table (stub in RD-03, completed in RD-06) |

## Key Files Created/Modified

```
porta/
├── src/
│   ├── oidc/
│   │   ├── provider.ts             # OIDC provider factory — creates & configures node-oidc-provider
│   │   ├── configuration.ts        # Provider configuration builder (features, TTLs, scopes, claims)
│   │   ├── postgres-adapter.ts     # PostgreSQL adapter for oidc_payloads table
│   │   ├── redis-adapter.ts        # Redis adapter for short-lived OIDC artifacts
│   │   ├── adapter-factory.ts      # Hybrid adapter factory — routes by model name
│   │   ├── account-finder.ts       # findAccount implementation (stub, completed in RD-06)
│   │   └── client-finder.ts        # Dynamic client lookup (stub, completed in RD-05)
│   ├── lib/
│   │   ├── signing-keys.ts         # Signing key management — load, generate, PEM↔JWK conversion
│   │   └── system-config.ts        # System config service — reads TTLs from system_config table
│   ├── middleware/
│   │   ├── tenant-resolver.ts      # Multi-tenant org-slug extraction and validation
│   │   └── oidc-cors.ts            # CORS middleware for OIDC endpoints
│   ├── server.ts                   # Updated — mount OIDC provider under /:orgSlug
│   └── config/
│       └── schema.ts               # Updated — add cookieKeys config field
├── package.json                    # + oidc-provider dependency
└── tests/
    └── unit/
        ├── oidc/
        │   ├── postgres-adapter.test.ts
        │   ├── redis-adapter.test.ts
        │   ├── adapter-factory.test.ts
        │   ├── configuration.test.ts
        │   ├── account-finder.test.ts
        │   └── client-finder.test.ts
        ├── lib/
        │   ├── signing-keys.test.ts
        │   └── system-config.test.ts
        └── middleware/
            └── tenant-resolver.test.ts
```
