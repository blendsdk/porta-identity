# Testing Strategy: SDK–Server Contract Truth

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --- | --- |
| GDPR export query and mapping | 90% (service + schema integration) |
| SDK domain methods | 90% (every corrected method has a spec test) |
| SDK type contracts | Exact-type oracle refreshed for changed types |
| CLI claim commands | 80% (argument parsing and SDK calls) |
| Docs | Build validation only |

- Test names state behavior: `should [expected behavior] when [condition]`.
- Integration tests run against the real migrated schema with PostgreSQL, Redis, and MailHog
  (`yarn docker:up`).
- End-to-end: `N/A` — no browser or OIDC flow changes; the SDK and CLI tests cover the corrected
  surfaces, and the server integration test covers the export endpoint.
- The SDK suite is pure unit tests with mock transports by design
  (`packages/sdk/vitest.config.ts:1-10`); "real schema" applies to the server integration suite.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> These test cases are derived EXCLUSIVELY from the requirements docs and component specs. They
> define expected behavior BEFORE any implementation exists.
>
> **IMMUTABLE ORACLE RULE:** Do NOT modify these expectations to match the implementation. If the
> implementation does not match a spec test case, the implementation is wrong — not the test.
>
> The `Source` column lives in this plan document, not in code. Spec tests quote the behavior in
> plain language in their in-code comments.

### Server — GDPR export and create ETag

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | `exportUserData(user)` for a user with one claim value on the real schema | `customClaims` is `[{ claimName, value, applicationId }]` derived from the definition | RD-02 R1, R3; 03-01 §Changed Query |
| ST-2 | `exportUserData(user)` for a user without claim values on the real schema | `customClaims` equals `[]` | RD-02 R3; 03-01 §Testing Requirements |
| ST-3 | `GET /api/admin/organizations/:orgId/users/:userId/export` with `admin:user:read` for users with and without claims | Both answer `200` with the export envelope | RD-02 R5; 03-01 §Error Handling |
| ST-4 | `validateSlug('new')` in the server unit suite | `{ isValid: false }` with an error naming the reservation | RD-01 R9; 03-02 §Testing Requirements |
| ST-5 | `validateSlug('new-york')` and other slugs containing `new` | `{ isValid: true }` | RD-01 R9; 03-02 §Error Handling |
| ST-24 | `POST /organizations/:orgId/users` response | Response carries an `ETag` header equal to the value a subsequent `GET` returns | RD-01 R4; AR-17; 03-01 §Changed Handler |

### SDK — Organizations

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-6 | `validateSlug('taken-slug')` when the server answers `200 { isValid: false, error: 'Slug already in use' }` | Resolves with exactly `{ isValid: false, error: 'Slug already in use' }`; no `available` property. Red evidence is type-level (`SlugValidationResult`), because the pre-change pass-through already accepts the body | RD-01 R1; AR-2; 03-03 §New Types |
| ST-7 | `validateSlug` when the server answers `400` (malformed or reserved) | Throws `PortaValidationError` (pinning; transport behavior already covered) | RD-01 R1; AR-2 |
| ST-8 | `organizations.list({ sortBy: 'name', sortOrder: 'asc' })` | Transport receives `params` containing `sortBy: 'name'` and `sortOrder: 'asc'`. Red evidence is type-level (`ListParams` keys); forwarding already works at runtime | RD-01 R2; AR-3; 03-03 §New Types |
| ST-9 | `organizations.update(id, input)` when the response has `ETag: W/"abc"` | Resolves `{ data, etag: 'W/"abc"' }`; the request body is unchanged | RD-01 R4; AR-5; 03-03 §New Functions |
| ST-10 | `organizations.getHistory(id, { limit: 50, after: 'cur', eventType: 'org.' })` when the server answers `{ data: [...], hasMore: true, nextCursor: 'n2' }` | Transport receives `limit: 50`, `after: 'cur'`, `event_type: 'org.'`; resolves the full envelope with `nextCursor: 'n2'` | RD-01 R3; AR-4; 03-03 §New Functions |

