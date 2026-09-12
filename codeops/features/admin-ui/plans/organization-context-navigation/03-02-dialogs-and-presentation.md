# Dialogs and Presentation: Organization Context and Navigation

> **Document**: 03-02-dialogs-and-presentation.md
> **Parent**: [Index](00-index.md)

## Overview

This component replaces the authenticated summary with the approved menus, identity dialog,
organization chooser/create dialogs, and minimal landing view. It uses JSVision's existing widgets
and the default theme; it introduces no styling system or navigation framework. (AR-1, AR-4)

## Architecture

### Current Architecture

`presentation.ts` owns one `AdminSummaryView`, two top-level menus, and a responsive status line.
`application.ts` constructs the shared modal host and uses JSVision's standard input/confirm helpers
for authentication.

### Proposed Changes

- Add `organization-dialogs.ts` for custom Dialog/Input/ListView construction and dialog-local
  signals.
- Keep main-view/menu/status rendering in `presentation.ts`.
- Keep operation ownership and final state transitions in `application.ts`.
- Continue using the existing JSVision default theme and render every background cell. (AR-1)

## Implementation Details

### Commands

Extend `ADMIN_COMMANDS` with stable names for `who-am-i`, `create-organization`, and
`switch-organization`. Dialog buttons use JSVision's existing terminating commands internally and
map their results to the typed dialog outcomes. Existing Reauthenticate, Quit, Retry, Authenticate,
and Cancel commands remain unchanged.

### Global and Organization Menus

- Replace Application/Session with top-level `☰ Menu` when the capability profile reports usable
  UTF-8 glyph width; otherwise use `Menu`.
- Menu contains `Who am I…`, `Reauthenticate`, and `Quit`.
- Add top-level `Organizations` containing `Create organization…` and `Switch organization…`.
- Both organization items remain present. When disabled, their labels append
  `(requires organization create)` or `(requires organization read)` and their commands are disabled.
- Geometry below RD-01's recovery threshold hides menus and keeps only Quit reachable.

### Identity Dialog

```ts
export function showWhoAmIDialog(
  host: ModalDialogHost,
  state: AuthenticatedAdminState,
  insecure: boolean,
): Promise<void>;
```

The read-only dialog contains only normalized server, `Authenticated`, safe name fallback, safe
email fallback, and the conditional insecure-TLS warning. It uses no editable controls and closes
through keyboard-accessible OK/Escape. Display text goes through the established control-rejecting,
80-character boundary. The application owns AbortSignal handling through its existing abortable
dialog wrapper.

### Organization Chooser

```ts
export type OrganizationChoiceResult =
  | { readonly kind: 'switch'; readonly organization: AdminOrganizationContext }
  | { readonly kind: 'create' }
  | { readonly kind: 'reauthenticate' }
  | { readonly kind: 'cancel' };

export function showOrganizationChooser(
  host: ModalDialogHost,
  options: OrganizationChooserOptions,
): Promise<OrganizationChoiceResult>;
```

- Open immediately when invoked; display `Loading organizations` while the application-owned load
  promise is pending.
- Without read capability, send no request and show `Organization listing unavailable` with Cancel,
  Reauthenticate, and independently enabled Create.
- A successful empty list shows `No organizations available` and keeps permitted Create reachable.
- Render each validated row as control-free, display-width-clipped `name (slug) [status]` in the
  exact SDK order. `ListView.sorted` remains false. (AR-2)
- Active, suspended, and archived rows are equally selectable. Enter/Space or Switch confirms only
  the currently selected valid row. No default row becomes selected merely because focus moved.
- Cancel never changes the current organization.
- Reauthenticate resolves a typed result; the application releases chooser ownership before
  starting the existing reauthentication operation.

### Create Dialog

```ts
export type CreateOrganizationDialogResult =
  | { readonly kind: 'create'; readonly input: CreateOrganizationInput }
  | { readonly kind: 'cancel' };
```

- Field order is Name, Slug, Default locale.
- Name is required with maximum length 255; slug and locale are optional and omitted when empty.
- Completed values enforce RD-02's 1–255, 3–100, and 2–10 bounds. Slug syntax and uniqueness remain
  server-owned.
- Create is the default action, Cancel is always available, validation retains entered values, and
  one activation disables further submission until the operation resolves.
- The application supplies only AR-3 fixed errors; raw details never enter dialog signals.

### Landing View

- Authenticated with no selection: `Choose or create an organization.`
- Authenticated with selection: name, slug, textual status, and normalized server only.
- Identity moves entirely to Who am I; no former summary, dashboard, metrics, or later modules remain.
- Every remote field is control-free and clipped to the available row width without wrapping into
  menu/status rows.

### Responsive and Focus Behavior

- Dialog dimensions are capped to the current content bounds so 80×24 and 48×12 stay usable.
- When geometry crosses below the existing recovery threshold, the application closes modal
  ownership, quarantines late organization results, and shows the resize-only view before redraw.
- When geometry recovers, menus/status are rebuilt from current capabilities and selection.
- Dialog completion returns focus to the invoking menu or landing view; initial auto-choice returns
  focus to the landing view.

## Error Handling

| Error case                           | Presentation                                                               | AR Ref |
| ------------------------------------ | -------------------------------------------------------------------------- | ------ |
| Invalid create input                 | Keep dialog open with local validation state                               | AR-3   |
| Fixed organization-operation failure | Show only its allowlisted label and preserve prior selection               | AR-3   |
| Session invalid                      | Close organization modal and return to RD-01 authentication-required state | AR-6   |
| Logical cancellation/late completion | Close promptly; publish no late UI/state update                            | AR-8   |
| Unrecoverable terminal geometry      | Cancel modal ownership; retain Quit-only resize view                       | AR-8   |

## Testing Requirements

- Real JSVision frame-buffer tests at 80×24, 48×12, and below threshold.
- Keyboard reachability, menu labels/enablement, focus return, and default-theme background coverage.
- Safe identity/organization rendering and exact AR-3 error vocabulary.
- Chooser loading, unavailable, empty, list, switch, create, and cancel states.
