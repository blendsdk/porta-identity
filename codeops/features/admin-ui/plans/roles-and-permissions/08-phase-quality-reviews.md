# Roles and Permissions Phase Quality Reviews

> **Status**: Phase 2 review passed with one accepted deferred residual
> **Last Updated**: 2026-09-09 23:32
> **CodeOps Artifact Schema**: 1

## Phase 1: Authority Provenance and OIDC Claims

**Review boundary:** `6e3dcf8044a72bea5715913dacee70cccfcb8311..f2c7c05e`
**Scope mode:** Strict
**Verification before review:** 298 selected Phase 1 unit assertions, scoped ESLint, server
typecheck, and 97 repository structure tests passed. Six canonical-mutation specifications remain
scheduled for Phase 2 under AR-20. Root `yarn verify` was not run under AR-11.

| ID     | Severity | Lens            | Finding                                                                                  | Minimum correction                                                                        | Ruling      |
| ------ | -------- | --------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| RV-001 | 🟠 Major | Correctness     | Application-qualified repository SQL had no direct predicate and parameter-binding tests | Add one qualified-role and one qualified-permission case to the existing repository suite | ✅ Accepted |
| RV-002 | 🟡 Minor | Maintainability | Admin authorization and account-claim docblocks described the superseded behavior        | Describe canonical Admin provenance and application-scoped RBAC/custom claims             | ✅ Accepted |

The security audit reported no findings under the authentication-protocol and tenant-isolation
lenses. An independent challenge confirmed that RV-001 is major because higher-level claim tests
mock the repository and cannot detect a missing SQL predicate. It also confirmed that the two
focused repository cases are the minimum sufficient correction and add no abstraction, dependency,
or generalized machinery. The user accepted both corrections.

The corrections pass 73 focused assertions with the six Phase 2 mutation cases still intentionally
skipped, scoped ESLint, server typecheck, and all 97 repository structure tests.

The single bounded re-review passed with no critical, major, or minor findings. It confirmed that
both qualified repository paths bind and test the application boundary directly, and that the
updated documentation matches the implemented authority behavior.

## Phase 2: Application-Scoped RBAC Mutations

**Review boundary:** f2c7c05e..8c9d10f5
**Scope mode:** Strict
**Verification before review:** 368 selected Phase 2 unit assertions, 10 PostgreSQL/Redis
integration assertions, scoped ESLint and Prettier, server typecheck, and 97 repository structure
tests passed. Root yarn verify was not run under AR-11.

| ID     | Severity | Lens        | Finding                                                                                        | Minimum correction                                                                                         | Ruling   |
| ------ | -------- | ----------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| RV-003 | Major    | Correctness | Permission deletion did not serialize affected-user capture with concurrent user-role writes   | Lock the permission's affected roles in stable order and recheck the application-qualified graph           | Accepted |
| RV-004 | Major    | Security    | Permission deletion included users connected only through inconsistent cross-application links | Qualify affected roles through the permission's authoritative application                                  | Accepted |
| RV-005 | Major    | Security    | Generic mapping and creation paths did not protect every canonical Admin RBAC record           | Extend the existing guards to canonical permissions, the legacy role, and reserved canonical role creation | Accepted |
| RV-006 | Major    | Security    | A token issued concurrently with authority revocation can be inserted after the deletion scan  | Plan a complete issuance/version validation boundary separately; do not add partial locking to RD-05       | Deferred |
| RV-007 | Major    | Correctness | Permission deletion and mapping mutation acquired the same rows in opposite orders             | Make both existing paths lock permissions before roles                                                     | Accepted |
| RV-008 | Major    | Correctness | Canonical role creation protection also blocked the direct initialization path                 | Make init use the existing repository bootstrap writer, matching canonical permissions                     | Accepted |
| RV-009 | Major    | Security    | An ordinary Admin role could be renamed to an absent reserved canonical slug                   | Apply the same reserved-slug check to a requested role-slug update                                         | Accepted |

The user accepted the three minimum corrections and directed that the solution remain appropriate
for rare, setup-oriented administration. No advisory or distributed locks, token-version column,
worker, queue, retry system, or generalized authorization layer will be added. RV-006 remains an
explicit residual concurrency risk: Admin API authorization is resolved live, but an external
token issued across the same boundary can retain older claims. A correct solution changes the OIDC
issuance contract and therefore remains outside this focused remediation.

The accepted corrections pass 386 focused unit assertions, 11 PostgreSQL/Redis integration
assertions, 11 application-isolation penetration assertions, scoped ESLint and Prettier, server
typecheck, and all 97 repository structure tests. Root `yarn verify` was not run under AR-11.

The final bounded correctness and security re-reviews passed with no new findings. They confirmed
the application-qualified capture, consistent permission-before-role ordering, concurrent
user-role serialization, complete canonical mutation guards, and repository-owned initialization
path. RV-006 remains deferred exactly as ruled.
