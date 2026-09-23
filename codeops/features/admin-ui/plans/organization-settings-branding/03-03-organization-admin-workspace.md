# Organization Admin Workspace: Organization Settings and Branding

> **Document**: 03-03-organization-admin-workspace.md
> **Parent**: [Index](00-index.md)

## Overview

Add one maximized, tabbed workspace for the selected organization. Reuse the Admin UI's validated
state, context-epoch, Layout DSL, focused dialogs, and capability patterns. The workspace does not
replace the organization switcher and does not add concurrent-editor behavior. (RD-06 AC-01–AC-12,
AC-19–AC-22; AR-1, AR-2)

## Architecture

### Current Architecture

`application.ts` coordinates authenticated sessions and active organization context.
`presentation.ts` owns menu items. `organization-service.ts` validates a four-field projection and
supports list/create/delete/reconcile. `organization-dialogs.ts` owns create/switch/delete UI. The
Applications and Users workspaces provide the established maximized TabView and controller pattern.

### Proposed Changes

- Extend `state.ts` with existing `admin:org:update` and `admin:org:suspend` capability booleans and
  a full validated organization-settings projection separate from the compact selected context.
- Extend `organization-service.ts` with direct get/update, activate/suspend, login-method,
  two-factor-policy, branding-setting, list/upload/delete-asset operations. Supply its three existing
  SDK domains through one narrowly scoped organization-workspace dependency object.
- Add `organization-controller.ts` for one workspace generation, active-organization snapshot,
  ordinary per-tab request-pending state, and late-result rejection.
- Add `organization-workspace.ts` for the maximized TabView and its focused confirmations/file
  picker. Reuse the files package directly; do not build a file-browser abstraction.
- Wire one `Manage current organization…` command through `presentation.ts` and `application.ts`.
  Include the production SDK-domain composition in `commands/admin.ts`. Existing
  create/switch/delete commands remain unchanged. (AR-2)

## State and Validation

The workspace projection includes only RD-06 fields: ID, slug, name, status, `isSuperAdmin`,
default locale, created/updated timestamps, default login methods, 2FA policy, four exposed
branding settings, and logo/favicon metadata. Validate every remote value before retaining it;
reject control-bearing display text and impossible arrays/enums/dates using existing helpers.

The locale editor offers `en`. If the server returns another syntactically valid existing locale,
show it as unsupported and preserve it until the administrator explicitly selects `en`. Dates use
the shared UTC formatter. (RD-06 AC-03; AR-2)

No ETag is stored or sent. The selected compact organization context is reconciled after name,
status, or other context-visible changes. (RD-06 AC-08, AC-20; AR-2)

## Workspace and Tabs

### Window

- Caption identifies the selected organization and the workspace purpose.
- Maximized by default; not resizable, minimizable, or maximizable by window controls.
- One TabView in order: Overview, Authentication, Branding.
- Layout DSL owns every size/position. The workspace requires at least 49×19, matching the native
  JSVision file dialog. Do not add a compact fallback, disabled upload mode, custom picker, or ad hoc
  dimensions.
- Closing or a context/session epoch change disposes bindings, cancels UI ownership, ignores late
  responses, and returns to the ordinary selected-organization state.

### Overview

Show read-only ID, slug, status, created, and updated fields. Name and locale are editable only with
`admin:org:update`. Save enables only for valid changed values. Activate/Suspend is operational and
separate from navigation; Suspend uses the shared focused confirmation. The super-admin
organization's Suspend action is visible-disabled with the RD explanation. (RD-06 AC-03–AC-04;
AR-2)

### Authentication

Represent Password and Magic link as independent checkboxes and prevent saving an empty set. Show
the four existing 2FA policies. Guidance states that login-method defaults are client-inheritable,
while 2FA is organization-wide but applies only after username/password. Magic-link login remains
passwordless with no additional OTP/TOTP prompt. (RD-06 AC-05–AC-07; AR-2)

One Save sends only changed values through the existing separate endpoints. Calls are sequential
only to make the outcome understandable, not for concurrency control. If one succeeds and the next
fails, reload both displayed values once and show a fixed failure. Do not compensate or retry.
(RD-06 AC-08, AC-20; AR-2)

### Branding

Show company name, primary color, fallback logo URL, and fallback favicon URL without custom CSS.
Text Save is independent from assets. Always show Logo and Favicon metadata rows. Add/Replace opens
`openFile()` with the five approved formats, reads the chosen file, gives local type/decoded-size
feedback, base64-encodes it, and uploads immediately. Remove uses the shared confirmation and then
deletes immediately. Cancellation performs no action. (RD-06 AC-09–AC-13; AR-1, AR-2)

No terminal bitmap preview is created. Metadata shows media type, decoded size, and shared UTC
updated time. All controls remain visible-disabled when their capability is unavailable.

## Controller Rules

- Snapshot organization ID plus session and organization epochs when opening.
- Before dispatch and after await, compare the snapshot with current state; stale work is discarded.
- Disable a tab's operation controls only while that tab's current request is pending. This prevents
  double submission in one UI; it is not a queue, global lock, or concurrency system. (AR-2)
- Successful settings mutations reload their affected displayed resource. Asset mutations reload
  metadata. Unknown outcomes reload the affected state once before re-enabling mutation.
- A definite 401 delegates to the existing reauthentication coordinator. A 403 is shown as the
  ordinary sanitized authorization failure; no extra super-admin signal is added.

## Error Handling

| Error case                                  | Handling strategy                                     | AR Ref |
| ------------------------------------------- | ----------------------------------------------------- | ------ |
| No selected organization/read capability    | Manage action visible-disabled; no request            | AR-2   |
| Invalid remote projection                   | Fixed invalid-response state; retain no unsafe values | AR-2   |
| Context/session changes                     | Close workspace and discard late outcomes             | AR-2   |
| Invalid or unchanged form                   | Save disabled with field/status guidance              | AR-2   |
| Authentication partial failure              | Reload both values once; fixed failure; no retry      | AR-2   |
| File picker cancellation                    | No mutation and no error                              | AR-2   |
| Local file invalid/oversized                | Identify type or size only; do not echo content       | AR-2   |
| Asset outcome unknown                       | Reload metadata once before another operation         | AR-2   |
| Server 403 on protected super-admin setting | Sanitized authorization failure and reload            | AR-2   |

## Testing Requirements

- State/service specifications for every accepted/rejected field, capability, request body, result,
  401/403/failure mapping, and no ETag use.
- Workspace specifications for menu state, tab order, DSL layout, form validity, partial failure,
  immediate asset operations, focus return, epoch changes, and 49×19 minimum-size reachability.
- Implementation tests for selection, bindings, disposal, double-submit prevention, and file-read
  failures without duplicating specification expectations.
- PTY/UI coverage uses existing harnesses; no new test framework is introduced. (AR-2, AR-3)
