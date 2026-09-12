# SDK and CLI Contracts: Roles and Permissions

> **Document**: 03-03-sdk-cli-contracts.md
> **Parent**: [Index](00-index.md)

## Overview

Correct the public SDK, SDK agent, and conventional CLI directly to match the existing server
collections and the new explicit reduction results. Porta has no deployed consumer compatibility
requirement, so false pagination and obsolete wrappers are removed rather than preserved (AR-6–AR-7).

## SDK Contracts

- `roles.list(appId): Promise<Role[]>` and `permissions.list(appId, { moduleId? }):
Promise<Permission[]>` unwrap complete arrays.
- Remove role/permission pagination parameters, `listAll`, and deprecated singular permission-
  mapping wrappers.
- `permissions.update(appId, permissionId, input)` accepts optional Name and nullable Description.
- `userRoles.list(orgId, userId): Promise<Role[]>`; assign/remove use collection `PUT`/`DELETE`
  with `{ roleIds }`.
- Reduction methods return the exact values in 03-02 §Result Contracts. Add methods keep their
  existing void result (AR-6–AR-7).

The three RBAC SDK domains use the existing `requireData` helper plus narrow structural guards for
entities, arrays, and reduction results. This protects direct SDK, agent, and conventional CLI
consumers, especially where `reauthenticationRequired` distinguishes committed success. The Admin
UI retains its stricter ownership, control-character, timestamp, and projection validation. No
schema framework is added. Public SDK types remain exact, documented, and free of unsafe casts
(AR-17).

## SDK Agent and Conventional CLI

Agent tools describe complete role/permission arrays and expose permission update through existing
definitions and executor dispatch. No new agent framework or transport method is added.

`porta app role list` and `porta app permission list` remove page options and totals. Role update,
delete, permission update/delete, role-permission removal, and user-role commands consume corrected
SDK return values. Single-row commands wrap one ID in an array. Human output stays concise; JSON
output reflects the corrected public SDK value (AR-6–AR-7).

## Error Handling

| Error case                       | Handling                                                             | AR Ref           |
| -------------------------------- | -------------------------------------------------------------------- | ---------------- |
| Invalid server collection/result | Fixed SDK validation failure; Admin UI publishes no partial state    | AR-6–AR-7, AR-17 |
| Unauthorized operation           | Existing typed SDK forbidden error and fixed CLI/UI outcome          | AR-3–AR-6        |
| Reauthentication required        | Conventional command reports committed success; Admin UI enters auth | AR-7             |
| Unknown network outcome          | Existing fixed unknown-outcome path; no automatic retry              | AR-4, AR-7       |

## Testing Requirements

- SDK runtime and type-contract specifications for every corrected method.
- SDK agent definition/executor specifications for arrays and permission update.
- Conventional CLI argument, HTTP-call, human-output, and JSON-output specifications.
- Clean-revision compatibility verification after implementation is committed (AR-11).
