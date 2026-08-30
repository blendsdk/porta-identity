# OIDC Clients Workspace: Applications and OIDC Clients

> **Document**: 03-05-oidc-clients-workspace.md
> **Parent**: [Index](00-index.md)

## Overview

The OIDC Clients workspace manages clients for the selected organization. It presents familiar
OIDC configuration groupings while keeping immutable ownership fields obvious and protecting
one-time secret plaintext.

## Architecture

### Proposed Changes

Add a feature-specific client workspace plus movable create/edit, lifecycle, secret-list, secret-
generation, revocation, and one-time-warning dialogs. Use one approved `TabView` dialog for client
configuration, a vertical `Scroller` for long tab content, and DataGrid editors for multi-value
URI/origin collections (AR-3).

## Implementation Details

### Client List and Detail

The full-height DataGrid shows Name, Client ID, Application, Application Type, Client Type, and
textual Status. Without an active organization the menu item remains visible-disabled with
`organization required`. Application name is resolved only when app-read capability is available;
otherwise the immutable application ID is shown.

Detail shows all supported fields and focused Basic, Redirects, Protocol, Login, and Secrets
actions. Organization, application, application type, client type, and generated Client ID are
immutable. Inactive clients remain editable; revoked clients are read-only.

### Tabbed Configuration Dialog

The movable dialog uses the Layout DSL throughout (AR-3):

- **Basic:** one-row client name and immutable identity/context fields.
- **Redirects:** DataGrid editors for redirect and logout URI collections.
- **Protocol:** closed grant, response, authentication-method, scope, PKCE, and allowed-origin
  controls, with allowed origins in a DataGrid editor.
- **Login:** inherit, password, magic-link, or both.

Create opens on Basic. The Basic, Redirects, Protocol, and Login detail actions open this same dialog
with the matching tab active; Secrets remains a separate metadata and rotation workflow. Each
collection editor uses a row DataGrid plus explicit Add, Edit, and Remove actions reachable by
keyboard and mouse. The active tab's long content sits in a vertical Scroller, so controls remain
reachable at 48x12 without stretching single-line inputs.

Create additionally selects one validated active global application and the immutable client and
application types. Optional protocol fields begin as `Server default` and are omitted from the
payload until selected. Confidential creation accepts the optional initial-secret label.

### Secret Management

The Secrets DataGrid shows metadata only. Generation accepts a one-row optional label and optional
valid expiry. Revoke requires named confirmation. Public or revoked clients expose those actions as
visible-disabled.

The one-time warning dialog shows client name, Client ID, optional label, plaintext in a bounded
non-editable view, and the fixed cannot-be-shown-again warning. It has no application Copy action,
is the sole view allowed to receive plaintext, and offers no path back to it after dismissal.
Legacy-only clients display the one-time transition guidance from AR-7.

## Integration Points

- client state/service/controller in `03-03-admin-state-services.md`
- validated global application catalog for create selection
- selected organization and capability snapshot
- JSVision `TabView`, `DataGrid`, Layout DSL, modal, focus, and mouse support

## Error Handling

| Error Case                              | Handling Strategy                                             | Source             |
| --------------------------------------- | ------------------------------------------------------------- | ------------------ |
| No active organization                  | Keep navigation visible-disabled with `organization required` | RD-04 AC-01        |
| Invalid field combination               | Block dispatch with fixed field feedback; server revalidates  | RD-04 validation   |
| Returned client/secret has wrong parent | Reject entire result and preserve prior validated view        | RD-04 AC-07, AC-12 |
| Secret dialog closes or context changes | Permanently discard plaintext reference                       | RD-04 AC-11, AC-13 |
| Legacy-only authentication              | Explain that one modern secret must be generated              | AR-7               |
| Mutation result is indeterminate        | Require deliberate reload before another mutation             | RD-04 AC-14        |

## Testing Requirements

- List/detail tests for organization ownership, permissions, application ID fallback, and states.
- Dialog tests for entry tabs, vertical scrolling, collection DataGrid row actions, server-default
  omission, compatibility rules, one-row inputs, movement, focus, keyboard/mouse access,
  small-terminal recovery, and redraw.
- Plaintext lifecycle tests covering every dismissal and context/session/quit/resize path.