### SDK — Users, claims, roles, export

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-11 | `users.create(input)` when the response has an `ETag` header | Resolves `{ data: User, etag }` | RD-01 R4; AR-17; 03-04 §New Functions |
| ST-12 | `users.update(orgId, userId, input)` when the response has an `ETag` header | Resolves `{ data: User, etag }` | RD-01 R4; AR-5; 03-04 §New Functions |
| ST-13 | `usersById.update(userId, input)` when the response has an `ETag` header | Resolves `{ data: User, etag }` | RD-01 R4; AR-5; 03-04 §New Functions |
| ST-14 | `users.getHistory(orgId, userId, { limit: 10, after: 'c', eventType: 'user.login' })` | Transport receives `limit: 10`, `after: 'c'`, `event_type: 'user.login'`; resolves `HistoryResult` | RD-01 R3; AR-4; 03-04 §New Functions |
| ST-15 | `usersById.getHistory(userId)` when the server answers `{ data: { data, hasMore, nextCursor } }` | Resolves the inner `HistoryResult` envelope, not the outer `data` array (already pinned; regression) | RD-01 R3; AR-14; 03-04 §New Functions |
| ST-16, ST-17 | Withdrawn | Application/client history is deferred to a separate server defect; their routes answer `500` (`Unsupported entity type for history`) | RD-01 R3; AR-4 |
| ST-18 | `customClaims.getValuesForUser(appId, userId)` when the server answers `{ data: [{ definition, value }] }` | Transport calls `GET /applications/:appId/claims/users/:userId`; resolves the array with `definition.claimName` and `value.value`; the result is not filtered by application (documented server behavior) | RD-01 R5, R6; AR-6, AR-7, AR-15 |
| ST-19 | `customClaims.setValue(appId, claimId, userId, 'engineering')` | Transport calls `PUT /applications/:appId/claims/:claimId/users/:userId` with body `{ value: 'engineering' }` | RD-01 R5; AR-6 |
| ST-20 | `customClaims.deleteValue(appId, claimId, userId)` | Transport calls `DELETE /applications/:appId/claims/:claimId/users/:userId` | RD-01 R5; AR-6 |
| ST-21 | `userRoles.getEffectivePermissions(orgId, userId)` | Transport calls `GET /organizations/:orgId/users/:userId/roles/permissions`; resolves `Permission[]` | RD-01 R7; AR-8 |
| ST-22 | `twoFactor.setPolicy(orgId, 'required_totp')`, then a second call sends the returned token as `If-Match`, when the response has an `ETag` header | First call resolves `{ data: TwoFactorPolicyResult, etag }`; the second request carries the `If-Match` header | RD-01 R4; AR-5; 03-05 §New Functions |
| ST-23 | `users.exportData(orgId, userId)` resolving the server document | The resolved value type-checks against `UserDataExport` (type-contract oracle) | RD-01 R8; AR-9; 03-04 §New Types |
| ST-28 | `customClaims.getValue(appId, claimId, userId)` when the server answers `{ data: storedRow }` | Transport calls `GET /applications/:appId/claims/:claimId/users/:userId`; resolves the `UserClaimValue` row | RD-01 R5; AR-6; 03-04 §New Functions |

### CLI

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-25 | `porta user claims list --org <org> --app <app> <user>` | Calls `customClaims.getValuesForUser(app, user)` and prints `Claim ID`, `Claim Name`, `Value` | RD-01 R10; AR-12; 03-05 §New Functions |
| ST-26 | `porta user claims set --org <org> --app <app> <user> --claim c1 --value v` | Calls `customClaims.setValue(app, 'c1', user, 'v')` | RD-01 R10; AR-12 |
| ST-27 | `porta user claims remove --org <org> --app <app> <user> --claim c1` | Calls `customClaims.deleteValue(app, 'c1', user)` | RD-01 R10; AR-12 |

> **⚠️ AUTHORING RULE:** Expectations come from the specification documents, never from reading
> the implementation first.

## Test Categories

### Specification Tests (from ST-cases above)

> Written BEFORE implementation. Added to the domain test file that owns each surface, or in a new
> spec file where no suitable file exists. Every case must fail against the pre-change code or be
> paired with a red-capable type-level oracle; cases that already pass are reclassified as
> regression/pinning tests (ST-5, ST-7, ST-15).

