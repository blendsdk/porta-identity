# RD-02: GDPR export schema repair

> **Feature**: sdk-server-contract-drift
> **Status**: Planning Complete
> **Source issue**: GitHub #161
> **CodeOps Artifact Schema**: 1

## Summary

Repair `exportUserData()` so the GDPR/Article 20 user export queries the real custom-claim tables.
Every call to `GET /api/admin/organizations/:orgId/users/:userId/export` currently fails with
`relation "user_claim_values" does not exist` and answers `500`.

## Context

`packages/server/src/users/gdpr.ts:116-120` selects from `user_claim_values` joined to
`claim_definitions` on `definition_id`. Migration `007_custom_claims.sql` defines
`custom_claim_values` (with a `claim_id` foreign key) and `custom_claim_definitions`. The unit test
mocks the database pool, so CI stays green while the deployed endpoint always fails. This blocks
Article 20 data export for every deployment.

## Functional Requirements

### Must Have

- **R1 — Correct query.** The custom-claim query uses `custom_claim_values ucv` joined to
  `custom_claim_definitions ccd` on `ccd.id = ucv.claim_id`, selected in `claim_name` order, with
  columns `ccd.claim_name`, `ucv.value`, and `ccd.application_id`.
- **R2 — No stale references.** No source query references `user_claim_values` or a bare
  `claim_definitions` table. (The portability manifest's JSON keys are not SQL and stay unchanged.)
- **R3 — Real-schema proof.** At least one test exercises the SQL against the real migrated
  schema, not a mocked pool:
  - a user with claim values → `customClaims` is populated with the definition-derived
    `claimName`, `value`, and `applicationId`;
  - a user without claim values → `customClaims` is `[]`.
- **R4 — Failure path preserved.** The existing export failure expectation (a database failure maps
  to a fixed error message) keeps working.

### Should Have

- **R5 — Boundary test.** The export endpoint answers `200` for a user with claims and for a user
  without claims when called through the route, proving the middleware path as well as the service.

### Won't Have (Out of Scope)

- Rewriting the export document shape or its field names.
- Adding new data categories to the export.
- Adding `try/catch` translation to the route beyond what the existing middleware provides.
- A database migration or compatibility views for the old names.

## Technical Requirements

### Data Safety

- The fix is read-only and parameterized; the user ID remains a bound parameter (`$1`).
- Existing exports must not change shape, ordering, or field names.

### Compatibility

- The export document stays a superset of what the SDK's `UserDataExport` type describes; adding
  the type to the SDK changes compile-time typing only.

## Acceptance Criteria

1. Export returns `200` for a user with claims and for a user without claims against a migrated
   database.
2. No source query references `user_claim_values` or a bare `claim_definitions` table.
3. At least one test fails against the current query, proving it runs against the real schema
   instead of a stub.
4. Existing unit-test expectations for the failure path remain passing.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|---|---|---|---|---|
| Repair technique | Correct SQL / compatibility database views | Correct SQL | Views would preserve wrong names and add schema surface | AR-1 |
| Test level | Real-schema integration / keep mocked unit only | Real-schema integration plus retained unit | Mocked pools hid the defect; real schema proves it | AR-1, AR-16 |

> **Traceability:** every scope decision references its Ambiguity Register entry. See
> `../../plans/sdk-contract-truth/00-ambiguity-register.md`.

## Dependencies

- PostgreSQL with applied migrations (integration test infrastructure).
- The export service is called by `packages/server/src/routes/users.ts:400-411`; the route and its
  permissions are unchanged.
