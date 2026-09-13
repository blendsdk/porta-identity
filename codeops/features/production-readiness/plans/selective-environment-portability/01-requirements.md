# Requirements: Selective Environment Portability

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-02](../../requirements/RD-02-selective-environment-portability.md) — the owning requirements document

## Scope of this plan (delta view)

### In this plan

- RD-02 AC-01–AC-10: strict manifest, selection, portable graph, natural keys, and credential exclusions.
- RD-02 AC-11–AC-16: preview, keep/update semantics, dependency order, atomicity, and new-client secrets.
- RD-02 AC-17–AC-23: authorization, SDK, CLI, Admin UI, results, audit, direct v1 correction, and safe summaries.

### Deferred / out of this plan

- Every item listed in RD-02 **Won't Have**, including backup/restore, large-data processing,
  synchronization/deletion, URL substitution, authentication material, global configuration,
  compatibility machinery, and concurrent-editor behavior. (AR-1)
- RD-03 PostgreSQL-backed global configuration remains separate. (AR-1)

## Plan-local decisions

| Decision                         | Chosen                                                             | AR Ref |
| -------------------------------- | ------------------------------------------------------------------ | ------ |
| Server code organization         | Direct `portability/` feature module split by responsibility       | AR-2   |
| Admin UI entry and initial scope | One maximized tabbed workspace; selected organization preferred    | AR-3   |
| Conventional CLI flags           | Separate yargs flags without a custom comma parser                 | AR-4   |
| Export attachment name           | `porta-manifest-<UTC timestamp>.json`                              | AR-5   |
| Verification boundary            | Approved focused, workspace, assurance, structure, and final gates | AR-6   |

## Acceptance Criteria

No plan-local product acceptance criterion extends RD-02. The implementation plan is acceptable
when every RD-02 acceptance criterion maps to at least one ST case, every implementation task maps
to an owning component specification, and the final verification boundary in AR-6 passes.
