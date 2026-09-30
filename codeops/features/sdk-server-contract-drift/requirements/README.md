# Porta SDK–Server Contract Truth — Requirements Documents

> **Feature**: sdk-server-contract-drift
> **Status**: Planning Complete
> **Created**: 2026-09-29
> **Architecture**: TypeScript ESM monorepo — Koa server, `@portaidentity/sdk`, `@portaidentity/cli`
> **CodeOps Artifact Schema**: 1

---

## Overview

The published `@portaidentity/sdk` drifted from the server's Admin API in several domains:
slug validation, list sorting, history pagination, response ETags, claim values, effective
permissions, and the GDPR export document type. A console client had to bypass the typed helpers
and call the SDK transport directly for every affected route. Separately, the server's GDPR export
queries nonexistent database tables, so the endpoint fails for every deployment.

This feature-set makes the SDK tell the truth about the server: the types, parameters, routes, and
return shapes match the real Admin API, and the export endpoint runs against the real schema. The
issues that raised this work are GitHub #159, #160, and #161.

## Minimum-Sufficient Baseline

**Original goal:** align the SDK admin domains with the server API and repair the GDPR export query.

**Smallest viable design:** correct the existing SQL, types, parameter names, and return shapes in
place; reuse `unwrapWithEtag`, `HistoryResult`, and the existing domain structure. No new domain
namespace beyond moving claim values into the existing `customClaims` namespace and deleting the
broken `userClaims` namespace.

**Excluded support machinery:** no OpenAPI-style schema generator, no shared server/SDK package, no
compatibility aliases kept past this change, no new assurance harness or test framework.

**Approved complexity:** none. Every change reuses an existing pattern.

## Domain Glossary

| Term | Definition |
|---|---|
| Contract truth | The SDK's types, parameters, routes, and return shapes match the server's real behavior. |
| ETag | A weak HTTP validator the server emits from entity type, ID, and `updatedAt`; callers pass it back in `If-Match` for optimistic concurrency. |
| `HistoryResult` | The server's history envelope `{ data, hasMore, nextCursor }`. |
| Effective permissions | The deduplicated permission set resolved across all roles assigned to a user. |
| Application-scoped claim value | A custom claim value owned by one application, addressed under `/applications/:appId/claims`. |
| Reserved slug | A slug the server refuses to assign because it collides with a system route or static path. |
| Legacy alias | The old SDK parameter/type names (`sort`, `order`, `available`, `UserClaimEntry`) removed by this feature-set. |

## Document Index

| # | Document | Description | Depends On |
|---|---|---|---|
| RD-01 | [SDK admin contract alignment](RD-01-sdk-admin-contract-alignment.md) | Organizations, users, history, claims, roles, 2FA, export, and reserved slug | — |
| RD-02 | [GDPR export schema repair](RD-02-gdpr-export-schema-repair.md) | Correct claim tables in the user data export | — |

## Scope Summary

| In scope | Out of scope |
|---|---|
| SDK organizations, users, claims, roles, two-factor, and history contracts | New SDK domain namespaces or a generated client |
| GDPR export SQL repair plus a real-schema test | Portability export/import behavior (already correct) |
| Server `new` slug reservation and operator note | Data migration for existing tenants |
| CLI `porta user claims` alignment with the real routes | Changes to the API shape itself |
| SDK CHANGELOG migration notes | Release version bumps and publishing |

## Relationship to Prior Work

The monorepo migration and production-readiness feature-sets are complete checkpoints. This
feature-set is a new, independent bug-fix feature-set; it does not reopen their verified histories.
The SDK's `1.11.0` changelog is the precedent for recording breaking contract corrections in a
minor release.