| Test File | ST Cases Covered | Component |
| --- | --- | --- |
| `packages/server/tests/integration/admin/gdpr-user-export.spec.test.ts` (new) | ST-1, ST-2, ST-3 | GDPR export |
| `packages/server/tests/unit/organizations/slugs.test.ts` | ST-4, ST-5 | Reserved slug |
| `packages/server/tests/integration/admin/users-create-etag.spec.test.ts` (new) | ST-24 | Create ETag |
| `packages/sdk/tests/domains/organizations.test.ts` | ST-6–ST-10 | Organizations |
| `packages/sdk/tests/domains/users.test.ts` | ST-11, ST-12, ST-14 | Users |
| `packages/sdk/tests/domains/standalone-users.test.ts` | ST-13, ST-15 (pinning) | Standalone users |
| `packages/sdk/tests/domains/custom-claims.test.ts` | ST-18, ST-19, ST-20, ST-28 | Claim values |
| `packages/sdk/tests/domains/user-roles.test.ts` | ST-21 | Effective permissions |
| `packages/sdk/tests/domains/two-factor.test.ts` | ST-22 | Policy ETag |
| `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` | ST-23 | Export typing |
| `packages/sdk/tests/type-contracts/common-contract.spec.test.ts` (new) | ST-6/ST-8 type-level red oracles | Slug result, list/history params |
| `packages/cli/tests/commands/user.test.ts` | ST-25, ST-26, ST-27 | CLI claims |
| `packages/cli/tests/commands/app.test.ts` | Claim-definition fields | CLI definitions |

### Implementation Tests (edge cases, internals)

> Written AFTER implementation.

| Test File | Description | Priority |
| --- | --- | --- |
| `packages/server/tests/unit/users/gdpr.test.ts` | Mapping tests plus a new rejecting-pool failure-path case | High |
| `packages/sdk/tests/type-compatibility/types.test.ts` | Server↔SDK structural oracle for `CustomClaimDefinition`; must be repaired (server import paths, `CustomClaimDefinition`) and listed in a typechecked program before it can fail | High |
| `packages/sdk/tests/domains/*.test.ts` | Empty history page (`hasMore: false`, `nextCursor: null`), missing ETag header yields `etag: null`, malformed `after` cursor surfaces as `PortaServerError`, claim list with zero entries | Medium |
| `packages/sdk/tests/type-contracts/*` | Exact-key oracles for `ListParams`, `HistoryParams`, `CustomClaimDefinition`, `UserDataExport`, `SlugValidationResult`; new files are added to `tests/type-contracts/tsconfig.json` | High |

### Integration Tests

| Test | Components | Description |
| --- | --- | --- |
| `admin/gdpr-user-export.spec.test.ts` | Export service + routes + PostgreSQL | Real-schema population, empty-result, and route-level `200` cases, following the `admin/system-config-api.spec.test.ts` router pattern |
| `admin/users-create-etag.spec.test.ts` | User routes + PostgreSQL | Create response header matches a subsequent read |

### End-to-End Tests

| Scenario | Steps | Expected Result |
| --- | --- | --- |
| N/A | No browser or OIDC flow changes | Covered by SDK/CLI tests and server integration |

## Test Data

### Fixtures Needed

- Existing integration factories: `createTestOrganization`, `createTestApplication`,
  `createTestUser`, `createTestClaimDefinition` (`packages/server/tests/integration/helpers/factories.ts`).
- Claim value insertion via the existing repository `upsertValue` or the service `setValue`.
- SDK mock transports with the envelope/header shapes from the ST-cases.

### Mock Requirements

- SDK domain tests use the established `mockTransport` pattern (mock only the transport boundary).
- Server integration tests use the real database through the standard setup and `truncateAllTables`.
- The GDPR export unit test keeps its mocked pool for the failure path (RD-02 R4) and gains no
  schema assumptions.

## Verification Checklist

- [ ] All specification test cases (ST-*) defined with concrete input/output pairs
- [ ] Every ST case traces to a requirement, spec doc, or AR entry
- [ ] Specification tests written BEFORE implementation
- [ ] Specification tests verified to FAIL before implementation, or paired with a red-capable
      type-level oracle (red phase)
- [ ] All specification tests pass after implementation (green phase)
- [ ] Implementation tests written for edge cases and internals
- [ ] All unit / integration tests pass (`yarn verify`, `yarn test:integration`)
- [ ] Registered `yarn assurance:compat` tenant-admin selector passes from a clean committed revision
- [ ] No regressions in existing tests
- [ ] Type-contract oracles refreshed for every changed public type, and the repaired oracle is in a
      typechecked program
- [ ] `yarn docs:build` passes
