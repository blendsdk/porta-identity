# Current State: Roles and Permissions

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

PostgreSQL already stores application-owned roles and permissions plus role-permission and user-role
mappings. Koa exposes CRUD and mapping routes, the SDK exposes partial domains, and conventional CLI
commands already call them. Role and permission deletion already captures affected users and uses
the request transaction plus detached deletion cleanup.

The terminal Admin UI has established Application detail tabs, User detail operations, immutable
state validation, focused dialogs, natural buttons, DataGrids, and Layout DSL composition. There is
no RBAC surface in those workspaces yet (AR-1–AR-6).

### Relevant Files

| Area                | Existing files                                                                         | Required change                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Admin authorization | `middleware/admin-auth.ts`, `lib/admin-permissions.ts`, `cli/commands/init.ts`         | Require canonical application provenance, add update/app-read capabilities, enforce assignment ceiling |
| OIDC claims         | `clients/service.ts`, `oidc/configuration.ts`, `oidc/account-finder.ts`, RBAC queries  | Carry internal application ownership without disclosure; filter claims; fail closed without context    |
| RBAC persistence    | `rbac/*-repository.ts`, `rbac/*-service.ts`                                            | Parent-qualify reads/writes, lock targets, capture affected users, preserve audit actor                |
| Cleanup             | `lib/deletion-cleanup.ts`, deletion services                                           | Share database revocation and detached targeted authority cleanup                                      |
| Routes              | `routes/roles.ts`, `routes/permissions.ts`, `routes/user-roles.ts`                     | Correct capabilities, actor propagation, responses, guards, and nested IDs                             |
| SDK and agent       | `sdk/src/domains/*roles.ts`, `sdk/src/types/*`, `sdk/src/agent.ts`                     | Match server arrays/routes and expose permission update/results                                        |
| Conventional CLI    | `cli/src/commands/app-role.ts`, `app-permission.ts`, `user-role.ts`                    | Consume corrected contracts and remove false pagination                                                |
| Admin UI            | Admin command/session composition plus Application/User state, controllers, workspaces | Wire one lazy RBAC bundle; add direct tabs and one focused User Roles flow                             |
| Docs                | RBAC API/concept, SDK agent, CLI application/user docs                                 | Publish the corrected application-scoped contracts                                                     |

## Gaps Identified

### Gap 1: Authority is not application-qualified

**Current behavior:** Admin middleware accepts any assigned `porta-*` slug, and OIDC claims combine
roles and permissions from all applications.

**Required behavior:** Only canonical `porta-admin` built-ins control the Admin API, while each OIDC
client receives only its application's live RBAC claims (03-01; AR-3, AR-8).

### Gap 2: Nested RBAC operations trust child IDs globally

**Current behavior:** several Get/Update/mapping functions ignore the route's application UUID;
mapping tables can connect records from different applications through ID-only calls.

**Required behavior:** every nested operation is parent-qualified and mixed ownership fails before
any mutation (03-02; AR-4).

### Gap 3: Mapping changes use broad or incomplete cleanup

**Current behavior:** additions/removals await Redis invalidation, role-permission changes flush all
users, and only record deletion performs database-owned authority revocation.

**Required behavior:** additions schedule affected-user cache invalidation; reductions capture and
revoke only affected authority inside the transaction, then detach targeted Redis cleanup (03-02;
AR-4, AR-7, AR-9).

### Gap 4: SDK and CLI contracts disagree with the server

**Current behavior:** role/permission lists pretend to be paginated; user roles use a fictitious DTO,
`POST`, and a suffixed DELETE; permission update is absent.

**Required behavior:** direct arrays and the server's collection `PUT`/`DELETE`, explicit reduction
results, permission update, and truthful agent/CLI/docs (03-03; AR-6–AR-7).

### Gap 5: The Admin UI has no RBAC workflow

**Current behavior:** Application details contain Overview and Modules only; User details have no
role-assignment operation. Existing controller/workspace files are already large.

**Required behavior:** add two Application tabs and one User Roles dialog through small feature-
local modules and thin shell integration (03-04; AR-5, AR-10).

## Dependencies

### Internal Dependencies

- RD-03 selected-organization User details and session-epoch ownership.
- RD-04 Application TabView, dialog ownership, DataGrid, and Layout DSL patterns.
- RD-10 transaction-owned deletion, affected-authority capture, and detached Redis cleanup.
- Existing SDK transport response headers/bodies and Koa admin mutation transaction middleware.

### External Dependencies

No new dependency. PostgreSQL, Redis, `oidc-provider`, Koa, Zod, and JSVision remain the existing
runtime boundaries (AR-9–AR-10).

## Risks and Concerns

| Risk                                     | Likelihood         | Impact   | Mitigation                                                           |
| ---------------------------------------- | ------------------ | -------- | -------------------------------------------------------------------- |
| Foreign role gains Admin authority       | Current defect     | Critical | Canonical application join and static capability ceiling             |
| Affected user escapes concurrent capture | Medium             | High     | Stable-order parent row locks and immediate recheck                  |
| Actor loses authority mid-workflow       | Expected edge      | High     | Explicit committed reauthentication result and session-epoch handoff |
| Redis is stale after commit              | Low                | Medium   | PostgreSQL-owned revocation plus detached targeted cleanup           |
| UI files become unmaintainable           | High without split | Medium   | Only required feature-local modules; thin shell edits                |
| Public SDK remains misleading            | Current defect     | Medium   | Direct breaking correction, tests, agent metadata, and docs          |
