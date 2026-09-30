# Current State: SDK–Server Contract Truth

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The server exposes a complete Admin API under `/api/admin` with consistent conventions:
`{ data: ... }` envelopes, weak ETags on selected writes, `{ data, hasMore, nextCursor }` history
envelopes, and per-resource Zod validators. The SDK wraps that API in 20 domain namespaces (19 after
the phantom `userClaims` namespace is removed) over a transport that prefixes `/api/admin`.

Verification against `develop` at `079c56c9` confirmed every finding in issues #159, #160, and
#161, plus three related defects. The tables below record the evidence.

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `packages/server/src/users/gdpr.ts` | GDPR export service | Correct claim-table SQL (03-01) |
| `packages/server/src/organizations/slugs.ts` | Slug rules | Add `new` to `RESERVED_SLUGS` (03-02) |
| `packages/sdk/src/domains/organizations.ts` | Organization domain | Slug result, sort params, history, ETag (03-03) |
| `packages/sdk/src/types/common.ts` | Shared list/history types | Sort names; history params type (03-03, 03-05) |
| `packages/sdk/src/domains/users.ts` | User domain | ETags, history params, export type (03-04) |
| `packages/sdk/src/domains/user-claims.ts` | Phantom claim routes | Delete; merge into `customClaims` (03-04) |
| `packages/sdk/src/types/user-claims.ts` | Claim value types | Replace flat type with server shapes (03-04) |
| `packages/sdk/src/types/custom-claims.ts` | Claim definition types | Align with server definition (03-04) |
| `packages/sdk/src/domains/custom-claims.ts` | Claim definitions | Add value methods; correct types (03-04) |
| `packages/sdk/src/domains/user-roles.ts` | User roles | Add `getEffectivePermissions` (03-04) |
| `packages/sdk/src/domains/two-factor.ts` | 2FA domain | `setPolicy` returns `ETagResponse` (03-05) |
| `packages/sdk/src/domains/applications.ts`, `clients.ts` | App/client history | No change — server routes answer `500`; deferred to a separate defect |
| `packages/sdk/src/client.ts`, `index.ts`, `agent.ts` | Public surface | Remove `userClaims`; refresh agent catalog (03-04, 03-05) |
| `packages/cli/src/commands/user-claim.ts`, `app-claim.ts`, `org.ts`, `user.ts`, `client.ts`, `app.ts`; `packages/cli/src/admin/user-service.ts`, `organization-service.ts` | CLI consumers | Align with corrected SDK return types and claim-definition fields (03-04, 03-05) |
| `docs/guide/sdk.md`, `docs/api/organizations.md`, `docs/cli/users.md`, `docs/cli/applications.md`, `docs/concepts/custom-claims.md`, `docs/guide/sdk-agent.md` | Consumer docs | Contract parity (03-03, 03-04, 03-05) |

### Code Analysis

