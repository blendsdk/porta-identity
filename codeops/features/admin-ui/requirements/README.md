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
core profile, invitation, credential, lifecycle, history, and purge operations. Later modules add
roles, sessions, two-factor controls, audit exploration, and operational data tools.

Applications are global product and authorization definitions shared by organizations. OIDC clients
are organization-specific deployments connected to those applications. The Admin UI must always
present that ownership distinction explicitly: global application changes are never represented as
changes confined to the active organization.

## Selected Domain Lenses

| Lens            | Repository evidence                                                    | Requirement focus                                                             |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web application | Authenticated HTTP API, roles, permissions, and tenant-owned resources | Authorization, validation, network failures, UI states, and tenant boundaries |

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
| User lifecycle           | Porta's active, inactive, suspended, and locked account states and transitions.     |
| Application              | A global product, service, or authorization definition shared by organizations.     |
| Application module       | A global feature grouping within an application and permission namespace.           |
| OIDC client              | An organization-owned OIDC deployment connected to one global application.          |

## Admin UI Presentation Directives

These directives apply to every current and future Admin UI requirement:

1. Use the JSVision Layout DSL for every screen and dialog unless a concrete JSVision limitation
   makes the required layout impossible. Any exception must remain local and document that
   limitation; ad hoc positioning is not a normal alternative.
2. Use JSVision DataGrid for tabular collections when rows and columns are the natural presentation.
   Small non-tabular choosers do not need to be forced into a grid.
3. Keep every single-line input at its natural one-row height. A Layout DSL container must never
   assign vertical growth or fill behavior that stretches a single-line input.

## Document Index

| #         | Document                                                                            | Description                                                            | Depends On |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| **AR**    | [Ambiguity Register](00-ambiguity-register.md)                                      | Approved feature decisions                                             | —          |
| **RD-01** | [JSVision admin foundation](RD-01-jsvision-admin-foundation.md)                     | Secure embedded shell, authentication, and playground                  | —          |
| **RD-02** | [Organization context and navigation](RD-02-organization-context-and-navigation.md) | Global menu, identity dialog, and organization create/switch workflows | RD-01      |
| **RD-03** | [User management](RD-03-user-management.md)                                         | Complete organization-scoped user administration                       | RD-02      |
| **RD-04** | [Applications and OIDC clients](RD-04-applications-and-oidc-clients.md)             | Global applications and organization-owned OIDC clients                | RD-02      |

## Dependency Graph

```text
RD-01 Secure admin foundation
  └── RD-02 Organization context and navigation
        ├── RD-03 User management
        └── RD-04 Applications and OIDC clients
              └── RD-05 Roles and permissions
```

## Suggested Implementation Order

| Phase                | Documents | Description                                                 |
| -------------------- | --------- | ----------------------------------------------------------- |
| Foundation           | RD-01     | Completed secure shell and live playground                  |
| Organization context | RD-02     | Establish the selected tenant context used by later screens |
| User administration  | RD-03     | Complete the core organization-scoped user workflows        |
| Application clients  | RD-04     | Manage global products and tenant OIDC deployments          |

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

## How to Use These Documents

Create and preflight a plan for the next incomplete RD, then execute it specification-first in the
existing Porta workflow. Requirements remain authoritative for observable behavior and security
boundaries.
