# Porta Admin UI — Requirements Documents

> **Project**: Porta Admin UI — Embedded terminal administration inside the Porta CLI
> **Status**: Active
> **Created**: 2026-08-27
> **Architecture**: Node.js 24 LTS, TypeScript ESM, JSVision, Porta SDK, and Porta Admin API
> **CodeOps Artifact Schema**: 1

## Overview

The Porta Admin UI is an authenticated terminal application embedded in the existing `porta` CLI.
Its completed foundation owns server selection, secure OIDC login, credential continuity, terminal
lifecycle, and the local maintainer playground.

The completed organization context supplies the tenant boundary for administration modules. User
management is the first such module: a familiar Users list and detail flow covering the existing
core profile, invitation, credential, lifecycle, history, and permanent Delete operations. Roles
and permissions extend the User and Application details with direct authorization management.
Organization settings then provide focused administration of the active tenant's identity,
authentication defaults, lifecycle, branding settings, and image assets. Later modules add
sessions, user-level two-factor controls, audit exploration, and operational data tools.

Applications are global product and authorization definitions shared by organizations. OIDC clients
are organization-specific deployments connected to those applications. The Admin UI must always
present that ownership distinction explicitly: global application changes are never represented as
changes confined to the active organization.

## Selected Domain Lenses

| Lens                   | Repository evidence                                                       | Requirement focus                                                            |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Web application        | Authenticated API, public identity pages, CSP, RBAC, and tenant resources | Authorization, validation, public errors, UI states, and tenant boundaries   |
| Data and migration     | PostgreSQL RBAC entities, mappings, settings, and binary branding assets  | Ownership, cardinality, size constraints, integrity, and forward migrations  |
| Distributed/concurrent | PostgreSQL authority, Redis state, ETags, and separate settings requests  | Transaction boundaries, conflicts, partial failure, and authoritative reload |

Universal security, accessibility, failure-state, and verification lenses apply throughout.

## Domain Glossary

| Term                     | Definition                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Porta server             | One selected Porta deployment origin.                                               |
| Super-admin organization | The special organization whose issuer authenticates Porta administrators.           |
| Organization             | Porta's domain and UI term for a tenant.                                            |
| Active organization      | The session-memory working context selected for organization-scoped administration. |
| UserInfo                 | The tenant-scoped OIDC `/me` response containing verified identity and RBAC claims. |
| User                     | An identity account owned by exactly one Porta organization.                        |
| User lifecycle           | Active/Inactive administration plus automatic failed-login lockout and recovery.    |
| Application              | A global product, service, or authorization definition shared by organizations.     |
| Application module       | A global feature grouping within an application and permission namespace.           |
| OIDC client              | An organization-owned OIDC deployment connected to one global application.          |
| Role                     | A named authorization bundle owned by exactly one application.                      |
| Permission               | A namespaced operation owned by one application and optionally one of its modules.  |
| Role permission          | A direct permission assignment to a role from the same application.                 |
| User role                | A direct application-role assignment to one organization-owned user.                |
| Authentication default   | An organization setting used by OIDC clients configured to inherit it.              |
| Branding asset           | An organization-owned validated logo or favicon stored as binary data.              |
| Effective branding       | Uploaded assets resolved ahead of configured URL fallbacks for pages and emails.    |

## Admin UI Presentation Directives

These directives apply to every current and future Admin UI requirement:

1. Use the JSVision Layout DSL for every screen and dialog unless a concrete JSVision limitation
   makes the required layout impossible. Any exception must remain local and document that
   limitation; ad hoc positioning is not a normal alternative.
2. Use JSVision DataGrid for tabular collections when rows and columns are the natural presentation.
   Small non-tabular choosers do not need to be forced into a grid.
3. Keep every single-line input at its natural one-row height. A Layout DSL container must never
   assign vertical growth or fill behavior that stretches a single-line input.

### Primary Module Workspace Recipe

Apply this directive to every primary administration module:

1. Present the module on one maximized, non-closable, non-resizable, and
   non-zoomable dialog surface. Use the dialog caption as the module title and do not repeat that
   title inside the content.
2. Give the primary DataGrid the growing list area and keep its columns visible when the collection
   is empty. Place search and filter controls above it. Place empty or no-match messages,
   interaction hints, record counts, paging, and short operation outcomes in a compact footer.
3. Use a TabView when a detail record has multiple coherent subviews. Inside each tab, use a
   GroupBox only when its caption and border separate multiple logical regions; do not wrap a
   single tab form or grid in a redundant GroupBox. Keep operational controls with the subview they
   affect and navigation in a separate bottom row.
4. Let Layout DSL rows determine every button's natural measured width. Keep selection-dependent
   operations visible but disabled until the selected record makes them applicable.
5. Render empty, loading, failure, retry, and indeterminate states within the same module surface.
   Preserve validated content beneath temporary status feedback when it remains safe to display.
6. On a compact terminal, logical detail sections may collapse into one bounded selectable list so
   every value and operation remains reachable. Navigation must remain in its separate bottom row.

