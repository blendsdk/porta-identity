# Admin UI: Selective Environment Portability

> **Document**: 03-04-admin-ui.md
> **Parent**: [Index](00-index.md)

## Overview

The terminal Admin UI adds one maximized Import / Export workspace. Export and Import are tabs in
the same full-page window and use Layout DSL exclusively. The controller owns file access, SDK
calls, cancellation, preview invalidation, and one-time-secret display; the view emits closed
intents and renders immutable state. (AR-3)

## Architecture

### Current Architecture

The Admin shell uses command constants and capability-driven menus, mounts one maximized workspace,
and delegates asynchronous work to feature controllers. Organization branding already demonstrates
injectable JSVision `openFile()` and Node file reads. `selectable-read-only-input.ts` and
`showOneTimeClientSecretDialog()` in `client-dialogs.ts` already provide selectable, copyable,
read-only one-time-secret presentation.

### Proposed Changes

Add:

| File                              | Responsibility                                             |
| --------------------------------- | ---------------------------------------------------------- |
| `admin/portability-state.ts`      | Immutable view states, selections, results, and intents    |
| `admin/portability-service.ts`    | UI-neutral SDK operation adapter                           |
| `admin/portability-workspace.ts`  | Maximized two-tab Layout DSL view                          |
| `admin/portability-controller.ts` | Operation ownership, file dialogs, preview/apply lifecycle |

Extend `AdminApplicationSession`, the session factory, `AdminCapabilities`, presentation commands,
and application lifecycle with one portability operation/controller. Derive `isSuperAdmin` only
from the exact live `porta-super-admin` role. Server authorization remains authoritative. (AR-1,
AR-3)

`AdminCapabilities` gains explicit `canExportData`, `canImportData`, `canReadClaims`,
`canCreateClaims`, `canUpdateClaims`, and `isSuperAdmin` booleans. Existing application, role,
permission, user, client, and organization booleans complete the local category matrix. The session
continues to discard raw role and permission arrays after validation. (AR-1)

## Implementation Details

### Menu and Workspace

The menu bar contains one direct **Import / Export…** command. It is enabled when the authenticated
identity has at least one portability operation permission and the needed operation adapter exists.
Opening it mounts one already-maximized window titled **Import / Export**. It follows the existing
workspace pattern with `resizable = false` and `zoomable = false`; its tabs are **Export** and
**Import**. Closing restores the landing focus through the existing `focusInto`/workspace lifecycle.
(AR-3)

The first authorized tab is initially selected, with Export preferred when both operations are
authorized. Both tabs remain visible. An unauthorized tab contains only a fixed
permission-required state; it cannot open a file dialog or dispatch an SDK operation.

### Export Tab

The DSL column uses padding 1 and gap 1. It contains:

1. scope controls for **Selected organization** and, only for exact super-admin, **Entire environment**;
2. category checkboxes, with **OIDC clients** initially unchecked;
3. application choice (**All applications** or selected application checkboxes) when any selected
   category requires applications;
4. a compact selection summary;
5. **Export…** and **Close** buttons after one spacer row.

A category checkbox is disabled when the current explicit capabilities cannot satisfy its export
permission row. The server recomputes the complete union before returning content. (AR-1)

When an organization is selected in the shell, that scope is initially selected. Without one,
environment scope is initially selected only for exact super-admin; otherwise export remains
disabled until a valid organization is selected in the normal shell. **Export…** is disabled for
an empty category set or invalid application selection. It first calls the SDK export so the server
records access and returns the authoritative attachment filename. It then opens a JSVision save-mode
file dialog seeded with that name and writes the manifest to the chosen path. Cancelling the dialog
writes no local file but does not remove the completed export audit. (AR-1, AR-3, AR-5, AR-8)

### Import Tab

The DSL column uses padding 1 and gap 1. It contains **Choose manifest…**, a read-only selectable
filename field, keep/update radio controls with keep-existing selected initially, **Preview**, an
ordered summary surface, **Apply**, and **Close**. No record editor, merge UI, progress UI, or
scrolling framework is added. (AR-1, AR-3)

Choosing a file reads at most 64 MiB as UTF-8 and stores only the parsed unknown JSON plus display
filename in controller state. Preview calls the SDK; Apply is disabled until preview succeeds.
Changing the file or mode immediately clears the preview and disables Apply. A failed preview shows
the bounded safe errors grouped by entity type and focuses the first invalid dependency. Apply
asks one **Are you sure?** confirmation, then calls the SDK with the same file content and mode.
(AR-1)

After committed apply, counts remain visible. If credentials exist, the controller opens the
existing selectable, copyable, read-only one-time-secret presentation before the result can be
dismissed. It calls the existing presenter sequentially once per credential, using `client_id` as
both the available client label and Client ID. It does not retain credentials in reusable workspace
state after the dialogs close. (AR-1)

### State and Cancellation

One operation generation and `AbortController` follow existing controller-ownership patterns. A
closed workspace or changed authenticated session cancels local ownership and ignores late results.
It does not claim that closing the client connection cancels an in-flight server apply, and it
performs no automatic retry. The single-operator UI does not add ETags, polling, conflict resolution,
or reload-and-retry. (AR-1, AR-3)

## Integration Points

- `presentation.ts`: command and top-level menu.
- `application.ts`: controller ownership, focus, enablement, cancellation, and disposal.
- `commands/admin.ts`: SDK domains passed into the prepared session.
- `session-service.ts`: exact super-admin capability plus existing permissions.
- `@jsvision/files`: open and save-mode file dialogs.
- Reuse `selectable-read-only-input.ts` unchanged and call the one-time secret presenter in
  `client-dialogs.ts` once per returned credential.

## Error Handling

| Error Case                                       | Handling Strategy                                                                   | AR Ref |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| File dialog cancellation                         | Preserve current state and perform no network/file mutation                         | AR-3   |
| Invalid/oversized/unreadable manifest            | Fixed local message; Apply disabled                                                 | AR-1   |
| Export save failure                              | Fixed message; no retry and no false success                                        | AR-3   |
| Preview rejection                                | Bounded grouped errors; focus first invalid dependency                              | AR-1   |
| File or mode changed after preview               | Clear preview immediately and disable Apply                                         | AR-1   |
| Apply failure                                    | Fixed safe failure; clear approval and reload only displayed result state if needed | AR-1   |
| Session/organization changes or workspace closes | Abort ownership and ignore late completion                                          | AR-3   |

## Testing Requirements

- Workspace specification tests cover ST-52–ST-62; the Admin application lifecycle specification
  owns ST-63.
- Headless tests inspect Layout DSL, menu/capability gating, empty selection, default-off clients,
  file cancellation, preview invalidation, Apply enablement, focus restoration, and secret display.
- Browser `yarn test:ui` is not planned because this feature changes no browser-facing OIDC flow;
  it becomes required only if execution crosses that boundary. (AR-6)
