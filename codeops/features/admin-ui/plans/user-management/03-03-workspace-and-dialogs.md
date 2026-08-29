# Workspace and Dialogs: User Management

> **Document**: 03-03-workspace-and-dialogs.md
> **Parent**: [Index](00-index.md)

## Overview

Add direct, user-specific JSVision composition. `user-workspace.ts` owns the browse/detail/history
surface and focus; `user-dialogs.ts` owns focused modal input and confirmation. The existing
presentation continues to own application chrome and menu construction. No table engine, form
schema, generated screen, or reusable entity abstraction is introduced (AR-2, AR-5).

## Users Menu

Add user command constants for browse, create, invite, edit, history, credentials, lifecycle, retry,
back, and purge. The top-level `Users` menu remains visible:

- no organization: parent disabled with the fixed organization-required reason;
- selected organization and any user capability: parent enabled;
- selected organization without user capability: parent disabled with the fixed permission reason;
- `Browse users…`, `Create user…`, and `Invite user…` remain visible and are enabled independently
  by their exact capability;
- unavailable children show concise fixed reasons, not missing/remote claim values.

The hamburger, Organizations menu, authentication gate, Quit, and terminal shortcuts remain
unchanged.

## User Workspace

`createAdminUserWorkspace()` returns a feature-specific surface with:

```ts
interface AdminUserWorkspace {
  readonly content: View;
  readonly setState: (state: AdminUserViewState) => void;
  readonly focusCurrent: () => void;
  readonly clear: () => void;
  readonly dispose: () => void;
}
```

The concrete implementation may compose a small `Group` and existing list/text/button controls; it
does not expose those controls outside the module. Remote values enter only through validated state.

### Browse view

- Shows email, optional given/family name, and textual status for at most 20 rows.
- Search submits on deliberate activation and is limited to 255 characters.
- Status offers only All, Active, Inactive, Suspended, and Locked.
- Previous is enabled only above page 1; Next is enabled only below `totalPages`.
- Loading, empty, no-match, forbidden, unavailable, invalid-response, and retry states are explicit.
- A failed request leaves the last validated page mounted and non-malformed rows are never recovered
  from a rejected response.
- Selecting a validated row opens detail; Back returns to the same validated page and focused row.

### Detail view

Render only the validated RD-03 projection in readable identity, contact/address, account, and
timestamp sections. Email is the stable target label. Two-factor is read-only. Login summary is
only last-login timestamp and login count. No secret, failed-login, metadata, token, hash, raw body,
or internal error field is accepted by the view interface.

Available action controls follow state and capability:

- profile edit, password set/clear, and verify email require update capability;
- verify email appears only when unverified; clear password appears only when a password exists;
- active exposes suspend, lock, and deactivate; suspended exposes unsuspend; locked exposes unlock;
  inactive exposes reactivate;
- lifecycle actions require lifecycle capability and purge independently requires purge capability;
- history requires read capability.

### History view

Render at most 20 newest-first entries with event type, actor UUID or `System`, and timestamp. Show
one fixed “more entries exist” indicator from `hasMore`; add no paging/filter controls and never
render metadata.

## Dialogs

Every dialog receives the existing modal host and caller-owned abort signal. Results are typed
dialog-local values or cancellation; they contain no application state.

### Create and edit

- Use focused sections for identity, contact, address, and credentials rather than a generated
  form.
- Create includes required email, optional password/confirmation, and persisted profile fields;
  `phoneNumberVerified` is absent.
- Edit renders email read-only and submits only touched fields; an explicitly cleared nullable field
  becomes null. `phoneNumberVerified` remains editable.
- Local validation preserves ordinary fields. Password and confirmation signals are overwritten
  with empty strings in a `finally` path after success, failure, or cancellation.

### Invite and preview

- Collect required email plus optional names, locale, and personal message; no role/claim inputs
  exist.
- Preview dispatches the same non-assignment input and opens a bounded read-only subject/plain-text
  dialog. HTML never reaches a control.
- Closing preview returns to the populated invite dialog. Invalid preview preserves the invite
  fields and shows only the fixed invalid-response outcome.

### Credentials, lifecycle, and purge

- Set password uses masked password/confirmation and the same unconditional clearing rule.
- Clear password and verify email show exact email and require explicit confirmation.
- Suspend optionally collects a reason; lock requires one. Suspend, lock, and deactivate show exact
  email plus target state before dispatch.
- Unsuspend, unlock, and reactivate require one deliberate activation without a second confirmation.
- Purge shows exact email, a fixed irreversible warning, initially focuses Cancel, and labels the
  distinct action `Purge permanently`.

Duplicate activation is disabled while one modal submission owns dispatch. Cancel before dispatch
sends no request; cancel after dispatch invalidates presentation ownership but does not retry.

## Responsive and Focus Behavior

- Normal and compact layouts remain usable with the existing thresholds.
- Below the recovery threshold, mounted user dialogs are removed and their operation is cancelled;
  the last validated same-context workspace state remains owned but hidden.
- Recovery redraws that state without accepting a late cancelled result.
- Cancellation or recoverable failure returns focus to the invoking row/action; context teardown
  clears the workspace and returns focus to the shell.
- Keyboard and mouse activate the same commands. No additional global shortcut is introduced.

## Error Handling

| Error case                     | Presentation                                                   | AR Ref     |
| ------------------------------ | -------------------------------------------------------------- | ---------- |
| Invalid local form             | Fixed validation label; preserve non-secret fields             | AR-5, AR-9 |
| Forbidden/unavailable/conflict | Fixed label over unchanged validated view                      | AR-9       |
| Invalid response               | Fixed invalid-response label; no remote value mounted          | AR-9       |
| Final authentication failure   | Close user modal and yield to the existing authentication gate | AR-4, AR-9 |
| Cancel/resize                  | Preserve validated view, remove modal, reject late result      | AR-4, AR-5 |

## Testing Requirements

- Real JSVision specification tests cover menu visibility/enablement, list navigation, detail
  projection, every dialog bound, destructive focus, keyboard/mouse parity, and responsive redraw.
- Tests inspect rendered/control state without snapshotting raw server values.
- Implementation tests cover signals, focus restoration, modal teardown, password clearing, and no
  HTML/control-bearing text reaching display.
