# Porta v5 — Requirements Overview

> **Project**: Porta v5 — OIDC Identity Provider
> **Version**: 0.10.0
> **Last Updated**: 2026-04-07
> **Status**: In Progress — Requirements Finalized

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Core Concepts](#3-core-concepts)
4. [Requirements Documents](#4-requirements-documents)
5. [Known Risks & Challenges](#5-known-risks--challenges)
6. [Resolved Questions](#6-resolved-questions)
7. [Effort Estimate](#7-effort-estimate)
8. [Changelog](#8-changelog)

---

## 1. Project Overview

### What Is Porta v5?

Porta v5 is a **purpose-built OIDC Identity Provider** — a service that issues tokens, manages user identities, and implements the OpenID Connect specification. It allows external applications to authenticate users and receive identity claims (who the user is, what organization they belong to, what roles they have, what they're allowed to do).

### Goals

- **Standards-compliant**: OpenID Connect Core 1.0, OAuth 2.0 (RFC 6749), PKCE (RFC 7636)
- **Production-ready**: Suitable for real-world deployment with proper security, monitoring, and operational tooling
- **Multi-tenant**: Organization model with application-scoped authorization — users belong to organizations, and their roles are scoped per (organization, application) pair
- **Multiple authentication methods**: Password, magic link (passwordless), TOTP 2FA
- **API-first management**: Full admin API for programmatic management of organizations, applications, clients, users, roles, and invitations
- **Brandable**: Per-application branding on interaction pages (login, consent, invitation)
- **Multi-language**: Internationalization (English + Dutch) for all user-facing pages and emails
- **Minimal footprint**: Lightweight Node.js service with minimal dependencies

### Non-Goals

- Porta v5 is NOT a general-purpose web framework
- Porta v5 does NOT provide a full admin dashboard UI (API-only for management; UI is only for authentication flows)
- Porta v5 does NOT implement social login federation (Google, GitHub, etc.) in the initial version

---

## 2. Architecture Decisions

### ADR-001: Use `oidc-provider` as the OIDC Protocol Engine

**Decision**: Use [panva/oidc-provider](https://github.com/panva/node-oidc-provider) (OpenID Certified™) for all OIDC protocol handling.

**Rationale**:
- Certified conformance with OIDC Core, Discovery, Dynamic Registration, and multiple security profiles
- Implements 10+ RFCs correctly (token formats, PKCE, introspection, revocation, DPoP, etc.)
- Maintained by the same author as `jose` (the standard JWT library)
- Building OIDC from scratch would require ~7-9 months of engineering

**Consequences**:
- We depend on a single-maintainer open-source project (MIT license)
- Breaking changes between major versions require adapter rewrites (~1-2 weeks per major version)
- We inherit Koa as a runtime dependency (oidc-provider is Koa-based)

### ADR-002: Pure Koa — No BlendSDK

**Decision**: Build the application as a native Koa application. Do not use BlendSDK/WebAFX.

**Rationale**:
- `oidc-provider` is natively Koa — using Express/WebAFX creates an impedance mismatch (Koa ctx vs Express req/res)
- An OIDC provider is a focused, specialized service — it doesn't need a full framework's abstractions
- Direct use of `pg`, `ioredis`, `nodemailer` is cleaner than wrapping them in BlendSDK packages
- Eliminates the #1 technical risk identified during research

**Consequences**:
- No dependency injection container — services are wired via closures/modules
- No abstract providers (CacheProvider, Database) — direct library usage
- Different stack from other BlendSDK services (acceptable for a dedicated identity service)
- Consumer applications can still use BlendSDK's `webafx-auth` (planned `OidcAuthProvider`) to validate tokens

### ADR-003: PostgreSQL + Redis Hybrid Storage

**Decision**: Use PostgreSQL for persistent data and Redis for ephemeral/high-frequency data.

**Rationale**:
- PostgreSQL: Users, organizations, applications, roles, clients, grants, refresh tokens, audit logs, signing keys — data that must survive restarts
- Redis: Sessions, access tokens, authorization codes, device codes, interactions — short-lived data with TTL

**Consequences**:
- Two data stores to operate and monitor
- Adapter must handle cross-store operations (e.g., revoking a grant touches both stores)

### ADR-004: Server-Rendered Interaction Pages

**Decision**: Login, consent, MFA, and invitation acceptance pages are server-rendered (EJS templates).

**Rationale**:
- OIDC interaction pages are simple forms — no need for a SPA framework
- Server-rendered pages are more secure (no client-side state manipulation)
- Faster to build and easier to secure against XSS

**Consequences**:
- Limited interactivity (acceptable for auth forms)
- Styling/branding needs to be done via CSS/templates
- Per-application branding resolved at render time from the OIDC client → application mapping

### ADR-005: Opaque Access Tokens

**Decision**: Access tokens are opaque (random references) rather than self-contained JWTs.

**Rationale**:
- Opaque tokens cannot be decoded by clients — no information leakage
- Revocation is instant (delete from store; next introspection returns inactive)
- Resource servers MUST use the `/introspect` endpoint, which gives Porta full control over what information is released
- oidc-provider supports this natively via `formats.AccessToken = 'opaque'`

**Consequences**:
- Resource servers must call `/introspect` on every request (or cache the result with a short TTL)
- Slightly higher latency for resource servers compared to local JWT validation
- ID tokens remain JWTs (required by OIDC spec)

### ADR-006: SMTP via Nodemailer for Email Delivery

**Decision**: Use Nodemailer with SMTP transport for all email delivery (magic links, invitations, password resets, email verification).

**Rationale**:
- No SaaS email dependency (SendGrid, SES, etc.)
- SMTP is universal — works with any email provider
- Simple configuration via environment variables

**Consequences**:
- Deliverability depends on the SMTP server configuration (SPF, DKIM, DMARC)
- No built-in analytics/tracking (acceptable for transactional auth emails)
- Configuration: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### ADR-007: Signing Keys in Database (Encrypted)

**Decision**: Store OIDC signing keys in PostgreSQL, encrypted at rest with AES-256-GCM.

**Rationale**:
- Works with horizontal scaling (all instances share the same keys from DB)
- Survives container restarts and blue-green deployments
- Key rotation is a database operation — no filesystem or KMS dependency
- Backup strategy aligns with existing database backup practices
- Only one secret to manage: `KEY_ENCRYPTION_KEY` environment variable

**Consequences**:
- `KEY_ENCRYPTION_KEY` must be securely managed (env var, injected at deploy time)
- Key rotation is automated (periodic) with configurable overlap period for JWKS

### ADR-008: Admin API Dual Authentication

**Decision**: The Admin API supports both static API keys and admin-scoped JWT tokens.

**Rationale**:
- **API keys** (`X-API-Key` header): For automation, CI/CD pipelines, and service-to-service calls
- **Admin JWT** (`Authorization: Bearer <token>`): For admin users authenticated through the OIDC flow via the built-in `porta-admin` application
- Having both allows programmatic access without requiring an interactive login flow

**Consequences**:
- API keys must be securely generated, hashed at rest, and rotatable
- Admin middleware checks both auth methods and resolves to an identity (API key name or user ID) for audit logging
- API keys are scoped (e.g., read-only, full-access) in Phase 2
- See [API-SURFACE.md §Admin API Authentication](./API-SURFACE.md#admin-api-authentication) for the full auth specification

### ADR-009: Client Secrets Hashed at Rest

**Decision**: OIDC client secrets are hashed (SHA-256) and shown only once at creation time.

**Rationale**:
- Hashing prevents secret exposure even if the database is compromised
- Industry standard practice (GitHub, Stripe, Google Cloud all do this)
- oidc-provider supports a custom `client_secret` comparison function

**Consequences**:
- Secrets cannot be recovered — only regenerated (rotate-secret endpoint)
- The API returns the plaintext secret exactly once in the creation/rotation response
- Admin API "get client" never includes the secret

### ADR-010: Docker Blue-Green Deployment

**Decision**: Deploy via Docker using a blue-green deployment pattern.

**Rationale**:
- Zero-downtime deployments
- Infrastructure already exists

**Consequences**:
- Application must be stateless (all state in PostgreSQL/Redis) — already a requirement
- Signing keys in database ensures both blue and green instances use the same keys

---

## 3. Core Concepts

### Organization

An **Organization** is a tenant boundary — a company, team, or customer account. It is the top-level grouping for user access.

- Organizations have **members** (users) with organization-level roles (owner, admin, member)
- Organizations **subscribe to applications** — enabling which applications are available to their members
- Users are assigned **application roles within an organization** — a user can be "admin" in App CRM for "Company A" and "viewer" in App CRM for "Company B"
- Organizations enable multi-tenant SaaS scenarios where the same application serves multiple customers with isolated access

### Application

An **Application** represents a logical product or service — equivalent to an "App Registration" in Azure AD.

- Applications define **permissions** and **roles** globally (the role/permission catalog)
- Applications can have one or more **OIDC clients** per organization
- Applications are shared across organizations — different organizations can use the same application with the same role definitions
- Each application can define **branding** (logo, colors, CSS) for its interaction pages
- Application IDs are user-provided slugs (lowercase alphanumeric + hyphens, 3-64 chars, immutable after creation)

### OIDC Client

An **OIDC Client** is a technical configuration that belongs to an (Organization, Application) pair. It defines how a specific frontend, backend, or service authenticates with Porta.

- Identified by `client_id` (and optionally `client_secret` for confidential clients)
- Configures: grant types, redirect URIs, token endpoint auth method, allowed scopes
- Scoped to an organization + application — "Company A's CRM SPA" is a different client than "Company B's CRM SPA"
- **Claim resolution rule**: The organization and application context for custom claims (`app:roles`, `app:organization`) is ALWAYS derived from the authenticating OIDC client's `organization_id` and `application_id`. The user does not select an organization during authentication.

### User

A **User** is an identity that can authenticate. Users exist globally (not per-organization) but their roles and permissions are scoped per (organization, application).

- A user can belong to multiple organizations (e.g., a consultant)
- Within each organization, they have roles per application

### Role

A **Role** is a named group of permissions, defined globally per Application. Examples: "admin", "editor", "viewer".

### Permission

A **Permission** is a fine-grained capability, defined globally per Application. Examples: "documents:read", "documents:write", "admin:manage".

### Invitation

An **Invitation** is a mechanism for onboarding users into an organization for a specific application. An invitation creates a pending user record that is activated when the user accepts, assigning them to the organization with the specified roles.

---

## 4. Requirements Documents

> The detailed requirements are split across multiple focused documents. Each document is self-contained and can be read independently.

| Document | Section | Description |
|----------|---------|-------------|
| [FEATURES.md](./FEATURES.md) | §4 | Feature requirements (OIDC, Auth, MFA, Org, App, RBAC, Claims, Clients, Users, Invitations, Self-Service, Audit, i18n), Audit Event Catalog, Scope Catalog, Introspection Response, Status Enforcement, Profile Claims Mapping |
| [API-SURFACE.md](./API-SURFACE.md) | §5 | OIDC Protocol Endpoints, Interaction Endpoints, Admin API Authentication, API Conventions (pagination, response format, HTTP codes, CORS), Admin API (~60 endpoints), Self-Service API |
| [DATA-MODEL.md](./DATA-MODEL.md) | §6 | ER diagram, 17+ tables, oidc_clients.payload fields, FK Cascade Matrix, Database Index Strategy |
| [SECURITY.md](./SECURITY.md) | §7 | 25 security requirements (SEC-01 through SEC-25), Account Lockout, Rate Limiting, Password Policy, Signing Key Rotation, Token & Session Lifetimes |
| [OPERATIONS.md](./OPERATIONS.md) | §8 | Performance targets, Deployment, Monitoring, Development, Bootstrapping, Migrations, Redis Key Strategy, Stale Data Cleanup, Environment Variables Reference |

---

## 5. Known Risks & Challenges

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| `oidc-provider` single maintainer | Medium | Low-Medium | Library is mature; pin versions; `jose` dependency already accepted |
| `oidc-provider` breaking changes on upgrade | Medium | Medium | Pin major version; budget ~1-2 weeks/year for upgrades |
| oidc-provider adapter edge cases (consume, revoke) | High | Likely | Extensive integration tests; use PostgreSQL transactions |
| Cross-store consistency (PostgreSQL + Redis) | High | Likely | Redis as cache/ephemeral only; PostgreSQL as source of truth |
| Key management operational complexity | Medium | Certain | Automate rotation; encrypted storage in DB with single env var |
| Security responsibility (login UI, password storage, brute force) | High | Certain | Security review; OWASP guidelines; pen testing |
| Testing OIDC conformance | Medium | Certain | Run conformance tests in CI for continuous verification |
| Multi-tenant data isolation | High | Likely | All queries include organization_id; enforce at service layer; integration tests per org boundary |
| Organization model complexity | Medium | Certain | Build from day one to avoid costly refactoring |

---

## 6. Resolved Questions

> All questions have been resolved as of v0.2.0.

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Should self-service registration be enabled by default? | **No** — invite-only by default, opt-in per deployment via config flag. SELF-01 remains Phase 2. |
| Q2 | Should there be an organization/tenant model above applications? | **Yes** — organizations are included in MVP. Users belong to organizations, and roles are scoped to (user, organization, application). See [FEATURES.md §4.4](./FEATURES.md#44-organization-model). |
| Q3 | What email delivery service to use in production? | **SMTP via Nodemailer**. No SaaS dependency. Config via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars. |
| Q4 | Should the interaction UI be brandable per application? | **Yes** — applications have a `branding` JSONB field (logo, colors, CSS). Interaction pages resolve branding from OIDC client → application. |
| Q5 | Opaque tokens or JWT for access tokens? | **Opaque** — access tokens are opaque references stored in the adapter. Resource servers MUST use `/introspect`. ID tokens remain JWTs per OIDC spec. See ADR-005. |
| Q6 | Admin API authentication mechanism? | **Both** — static API keys (`X-API-Key` header) for automation and admin JWT (`Authorization: Bearer`) for admin users. See ADR-008 and [API-SURFACE.md §Admin API Authentication](./API-SURFACE.md#admin-api-authentication). |
| Q7 | Should client secrets be stored hashed or encrypted? | **Hashed** — SHA-256, shown once at creation, never recoverable. Rotate via API. See ADR-009. |
| Q8 | What is the deployment target? | **Docker with blue-green deployment pattern** — infrastructure already exists. See ADR-010. |
| Q9 | Is OIDC Foundation certification desired? | **No** — `oidc-provider` is already OpenID Certified™. OIDC conformance tests will run in CI for continuous verification, but formal certification is not pursued. |
| Q10 | How should signing keys be stored? | **Database (PostgreSQL), encrypted at rest** with AES-256-GCM. Single `KEY_ENCRYPTION_KEY` env var for encryption. See ADR-007 and [DATA-MODEL.md signing_keys](./DATA-MODEL.md#signing_keys). |

---

## 7. Effort Estimate

> Based on a single developer. Reduce proportionally with team size.

| Phase | Components | Effort |
|-------|-----------|--------|
| **Phase 0: Setup** | Project scaffolding, Docker, CI, config | 2 days |
| **Phase 1: Core OIDC** | oidc-provider config, storage adapter, JWKS, signing keys, findAccount | 8 days |
| **Phase 2: Auth Flows** | Password login, magic link, MFA, consent UI, branding | 9 days |
| **Phase 3: Organization Model** | Organizations CRUD, members, subscriptions, org-scoped queries | 3 days |
| **Phase 4: Application Model** | Applications, roles, permissions, claims | 5 days |
| **Phase 5: Admin API** | All admin endpoints (orgs, apps, clients, users, roles) | 8 days |
| **Phase 6: Invitations** | Invitation system (org-scoped), acceptance flow, emails via SMTP | 4 days |
| **Phase 7: Self-Service** | Password reset, email verification, MFA setup | 4 days |
| **Phase 8: Security** | Rate limiting, brute force, CSRF, input validation, key rotation | 4 days |
| **Phase 9: Testing** | Unit tests, integration tests, auth flow e2e, OIDC conformance | 6 days |
| **Phase 10: Polish** | Audit logging, documentation, deployment config | 3 days |
| **Total** | | **~56 days (~11 weeks)** |

---

## 8. Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-03 | 0.1.0 | Initial requirements document |
| 2026-04-07 | 0.2.0 | Resolved all open questions. Added organization model (§3, §4.4). Added signing keys table, admin API keys table, application branding. Updated data model for org-scoped role assignments and OIDC clients. Added ADR-005 through ADR-010. Updated API surface for organization-scoped endpoints. Updated effort estimate. Promoted CLAIMS-03 to MVP. Added PERF-04, DEPLOY-08, SEC-21/22/23. |
| 2026-04-07 | 0.3.0 | **Round 1 gap analysis (11 gaps):** Added Admin API Key CRUD endpoints, interaction error handling specification, API conventions (pagination, response format, HTTP codes), CORS policy (SEC-25), password policy (NIST SP 800-63B, SEC-24), token & session lifetimes (11 configurable TTLs), consent scope i18n, database migration strategy, Redis key strategy, environment variables reference. |
| 2026-04-07 | 0.4.0 | **Round 2 gap analysis (11 gaps):** Added Scope Catalog (7 scopes), introspection response specification, admin JWT qualification via `porta-admin` application, client credentials roles (`client_roles` TEXT[] on oidc_clients), consent policy (skipConsent), health check endpoint, email verification & password reset token tables, FK cascade matrix (22 relationships), account lockout policy, rate limiting thresholds (9 endpoint categories). |
| 2026-04-07 | 0.5.0 | **Round 3 gap analysis (10 gaps):** Added bootstrapping procedure (`npm run bootstrap`, porta-system org, porta-admin app, admin roles, initial admin user), audit event type catalog (50+ events across 5 categories), signing key rotation policy (90-day, RS256 default, pg_try_advisory_lock), signing key admin endpoints, database index strategy (21+ indexes including partial), structured log schema, organization/application status enforcement (4-step check), `system` boolean on organizations and applications, profile claims mapping, oidc_clients.payload key fields. |
| 2026-04-07 | 0.6.0 | Added i18n feature requirements (§4.13, I18N-01 through I18N-11), user `locale` column, language resolution order, translatable email templates and validation messages, consent scope descriptions. |
| 2026-04-07 | 0.7.0 | **Structural split:** Monolithic requirements document split into 6 focused files for maintainability. No content changes. Files: OVERVIEW.md, FEATURES.md, API-SURFACE.md, DATA-MODEL.md, SECURITY.md, OPERATIONS.md. |
| 2026-04-07 | 0.8.0 | **Round 4 gap analysis (28 gaps):** Replaced stale v0.2.0 master with OVERVIEW.md. Added bootstrap OIDC client for porta-admin (BOOTSTRAP_ADMIN_REDIRECT_URI). Added `revoked_at` to admin_api_keys, `updated_at` to oidc_clients. Specified application ID format (slug, 3-64 chars, immutable). Added org-app subscription check to status enforcement. Defined admin JWT authentication specification (role→access matrix). Added request/response body schemas and sensitive field exclusion rules. Defined org_role semantics for MVP (metadata + at-least-one-owner rule). Changed invitations.roles from TEXT[] to UUID[] (role_ids). Added explicit claim resolution rule for multi-org users. Added email template specification. Defined health check response schema. Added audit_log FK for application_id. Standardized UUID PK defaults. Specified oidc_clients.id and signing_keys.id generation. Documented magic link timing edge case. Added missing cascade behaviors. Added stale data cleanup specification. Defined PUT merge semantics. Documented applications.owner_id purpose. Noted admin_api_keys.scopes MVP behavior. Listed oidc_models model names. |
| 2026-04-07 | 0.9.0 | **Round 5 gap analysis (9 gaps):** Specified bootstrap porta-admin-client full config (public client, grant_types, scopes). Split self-service API into authenticated/unauthenticated. Defined email branding fallback for context-free flows. Added admin_api_keys.created_by cascade. Defined invitation post-flow (welcome page, no auto-login). Expanded CSRF to invitation forms. Added CORS for self-service. Added timestamps to permissions/roles. Fixed audit_log.organization_id FK notation. |
| 2026-04-07 | 0.10.0 | **Round 6 gap analysis (5 fixes):** Added permissions immutability note (no update endpoint — delete and re-create). Fixed signing key rotation link (§5.4 → §5.5). Added `roles.is_default` Phase 2 note. Added `POST /api/reset-password` rate limit (10/min per IP). Added self-service request body reference table. |
