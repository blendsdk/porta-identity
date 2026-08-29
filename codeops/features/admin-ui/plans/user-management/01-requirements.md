# Requirements: User Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-03](../../requirements/RD-03-user-management.md) — the owning requirements document

## Scope of this plan (delta view)

### In this plan

- UM-01–UM-04: independently authorized navigation, validated offset list, explicit list states,
  detail, and bounded history.
- UM-05–UM-11: create, invite/preview, profile edit, password and verification, lifecycle actions,
  and explicit permanent purge.
- UM-12–UM-16: capability projection, sanitized operation results, organization/session isolation,
  named SDK corrections, and terminal-complete interaction.
- UM-17: direct user-specific modules following current organization patterns; shared extraction is
  allowed only for demonstrated duplication.
- Public CLI/SDK documentation, current `porta user` consumers, SDK agent metadata, packed P1
  compatibility, and the existing packed Admin UI journey required by UM-15 and AC-13.

### Deferred / out of this plan

- RD-05 role and claim assignment or management.
- RD-07 sessions, two-factor mutation, recovery codes, and failed-login/lockout analysis.
- RD-08 global audit exploration.
- RD-09 import, export, bulk, and filesystem tooling.
- Impersonation, live/background refresh, conflict/merge UI, tenant-deletion polling, optimistic UI,
  generic entity/table/form frameworks, new dependencies, server endpoints, workflows, matrices, or
  unrelated SDK cleanup.

## Plan-local decisions

| Decision        | Chosen                                                            | AR Ref     |
| --------------- | ----------------------------------------------------------------- | ---------- |
| Module boundary | Five user-specific modules with thin existing-module integration  | AR-2       |
| Delivery order  | SDK contracts before CLI user services and UI                     | AR-3, AR-7 |
| State owner     | Organization/session-bound user controller and generation token   | AR-4       |
| UI split        | Workspace for list/detail/history; dialogs for focused operations | AR-5       |
| Verification    | Approved affected-package and compatibility gates                 | AR-6, AR-8 |
| Failures        | Existing fixed local vocabulary extended only where required      | AR-9       |

## Acceptance Criteria

The RD owns all product acceptance criteria. This plan adds no behavior beyond RD-03 AC-1–AC-13;
plan readiness additionally requires every cited ST case to precede implementation, fail for the
expected missing behavior, and pass without weakening its expectation.
