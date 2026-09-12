# Requirements: Roles and Permissions

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-roles-and-permissions.md) — the owning requirements document

## Scope of This Plan

### In this plan

- RD-05 AC-01–AC-11: direct Application role/permission CRUD and focused mapping/user assignment.
- RD-05 AC-12–AC-15 and AC-19–AC-20: targeted authority cleanup, bounded locking, reconciliation,
  canonical Admin provenance, and application-filtered OIDC claims.
- RD-05 AC-16–AC-18: compact Layout DSL presentation, readable dates, and unobtrusive context.
- RD-05 SDK, conventional CLI, agent, audit, documentation, and verification requirements.

### Deferred / out of this plan

- Every RD-05 Won't Have item, including advanced RBAC, bulk workflows, effective-permission
  simulation, pagination, optimistic concurrency, and generalized support machinery (AR-1–AR-2).
- RD-06 through RD-09 and any redesign of existing Application or User behavior not needed to mount
  the two approved RBAC surfaces (AR-1, AR-5).

## Plan-Local Decisions

| Decision                         | Chosen                                                             | AR Ref |
| -------------------------------- | ------------------------------------------------------------------ | ------ |
| Reduction response               | Explicit HTTP/SDK result with committed `reauthenticationRequired` | AR-7   |
| Missing OIDC application context | Empty RBAC arrays; operational failures still fail                 | AR-8   |
| Cleanup reuse                    | Two narrow helpers around existing transaction and Redis behavior  | AR-9   |
| Terminal decomposition           | Only responsibility-bearing feature-local modules                  | AR-10  |
| Final verification               | Exact affected-package, harness, assurance, and compatibility set  | AR-11  |
| Internal claim context           | Namespaced provider metadata with tested non-disclosure            | AR-12  |
| Production RBAC composition      | One feature-local lazy factory through the existing session seam   | AR-13  |
| Unknown mutation outcome         | Explicit read-only Reload; never automatic mutation replay         | AR-14  |
| Canonical records                | Fully immutable through generic CRUD                               | AR-15  |
| Existing contract tests          | Named maintenance in each owning phase                             | AR-16  |
| SDK response validation          | Existing helper plus narrow RBAC guards                            | AR-17  |
| Survivor check reuse             | Extract existing repository-owned SQL; add no repository/framework | AR-18  |

## Acceptance Criteria

The owning RD contains the complete acceptance criteria. This plan adds no independent product
criterion; execution readiness additionally requires every ST case in `07-testing-strategy.md` and
the AR-11 verification set to pass.