## Document Index

| #         | Document                                                                                    | Description                                                            | Depends On          |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| **AR**    | [Ambiguity Register](00-ambiguity-register.md)                                              | Approved feature decisions                                             | —                   |
| **RD-01** | [JSVision admin foundation](RD-01-jsvision-admin-foundation.md)                             | Secure embedded shell, authentication, and playground                  | —                   |
| **RD-02** | [Organization context and navigation](RD-02-organization-context-and-navigation.md)         | Global menu, identity dialog, and organization create/switch workflows | RD-01               |
| **RD-03** | [User management](RD-03-user-management.md)                                                 | Complete organization-scoped user administration                       | RD-02               |
| **RD-04** | [Applications and OIDC clients](RD-04-applications-and-oidc-clients.md)                     | Global applications and organization-owned OIDC clients                | RD-02               |
| **RD-05** | [Roles and permissions](RD-05-roles-and-permissions.md)                                     | Application RBAC definitions, mappings, and user role assignments      | RD-03, RD-04, RD-10 |
| **RD-06** | [Organization settings and branding](RD-06-organization-settings-and-branding.md)           | Active-organization settings, authentication defaults, and branding    | RD-02               |
| **RD-10** | [Record deletion and lifecycle simplification](RD-10-application-module-client-deletion.md) | Product-wide Delete, Archive removal, cascade, and targeted logout     | RD-02–RD-04         |

## Dependency Graph

```text
RD-01 Secure admin foundation
  └── RD-02 Organization context and navigation
        ├── RD-03 User management
        ├── RD-04 Applications and OIDC clients
        │     └── RD-10 Record deletion and lifecycle simplification
        └── RD-06 Organization settings and branding

RD-05 Roles and permissions depends on RD-03, RD-04, and RD-10
```

## Suggested Implementation Order

| Phase                 | Documents | Description                                                 |
| --------------------- | --------- | ----------------------------------------------------------- |
| Foundation            | RD-01     | Completed secure shell and live playground                  |
| Organization context  | RD-02     | Establish the selected tenant context used by later screens |
| User administration   | RD-03     | Complete the core organization-scoped user workflows        |
| Application clients   | RD-04     | Manage global products and tenant OIDC deployments          |
| Record deletion       | RD-10     | Remove Archive and provide consistent permanent Delete      |
| Authorization         | RD-05     | Manage application RBAC and organization user assignments   |
| Organization settings | RD-06     | Manage active-organization defaults and effective branding  |

## Key Architecture Decisions

| Decision               | Choice                                                     | Rationale                                              |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Product terminology    | Organization                                               | Matches Porta's existing API and data model            |
| Authentication context | Global administration login through the super-admin issuer | Tenant switching is working context, not another login |
| Capability discovery   | Validate existing UserInfo `roles` and `permissions`       | Avoids a redundant server endpoint                     |
| Selection lifetime     | Current application session only                           | Avoids stale persisted tenant context                  |
| Organization loading   | One complete list through SDK `listAll`                    | Keeps the small-deployment UI simple                   |
| User navigation        | Searchable list leading to detail and focused actions      | Familiar administration without a generated framework  |
| User feature depth     | Complete existing core user-management surface             | Finishes one roadmap feature before starting another   |
| Multi-user concurrency | No dedicated locking, merge, polling, or conflict workflow | Matches the expected single-operator terminal usage    |
| Import and export      | Deferred to RD-09                                          | Keeps operational data tooling together                |
| Application ownership  | Global product definition                                  | Reused consistently by every related organization      |
| Client ownership       | Selected organization                                      | Holds tenant-specific OIDC deployment configuration    |
| UI layout              | JSVision Layout DSL                                        | Keeps sizing and redraw behavior deterministic         |
| Tabular collections    | JSVision DataGrid where appropriate                        | Reuses the established accessible grid interaction     |
| Setup-time deletion    | Direct synchronous cascade after confirmation              | Avoids preview, queue, and worker machinery            |
| Record lifecycle       | Reversible disable states plus permanent Delete            | Removes redundant retained terminal record states      |
| RBAC ownership         | Roles and permissions belong to one global application     | Prevents cross-application authorization mappings      |
| Authority reduction    | Targeted session/token cleanup; additions invalidate cache | Removes stale authority without unnecessary logout     |
| RBAC list contracts    | Complete arrays without pagination                         | Matches the server and expected-small collections      |
| Organization workspace | Overview, Authentication, and Branding tabs                | Separates coherent current-tenant settings             |
| Branding precedence    | Uploaded asset, then configured URL fallback               | Makes one effective result explicit across consumers   |
| Branding upload path   | JSON/base64 transport into PostgreSQL binary storage       | Repairs the existing design without parallel protocols |

## How to Use These Documents

Create and preflight a plan for the next incomplete RD, then execute it specification-first in the
existing Porta workflow. Requirements remain authoritative for observable behavior and security
boundaries.
