# Porta Production Readiness — Requirements Documents

> **Project**: Porta Production Readiness — security corrections, environment portability, and
> database-backed operational policy
> **Status**: Complete
> **Created**: 2026-09-12
> **Architecture**: Node.js 24 LTS, TypeScript ESM, Koa, oidc-provider, PostgreSQL, Redis, SDK, CLI,
> and JSVision Admin UI
> **CodeOps Artifact Schema**: 1

---

## Overview

This feature-set removes the two known security defects that block a new production installation,
then adds selective movement of Porta organizations and application data, followed by a small
PostgreSQL-backed global policy catalog. The requirements cover the server, database, SDK,
conventional CLI, embedded Admin UI, tests, and operator documentation. The work remains a separate
feature-set and follows the approved security, portability, then configuration order. (AR-1, AR-2)

The design assumes Porta has no adopted production data and the Admin UI has one operator at a
time. PostgreSQL backup, replication, standby, and disaster recovery remain operating-system and
database-administration responsibilities. The portability manifest is for moving selected logical
configuration and identities, not for replacing those workflows.

## Minimum-Sufficient Baseline

**Original goal:** make a new Porta installation safe to run in production, support selective
movement between installations, and manage approved global policy values in PostgreSQL.

**Smallest viable design:** correct signing-key encryption/rotation and TOTP replay; use one strict,
selective JSON manifest with atomic previewed import; and expose one closed 18-key configuration
catalog through existing product surfaces.

**Excluded support machinery:** no KMS/HSM project, worker, queue, pub/sub, watcher, streaming or ZIP
export, compatibility parser, automatic backup/standby workflow, arbitrary configuration keys,
configuration history, or concurrent-admin conflict protocol.

**Approved complexity:** none. Every feature reuses existing Porta services and infrastructure.

## Domain Glossary

| Term | Definition |
|---|---|
| Production security correction | A focused fix for a demonstrated security defect that blocks safe initial deployment. |
| Portable manifest | One strict versioned JSON document containing selected logical Porta records and relationships. |
| Selected-organization scope | Organization-owned manifest data limited to one organization slug. |
| Complete-environment scope | Organization-owned manifest data for every organization, requiring exact super-admin authority. |
| Global application | An application and authorization definition shared across organizations. |
| Natural key | A stable public identity such as an organization/application slug, normalized email, or OIDC Client ID. |
| Keep existing | Import mode that reuses compatible destination records without changing their portable fields. |
| Update existing | Import mode that updates listed portable fields but never deletes unlisted destination state. |
| Closed configuration catalog | The exact code-defined list of editable keys, types, ranges, defaults, and application modes. |
| Runtime setting | A configuration value visible locally after cache clear and on other instances within 60 seconds. |
| Restart-required setting | An OIDC-provider startup value that applies only after every Porta instance restarts. |
| Root secret | A credential or encryption key that remains in environment or secret-manager configuration. |

## Document Index

| # | Document | Description | Depends On |
|---|---|---|---|
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Approved scope and architecture decisions | — |
| **RD-01** | [Production Security Corrections](RD-01-production-security-corrections.md) | Signing-key encryption/rotation and single-use TOTP | — |
| **RD-02** | [Selective Environment Portability](RD-02-selective-environment-portability.md) | Selective JSON export, preview, and atomic import | RD-01 |
| **RD-03** | [PostgreSQL-Backed Global Configuration](RD-03-postgresql-backed-global-configuration.md) | Closed typed operational-policy catalog | RD-01, RD-02 |

## Dependency Graph

```text
RD-01 Production security corrections
  └── RD-02 Selective environment portability
        └── RD-03 PostgreSQL-backed global configuration
```

The order is a delivery priority, not an unnecessary runtime coupling. RD-02 relies on the corrected
destination security boundaries. RD-03 follows portability so global destination policy is not
mistaken for portable organization/application data.

## Suggested Implementation Order

