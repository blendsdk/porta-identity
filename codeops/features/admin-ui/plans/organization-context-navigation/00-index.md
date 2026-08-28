# Organization Context and Navigation Implementation Plan

> **Feature**: First organization-aware workflow inside the existing `porta admin` terminal application
> **Status**: Planning Complete
> **Created**: 2026-08-28
> **Implements**: admin-ui/RD-02
> **CodeOps Artifact Schema**: 1

## Overview

This plan replaces the authenticated foundation summary with a small organization-aware shell. The
existing CLI session remains global to one Porta server; the application validates advisory
capabilities from UserInfo, lets the administrator explicitly choose or create an organization, and
stores only a four-field in-memory working context.

The implementation stays within the current CLI, JSVision application, Porta SDK organization
domain, and admin playground. It adds no server or SDK behavior, dependency, workspace, workflow,
runtime matrix, search, or pagination UI. (AR-4, AR-5)

## Document Index

| #     | Document                                                                            | Description                                               |
| ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)                                      | Zero-Ambiguity Gate decisions                             |
| 00    | [Index](00-index.md)                                                                | Overview and navigation                                   |
| 01    | [Requirements](01-requirements.md)                                                  | Thin plan delta over RD-02                                |
| 02    | [Current State](02-current-state.md)                                                | Grounded implementation analysis                          |
| 03-01 | [Organization State and Service](03-01-organization-state-and-service.md)           | Capability, validation, SDK, and error boundaries         |
| 03-02 | [Dialogs and Presentation](03-02-dialogs-and-presentation.md)                       | Menus, dialogs, landing view, and responsive behavior     |
| 03-03 | [Application and Session Integration](03-03-application-and-session-integration.md) | Commands, state transitions, reauthentication, and wiring |
| 07    | [Testing Strategy](07-testing-strategy.md)                                          | Immutable specification cases and scoped verification     |
| 99    | [Execution Plan](99-execution-plan.md)                                              | Specification-first task checklist                        |

## Quick Reference

### Operator Flow

```text
porta admin
  → verify global administrator session
  → open organization chooser (no silent selection)
  → Switch or Create
  → show organization name, slug, status, and server
```

### Key Decisions

| Decision         | Outcome                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Source structure | Two focused new CLI files; reuse existing application/state/presentation/session files (AR-1) |
| List ordering    | Preserve SDK/server order (AR-2)                                                              |
| Public errors    | Five fixed local categories only (AR-3)                                                       |
| Verification     | Scoped CLI, structure, and existing packed-playground checks on Node 24 LTS (AR-5, AR-9)      |

## Related Files

- `packages/cli/src/admin/`
- `packages/cli/src/auth/login-coordinator.ts`
- `packages/cli/src/auth/types.ts`
- `packages/cli/src/commands/admin.ts`
- `packages/cli/tests/admin/`
- `docker/admin-playground/tests/`
- `docs/cli/overview.md`
- `packages/cli/README.md`
- `techdocs/guides/admin-playground.md`
