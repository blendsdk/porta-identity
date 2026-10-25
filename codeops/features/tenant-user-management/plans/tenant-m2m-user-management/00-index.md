# Tenant-Scoped M2M User Management Implementation Plan

> **Feature**: Let an external tenant BFF manage users in its organization with only a `client_id` and `client_secret`
> **Status**: Plan Preflighted
> **Created**: 2026-10-25 15:44
> **Implements**: tenant-user-management/T-01
> **CodeOps Artifact Schema**: 1

## Overview

Porta already lets a tenant BFF invite users through a `client_credentials` token with the `org:user:invite` scope. This plan extends that same tenant-scoped M2M model to user management: create, list, get, update, permanently delete, activate/deactivate, and manage roles. The BFF holds only a tenant client ID and secret; it never needs a super-admin user, a control-plane token, or a refresh token.

The work is deliberately a tenant user-management surface, not a one-off create route. It reuses the existing Admin API route shapes, user services, role services, and SDK domains, while adding a tenant actor boundary, three least-privilege scopes, first-class client audit attribution, and the tests needed to prove tenant isolation.

## Minimum-Sufficient Baseline

**Original goal:** an external BFF with only a tenant `client_id` and `client_secret` can CRUD users in its own organization without a privileged Porta account.

**Smallest viable design:** reuse the existing `/organizations/:orgId/users` route shapes and user services; add a service-only tenant actor boundary and three scopes; reuse the existing SDK with `apiPrefix: '/api'`; add first-class client actor columns to the existing audit table. No new service, user account, API gateway, client model, dependency, or background worker.

**Excluded machinery:** synthetic service user, separate tenant API service, dynamic client registration, multi-org partner client, bulk user engine, new Admin UI, new assurance harness profile, password/2FA/export/history/invite-preview routes.

**Approved complexity:** None — the audit column extension and tenant auth refactor are direct obligations of the accepted requirements, not a new support layer. See AR-14, AR-16, AR-18, and AR-21.

## Document Index

| #   | Document | Description |
| --- | -------- | ----------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md) | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02  | [Current State](02-current-state.md) | Existing tenant invite, user, audit, role, SDK, and CLI analysis |
| 03  | [Tenant Auth and Scopes](03-01-tenant-auth-and-scopes.md) | Scope model, actor resolution, boundaries, rate limiting |
| 03  | [User CRUD Routes](03-02-user-crud-routes.md) | Routes, schemas, services, lifecycle, roles, responses |
| 03  | [Audit and Client Actor](03-03-audit-client-actor.md) | Audit migration, actor model, event coverage, durability |
| 03  | [SDK, CLI, and Documentation Contracts](03-04-sdk-cli-docs-contracts.md) | SDK types, CLI display, public docs, techdocs, ADR |
| 07  | [Testing Strategy](07-testing-strategy.md) | Specification test cases, integration, pentest, and verification |
| 99  | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### BFF client configuration

| Field | Value |
| --- | --- |
| `clientType` | `confidential` |
| `grantTypes` | `['client_credentials']` |
| `scope` | `org:user:read org:user:write org:user:delete` (add `org:user:invite` if used) |
| `tokenEndpointAuthMethod` | `client_secret_post` |
| `organizationId` | Tenant organization |
| `applicationId` | Tenant application |

### SDK usage

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import {
  createClientCredentialsAuth,
  createNodeTransport,
} from '@portaidentity/sdk/node';

const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    apiPrefix: '/api',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.example.com/acme/token',
      clientId: process.env.PORTA_TENANT_CLIENT_ID!,
      clientSecret: process.env.PORTA_TENANT_CLIENT_SECRET!,
      scope: 'org:user:read org:user:write org:user:delete',
    }),
  }),
});

const tenantOrg = process.env.PORTA_TENANT_ORG_ID!;

const created = await client.users.create({
  organizationId: tenantOrg,
  email: 'new.user@example.com',
  givenName: 'New',
  familyName: 'User',
  emailVerified: true,
});

await client.users.update(tenantOrg, created.data.id, {
  nickname: 'newbie',
  phoneNumber: '+15555550123',
  phoneNumberVerified: true,
});

await client.userRoles.assign(tenantOrg, created.data.id, [roleId]);

