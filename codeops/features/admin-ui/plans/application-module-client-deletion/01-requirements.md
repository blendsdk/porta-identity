# Requirements: Record Deletion and Lifecycle Simplification

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-10](../../requirements/RD-10-application-module-client-deletion.md) — the owning requirements document
> **Last Updated**: 2026-09-06 02:00
> **CodeOps Artifact Schema**: 1

## Scope of This Plan

### In This Plan

- All RD-10 Must Haves and Should Haves.
- Corrections to completed RD-02, RD-03, and RD-04 implementations where RD-10 removes their prior
  Archive, Purge, or whole-client Revoke behavior.
- Embedded Admin UI deletion only for the five resource surfaces that already exist. API, SDK, and
  conventional CLI deletion covers all eight record types.

### Deferred or Outside This Plan

- No RD-10 requirement is deferred.
- Role, permission, and claim management workspaces remain owned by their roadmap feature.
- The exclusions in RD-10 remain authoritative.

## Plan-Local Acceptance

- Exact phase commands are copy-paste runnable against the named planned specification files.
- Existing assurance and compatibility gates are used without adding a new harness or operation
  matrix.
