# Porta v5 — Requirements Document

> **Project**: Porta v5 — OIDC Identity Provider
> **Version**: 0.2.0
> **Last Updated**: 2026-04-07
> **Status**: In Progress — Requirements Finalized

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Core Concepts](#3-core-concepts)
4. [Feature Requirements](#4-feature-requirements)
   - [4.1 OIDC Protocol (via oidc-provider)](#41-oidc-protocol-via-oidc-provider)
   - [4.2 Authentication Methods](#42-authentication-methods)
   - [4.3 Multi-Factor Authentication (MFA)](#43-multi-factor-authentication-mfa)
   - [4.4 Organization Model](#44-organization-model)
   - [4.5 Application Model](#45-application-model)
   - [4.6 Roles & Permissions (RBAC)](#46-roles--permissions-rbac)
   - [4.7 Custom Claims](#47-custom-claims)
   - [4.8 Client Management](#48-client-management)
   - [4.9 User Management](#49-user-management)
   - [4.10 User Invitations](#410-user-invitations)
   - [4.11 Self-Service Flows](#411-self-service-flows)
   - [4.12 Audit Logging](#412-audit-logging)
5. [API Surface](#5-api-surface)
   - [5.1 OIDC Protocol Endpoints](#51-oidc-protocol-endpoints)
   - [5.2 Interaction Endpoints (User-Facing)](#52-interaction-endpoints-user-facing)
   - [5.3 Admin API Endpoints](#53-admin-api-endpoints)
   - [5.4 Self-Service API Endpoints](#54-self-service-api-endpoints)
6. [Data Model](#6-data-model)
7. [Security Requirements](#7-security-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Known Risks & Challenges](#9-known-risks--challenges)
10. [Resolved Questions](#10-resolved-questions)
11. [Effort Estimate](#11-effort-estimate)
12. [Changelog](#12-changelog)

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

**Decision**: Login, consent, MFA, and invitation acceptance pages are server-rendered (EJS templates or similar).

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
- **Admin JWT** (`Authorization: Bearer <token>`): For admin users authenticated through the OIDC flow
- Having both allows programmatic access without requiring an interactive login flow

**Consequences**:
- API keys must be securely generated, hashed at rest, and rotatable
- Admin middleware checks both auth methods and resolves to an identity (API key name or user ID) for audit logging
- API keys are scoped (e.g., read-only, full-access) in Phase 2

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

### OIDC Client

An **OIDC Client** is a technical configuration that belongs to an (Organization, Application) pair. It defines how a specific frontend, backend, or service authenticates with Porta.

- Identified by `client_id` (and optionally `client_secret` for confidential clients)
- Configures: grant types, redirect URIs, token endpoint auth method, allowed scopes
- Scoped to an organization + application — "Company A's CRM SPA" is a different client than "Company B's CRM SPA"

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

## 4. Feature Requirements

### Priority Legend

| Tag | Meaning |
|-----|---------|
| **MVP** | Required for first production release |
| **Phase 2** | Important but can follow shortly after MVP |
| **Future** | Nice-to-have, not planned for initial releases |

---

### 4.1 OIDC Protocol (via oidc-provider)

> All OIDC protocol features are provided by `oidc-provider`. We configure and integrate them.

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| OIDC-01 | OpenID Connect Core 1.0 compliance | **MVP** | Authorization, token, userinfo endpoints |
| OIDC-02 | OAuth 2.0 Authorization Code grant + PKCE | **MVP** | PKCE enforced for all clients |
| OIDC-03 | OAuth 2.0 Client Credentials grant | **MVP** | Machine-to-machine authentication |
| OIDC-04 | OAuth 2.0 Refresh Token grant | **MVP** | With rotation and replay detection |
| OIDC-05 | Discovery endpoint (`.well-known/openid-configuration`) | **MVP** | Auto-generated by oidc-provider |
| OIDC-06 | JWKS endpoint (`/jwks`) | **MVP** | Public signing keys |
| OIDC-07 | Token Introspection (RFC 7662) | **MVP** | Resource servers MUST use this for opaque access tokens |
| OIDC-08 | Token Revocation (RFC 7009) | **MVP** | Explicit token invalidation |
| OIDC-09 | RP-Initiated Logout | **MVP** | Logout with redirect |
| OIDC-10 | Opaque access tokens | **MVP** | Access tokens are opaque references; introspection required |
| OIDC-11 | Device Authorization Grant (RFC 8628) | **Phase 2** | For CLI tools, TV apps, IoT |
| OIDC-12 | Dynamic Client Registration (RFC 7591) | **Future** | Self-service client registration |
| OIDC-13 | Back-Channel Logout | **Future** | Server-to-server logout propagation |
| OIDC-14 | DPoP (RFC 9449) | **Future** | Proof of possession tokens |
| OIDC-15 | Pushed Authorization Requests (RFC 9126) | **Future** | Enhanced security for authorization requests |

---

### 4.2 Authentication Methods

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| AUTH-01 | Password-based authentication | **MVP** | Email + password login |
| AUTH-02 | Magic link (passwordless) authentication | **MVP** | Email-based via SMTP/Nodemailer, single-use, time-limited (15 min) |
| AUTH-03 | Dual-mode login page | **MVP** | Users choose between password or magic link on the same page |
| AUTH-04 | Passwordless-only users | **MVP** | Users created via invitation can opt for no password |
| AUTH-05 | AMR (Authentication Methods References) in tokens | **MVP** | `["pwd"]`, `["email"]`, `["pwd", "otp"]`, `["email", "otp"]` |
| AUTH-06 | Session management | **MVP** | Cookie-based sessions with configurable TTL |
| AUTH-07 | WebAuthn / FIDO2 | **Future** | Hardware key / biometric authentication |
| AUTH-08 | Social login federation (Google, GitHub, etc.) | **Future** | External IdP federation |

---

### 4.3 Multi-Factor Authentication (MFA)

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| MFA-01 | TOTP (Time-Based One-Time Password) | **MVP** | Compatible with Google Authenticator, Authy, etc. |
| MFA-02 | QR code provisioning | **MVP** | Generate QR code for authenticator app setup |
| MFA-03 | Backup recovery codes | **MVP** | 8 single-use codes generated at MFA setup |
| MFA-04 | MFA challenge during login | **MVP** | After password or magic link verification |
| MFA-05 | MFA setup via self-service | **MVP** | Users enable/disable MFA on their account |
| MFA-06 | MFA enforcement per application | **Phase 2** | Applications can require MFA for their users |
| MFA-07 | WebAuthn as MFA method | **Future** | Hardware key as second factor |

---

### 4.4 Organization Model

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| ORG-01 | Organization CRUD via Admin API | **MVP** | Create, read, update, delete organizations |
| ORG-02 | Organization member management | **MVP** | Add/remove users as members with org-level roles (owner, admin, member) |
| ORG-03 | Organization-application subscriptions | **MVP** | Enable/disable which applications are available per organization |
| ORG-04 | Organization-scoped OIDC clients | **MVP** | Clients belong to (organization, application) pair |
| ORG-05 | Organization-scoped role assignments | **MVP** | User roles are scoped to (user, organization, application) |
| ORG-06 | Organization-scoped invitations | **MVP** | Invitations target an organization + application + roles |
| ORG-07 | Organization claims in tokens | **MVP** | `org_id`, `org_name` in token claims via `app:organization` scope |
| ORG-08 | Organization status (active/suspended) | **MVP** | Suspended organizations reject all auth requests |
| ORG-09 | Organization-level settings | **Phase 2** | MFA requirement, session TTL overrides, allowed auth methods per org |
| ORG-10 | Organization admin delegation | **Phase 2** | Org admins can manage their own members and role assignments |
| ORG-11 | Organization webhooks | **Future** | Notify organizations of events (member added, invitation accepted) |

---

### 4.5 Application Model

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| APP-01 | Application CRUD via Admin API | **MVP** | Create, read, update, delete applications |
| APP-02 | Application-scoped permissions | **MVP** | Each application defines its own permission set (global catalog) |
| APP-03 | Application-scoped roles | **MVP** | Roles are containers of permissions, defined globally per application |
| APP-04 | Application status (active/disabled) | **MVP** | Disabled applications reject all auth requests |
| APP-05 | Application branding | **MVP** | Logo URL, primary color, accent color, custom CSS for interaction pages |
| APP-06 | Default roles for new users | **Phase 2** | Automatically assign roles when a user is added to an application |
| APP-07 | Application-level settings | **Phase 2** | MFA requirement, session TTL overrides, allowed auth methods |
| APP-08 | Application webhooks | **Future** | Notify applications of events (user created, invitation accepted, etc.) |

---

### 4.6 Roles & Permissions (RBAC)

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| RBAC-01 | Permission CRUD per application | **MVP** | Define permissions like `documents:read`, `admin:manage` |
| RBAC-02 | Role CRUD per application | **MVP** | Define roles with assigned permissions |
| RBAC-03 | User-to-role assignment per (organization, application) | **MVP** | A user can have different roles per org+app combination |
| RBAC-04 | Roles and permissions in token claims | **MVP** | Available via custom scopes (`app:roles`) |
| RBAC-05 | Multiple roles per user per (organization, application) | **MVP** | Users can hold multiple roles simultaneously |
| RBAC-06 | Role hierarchy / inheritance | **Future** | "admin" inherits all permissions of "editor" |

---

### 4.7 Custom Claims

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| CLAIMS-01 | Standard OIDC claims (sub, name, email, etc.) | **MVP** | Via `openid`, `profile`, `email` scopes |
| CLAIMS-02 | Application-scoped role/permission claims | **MVP** | Via custom `app:roles` scope |
| CLAIMS-03 | Organization claims | **MVP** | `org_id`, `org_name` via `app:organization` scope (promoted to MVP with org model) |
| CLAIMS-04 | Custom metadata claims | **Future** | Application-defined arbitrary key-value claims |

---

### 4.8 Client Management

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| CLIENT-01 | Client CRUD via Admin API | **MVP** | Create, read, update, delete OIDC clients |
| CLIENT-02 | Client belongs to (Organization, Application) | **MVP** | Every client is scoped to one organization and one application |
| CLIENT-03 | Public clients (SPAs, mobile) | **MVP** | `token_endpoint_auth_method: "none"`, PKCE required |
| CLIENT-04 | Confidential clients (server-side) | **MVP** | `client_secret_basic` or `client_secret_post` |
| CLIENT-05 | Client secret generation and hashing | **MVP** | Secret shown once at creation, stored hashed (SHA-256), rotate via API |
| CLIENT-06 | Redirect URI management | **MVP** | Strict exact-match validation, HTTPS required in production |
| CLIENT-07 | Client credentials grant per client | **MVP** | Machine-to-machine tokens with application roles |
| CLIENT-08 | `private_key_jwt` client authentication | **Future** | For high-security environments |

---

### 4.9 User Management

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| USER-01 | User CRUD via Admin API | **MVP** | Create, read, update, suspend/activate users |
| USER-02 | Password hashing with Argon2id | **MVP** | Industry-standard password storage |
| USER-03 | User status management (active, suspended, locked) | **MVP** | Suspended users cannot authenticate |
| USER-04 | External user creation via Admin API | **MVP** | Applications can create users programmatically |
| USER-05 | User profile fields | **MVP** | email, display_name, first_name, last_name, avatar_url, phone |
| USER-06 | Auth method preference per user | **MVP** | `password`, `magic_link`, or `both` |
| USER-07 | List user's organizations, applications, and roles | **MVP** | Query what a user has access to across all orgs and apps |
| USER-08 | Bulk user operations | **Phase 2** | Bulk create, bulk role assignment |
| USER-09 | User search and filtering | **Phase 2** | Search by email, name, status, organization, application, role |

---

### 4.10 User Invitations

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| INVITE-01 | Invite user via Admin API | **MVP** | Invitation for a specific organization + application + roles |
| INVITE-02 | Invitation email with magic link | **MVP** | User receives email via SMTP/Nodemailer with link to accept |
| INVITE-03 | Invitation acceptance flow | **MVP** | User sets up account (display name, password or passwordless) |
| INVITE-04 | Automatic role assignment on acceptance | **MVP** | Roles specified in invitation are assigned to the user in the org+app |
| INVITE-05 | Invitation expiry | **MVP** | Configurable (default: 72 hours) |
| INVITE-06 | Invitation revocation | **MVP** | Admin can revoke pending invitations |
| INVITE-07 | Existing user handling | **MVP** | If user already exists, org membership + roles are assigned directly |
| INVITE-08 | Bulk invitations | **Phase 2** | Invite multiple users in a single API call |
| INVITE-09 | Invitation status tracking | **MVP** | pending, accepted, expired, revoked |
| INVITE-10 | Custom invitation message | **MVP** | Optional message included in the invitation email |
| INVITE-11 | Invitation metadata pass-through | **Phase 2** | Application-specific data that persists through the invitation flow |

---

### 4.11 Self-Service Flows

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| SELF-01 | Self-service registration | **Phase 2** | Disabled by default. Opt-in per deployment via config flag |
| SELF-02 | Email verification | **MVP** | Verify email ownership before account activation |
| SELF-03 | Password reset via email | **MVP** | Forgot password → email via SMTP → reset link |
| SELF-04 | MFA setup/disable | **MVP** | Users manage their own 2FA settings |
| SELF-05 | Profile update | **Phase 2** | Users update their display name, avatar, etc. |
| SELF-06 | Password change | **MVP** | Authenticated users can change their password |
| SELF-07 | Active session listing | **Future** | View and revoke active sessions |
| SELF-08 | Account deletion | **Future** | User-initiated account deletion (GDPR) |

---

### 4.12 Audit Logging

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| AUDIT-01 | Log all authentication events | **MVP** | login_success, login_failed, mfa_verified, magic_link_requested |
| AUDIT-02 | Log all admin operations | **MVP** | user_created, client_created, role_assigned, invitation_sent, org_created |
| AUDIT-03 | Log token lifecycle events | **MVP** | token_issued, token_revoked, token_introspected |
| AUDIT-04 | Include context in audit entries | **MVP** | user_id, client_id, organization_id, ip_address, user_agent, timestamp |
| AUDIT-05 | Audit log query API | **MVP** | Filter by event type, user, client, organization, date range |
| AUDIT-06 | Audit log retention policy | **Phase 2** | Automatic cleanup of old entries |
| AUDIT-07 | Audit log export | **Future** | Export to external logging systems (SIEM) |

---

## 5. API Surface

### 5.1 OIDC Protocol Endpoints

> Provided by `oidc-provider`. Configured, not custom-built.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC Discovery document |
| GET | `/jwks` | JSON Web Key Set (public signing keys) |
| GET/POST | `/authorize` | Authorization endpoint (initiates auth flow) |
| POST | `/token` | Token endpoint (issue/refresh tokens) |
| GET/POST | `/userinfo` | User claims endpoint |
| POST | `/revoke` | Token revocation |
| POST | `/introspect` | Token introspection (required for opaque access tokens) |
| GET/POST | `/end-session` | Logout |
| POST | `/device/auth` | Device authorization (Phase 2) |
| POST | `/device` | Device code verification (Phase 2) |

### 5.2 Interaction Endpoints (User-Facing)

> Server-rendered pages for authentication interactions. Branded per application.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/interaction/:uid` | Show login or consent page (branded per application) |
| POST | `/interaction/:uid/login` | Submit password credentials |
| POST | `/interaction/:uid/magic-link` | Request magic link email |
| GET | `/interaction/:uid/magic/:token` | Verify magic link (from email) |
| POST | `/interaction/:uid/mfa` | Submit TOTP code |
| POST | `/interaction/:uid/confirm` | Confirm consent |
| GET | `/invite/:token` | Show invitation acceptance page (branded per application) |
| POST | `/invite/:token/accept` | Accept invitation and create account |

### 5.3 Admin API Endpoints

> Protected by admin authentication: API key (`X-API-Key` header) or admin JWT (`Authorization: Bearer` header).
> Used by external applications for management operations.

#### Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations` | List all organizations |
| POST | `/api/admin/organizations` | Create an organization |
| GET | `/api/admin/organizations/:orgId` | Get organization details |
| PUT | `/api/admin/organizations/:orgId` | Update an organization |
| DELETE | `/api/admin/organizations/:orgId` | Delete an organization |

#### Organization Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/members` | List organization members |
| POST | `/api/admin/organizations/:orgId/members` | Add a user as member |
| PUT | `/api/admin/organizations/:orgId/members/:userId` | Update member org-level role |
| DELETE | `/api/admin/organizations/:orgId/members/:userId` | Remove member from organization |

#### Organization-Application Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications` | List enabled applications for org |
| POST | `/api/admin/organizations/:orgId/applications` | Enable an application for org |
| DELETE | `/api/admin/organizations/:orgId/applications/:appId` | Disable application for org |

#### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications` | List all applications |
| POST | `/api/admin/applications` | Create an application |
| GET | `/api/admin/applications/:id` | Get application details |
| PUT | `/api/admin/applications/:id` | Update an application (including branding) |
| DELETE | `/api/admin/applications/:id` | Delete an application |

#### Permissions (per Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications/:appId/permissions` | List permissions |
| POST | `/api/admin/applications/:appId/permissions` | Create permission(s) |
| DELETE | `/api/admin/applications/:appId/permissions/:permId` | Delete a permission |

#### Roles (per Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications/:appId/roles` | List roles |
| POST | `/api/admin/applications/:appId/roles` | Create a role with permissions |
| PUT | `/api/admin/applications/:appId/roles/:roleId` | Update role (name, permissions) |
| DELETE | `/api/admin/applications/:appId/roles/:roleId` | Delete a role |

#### Clients (per Organization + Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications/:appId/clients` | List clients for org+app |
| POST | `/api/admin/organizations/:orgId/applications/:appId/clients` | Create OIDC client |
| GET | `/api/admin/clients/:clientId` | Get client details |
| PUT | `/api/admin/clients/:clientId` | Update client |
| DELETE | `/api/admin/clients/:clientId` | Delete client |
| POST | `/api/admin/clients/:clientId/rotate-secret` | Rotate client secret (returns new secret once) |

#### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List/search users |
| POST | `/api/admin/users` | Create a user |
| GET | `/api/admin/users/:id` | Get user details |
| PUT | `/api/admin/users/:id` | Update user |
| PUT | `/api/admin/users/:id/status` | Suspend/activate user |
| GET | `/api/admin/users/:id/organizations` | List user's orgs, apps, and roles |

#### User-Organization-Application Role Assignments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications/:appId/users` | List users with roles for org+app |
| POST | `/api/admin/organizations/:orgId/applications/:appId/users/:userId/roles` | Assign role(s) to user |
| DELETE | `/api/admin/organizations/:orgId/applications/:appId/users/:userId/roles/:roleId` | Remove role from user |

#### Invitations (per Organization)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/invitations` | List invitations for org |
| POST | `/api/admin/organizations/:orgId/invitations` | Create an invitation (org + app + roles) |
| POST | `/api/admin/organizations/:orgId/invitations/bulk` | Bulk invite (Phase 2) |
| DELETE | `/api/admin/invitations/:id` | Revoke an invitation |

#### Audit Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/audit` | Query audit log (with filters including organization) |

### 5.4 Self-Service API Endpoints

> Authenticated by user's own token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Self-service registration (Phase 2, disabled by default) |
| POST | `/api/verify-email` | Verify email with token |
| POST | `/api/forgot-password` | Request password reset |
| POST | `/api/reset-password` | Reset password with token |
| PUT | `/api/account/password` | Change password (authenticated) |
| GET | `/api/account/profile` | Get own profile (Phase 2) |
| PUT | `/api/account/profile` | Update own profile (Phase 2) |
| POST | `/api/account/mfa/setup` | Start MFA setup (get QR code) |
| POST | `/api/account/mfa/confirm` | Confirm MFA setup (verify first code) |
| DELETE | `/api/account/mfa` | Disable MFA |

---

## 6. Data Model

### Entity Relationship Overview

```
organizations ──< organization_applications >──── applications ──< permissions
     │                                                │                │
     │                                                │                │
     │                                                ├──< roles ──────┤ (role_permissions)
     │                                                │
     ├──< organization_members >──── users            │
     │                                 │              │
     │                                 │              │
     └──< oidc_clients >──────────────┼──────────────┘
     │                                 │
     │                                 │
     └──< user_org_app_roles >────────┘
                │
                └──> roles

     users ──< magic_links
            ──< mfa_backup_codes
            ──< invitations (org-scoped)

     signing_keys (encrypted at rest)
     audit_log
     admin_api_keys
```

### Tables

#### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | User identifier |
| `email` | TEXT | UNIQUE, NOT NULL | Email address (login identifier) |
| `email_verified` | BOOLEAN | DEFAULT false | Email verification status |
| `password_hash` | TEXT | NULLABLE | Argon2id hash (NULL for passwordless users) |
| `display_name` | TEXT | | Full display name |
| `first_name` | TEXT | | Given name |
| `last_name` | TEXT | | Family name |
| `phone` | TEXT | | Phone number |
| `avatar_url` | TEXT | | Profile picture URL |
| `auth_method` | TEXT | DEFAULT 'password' | Preferred auth: 'password', 'magic_link', 'both' |
| `mfa_secret` | TEXT | NULLABLE | TOTP secret (encrypted at rest) |
| `mfa_enabled` | BOOLEAN | DEFAULT false | Whether MFA is active |
| `status` | TEXT | DEFAULT 'active' | 'active', 'suspended', 'locked' |
| `failed_logins` | INT | DEFAULT 0 | Failed login attempt counter |
| `locked_until` | TIMESTAMPTZ | NULLABLE | Account lockout expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `organizations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Organization identifier |
| `slug` | TEXT | UNIQUE, NOT NULL | URL-friendly identifier (e.g., "company-a") |
| `name` | TEXT | NOT NULL | Display name |
| `description` | TEXT | | |
| `logo_url` | TEXT | | Organization logo |
| `status` | TEXT | DEFAULT 'active' | 'active', 'suspended' |
| `settings` | JSONB | DEFAULT '{}' | Org-level settings |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `organization_members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `organization_id` | UUID | FK → organizations(id), PK | |
| `user_id` | UUID | FK → users(id), PK | |
| `org_role` | TEXT | DEFAULT 'member', NOT NULL | 'owner', 'admin', 'member' |
| `joined_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `applications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Application identifier (e.g., "app-crm") |
| `name` | TEXT | NOT NULL | Display name |
| `description` | TEXT | | |
| `icon_url` | TEXT | | Application icon |
| `homepage_url` | TEXT | | Application homepage |
| `owner_id` | UUID | FK → users(id) | Application owner |
| `status` | TEXT | DEFAULT 'active' | 'active', 'disabled' |
| `settings` | JSONB | DEFAULT '{}' | Application-level settings |
| `branding` | JSONB | DEFAULT '{}' | Branding config (see below) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Branding JSONB structure:**
```json
{
  "logo_url": "https://example.com/logo.svg",
  "primary_color": "#1a73e8",
  "accent_color": "#ffffff",
  "background_color": "#f5f5f5",
  "custom_css": "/* optional custom CSS overrides */"
}
```

#### `organization_applications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `organization_id` | UUID | FK → organizations(id), PK | |
| `application_id` | TEXT | FK → applications(id), PK | |
| `enabled` | BOOLEAN | DEFAULT true | Whether this org has access to this app |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `name` | TEXT | NOT NULL | e.g., "documents:read" |
| `description` | TEXT | | |
| | | UNIQUE(application_id, name) | |

#### `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `name` | TEXT | NOT NULL | e.g., "editor" |
| `description` | TEXT | | |
| `is_default` | BOOLEAN | DEFAULT false | Auto-assigned to new users |
| | | UNIQUE(application_id, name) | |

#### `role_permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `role_id` | UUID | FK → roles(id), PK | |
| `permission_id` | UUID | FK → permissions(id), PK | |

#### `user_org_app_roles`

> User role assignments scoped to (organization, application).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | FK → users(id), PK | |
| `organization_id` | UUID | FK → organizations(id), PK | |
| `application_id` | TEXT | FK → applications(id), PK | |
| `role_id` | UUID | FK → roles(id), PK | |
| `assigned_at` | TIMESTAMPTZ | DEFAULT now() | |
| `assigned_by` | UUID | FK → users(id) | Who assigned the role |

#### `oidc_clients`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | client_id |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `organization_id` | UUID | FK → organizations(id), NOT NULL | Organization this client belongs to |
| `secret_hash` | TEXT | NULLABLE | SHA-256 hash of client_secret (NULL for public clients) |
| `payload` | JSONB | NOT NULL | oidc-provider client metadata |
| `description` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `oidc_models`

> Generic storage for oidc-provider models (tokens, grants, sessions, etc.)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `model_name` | TEXT | PK | Model type (RefreshToken, Grant, etc.) |
| `id` | TEXT | PK | Model instance ID |
| `payload` | JSONB | NOT NULL | oidc-provider model data |
| `grant_id` | TEXT | NULLABLE, INDEXED | For revokeByGrantId |
| `user_code` | TEXT | NULLABLE, INDEXED | For device flow |
| `uid` | TEXT | NULLABLE, INDEXED | For session binding |
| `expires_at` | TIMESTAMPTZ | NULLABLE, INDEXED | Expiration time |
| `consumed_at` | TIMESTAMPTZ | NULLABLE | When consumed (auth codes) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `invitations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `email` | TEXT | NOT NULL | Invitee email |
| `organization_id` | UUID | FK → organizations(id), NOT NULL | Target organization |
| `application_id` | TEXT | FK → applications(id), NOT NULL | Target application |
| `roles` | TEXT[] | DEFAULT '{}' | Role names to assign on acceptance |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 hash of invitation token |
| `invited_by` | UUID | FK → users(id), NULLABLE | Admin who sent it |
| `client_id` | TEXT | NULLABLE | Which client initiated |
| `message` | TEXT | NULLABLE | Custom message |
| `metadata` | JSONB | DEFAULT '{}' | Pass-through data |
| `status` | TEXT | DEFAULT 'pending' | 'pending', 'accepted', 'expired', 'revoked' |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `user_id` | UUID | FK → users(id), NULLABLE | Set when accepted |
| `accepted_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `magic_links`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `interaction_uid` | TEXT | NOT NULL | OIDC interaction this belongs to |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 of the magic token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `ip_address` | INET | | Requestor IP |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `mfa_backup_codes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `code_hash` | TEXT | NOT NULL | SHA-256 of the backup code |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `signing_keys`

> OIDC signing keys stored encrypted. Used for JWKS and token signing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Key ID (kid) |
| `algorithm` | TEXT | NOT NULL | Signing algorithm (e.g., "RS256", "ES256") |
| `private_key_enc` | TEXT | NOT NULL | AES-256-GCM encrypted private key PEM |
| `public_key` | TEXT | NOT NULL | Public key PEM (not encrypted) |
| `status` | TEXT | DEFAULT 'active', NOT NULL | 'active', 'rotated', 'retired' |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `rotated_at` | TIMESTAMPTZ | NULLABLE | When this key was replaced by a new active key |
| `expires_at` | TIMESTAMPTZ | NULLABLE | When to remove from JWKS (overlap period end) |

#### `admin_api_keys`

> Static API keys for admin API access (automation, CI/CD).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `name` | TEXT | NOT NULL | Human-readable key name (e.g., "CI Pipeline") |
| `key_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 hash of the API key |
| `key_prefix` | TEXT | NOT NULL | First 8 chars of key (for identification) |
| `scopes` | TEXT[] | DEFAULT '{*}' | Allowed scopes (Phase 2: fine-grained) |
| `last_used_at` | TIMESTAMPTZ | NULLABLE | |
| `created_by` | UUID | FK → users(id), NULLABLE | |
| `expires_at` | TIMESTAMPTZ | NULLABLE | Optional expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `audit_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PK | |
| `event_type` | TEXT | NOT NULL | Event category |
| `user_id` | UUID | FK → users(id), NULLABLE | |
| `client_id` | TEXT | NULLABLE | |
| `organization_id` | UUID | NULLABLE | Organization context |
| `application_id` | TEXT | NULLABLE | |
| `ip_address` | INET | | |
| `user_agent` | TEXT | | |
| `details` | JSONB | | Additional event data |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

## 7. Security Requirements

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| SEC-01 | PKCE enforcement | **MVP** | Required for ALL authorization code flows |
| SEC-02 | Argon2id password hashing | **MVP** | Memory-hard, side-channel resistant |
| SEC-03 | Constant-time token comparison | **MVP** | Prevent timing attacks on secrets and codes |
| SEC-04 | Single-use authorization codes | **MVP** | Atomic consume; revoke all tokens if code replayed |
| SEC-05 | Refresh token rotation | **MVP** | New refresh token on each use; detect replay |
| SEC-06 | Redirect URI exact matching | **MVP** | No wildcards, no open redirectors |
| SEC-07 | HTTPS required in production | **MVP** | oidc-provider enforces this |
| SEC-08 | CSRF protection on interaction forms | **MVP** | Token-based CSRF on login/consent pages |
| SEC-09 | Rate limiting on sensitive endpoints | **MVP** | `/token`, `/interaction/*/login`, magic link requests |
| SEC-10 | Brute force protection | **MVP** | Progressive delays, account lockout after N failures |
| SEC-11 | MFA secret encryption at rest | **MVP** | TOTP secrets encrypted in database |
| SEC-12 | Cookie security | **MVP** | HttpOnly, Secure, SameSite=Lax |
| SEC-13 | CSP headers on interaction pages | **MVP** | Prevent XSS on login/consent pages |
| SEC-14 | Signing key rotation | **MVP** | Periodic rotation with JWKS overlap period |
| SEC-15 | Magic link single-use | **MVP** | Atomic consume, hash-based storage |
| SEC-16 | Magic link rate limiting | **MVP** | Max 3 per email per 15 minutes |
| SEC-17 | Invitation token single-use | **MVP** | Consumed atomically on acceptance |
| SEC-18 | User enumeration prevention | **MVP** | Same response for valid/invalid emails on magic link and password reset |
| SEC-19 | Audit logging of all security events | **MVP** | See Audit Logging section |
| SEC-20 | Input validation on all endpoints | **MVP** | Schema validation (zod or similar) |
| SEC-21 | Signing key encryption at rest | **MVP** | Private keys encrypted with AES-256-GCM via `KEY_ENCRYPTION_KEY` |
| SEC-22 | Client secret hashing | **MVP** | Client secrets stored as SHA-256 hashes, shown once at creation |
| SEC-23 | Admin API key hashing | **MVP** | API keys stored as SHA-256 hashes, shown once at creation |

---

## 8. Non-Functional Requirements

### Performance

| ID | Requirement | Target |
|----|-------------|--------|
| PERF-01 | Token endpoint response time | < 100ms (p95) |
| PERF-02 | Authorization endpoint response time | < 200ms (p95) |
| PERF-03 | UserInfo endpoint response time | < 50ms (p95) |
| PERF-04 | Introspection endpoint response time | < 50ms (p95) |
| PERF-05 | Concurrent users supported | 10,000+ active sessions |
| PERF-06 | Token issuance throughput | 1,000+ tokens/second |

### Deployment

| ID | Requirement | Description |
|----|-------------|-------------|
| DEPLOY-01 | Docker container | Single Dockerfile for the application |
| DEPLOY-02 | Docker Compose | Full stack (app + PostgreSQL + Redis) for development |
| DEPLOY-03 | Environment-based configuration | All config via environment variables |
| DEPLOY-04 | Stateless application | No local state — all state in PostgreSQL/Redis |
| DEPLOY-05 | Horizontal scalability | Multiple instances behind a load balancer |
| DEPLOY-06 | Health check endpoint | `/health` with PostgreSQL and Redis status |
| DEPLOY-07 | Graceful shutdown | Handle SIGTERM, drain connections |
| DEPLOY-08 | Blue-green deployment | Zero-downtime deploys via Docker blue-green pattern (existing infrastructure) |

### Monitoring & Observability

| ID | Requirement | Priority |
|----|-------------|----------|
| MON-01 | Structured logging (JSON) | **MVP** |
| MON-02 | Health check endpoint | **MVP** |
| MON-03 | Prometheus metrics endpoint | **Phase 2** |
| MON-04 | OpenTelemetry tracing | **Future** |

### Development

| ID | Requirement | Description |
|----|-------------|-------------|
| DEV-01 | TypeScript (strict mode) | All source code in TypeScript |
| DEV-02 | Node.js ≥ 22 | Runtime requirement |
| DEV-03 | ESM-only | No CommonJS |
| DEV-04 | Vitest for testing | Unit and integration tests |
| DEV-05 | Automated test suite | Run without external dependencies (Memory/SQLite mocks for unit tests) |
| DEV-06 | Integration tests with Docker | PostgreSQL + Redis via Docker Compose |

---

## 9. Known Risks & Challenges

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

## 10. Resolved Questions

> All questions have been resolved as of v0.2.0.

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Should self-service registration be enabled by default? | **No** — invite-only by default, opt-in per deployment via config flag. SELF-01 remains Phase 2. |
| Q2 | Should there be an organization/tenant model above applications? | **Yes** — organizations are included in MVP. Users belong to organizations, and roles are scoped to (user, organization, application). See Organization Model (§4.4). |
| Q3 | What email delivery service to use in production? | **SMTP via Nodemailer**. No SaaS dependency. Config via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars. |
| Q4 | Should the interaction UI be brandable per application? | **Yes** — applications have a `branding` JSONB field (logo, colors, CSS). Interaction pages resolve branding from OIDC client → application. |
| Q5 | Opaque tokens or JWT for access tokens? | **Opaque** — access tokens are opaque references stored in the adapter. Resource servers MUST use `/introspect`. ID tokens remain JWTs per OIDC spec. See ADR-005. |
| Q6 | Admin API authentication mechanism? | **Both** — static API keys (`X-API-Key` header) for automation and admin JWT (`Authorization: Bearer`) for admin users. See ADR-008. |
| Q7 | Should client secrets be stored hashed or encrypted? | **Hashed** — SHA-256, shown once at creation, never recoverable. Rotate via API. See ADR-009. |
| Q8 | What is the deployment target? | **Docker with blue-green deployment pattern** — infrastructure already exists. See ADR-010. |
| Q9 | Is OIDC Foundation certification desired? | **No** — `oidc-provider` is already OpenID Certified™. OIDC conformance tests will run in CI for continuous verification, but formal certification is not pursued. |
| Q10 | How should signing keys be stored? | **Database (PostgreSQL), encrypted at rest** with AES-256-GCM. Single `KEY_ENCRYPTION_KEY` env var for encryption. See ADR-007 and `signing_keys` table. |

---

## 11. Effort Estimate

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

## 12. Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-03 | 0.1.0 | Initial requirements document |
| 2026-04-07 | 0.2.0 | Resolved all open questions. Added organization model (§3, §4.4). Added signing keys table, admin API keys table, application branding. Updated data model for org-scoped role assignments and OIDC clients. Added ADR-005 through ADR-010. Updated API surface for organization-scoped endpoints. Updated effort estimate (+6 days for org model, branding, conformance tests). Promoted CLAIMS-03 (organization claims) to MVP. Added PERF-04 (introspection performance), DEPLOY-08 (blue-green), SEC-21/22/23. |