**GDPR export (#161).** The custom-claim query is the only wrong SQL in the repository:

```sql
-- packages/server/src/users/gdpr.ts:116-120
SELECT cd.claim_name, ucv.value, cd.application_id
FROM user_claim_values ucv
JOIN claim_definitions cd ON cd.id = ucv.definition_id
WHERE ucv.user_id = $1
```

Migration 007 defines the tables as `custom_claim_definitions` and `custom_claim_values` with
`custom_claim_values.claim_id` referencing `custom_claim_definitions(id)`
(`packages/server/migrations/007_custom_claims.sql:5-44`). The only other occurrences of the wrong
names are portability manifest JSON keys, not SQL. The unit test mocks `getPool`
(`packages/server/tests/unit/users/gdpr.test.ts:6-10`), so no test catches the defect.

**Slug validation (#159.1).** The route parses the query with `organizationSlugSchema`
(`packages/server/src/routes/organizations.ts:98-100`), which refines through `validateSlug`
(`packages/server/src/organizations/validators.ts:15-17`). A malformed or reserved slug therefore
answers `400`. A well-formed slug proceeds to `validateSlugAvailability`, which answers
`{ isValid: false, error: 'Slug already in use' }` when taken
(`packages/server/src/organizations/service.ts:475-492`). The SDK declares
`SlugValidation { available: boolean; slug: string }` and casts the body
(`packages/sdk/src/domains/organizations.ts:20-23,84-87`), so `available` is always `undefined`.

**Sort parameters (#159.2).** The server list schemas accept `sortBy` and `sortOrder` only
(`packages/server/src/routes/organizations.ts:84-95`). The SDK forwards
`ListParams.sort`/`order` verbatim through `toQueryParams`
(`packages/sdk/src/types/common.ts:23-26`, `packages/sdk/src/domains/helpers.ts:125-141`), and the
index signature hides the mistake from the compiler. The user list already uses the correct names
(`packages/sdk/src/types/users.ts:232-234`).

**History (#159.3, #160.2).** `getEntityHistory` returns `{ data, hasMore, nextCursor }`
(`packages/server/src/lib/entity-history.ts:42-46,122-190`) and supports only `organization` and
`user` entity types (`:57-60`). The organization and user routes pass the envelope through
(`organizations.ts:291-299`, `users.ts:435-447`); the standalone user route wraps it as
`{ data: envelope }` (`packages/server/src/routes/users.ts:884-892`). The application and client
routes call `getEntityHistory` with unsupported entity types and therefore answer `500`
(`applications.ts:317-326`, `clients.ts:436-443`; `entity-history.ts:132-135`); application/client
history is deferred to a separate server defect. The SDK:

| Method | Current defect |
| --- | --- |
| `organizations.getHistory` | `unwrapData<HistoryEntry[]>` returns the bare `data` array and drops `hasMore`/`nextCursor`; accepts `ListParams` that do not map to server names |
| `users.getHistory` | Sends `params: undefined`; return type `HistoryResult` matches the unwrapped route shape but no parameters can be passed |
| `usersById.getHistory` | `unwrapData<HistoryResult>` works and is pinned by `tests/domains/standalone-users.test.ts` |
| `applications.getHistory`, `clients.getHistory` | Deferred with the server defect; no SDK change in this plan |

**ETags (#159.4, #160.1, #160.5).** Server emission sites: `organizations.update`
(`routes/organizations.ts:239`), `users.update` (`routes/users.ts:301`), standalone `users.update`
(`:805`), and `twoFactor.setPolicy` (`routes/two-factor-admin.ts:360`). The SDK returns bare
entities from all of those plus `users.create`. Issue #160 states that `POST
/organizations/:orgId/users` sets an `ETag` (`packages/server/src/routes/users.ts:279`), but that
line belongs to the `GET /:userId` handler; the create handler at `:220-232` sets no header. Per
AR-17 the plan adds the one-line emission so `users.create` can return `ETagResponse<User>`
consistently with the other user write paths. `POST /organizations` and claim writes emit no ETag
and stay unchanged.

**Claims (#160.3, related).** The SDK targets `/organizations/:orgId/users/:userId/claims`
(`packages/sdk/src/domains/user-claims.ts:17-33`), which does not exist. The real routes live
under the application prefix (`packages/server/src/routes/custom-claims.ts:109-247`) but do not
filter values by application: list values `GET /users/:userId`, single value
`GET|PUT|DELETE /:claimId/users/:userId`, all under `admin:claim:read`/`admin:claim:update`. List
items are `{ definition, value }` (`packages/server/src/custom-claims/repository.ts:443-466`);
single values are the stored row
`{ id, userId, claimId, value, createdAt, updatedAt }` (`packages/server/src/custom-claims/types.ts:102-109`).
The list service returns values across all applications (`repository.ts:492-501`), so the SDK
documents that `applicationId` is not a server-side filter.
The SDK's flat `UserClaimEntry { claimDefinitionId, claimName, claimSlug, value, updatedAt }`
(`packages/sdk/src/types/user-claims.ts:7-13`) matches neither. The SDK definition types
(`packages/sdk/src/types/custom-claims.ts:9-45`) also describe a nonexistent resource: the server
uses `claimName`, `claimType`, and `includeIn*` flags
(`packages/server/src/custom-claims/types.ts:36-47`). The CLI's `porta user claims` subcommands
depend on the phantom namespace (`packages/cli/src/commands/user-claim.ts:69,120,152`).

**Permissions (#160.4).** The server route
`GET /api/admin/organizations/:orgId/users/:userId/roles/permissions` resolves deduplicated
permissions under `admin:role:read` (`packages/server/src/routes/user-roles.ts:204-222`,
`packages/server/src/rbac/user-role-service.ts:176-182`). The SDK has no method for it.

**Export type (#160.6).** The server returns a concrete `UserDataExport`
(`packages/server/src/users/gdpr.ts:21-66`); the SDK types it as `Record<string, unknown>`
(`packages/sdk/src/domains/users.ts:95-96`).

**Reserved slug (#159.5).** `RESERVED_SLUGS` (`packages/server/src/organizations/slugs.ts:24-54`)
has no `new`. `new` is a conventional create-action segment that reserved system or future static
routes can claim, which leaves the slug URL ambiguous; no active route currently shadows it.

## Gaps Identified

### Gap 1: GDPR export queries nonexistent tables (RD-02)

**Current Behavior:** Every export request fails with `relation "user_claim_values" does not exist`
and answers `500`; the route has no `try/catch` (`packages/server/src/routes/users.ts:400-411`).

**Required Behavior:** The export returns `200` with populated `customClaims` against a migrated
database.

**Fix Required:** Correct table and column names; add real-schema test coverage (03-01, ST-1–ST-3).

### Gap 2: SDK contract drift (RD-01)

**Current Behavior:** Multiple distinct contract defects across organizations, users, claims,
roles, 2FA, and the supported history surfaces (application/client history excluded).

**Required Behavior:** Types, parameters, routes, and return shapes match the server (03-03, 03-04,
03-05).

**Fix Required:** The corrections listed in the Relevant Files table, each pinned by a spec test or
type-level oracle (ST-4–ST-15, ST-18–ST-28).

### Gap 3: `new` is not reserved (RD-01 R9)

**Current Behavior:** Any organization may claim the slug `new`, a conventional create-action
segment that reserved system or future static routes can claim, leaving the slug URL ambiguous.

**Required Behavior:** Validation rejects `new`; the operator documentation explains how an existing
tenant named `new` is addressed and how a slug change is performed today (03-02, ST-4).

## Dependencies

### Internal Dependencies

- `unwrapWithEtag` and `HistoryResult` already exist in the SDK and are reused.
- The CLI consumes the SDK directly (`packages/cli/src/client-factory.ts`), so SDK changes must
  land with the CLI update in the same plan; this includes the classic commands, the `porta admin`
  services, and their tests.
- The SDK's type-contract tests (`packages/sdk/tests/type-contracts/`) act as an exact-type oracle
  and must be refreshed with the type changes. `packages/sdk/tests/type-compatibility/types.test.ts`
  is not part of any typecheck program and its server imports are broken; it must be repaired and
  wired into a typechecked project before it can pin the claim-definition type.
- The retained tenant-admin compatibility probe (`test-harness/consumers/tenant-admin-sdk-probe.mjs`)
  consumes `users.update` and must be updated with the return-type change; Phase 4 runs the
  registered `yarn assurance:compat` tenant-admin selector.

### External Dependencies

- PostgreSQL, Redis, and MailHog for integration verification (`yarn docker:up`).
- No new npm dependency, no migration, no infrastructure change.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Breaking SDK return types surprise adopters | High | Medium | Changelog migration notes; clean-break decision recorded in AR-10 |
| Type-contract oracle tests fail en masse | High | Low | Refresh them deliberately as part of the type task, not as an afterthought |
| SDK and CLI drift apart mid-change | Medium | Medium | Same phase (03-05) updates both; `yarn verify` covers both |
| Real-schema test requires services and is skipped accidentally | Low | High | The spec test uses the standard integration setup and runs in `yarn test:integration` |
| An existing tenant already uses the slug `new` | Low | Medium | UUID access always works; the operator note documents UUID access and a direct database slug change, and portability manifests containing `new` need a slug edit on import (AR-11) |
