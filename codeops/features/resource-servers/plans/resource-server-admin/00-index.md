# Resource-Server Admin Management Implementation Plan

> **Feature**: Admin API, SDK, CLI, and docs for application-owned resource servers
> **Status**: Complete
> **Created**: 2026-11-09 00:22
> **Implements**: resource-servers/RD-01
> **CodeOps Artifact Schema**: 1

## Overview

This plan completes the deferred management surface for the resource-server model that already
exists in Porta. It adds CRUD Admin routes under `/api/admin/applications/:appId/resource-servers`,
a service/repository module, replace-all custom-scope management, SDK methods, the
`porta app resource-server` CLI family, and public/technical documentation. Provider resolution and
the database schema remain unchanged.

The work is deliberately bounded: the existing tables, unique constraints, namespace trigger,
permission middleware, transaction helper, audit middleware, SDK transport, and CLI command patterns
carry the behavior. No new migration, permission family, cache, queue, worker, or UI surface is
introduced.

## Minimum-Sufficient Baseline

**Original goal:** make application-owned resource servers operable through the Admin API, SDK, CLI,
and docs without changing provider behavior.

**Smallest viable design:** a focused `resource-servers` server module plus a nested Admin router,
SDK methods on the existing applications domain, a new CLI command family, and documentation. It
reuses `admin:app:read`/`admin:app:update`, the existing schema and namespace trigger, the request
transaction helper, and the generic Admin mutation audit.

**Excluded machinery:** no new migration, RBAC permission family, export/import extension,
target-specific audit event, ETag/If-Match layer, pagination layer, terminal Admin UI, end-user
self-service, cache, queue, or background worker.

**Approved complexity:** None. AR-1 through AR-5 are bounded implementation choices, not a
complexity escalation.

## Document Index

| #   | Document | Description |
| --- | --- | --- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Plan-level decisions (AR-1–AR-5) |
| 00  | [Index](00-index.md) | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md) | Thin delta view of RD-01 |
| 02  | [Current State](02-current-state.md) | Existing model, routes, SDK, CLI, and gaps |
| 03-01 | [Server API](03-01-server-api.md) | Types, validation, repository, service, routes, transactions |
| 03-02 | [SDK](03-02-sdk.md) | Types, domain methods, response validation |
| 03-03 | [CLI and Docs](03-03-cli-docs.md) | Command family, output, public and technical docs |
| 07  | [Testing Strategy](07-testing-strategy.md) | ST-cases and verification layers |
| 99  | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### Admin API

```http
GET    /api/admin/applications/:appId/resource-servers
POST   /api/admin/applications/:appId/resource-servers
GET    /api/admin/applications/:appId/resource-servers/:resourceServerId
PUT    /api/admin/applications/:appId/resource-servers/:resourceServerId
DELETE /api/admin/applications/:appId/resource-servers/:resourceServerId
```

### SDK

```ts
const servers = await client.applications.listResourceServers(appId);
const created = await client.applications.createResourceServer(appId, {
  name: 'Billing API',
  identifier: 'https://billing.example.test',
  scopes: ['billing:read'],
});
```

### CLI

```bash
porta app resource-server list acme
porta app resource-server create acme \
  --name "Billing API" \
  --identifier https://billing.example.test \
  --scope billing:read
```

## Key Decisions

| Decision | Outcome | AR Ref |
| --- | --- | --- |
| Server module layout | New `packages/server/src/resource-servers/` module | AR-1 |
| Route wiring | New `routes/resource-servers.ts` mounted in `server.ts` | AR-2 |
| Documentation layout | Dedicated API and CLI pages, cross-linked from applications | AR-3 |
| Final verification | `pnpm verify` at the final phase | AR-4 |
| Provider-boundary review | Existing `oidc-provider-reviewer` specialist | AR-5 |

## Specialist Agents

| Role | Kind | Use | AR Ref |
| --- | --- | --- | --- |
| `oidc-provider-reviewer` | reviewer | Phase 1 provider-model and audience/identifier review | AR-5 |

_Detection evidence: the role is already installed and approved; its brief covers opaque provider
identifiers, application ownership, and token/audience boundaries, which this feature touches. It is
additional to the mandatory correctness and security reviews._

## Related Files

- `packages/server/src/oidc/resource-servers.ts` — existing provider resolver
- `packages/server/src/resource-servers/` — new Admin module
- `packages/server/src/routes/resource-servers.ts` — new router
- `packages/server/src/server.ts` — router mount
- `packages/sdk/src/types/resource-servers.ts` — new SDK types
- `packages/sdk/src/domains/applications.ts` — SDK methods
- `packages/cli/src/commands/app-resource-server.ts` — new CLI family
- `packages/cli/src/commands/app.ts` — command registration
- `docs/api/resource-servers.md`, `docs/cli/resource-servers.md` — public docs
- `techdocs/architecture/api-design.md`, `techdocs/architecture/data-model.md` — maintainer docs
