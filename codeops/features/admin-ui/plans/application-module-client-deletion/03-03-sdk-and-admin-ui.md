# Design 03-03: SDK, Conventional CLI, and Admin UI

> **Status**: Preflighted
> **Last Updated**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## SDK Contracts

Each domain exposes one thin `Promise<void>` delete method using the API paths in 03-01:

- `organizations.delete(idOrSlug)`
- `applications.delete(id)`
- `applications.deleteModule(appId, moduleId)`
- `clients.delete(id)`
- `roles.delete(appId, roleId)`
- `permissions.delete(appId, permissionId)`
- `customClaims.delete(appId, claimId)`
- `users.delete(orgId, userId)`

Remove Archive, Restore, Destroy, Purge, role/permission/claim Archive aliases, and whole-client
Revoke methods. Update status unions and agent tool descriptors. Secret/session/token revoke methods
remain.

## Conventional CLI

Expose the direct commands:

```text
porta org delete <id-or-slug>
porta app delete <app-id>
porta app module delete <app-id> <module-id>
porta client delete <client-id>
porta app role delete <app-id> <role-id>
porta app permission delete <app-id> <permission-id>
porta app claim delete <app-id> <claim-id>
porta user delete <org-id> <user-id>
```

Commands resolve enough safe display data, show the common confirmation, call one SDK method, and
print a bounded success/failure result. They do not implement cascade or authorization. The global
`--force` option does not bypass record-delete confirmation; obsolete lifecycle subcommands are
removed from help and parsers.

## Confirmation Contract

The warning names the complete safe target and relevant affected-data classes. Application deletion
states that its effect is deployment-global. User deletion states that identity data is physically
removed. Buttons are **Keep** and **Delete <name>**; Keep is default and Escape keeps the record.
Button widths use content measurement and surrounding spaces. At small terminal sizes, only the
destructive button label may ellipsize; the complete name remains wrapped in the body.

Hostile control characters in remote names use the existing terminal-safe rendering boundary.

## Embedded Admin UI

Reuse the current state/controller/service/dialog/workspace structure:

- Capability names become exact `canDelete...` flags.
- Delete is enabled only for a current selected record with the matching permission and valid
  parent/organization/session generation.
- Module operations remain below their DataGrid with the existing empty DSL row.
- Duplicate submission is blocked while a mutation owns the target.
- No optimistic removal occurs.
- Success reloads from the server and navigates away from a deleted detail.
- Failure reloads and shows a fixed error without dependency details.
- If current authentication or permission disappears, the existing authentication gate owns the
  transition back to login.
- Dialog teardown restores focus on Keep/failure; success focuses the authoritative list without
  selecting an unrelated row.

Remove archived/revoked read-only branches and Archive/Purge/whole-client-Revoke actions. Keep
Deactivate/Activate, Suspend/Activate, secret Revoke, and existing navigation controls.

## UI Scope

The embedded Admin UI adds Delete only to its five existing resource surfaces: organization, user,
application, module, and client. Role, permission, and claim deletion is available through the
Admin API, SDK, and conventional CLI; this plan adds no corresponding Admin UI workspace. All
button placement and sizes use JSVision Layout DSL and measured controls.
