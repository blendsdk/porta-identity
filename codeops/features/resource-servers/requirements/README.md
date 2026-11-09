# Porta — Resource-Server Admin Requirements

> **Project**: Porta — multi-tenant OIDC identity platform
> **Status**: Complete
> **Created**: 2026-11-09
> **Architecture**: TypeScript ESM, Koa, node-oidc-provider, PostgreSQL, Redis
> **CodeOps Artifact Schema**: 1

---

## Overview

The resource-servers feature already provides the provider model for RFC 8707 resource indicators:
application-owned identifiers, access-token audiences, and an explicit custom-scope registry. The
model is consumed by the OIDC provider but has no product management surface.

This requirements set adds that surface end to end: Admin API, TypeScript SDK, CLI, and
documentation. It deliberately leaves provider resolution, the database schema, and existing token
behavior unchanged. The work completes the deferred admin surface recorded in the feature roadmap.

## Domain Lenses

| Lens | Evidence |
| --- | --- |
| Web application | Admin HTTP API, permission middleware, application ownership, fixed error states |
| Data and migration | Existing `resource_servers`, `resource_server_scopes`, and `resource_server_namespace` tables; no new migration |
| Distributed and concurrent | Unique constraints and the namespace trigger arbitrate concurrent writers; create/update use transactions and row locks |

The compiler/language and financial-system lenses do not apply: there is no parser, code
generation, money, or ledger behavior in this feature.

## Minimum-Sufficient Baseline

**Original goal:** make application-owned resource servers operable through the Admin API, SDK, CLI,
and docs.

**Smallest viable design:** CRUD routes nested under the existing applications Admin API, reusing
`admin:app:read` and `admin:app:update`, the existing database schema, the existing transaction and
unique-constraint patterns, the existing SDK applications domain, the existing CLI application
command family, and the existing generic Admin mutation audit. No new permission, migration,
provider path, cache, queue, or worker.

**Excluded support machinery:** no new RBAC permission family, no new database migration, no new
audit subsystem, no ETag/If-Match layer, no pagination layer, no export/import extension, no
terminal Admin UI surface, and no end-user self-service.

**Approved complexity:** None. No complexity-escalation entry was required.

## Domain Glossary

| Term | Definition |
| --- | --- |
| Resource server | An application-owned API identified by an absolute URI and represented by a row in `resource_servers`. |
| Identifier | The exact RFC 8707 resource indicator a client requests; globally unique and fragment-free. |
| Audience | The `aud` value placed in an access token for the resource server; defaults to the identifier and is globally unique. |
| Custom scope | A resource-server-registered scope outside the standard OIDC set. |
| Standard OIDC scope | `openid`, `profile`, `email`, `address`, `phone`, or `offline_access`; protocol-owned and never stored as a custom scope. |
| Scope registry | The set of custom scopes attached to one resource server. |
| Application ownership | A resource server belongs to exactly one application; clients of another application cannot request it. |
| Hard delete | The row is removed permanently, with cascade to its scopes and namespace entries. |

## Document Index

| # | Document | Description | Depends On |
| --- | --- | --- | --- |
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (AR-1–AR-10) | — |
| **RD-01** | [Resource-Server Admin Management](RD-01-resource-server-admin.md) | Admin API, SDK, CLI, docs, permissions, validation, and verification | — |

## Dependency Graph

```text
AR-1 … AR-10 (resolved)
        │
        └── RD-01 (resource-server admin management)
```

RD-01 is standalone. It depends on the already-delivered resource-server model and does not require
another RD.

## Suggested Implementation Order

| Phase | Documents | Description |
| --- | --- | --- |
| **A: Server contract** | RD-01 | Service/repository, Admin routes, validation, transactions, authorization, audit |
| **B: SDK and CLI** | RD-01 | Types, SDK methods, CLI command family, human/JSON output |
| **C: Documentation** | RD-01 | Public API/CLI pages and technical architecture updates |
| **D: Verification** | RD-01 | Unit, integration, pentest, SDK/CLI, structure, docs, and targeted provider-resolution checks |

## Key Architecture Decisions

