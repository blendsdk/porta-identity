# SDK–Server Contract Truth Implementation Plan

> **Feature**: Align the `@portaidentity/sdk` admin domains with the server Admin API and repair the GDPR export query
> **Status**: Planning Complete
> **Created**: 2026-09-29
> **Implements**: sdk-server-contract-drift/RD-01, sdk-server-contract-drift/RD-02
> **CodeOps Artifact Schema**: 1

## Overview

The published SDK drifted from the server in slug validation, list sorting, history pagination,
response ETags, claim values, effective permissions, and the GDPR export type. A console client had
to bypass the typed helpers for every affected route. Separately, the server's GDPR export queries
nonexistent claim tables, so the endpoint answers `500` for every deployment.

This plan makes the SDK tell the truth about the server and repairs the export query. It covers the
findings in GitHub issues #159, #160, and #161, plus the related defects found during verification:
the claim-definition types describe a resource that does not exist, and the claim-definition CLI
surface uses the same phantom fields. Application and client history is deferred: those server
routes answer `500` (`Unsupported entity type for history`) and need a separate server fix (AR-4).

The work spans three workspaces — `@portaidentity/server`, `@portaidentity/sdk`, and
`@portaidentity/cli` — and is organized so specification tests pin every corrected contract before
the implementation changes.

## Minimum-Sufficient Baseline

**Original goal:** align the SDK admin domains with the server API and repair the GDPR export
query.

**Smallest viable design:** correct the existing SQL, parameter names, types, and return shapes in
place; reuse `unwrapWithEtag`, `HistoryResult`, and the existing domain structure; move claim values
into the existing `customClaims` namespace and delete the broken `userClaims` namespace.

**Excluded machinery:** no generated SDK or shared schema package, no OpenAPI tooling, no
compatibility aliases kept past this change, no new test harness or assurance profile, no database
migration.

**Approved complexity:** none (see the register's Complexity Escalation Review).

## Document Index

| #   | Document                                                              | Description                                      |
| --- | --------------------------------------------------------------------- | ------------------------------------------------ |
| AR  | [Ambiguity Register](00-ambiguity-register.md)                        | Zero-Ambiguity Gate decisions (audit trail)      |
| 00  | [Index](00-index.md)                                                  | This document — overview and navigation          |
| 01  | [Requirements](01-requirements.md)                                    | Plan-local delta and acceptance criteria         |
| 02  | [Current State](02-current-state.md)                                  | Verified defect analysis with file:line evidence |
| 03-01 | [Server GDPR Export](03-01-server-gdpr-export.md)                   | Correct claim tables and real-schema proof       |
| 03-02 | [Server Reserved Slug](03-02-server-reserved-slug.md)               | Reserve `new` and document the operator path     |
| 03-03 | [SDK Organizations](03-03-sdk-organizations.md)                     | Slug validation, sort params, history, ETag      |
| 03-04 | [SDK Users, Claims, Roles](03-04-sdk-users-claims-roles.md)         | User ETags, history, claims, permissions, export |
| 03-05 | [SDK History, 2FA, CLI](03-05-sdk-history-two-factor-cli.md)        | Shared history contract, policy ETag, CLI scope  |
| 07  | [Testing Strategy](07-testing-strategy.md)                            | Specification test cases and verification        |
| 99  | [Execution Plan](99-execution-plan.md)                                | Phases, sessions, and task checklist             |

## Quick Reference

### Usage Examples

```typescript
// Slug validation now mirrors the server (400 for malformed/reserved, 200 for taken)
const check = await porta.organizations.validateSlug('acme-corp');
if (!check.isValid) console.log(check.error);

// Cursor history with a parameter filter
const page = await porta.users.getHistory(orgId, userId, { limit: 50, eventType: 'user.' });
let cursor = page.nextCursor;
while (cursor) {
  const next = await porta.users.getHistory(orgId, userId, { after: cursor });
  cursor = next.nextCursor;
}

// Optimistic concurrency without a re-read
const { data: org, etag } = await porta.organizations.update(orgId, { name: 'New name' }, currentEtag);
await porta.organizations.update(orgId, { name: 'Newer name' }, etag!);

// Claim values are addressed under the application path (the server does not filter by app)
const values = await porta.customClaims.getValuesForUser(appId, userId);
await porta.customClaims.setValue(appId, claimId, userId, 'engineering');

// Effective permissions resolve across roles
const permissions = await porta.userRoles.getEffectivePermissions(orgId, userId);
```

### Key Decisions

| Decision | Outcome |
| --- | --- |
| Slug-validation contract | Server-native `{ isValid, error? }`; `400` documented for malformed/reserved |
| Sort parameters | `ListParams` uses `sortBy`/`sortOrder` |
| History contract | Organizations, users, and standalone-user `getHistory` return `HistoryResult` and accept `{ limit, after, eventType }`; application/client history is deferred (server routes fail) |
| ETag writes | `organizations.update`, `users.create`, `users.update`, `usersById.update`, `twoFactor.setPolicy` |
| Claims surface | `userClaims` deleted; value methods merged into `customClaims` with `applicationId` (the server does not filter values by application) |
| Claim definition types | Server-aligned `CustomClaimDefinition` / `CreateCustomClaimInput` / `UpdateCustomClaimInput` |
| SDK compatibility | Clean break recorded in the changelog; no aliases |
| `new` slug | Reserved server-side; validation only, no data migration |
| CLI | `porta user claims` gains required `--app` |
| Export SQL | Correct tables `custom_claim_values` / `custom_claim_definitions` on `claim_id` |

## Related Files

**Server**

- `packages/server/src/users/gdpr.ts` — repaired query
- `packages/server/src/organizations/slugs.ts` — reserved word
- `packages/server/tests/unit/organizations/slugs.test.ts` — unit test
- `packages/server/tests/integration/admin/gdpr-user-export.spec.test.ts` — new real-schema test
- `packages/server/tests/integration/admin/users-create-etag.spec.test.ts` — new route-level ETag test
- `packages/server/tests/unit/users/gdpr.test.ts` — mapping and failure-path unit tests

**SDK**

- `packages/sdk/src/types/common.ts`, `types/user-claims.ts`, `types/custom-claims.ts`,
  `types/organizations.ts`, `types/users.ts`, `types/two-factor.ts`, `types/index.ts`
- `packages/sdk/src/domains/organizations.ts`, `users.ts`, `user-claims.ts`, `custom-claims.ts`,
  `user-roles.ts`, `two-factor.ts`, `index.ts`
- `packages/sdk/src/client.ts`, `index.ts`, `agent.ts`
- `packages/sdk/tests/domains/*`, `packages/sdk/tests/type-contracts/*`,
  `packages/sdk/tests/type-compatibility/types.test.ts`
- `packages/sdk/CHANGELOG.md`, `packages/sdk/README.md`

**CLI and docs**

- `packages/cli/src/commands/user-claim.ts`, `app-claim.ts`, `org.ts`, `user.ts`, `client.ts`, `app.ts`
- `packages/cli/src/admin/user-service.ts`, `organization-service.ts`
- `packages/cli/tests/commands/user.test.ts`, `app.test.ts`, `org.test.ts`, `client.test.ts`
- `packages/cli/tests/admin/user-service.spec.test.ts`, `organization-service.impl.test.ts`
- `test-harness/consumers/tenant-admin-sdk-probe.mjs`
- `docs/guide/sdk.md`, `docs/api/organizations.md`, `docs/cli/users.md`, `docs/cli/applications.md`,
  `docs/concepts/custom-claims.md`, `docs/guide/sdk-agent.md`
