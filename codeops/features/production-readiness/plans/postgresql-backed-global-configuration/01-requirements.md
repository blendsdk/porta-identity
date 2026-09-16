# Requirements: PostgreSQL-Backed Global Configuration

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-03](../../requirements/RD-03-postgresql-backed-global-configuration.md) — the OWNING requirements document

## Scope of this plan (delta view)

### In this plan

- RD-03 AC-01–AC-02: closed catalog and native JSONB authority.
- RD-03 AC-03–AC-08: all 18 lifetime, rate-limit, lockout, audit, and locale entries.
- RD-03 AC-09–AC-16: public-key isolation, validation, atomic updates, caching, restart state,
  fallback, migration, authorization, and audit.
- RD-03 AC-17–AC-19: SDK, conventional CLI, and full-page Admin UI.
- RD-03 AC-20–AC-21: operator documentation and deterministic duration presentation.

### Deferred / out of this plan

- Every item in RD-03's “Won't Have” section remains excluded. (AR-1–AR-5, AR-14)
- RD-02 portability manifests continue to reject global configuration. (AR-1)
- The unrelated introspection documentation/rate-limiter path inconsistency discovered during the
  planning conversation is not part of RD-03. (AR-1)

## Plan-local decisions

| Decision | Chosen | AR Ref |
|---|---|---|
| Workspace navigation and editing | Top-level command; four tabs; one workspace-wide Save/Cancel footer | AR-11 |
| Public errors and runtime warnings | Fixed safe messages/codes and bounded warning fields | AR-12 |
| CLI parsing and metadata | Fetch metadata, parse to native scalar, show range/mode | AR-13 |
| Implementation partition | Direct existing-module edits plus one catalog and one Admin UI feature family | AR-14 |
| Verification | Full approved matrix without specialized non-routine tooling | AR-15 |
| Duration text | Largest exact whole unit, otherwise seconds | AR-16 |
| Public labels | Human labels plus exact technical metadata | AR-17 |

## Acceptance Criteria

There are no additional product acceptance criteria. Execution must satisfy RD-03's 21 acceptance
criteria and the plan-local decisions above.
