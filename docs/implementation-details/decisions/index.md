# Architecture Decision Log

> **Last Updated**: 2026-04-24

## Overview

This page tracks all significant architecture decisions made during Porta's development. Each decision follows the ADR (Architecture Decision Record) format: context, decision, and consequences.

## Decision Log

| # | Decision | Status | Date | Summary |
|---|----------|--------|------|---------|
| ADR-001 | [Koa over Express](#adr-001-koa-over-express) | Accepted | — | Koa required for node-oidc-provider compatibility |
| ADR-002 | [Path-Based Multi-Tenancy](#adr-002-path-based-multi-tenancy) | Accepted | — | Organization slug in URL path for OIDC issuer isolation |
| ADR-003 | [Hybrid OIDC Adapters](#adr-003-hybrid-oidc-adapters-redis--postgresql) | Accepted | — | Redis for short-lived, PostgreSQL for long-lived OIDC artifacts |
| ADR-004 | [ES256 Token Signing](#adr-004-es256-token-signing) | Accepted | — | ECDSA P-256 for all JWT signing, no algorithm negotiation |
| ADR-005 | [Argon2id for Password Hashing](#adr-005-argon2id-for-password-hashing) | Accepted | — | Argon2id over bcrypt/scrypt for memory-hard hashing |
| ADR-006 | [Functional Code Style](#adr-006-functional-code-style) | Accepted | — | Standalone functions over classes for services |
| ADR-007 | [Zod for Config and Input Validation](#adr-007-zod-for-config-and-input-validation) | Accepted | — | Zod schemas for fail-fast config and request validation |
| ADR-008 | [Dual-Mode CLI Bootstrap](#adr-008-dual-mode-cli-bootstrap) | Accepted | — | Direct-DB for init/migrate, HTTP for all other commands |
| ADR-009 | [Self-Authentication for Admin API](#adr-009-self-authentication-for-admin-api) | Accepted | — | Porta validates its own tokens for admin API access |
| ADR-010 | [Domain Module Structure](#adr-010-domain-module-structure) | Accepted | — | Consistent module layout: types, repository, cache, service |
| ADR-011 | [Login Methods Resolution](#adr-011-login-methods-resolution) | Accepted | — | Per-client override with org-level default inheritance |
| ADR-012 | [Client Secret Two-Layer Hashing](#adr-012-client-secret-two-layer-hashing) | Accepted | — | SHA-256 pre-hash + Argon2id for OIDC compatibility |

---

## ADR-001: Koa over Express

**Context**: Porta needs an HTTP framework for its web server. node-oidc-provider, the OIDC engine, is designed for and tested with Koa.

**Decision**: Use Koa 2.x as the HTTP framework.

**Consequences**:
- ✅ Native compatibility with node-oidc-provider (no adapter needed)
- ✅ Clean async/await middleware pipeline
- ✅ Lightweight core with explicit middleware composition
- ⚠️ Smaller ecosystem than Express, fewer third-party middleware options

---

## ADR-002: Path-Based Multi-Tenancy

**Context**: Porta must serve multiple organizations, each with their own OIDC issuer. Options considered: subdomain-based (`orgSlug.auth.example.com`), path-based (`auth.example.com/orgSlug`), or header-based.

**Decision**: Use path-based multi-tenancy with the organization slug as the first URL path segment: `/:orgSlug/.well-known/openid-configuration`.

**Consequences**:
- ✅ Simple deployment — single DNS record, single TLS certificate
- ✅ Works behind any reverse proxy without wildcard DNS
- ✅ Tenant isolation via URL parsing (no header trust required)
- ✅ OIDC issuer URL naturally includes the tenant identifier
- ⚠️ All OIDC endpoints must be mounted under `/:orgSlug/` prefix
- ⚠️ Requires tenant resolver middleware before OIDC processing

---

## ADR-003: Hybrid OIDC Adapters (Redis + PostgreSQL)

**Context**: node-oidc-provider requires storage adapters for various OIDC artifacts (sessions, tokens, grants). Different artifacts have different durability and performance requirements.

**Decision**: Use a hybrid adapter strategy — Redis for short-lived artifacts, PostgreSQL for long-lived artifacts.

| Storage | Artifacts | Rationale |
|---------|-----------|-----------|
| Redis | Session, Interaction, AuthorizationCode, ReplayDetection, ClientCredentials, PushedAuthorizationRequest | High throughput, short TTL, acceptable data loss |
| PostgreSQL | AccessToken, RefreshToken, Grant | Durability required, survives Redis restart |

**Consequences**:
- ✅ Fast session lookups via Redis
- ✅ Durable tokens survive cache eviction
- ✅ Session `destroy()` cascades grant/token deletion across both stores
- ✅ Natural session expiry preserves tokens (enables refresh flows)
- ⚠️ Two adapter implementations to maintain
- ⚠️ Cascade deletion requires cross-store coordination

---

## ADR-004: ES256 Token Signing

**Context**: JWT tokens need a signing algorithm. Options: RS256 (RSA), ES256 (ECDSA), HS256 (HMAC), or EdDSA.

**Decision**: Use ES256 (ECDSA P-256) exclusively for all token signing. No algorithm negotiation.

**Consequences**:
- ✅ Smaller keys and signatures than RSA (faster verification)
- ✅ Well-supported across all JWT libraries
- ✅ No algorithm confusion attacks (single algorithm enforced)
- ✅ FIPS 186-4 compliant
- ⚠️ Requires native crypto module for key generation

---

## ADR-005: Argon2id for Password Hashing

**Context**: Passwords need to be hashed with a modern, memory-hard algorithm. Options: bcrypt, scrypt, Argon2id.

**Decision**: Use Argon2id for all password hashing, compliant with NIST SP 800-63B.

**Consequences**:
- ✅ Memory-hard — resistant to GPU/ASIC attacks
- ✅ OWASP recommended, NIST compliant
- ✅ Configurable memory/time/parallelism parameters
- ⚠️ Requires native C binding (`argon2` npm package) — needs build tools in Docker
- ⚠️ Also used for recovery code hashing and client secret verification

---

## ADR-006: Functional Code Style

**Context**: The codebase needs a consistent code organization pattern. Options: class-based services with DI, or standalone functions.

**Decision**: Use standalone exported functions for all service, repository, and utility code. No classes for business logic.

**Consequences**:
- ✅ Simpler to test (no instantiation, no mocking constructors)
- ✅ Tree-shakeable imports
- ✅ No dependency injection framework needed
- ✅ Module-level imports for dependencies (database pool, Redis client)
- ⚠️ Global state accessed via module imports (pool, Redis client)

---

## ADR-007: Zod for Config and Input Validation

**Context**: Environment variables and API request bodies need validation. Options: joi, yup, zod, class-validator.

**Decision**: Use Zod for both configuration validation (fail-fast on startup) and API request validation.

**Consequences**:
- ✅ TypeScript-native with excellent type inference
- ✅ Single library for both config and request validation
- ✅ Fail-fast config validation prevents runtime errors
- ✅ Production safety checks via Zod's `superRefine` (e.g., secure cookies require HTTPS)
- ⚠️ Config validated once at startup; system_config has its own runtime cache

---

## ADR-008: Dual-Mode CLI Bootstrap

**Context**: The CLI needs to work in two scenarios: (1) initial setup before any admin user exists, and (2) normal administration after setup.

**Decision**: Implement dual-mode bootstrap:
- `withBootstrap()` — Direct database access for `porta init`, `porta migrate`, `porta seed`
- `withHttpClient()` — HTTP-based access (via OIDC auth) for all other commands

**Consequences**:
- ✅ `porta init` can bootstrap the admin infrastructure without a pre-existing admin account
- ✅ Normal commands use the same auth flow as any other client (OIDC + PKCE)
- ✅ CLI credentials stored securely at `~/.porta/credentials.json` (0600 permissions)
- ⚠️ Two code paths to maintain (bootstrap vs HTTP)
- ⚠️ `porta login` requires a browser for the OIDC auth code flow

---

## ADR-009: Self-Authentication for Admin API

**Context**: The admin API needs authentication. Options: separate admin auth system, API keys, or use Porta's own OIDC tokens.

**Decision**: Porta authenticates its own admin API using tokens it issues to the super-admin organization. The admin-auth middleware validates ES256 JWTs against Porta's own signing keys.

**Consequences**:
- ✅ No external auth dependency
- ✅ Single source of truth for admin identity
- ✅ Leverages existing OIDC infrastructure (keys, token issuance, RBAC)
- ✅ `porta-admin` role provides granular access control
- ⚠️ Bootstrap requires `porta init` to create the super-admin org and first user

---

## ADR-010: Domain Module Structure

**Context**: The codebase is growing with multiple business domains. Need a consistent structure for each domain.

**Decision**: Each domain module follows a standard layout: `index.ts` (barrel), `types.ts`, `errors.ts`, `repository.ts`, `cache.ts`, `service.ts`, plus optional `slugs.ts` and `validators.ts`.

**Consequences**:
- ✅ Predictable file locations — developers know where to find things
- ✅ Clear separation of concerns within each module
- ✅ Barrel exports control the public API surface
- ✅ Easy to add new modules following the template
- ⚠️ Some modules have more files than strictly needed (not all need `slugs.ts`)

---

## ADR-011: Login Methods Resolution

**Context**: Different organizations and clients may support different authentication methods (password, magic link). Need a flexible inheritance model.

**Decision**: Per-client `login_methods` override (NULL = inherit from org) + per-org `default_login_methods` (NOT NULL, DB DEFAULT `{password,magic_link}`). Resolution via `resolveLoginMethods(org, client)`.

**Consequences**:
- ✅ Org-level default covers most cases
- ✅ Per-client override for special clients (e.g., passwordless-only SPA)
- ✅ NULL semantics = "inherit" is intuitive
- ✅ Enforced before authentication processing (early rejection)
- ⚠️ Template must handle 4 rendering modes (both/password-only/magic-link-only/empty)

---

## ADR-012: Client Secret Two-Layer Hashing

**Context**: node-oidc-provider uses SHA-256 to compare client secrets during `client_secret_post` authentication. But SHA-256 alone is insufficient for secret storage.

**Decision**: Store both a SHA-256 pre-hash (`secret_sha256`) for OIDC runtime comparison and a full Argon2id hash (`secret_hash`) for offline verification.

**Consequences**:
- ✅ Compatible with node-oidc-provider's SHA-256 comparison
- ✅ Full Argon2id protection for stored secrets
- ✅ SHA-256 pre-hash computed via middleware before reaching the provider
- ⚠️ Two hash values stored per secret (marginal storage overhead)

---

## Adding New ADRs

When making a significant architecture decision, add an entry to this log with:

1. **Context** — Why is this decision needed?
2. **Decision** — What was decided?
3. **Consequences** — What are the trade-offs?

Decisions that warrant an ADR:
- Technology choices (frameworks, libraries, databases)
- Architectural patterns (how modules interact)
- Security mechanisms (crypto algorithms, auth flows)
- Data model design (schema patterns, storage strategies)
- API design conventions (pagination, error handling)

## Related Documentation

- [System Overview](/implementation-details/architecture/system-overview) — Architecture resulting from these decisions
- [Security](/implementation-details/architecture/security) — Security decisions in practice
- [Data Model](/implementation-details/architecture/data-model) — Schema decisions in practice