| Decision | Choice | Rationale | AR Ref |
| --- | --- | --- | --- |
| Feature ownership | Existing `resource-servers` feature | Keeps the model and its deferred admin surface together | AR-1 |
| Permission model | `admin:app:read` / `admin:app:update` | No RBAC seed migration; App Admin already owns application configuration | AR-2 |
| Scope mutation | Replace-all on `PUT` | One atomic contract; no add/remove partial states | AR-3 |
| Delivery | API + SDK + CLI + docs together | The capability is not operator-usable until all consumers exist | AR-4 |
| List shape | Bounded list ordered by name | Per-application sets are expected to be small | AR-5 |
| CLI location | `porta app resource-server ...` | Matches existing application subcommands | AR-6 |
| Audience omission | Reset to identifier | `PUT` is full replacement and matches create/DB default | AR-7 |
| Standard scopes | Reject with `400` | Resolver owns protocol scopes; registry stays custom-only | AR-8 |
| Delete behavior | Hard delete and document impact | No reference table; matches the cascade model | AR-9 |
| Optional surfaces | Exclude export/import, target audit, ETag | Keeps the first surface bounded; generic audit remains | AR-10 |

## Commonly Forgotten Requirements

| Concern | Addressed? | Where |
| --- | --- | --- |
| Audit logging / activity trail | ✅ Yes | RD-01 generic `admin.mutation.committed` |
| Data export | N/A — excluded | AR-10, RD-01 Won't Have |
| API versioning | N/A — existing unversioned Admin API | RD-01 Technical Requirements |
| Rate limiting | ✅ Yes — existing Admin mutation limiter | RD-01 Security Considerations |
| Error messages and UX | ✅ Yes — fixed bodies and CLI output | RD-01 Technical Requirements |
| Empty states | ✅ Yes — `{ data: [] }` | RD-01 Acceptance Criterion 1 |
| Loading / optimistic UI | N/A — no UI | CLI only |
| Accessibility | N/A — no UI | CLI only |
| Mobile responsiveness | N/A — no UI | CLI only |
| Backup and disaster recovery | N/A — existing PostgreSQL controls | No new persistence |
| Monitoring and alerting | ✅ Yes — existing structured logs/audit | RD-01 Non-Functional Requirements |
| Email notifications | N/A | No notification behavior |
| Search | N/A — bounded list | AR-5 |
| Pagination | N/A — explicitly excluded | AR-5 |
| File upload/download | N/A | No file behavior |
| Soft delete vs hard delete | ✅ Yes — hard delete | AR-9 |
| Timezone handling | ✅ Yes — ISO-8601 UTC timestamps | RD-01 Projection |
| Localization | N/A — Admin/CLI surface | Existing conventions |
| Terms of service / privacy | N/A | No user-facing legal surface |
| GDPR / retention | N/A — no PII | Configuration only |
| Session management | N/A — Admin token only | Existing middleware |
| Offline behavior | N/A | Admin/CLI online operation |
| Admin / super-admin capabilities | ✅ Yes | RD-01 authorization |
| User onboarding | N/A | N/A |
| Configuration management | N/A — no feature flag | N/A |
| Input validation and sanitization | ✅ Yes | RD-01 validation table |
| Injection prevention | ✅ Yes — parameterized SQL | RD-01 Security Considerations |
| Authentication and authorization model | ✅ Yes | AR-2, RD-01 |
| Rate limiting on auth/public endpoints | ✅ Yes — existing Admin limiter | RD-01 Security Considerations |
| Secrets management | N/A — no new secret | RD-01 Security Considerations |
| Encryption at rest/in transit | ✅ Yes — existing DB and HTTPS | RD-01 Security Considerations |
| Infrastructure hardening | N/A — no new infrastructure | RD-01 Security Considerations |
| Security testing | ✅ Yes — unit, integration, pentest | RD-01 Acceptance Criteria 11–20 |

## Specialist Check

Specialist check: the existing `oidc-provider-reviewer` covers the provider-shape review for
identifier, audience, and resource-resolution boundaries. No new specialist candidate is needed.

## How to Use These Documents

1. Review and approve RD-01.
2. Run the `make-plan` skill for RD-01.
3. Execute the resulting plan with `exec-plan`.
4. Use the `oidc-provider-reviewer` in the plan's Specialist Agents table for the provider-boundary
   phases.
