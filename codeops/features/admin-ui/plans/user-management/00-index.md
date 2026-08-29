# User Management Implementation Plan

> **Feature**: Complete organization-scoped user administration in the embedded Admin UI
> **Status**: Planning Complete
> **Created**: 2026-08-29
> **Implements**: admin-ui/RD-03
> **CodeOps Artifact Schema**: 1

## Overview

Implement the approved RD-03 user-management flow inside `porta admin`: independently authorized
Users navigation, a validated paged list, user detail and history, focused create/invite/edit and
credential dialogs, lifecycle actions, and permanent purge. The work uses the selected organization
and verified session established by RD-02.

The implementation first corrects the named current SDK user contracts, then adds only
user-specific CLI modules following the existing JSVision application pattern. It does not create a
generic screen framework, add a dependency or endpoint, or pull later Admin UI features forward
(AR-1–AR-7).

## Document Index

| #     | Document                                                    | Description                                             |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)              | Zero-Ambiguity Gate decisions                           |
| 00    | [Index](00-index.md)                                        | Overview and navigation                                 |
| 01    | [Requirements](01-requirements.md)                          | Thin RD-03 scope view                                   |
| 02    | [Current State](02-current-state.md)                        | Existing SDK and Admin UI analysis                      |
| 03-01 | [SDK Contracts](03-01-sdk-user-contracts.md)                | Current user-domain corrections                         |
| 03-02 | [User State and Service](03-02-user-state-and-service.md)   | Validation, capability, and SDK boundary                |
| 03-03 | [Workspace and Dialogs](03-03-workspace-and-dialogs.md)     | Direct JSVision list, detail, history, and modals       |
| 03-04 | [Application Integration](03-04-application-integration.md) | Workflow ownership, cancellation, and production wiring |
| 07    | [Testing Strategy](07-testing-strategy.md)                  | Immutable specification cases and completion gates      |
| 99    | [Execution Plan](99-execution-plan.md)                      | Specification-first phases and task checklist           |

## Quick Reference

### Operator Flow

```text
Select organization → Users → Browse users → User detail → focused action
                           ↘ Create user
                           ↘ Invite user
```

### Key Decisions

| Decision        | Outcome                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| Scope           | RD-03 only; later roadmap features remain excluded (AR-1)                              |
| Code structure  | Five user-specific modules; no generalized UI framework (AR-2)                         |
| Contract order  | Correct current SDK and consumers before UI integration (AR-3)                         |
| State ownership | One organization/session-bound user controller (AR-4)                                  |
| UI              | Direct JSVision workspace and focused modal dialogs (AR-5)                             |
| Verification    | Affected packages, structure/docs, packed journey, and `p1-admin` compatibility (AR-6) |

## Related Files

- `packages/sdk/src/types/{common,users}.ts`
- `packages/sdk/src/domains/users.ts`
- `packages/sdk/src/agent.ts`
- `packages/cli/src/commands/user.ts`
- `packages/cli/src/admin/{state,session-service,presentation,application,application-runtime,index}.ts`
- `packages/cli/src/admin/user-{state,service,dialogs,workspace,controller}.ts`
- focused SDK, CLI Admin UI, compatibility, packed-playground, and documentation files listed in
  [the execution plan](99-execution-plan.md)
