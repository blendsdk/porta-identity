# Roles and Permissions Phase Quality Reviews

> **Status**: Phase 1 remediation verified; re-review pending
> **Last Updated**: 2026-09-09 18:42
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