await client.users.deactivate(tenantOrg, created.data.id);
```

### Audit row shape

```json
{
  "eventType": "user.created",
  "organizationId": "<tenant-org>",
  "userId": "<new-user>",
  "actorId": null,
  "actorType": "client",
  "actorClientId": "acme-bff",
  "actorClientName": "Acme BFF"
}
```

### Key Decisions

| Decision | Outcome | AR Ref |
| --- | --- | --- |
| Operations | CRUD + lifecycle + roles | AR-1 |
| Actor model | Service-client-only for CRUD; invite remains dual | AR-2 |
| Scopes | `read`, `write`, `delete` plus existing `invite` | AR-3 |
| Routes | Mirror Admin API under `/api` | AR-4 |
| Tenant boundary | One client per organization | AR-5 |
| Role boundary | Client-application roles only | AR-8 |
| Verification flags | BFF may assert email and phone verification | AR-9 |
| Create + roles | Separate calls | AR-10 |
| First credential | BFF directs user to existing login/reset | AR-11 |
| Delete | Permanent delete under separate scope; deactivate under write | AR-12 |
| Read audit | `user.read` and `user.listed` | AR-13 |
| Audit actor | First-class client columns | AR-14 |
| Audit durability | Mutations transaction-bound | AR-16 |
| Rate limits | 300 writes/hour, 60 deletes/hour | AR-17 |
| Verification | Full verify, production-security harness result recording against the accepted baseline, tenant-admin compat | AR-23 |

## Specialist Agents

**None** — the capability-gap check found no gap a standing specialist would close. The work reuses existing tenant-auth, user-service, RBAC, and audit patterns; the security lens and the policy-mandated independent reviewer cover the risk.

_Detection evidence: `packages/server/src/middleware/tenant-invite-auth.ts` already implements the tenant boundary; `packages/server/src/users/service.ts` and `packages/server/src/rbac/user-role-service.ts` already own the mutation paths; `packages/server/src/lib/audit-log.ts` already owns the audit boundary; `codeops/codeops.json` already requires independent review. A specialist would restate these patterns rather than add project-specific capability._

## Plan Location

This plan lives in the repository's nested CodeOps layout at
`codeops/features/tenant-user-management/plans/tenant-m2m-user-management/` and is owned by roadmap
row `tenant-user-management/T-01`. Start implementation from an up-to-date `origin/develop`; the
tenant invitation prerequisite (PR #189) is already integrated there. Do not use a stale local
`develop` or the older `feat/tenant-user-invitations` branch as the base.

## Related Files

- Server auth and routes: `packages/server/src/middleware/tenant-invite-auth.ts`, `packages/server/src/routes/tenant-invitations.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/routes/user-roles.ts`, `packages/server/src/server.ts`
- Server services: `packages/server/src/users/service.ts`, `packages/server/src/users/invite-service.ts`, `packages/server/src/rbac/user-role-service.ts`
- Audit: `packages/server/src/lib/audit-log.ts`, `packages/server/src/lib/entity-history.ts`, `packages/server/src/routes/audit.ts`, `packages/server/migrations/009_audit_log.sql`
- Scopes and provider: `packages/server/src/oidc/scopes.ts`, `packages/server/src/oidc/configuration.ts`
- SDK: `packages/sdk/src/domains/users.ts`, `packages/sdk/src/domains/user-roles.ts`, `packages/sdk/src/types/users.ts`, `packages/sdk/src/types/audit.ts`, `packages/sdk/src/types/common.ts`
- CLI: `packages/cli/src/commands/audit.ts`, `packages/cli/src/admin/user-service.ts`
- CLI/server bootstrap: `packages/server/src/cli/commands/init.ts` (system actor for bootstrap user creation)
- Existing tests and fixtures: `packages/server/tests/unit/lib/audit-log.test.ts`, `packages/server/tests/unit/users/service.test.ts`, `packages/server/tests/unit/users/invite-service.spec.test.ts`, `packages/server/tests/unit/rbac/user-role-service.test.ts`, `packages/server/tests/unit/routes/users.test.ts`, `packages/server/tests/unit/routes/user-roles.test.ts`, `packages/server/tests/integration/migrations.test.ts`, `packages/server/tests/integration/repositories/audit-log.repo.test.ts`, `packages/server/tests/integration/admin/record-deletion.spec.test.ts`, `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts`, `packages/server/tests/integration/rbac/authority-mutations.spec.test.ts`, `packages/server/tests/integration/rbac/permission-deletion-concurrency.impl.test.ts`, `packages/server/tests/unit/admin/administrative-data-production-driver.ts`, `packages/sdk/tests/type-contracts/users-contract.spec.test.ts`
- Docs: `docs/api/users.md`, `docs/api/audit.md`, `packages/sdk/README.md`, `techdocs/architecture/api-design.md`, `techdocs/architecture/security.md`, `techdocs/architecture/data-model.md`, `techdocs/decisions/index.md`
