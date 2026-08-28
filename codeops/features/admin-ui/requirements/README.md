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

The next requirement introduces the first administration context: a permission-aware organization
menu, creation and switching dialogs, and a small organization landing view. Later administration
modules consume the selected organization but remain independently scoped.

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

## Document Index

| #         | Document                                                                            | Description                                                            | Depends On |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| **AR**    | [Ambiguity Register](00-ambiguity-register.md)                                      | Approved feature decisions                                             | —          |
| **RD-01** | [JSVision admin foundation](RD-01-jsvision-admin-foundation.md)                     | Secure embedded shell, authentication, and playground                  | —          |
| **RD-02** | [Organization context and navigation](RD-02-organization-context-and-navigation.md) | Global menu, identity dialog, and organization create/switch workflows | RD-01      |

## Dependency Graph

```text
RD-01 Secure admin foundation
  └── RD-02 Organization context and navigation
        └── Later organization-scoped administration modules
```

## Suggested Implementation Order

| Phase                | Documents | Description                                                 |
| -------------------- | --------- | ----------------------------------------------------------- |
| Foundation           | RD-01     | Completed secure shell and live playground                  |
| Organization context | RD-02     | Establish the selected tenant context used by later screens |

## Key Architecture Decisions

| Decision               | Choice                                                     | Rationale                                              |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Product terminology    | Organization                                               | Matches Porta's existing API and data model            |
| Authentication context | Global administration login through the super-admin issuer | Tenant switching is working context, not another login |
| Capability discovery   | Validate existing UserInfo `roles` and `permissions`       | Avoids a redundant server endpoint                     |
| Selection lifetime     | Current application session only                           | Avoids stale persisted tenant context                  |
| Organization loading   | One complete list through SDK `listAll`                    | Keeps the small-deployment UI simple                   |

## How to Use These Documents

Create and preflight a plan for the next incomplete RD, then execute it specification-first in the
existing Porta workflow. Requirements remain authoritative for observable behavior and security
boundaries.
