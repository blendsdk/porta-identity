# Requirements: OIDC Provider Core

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Integrate `node-oidc-provider` as the OIDC protocol engine for Porta v5. The provider handles all standard OIDC/OAuth2 protocol operations — authorization, token issuance, introspection, revocation, JWKS, and discovery. Porta wraps this engine with multi-tenant issuer resolution (one issuer per organization), a hybrid PostgreSQL/Redis adapter for artifact storage, runtime-configurable token lifetimes from the database, and ES256 signing key management.

This is the foundational OIDC layer that all subsequent features (organizations, clients, users, auth workflows, RBAC) build upon.

## Functional Requirements

### Must Have

- [ ] `node-oidc-provider` installed, configured, and mounted on the Koa application
- [ ] Multi-tenant issuer support: `/{org-slug}` path prefix → unique OIDC issuer per organization
- [ ] PostgreSQL adapter for persistent OIDC artifact storage (via `oidc_payloads` table from RD-02)
- [ ] Redis adapter for short-lived OIDC data (sessions, interactions, auth codes, replay detection)
- [ ] Hybrid adapter factory that routes by model name (Redis for short-lived, Postgres for long-lived)
- [ ] Opaque access tokens (not JWT — more secure, requires introspection)
- [ ] JWT ID tokens (standard, client-readable, signed with ES256)
- [ ] ES256 signing algorithm (ECDSA with P-256 curve)
- [ ] Signing keys loaded from `signing_keys` table at startup
- [ ] ES256 key generation utility (for initial bootstrap and future rotation)
- [ ] JWKS endpoint serving active + grace-period (retired) keys
- [ ] Dynamic client lookup from `clients` + `client_secrets` tables (stub in RD-03)
- [ ] Dynamic account finder from `users` table (stub in RD-03)
- [ ] Token introspection endpoint (RFC 7662)
- [ ] Token revocation endpoint (RFC 7009)
- [ ] All token lifetimes read from `system_config` table with hardcoded fallback defaults
- [ ] System config service that reads typed values from the `system_config` table
- [ ] Cookie configuration with secure defaults
- [ ] CORS middleware for OIDC endpoints (origin checked against registered client origins)

### Supported OIDC/OAuth2 Flows

- [ ] Authorization Code with PKCE (web, mobile, desktop) — PKCE required, S256 only
- [ ] Client Credentials (service-to-service)
- [ ] Refresh Token (with rotation)

### Supported OIDC Endpoints

All endpoints are mounted under `/{org-slug}/` prefix:

| Endpoint | Path | Purpose |
|----------|------|---------|
| Authorization | `/{org-slug}/auth` | Start authorization flow |
| Token | `/{org-slug}/token` | Exchange code for tokens |
| UserInfo | `/{org-slug}/userinfo` | Get user claims |
| JWKS | `/{org-slug}/jwks` | Public signing keys |
| Discovery | `/{org-slug}/.well-known/openid-configuration` | Provider metadata |
| Introspection | `/{org-slug}/token/introspection` | Check token validity |
| Revocation | `/{org-slug}/token/revocation` | Invalidate tokens |
| End Session | `/{org-slug}/session/end` | Logout |

### Should Have

- [ ] Token exchange support (RFC 8693) — enabled in configuration for future use
- [ ] Pushed Authorization Requests (PAR, RFC 9126) — enabled in configuration
- [ ] Resource indicators (RFC 8707) — audience restriction on tokens

### Won't Have (Out of Scope for RD-03)

- Dynamic client registration (RFC 7591) — clients are admin-registered only
- Implicit flow — deprecated, not secure
- ROPC (Resource Owner Password Credentials) flow — deprecated
- Device Authorization Grant — not needed for web/mobile/desktop with browser
- SAML / WS-Federation — OIDC only
- Full `findAccount` implementation — deferred to RD-06 (Users)
- Full `findClient` with secret verification — deferred to RD-05 (Applications & Clients)
- Login/consent UI — deferred to RD-07 (Auth Workflows)
- Custom claims injection — deferred to RD-08 (RBAC & Custom Claims)
- Key rotation CLI commands — deferred to RD-09 (CLI)

## Technical Requirements

### Performance

- Redis adapter for short-lived artifacts (< 100ms per operation)
- System config values cached to avoid per-request DB queries
- Signing keys loaded once at startup (not per-request)
- Organization lookup in tenant resolver should be cached (Redis)

### Security

- Opaque access tokens — cannot be decoded by client, must use introspection
- PKCE required for all authorization code flows (S256 only, no plain)
- ES256 signing (modern, fast, secure)
- Secure cookies (httpOnly, signed, sameSite: lax)
- CORS restricted to registered client origins only
- No private key exposure in JWKS endpoint (only public keys)

### Compatibility

- Must work with the existing Koa middleware stack (error handler, request logger, body parser)
- Must not break the existing `/health` endpoint
- Must use the existing PostgreSQL pool (`src/lib/database.ts`)
- Must use the existing Redis client (`src/lib/redis.ts`)
- Must use `.js` extensions in imports (NodeNext module resolution)

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Adapter strategy | All Postgres, all Redis, hybrid | Hybrid | Redis for performance on short-lived artifacts; Postgres for persistence on long-lived tokens |
| Access token format | JWT, opaque | Opaque | More secure — tokens can't be decoded client-side; supports instant revocation via introspection |
| Signing algorithm | RS256, ES256, EdDSA | ES256 | Modern, fast, small keys/signatures, widely supported by OIDC clients |
| Multi-tenant model | Path-based, subdomain, header | Path-based (`/{org-slug}`) | Simple, works with single domain, easy to test locally, no DNS setup needed |
| PKCE policy | Optional, required for public, required for all | Required for all | OAuth 2.1 best practice; eliminates authorization code interception attacks |
| Client lookup | Static config, dynamic DB | Dynamic DB | Required for admin-managed multi-tenant clients |
| findAccount scope in RD-03 | Full implementation, stub | Stub | Real implementation depends on RD-06 (Users); stub returns minimal data |
| findClient scope in RD-03 | Full with secret verification, stub | Stub with basic lookup | Secret verification (Argon2id) depends on RD-05; basic structure now |
| System config caching | No cache, in-memory TTL, Redis | In-memory with TTL | Simple, fast, avoids Redis dependency for config reads; TTL ensures eventual consistency |

## Acceptance Criteria

1. [ ] `node-oidc-provider` starts successfully and serves discovery endpoint
2. [ ] Discovery endpoint at `/{org-slug}/.well-known/openid-configuration` returns valid JSON
3. [ ] JWKS endpoint at `/{org-slug}/jwks` returns ES256 public keys
4. [ ] PostgreSQL adapter correctly stores and retrieves OIDC payloads
5. [ ] Redis adapter correctly stores and retrieves short-lived OIDC artifacts
6. [ ] Adapter factory routes short-lived models to Redis, long-lived to PostgreSQL
7. [ ] System config service reads TTL values from `system_config` table
8. [ ] Signing keys loaded from `signing_keys` table and converted to JWK format
9. [ ] ES256 key generation utility produces valid key pairs
10. [ ] Multi-tenant issuer: different org slugs produce different issuer URLs
11. [ ] Invalid org slug returns 404
12. [ ] Cookie configuration uses secure defaults
13. [ ] All token TTLs sourced from system config with fallback defaults
14. [ ] Existing `/health` endpoint still works unchanged
15. [ ] `yarn verify` passes (lint + build + all tests)