| Phase | Documents | Description |
|---|---|---|
| **P0: Security** | RD-01 | Remove the known production blockers first. |
| **P1: Portability** | RD-02 | Move selected logical environments through one manifest. |
| **P2: Configuration** | RD-03 | Store and edit the closed global policy catalog. |

## Key Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Signing-key storage | Existing AES-256-GCM helper on every creation path | Closes plaintext Admin creation without a new key system. |
| TOTP replay | Conditional last-step update in PostgreSQL | Provides durable single-use behavior with no new service. |
| Legacy compatibility | None; reset unused installations | Porta has no adopted production data. |
| Portability artifact | One strict JSON v1.0 manifest | Easy to inspect and move without file-order machinery. |
| Import behavior | Mandatory preview and atomic keep/update | Gives predictable results without destination deletion. |
| Relationship identity | Public slugs, normalized email, and Client ID | Database UUIDs are installation-specific. |
| OIDC client data | Explicit and default-off; generate new secret | Makes environment-specific URLs visible and transfers no credentials. |
| Configuration ownership | Code-defined catalog, PostgreSQL values | Prevents arbitrary keys while allowing operator changes. |
| Cross-process refresh | Existing 60-second cache; restart startup settings | Avoids pub/sub and live provider mutation. |
| Infrastructure secrets | Environment or secret manager | The database must not store its own root access/encryption material. |
| Administrator concurrency | No special conflict workflow | The embedded Admin UI is a single-operator application. |

## Commonly Forgotten Requirements — Final Check

| Concern | Disposition | Owner |
|---|---|---|
| Audit logging | Content-free security/operation events are specified. | RD-01–RD-03 |
| Export/import | Selective portability is the complete logical-data boundary. | RD-02 |
| API/versioning | Strict manifest v1.0; existing Admin API paths evolve before adoption. | RD-02 |
| Rate limiting | Existing security limits remain; approved global limits are catalogued. | RD-01, RD-03 |
| Error and empty states | Fixed safe errors, empty selections, previews, and disabled actions are specified. | RD-01–RD-03 |
| Accessibility/layout | Existing JSVision focus behavior and Layout DSL are retained. | RD-02, RD-03 |
| Backup/DR | Explicitly outside portability; PostgreSQL/OS workflows own it. | RD-02 |
| Monitoring/alerts | No new subsystem; fixed safe logs and existing operations remain. | RD-01–RD-03 |
| Email/templates | No template change; lifetime policy applies at artifact creation. | RD-03 |
| Search/pagination/large data | Not needed for the approved small administrative datasets. | RD-02 |
| Files | One open/save JSON file; validated organization branding assets may be embedded. | RD-02 |
| Deletion/retention | Import never deletes; audit retention has one bounded setting. | RD-02, RD-03 |
| Time/localization | RFC 3339 manifest time; installed-locale fallback is configurable. | RD-02, RD-03 |
| Sessions/onboarding | Sessions and credentials are excluded; imported users establish new credentials. | RD-02 |
| Configuration | Closed catalog and external-secret boundary are explicit. | RD-03 |
| Input validation | Strict server-side Zod schemas, exact types, ranges, and domain validators. | RD-01–RD-03 |
| Injection prevention | Fixed parameterized SQL; JSON is data and never shell/template input. | RD-01–RD-03 |
| Authentication/authorization | Exact Admin permissions, tenant membership, and super-admin scope checks. | RD-01–RD-03 |
| Secrets/encryption | Root secrets stay external; private keys/TOTP encrypted; credentials never exported. | RD-01–RD-03 |
| Infrastructure hardening | No new service or exposure; existing production guidance remains authoritative. | RD-01–RD-03 |
| Security testing | Unit, integration, E2E, pentest, UI, and assurance boundaries are named. | RD-01–RD-03 |

## How to Use These Documents

1. Create and preflight the RD-01 implementation plan.
2. Execute RD-01 specification-first and complete its security verification.
3. Repeat for RD-02 and RD-03 in order.
4. Keep every plan inside this feature-set and update its roadmap after each verified phase.
