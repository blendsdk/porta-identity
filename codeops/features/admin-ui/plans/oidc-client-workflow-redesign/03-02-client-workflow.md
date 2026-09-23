# Client Workflow: OIDC Client Workflow Redesign

> **Document**: 03-02-client-workflow.md
> **Parent**: [Index](00-index.md)

## Overview

This component changes the Admin UI journey from one large configuration form to compact
registration followed by focused administration sections. It reuses the existing maximized OIDC
Clients surface, immutable projections, controller ownership, and application orchestration
(AR-3–AR-4, AR-12).

## Architecture

### Current Architecture

The workspace has list, detail, and secrets projections. Detail renders one long text block and a
row of Basic, Redirects, Protocol, Login, and Secrets buttons. All create/edit actions open the same
fixed tabbed dialog. Successful create ultimately reloads the list after any one-time secret is
presented.

### Proposed Changes

Retain the existing projections and add feature-local selected-section state inside the workspace.
The detail projection renders one of six sections: `Overview`, `Authentication`, `Protocol`, `Login
experience`, `Credentials`, or `Lifecycle`. This is a local UI discriminator, not a router or new
application state layer (AR-4, AR-14).

## Implementation Details

### Compact Registration

The registration dialog owns only:

- client name;
- active global application;
- client type;
- application type;
- one initial redirect URI; and
- for a confidential client, optional secret label and the expiry selector defined in
  [03-03 §Secret Expiry Selector](03-03-focused-editors.md#secret-expiry-selector).

Create remains disabled until all required visible fields are valid. Changing to public client
hides/disables secret inputs and removes both secret properties from the payload. Advanced fields
are omitted so existing server defaults remain authoritative (AR-3, AR-6, AR-11).

Registration uses the existing Dialog as a maximized, fixed module surface rather than a small
centered window. Client details and initial-secret settings use separate captioned groups with
comfortable normal-size spacing. The form region scrolls vertically when needed while Create and
Cancel remain in a separate bottom action row. This keeps the complete workflow reachable at
48×12 without adding a custom surface or navigation layer (AR-15).

### Detail Sections

| Section          | Content                                                                                                            | Operations                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Overview         | Identity, organization, application, types, status, timestamps, and concise read-only Protocol and Login summaries | Edit name                          |
| Authentication   | Redirect URIs, post-logout URIs, allowed origins                                                                   | Open focused collection editor     |
| Protocol         | Grants, response type, scope, token authentication, PKCE                                                           | Open focused protocol editor       |
| Login experience | Override mode, source organization, effective methods                                                              | Open focused login editor          |
| Credentials      | Confidential-client secret metadata DataGrid                                                                       | Generate or revoke selected secret |
| Lifecycle        | Active/inactive state and permanent deletion context                                                               | Activate/deactivate/delete         |

Each logical region uses an existing `GroupBox` with start-aligned caption and no shadow. Overview's
small name dialog emits only `{clientName}`; immutable identity/type fields remain read-only.
Operations stay with the section they affect. `Back to OIDC clients` remains in a separate bottom
navigation row. Layout DSL determines natural button widths (AR-4).

One existing JSVision `ListBox` owns section selection. It appears as a bounded left rail beside the
selected content at normal geometry and above the content at compact geometry. The same items,
selection, and keyboard behavior are retained across resize; no second button-based selector is
created. `Back to OIDC clients` remains in the bottom navigation row at both sizes. Do not add
horizontal action overflow or hard-coded scrolling extents (AR-4, AR-14).

### Post-Create Continuation

On successful create, hand any returned plaintext synchronously to the existing one-time presenter.
The presenter receives the returned raw `expiresAt` value and displays either the timestamp or
`Never` with the existing one-time warning. After the presenter closes, call the existing
`select(created.id)` flow so the client is authoritatively reloaded and its Overview becomes the
focused section. No second create, optimistic placeholder, direct retained-state merge, or new
reconciliation mechanism is introduced (AR-12; RD-04 AC-14).

If secret presentation cannot be completed, preserve the existing reconciliation-required behavior;
never retain plaintext merely to enable later navigation.

### Dialog File Responsibilities

`client-dialogs.ts` remains the stable file-level re-export surface for retained dialog operations.
The existing code moves directly into small registration, configuration, and credential modules.
The obsolete `AdminClientConfigurationTab`, shared configuration-dialog symbols, and tab
discriminator are removed from `admin/index.ts` and direct consumers when the replacement editors
land; compatibility wrappers are not added. Shared behavior is limited to existing types or small
feature-local helpers needed by more than one dialog. No base dialog class, factory, schema renderer,
or generalized collection framework is allowed (AR-14).

## Error Handling

| Error Case                          | Handling Strategy                                                                      | AR Ref      |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| No active application               | Registration remains unavailable through existing capability checks                    | AR-3        |
| Invalid required registration field | Create remains disabled and the field shows local validation                           | AR-3        |
| Create failure                      | Preserve the prior validated list and sanitized operation status                       | AR-1, AR-13 |
| One-time secret presenter fails     | Discard plaintext and require authoritative reconciliation                             | AR-12       |
| Organization/session changes        | Abort dialog/operation and clear organization-scoped state                             | AR-1        |
| Compact terminal                    | Keep every section and bottom navigation reachable through the existing compact recipe | AR-4        |

## Testing Requirements

- Registration field visibility, validation, payload omission, and natural sizing.
- Section navigation, resize-stable `ListBox` selection, GroupBox composition, action placement, and
  compact geometry.
- Overview name editing and authoritative Protocol/Login summaries.
- Post-create secret ordering, expiry presentation, authoritative reload, and Overview continuation.
- Context switch, cancellation, redraw, and plaintext non-retention regression coverage.
