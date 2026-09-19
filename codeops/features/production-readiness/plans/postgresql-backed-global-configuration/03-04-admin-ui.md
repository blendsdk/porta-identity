# Admin UI: PostgreSQL-Backed Global Configuration

> **Document**: 03-04-admin-ui.md
> **Parent**: [Index](00-index.md)

## Overview

The embedded terminal Admin UI gains one top-level `System Configuration…` command. It opens a
full-page, non-restorable configuration window with Lifetimes, Rate limits, Lockout, and General
tabs. Each tab renders direct form rows from server metadata; one persistent footer owns Save and
Cancel for all tabs. (AR-11, AR-14, AR-17)

## Architecture

### Current Architecture

The application already derives fixed permission booleans from live UserInfo, mounts one feature
workspace over the Desktop, and uses focused controller/service/state/workspace families for
organization and portability features.

### Proposed Changes

Add:

- `system-config-service.ts` for untrusted SDK-response validation and read/update operations.
- `system-config-state.ts` for immutable loaded/draft values, dirty/valid/busy state, and projection.
- `system-config-workspace.ts` for the four-tab Layout DSL form and workspace footer.
- `system-config-controller.ts` for open/load/save/discard/close lifecycle.

Extend existing session, capability, presentation, application, and barrel modules directly. No
generic workspace/form framework is added. (AR-11, AR-14)

## Implementation Details

### Authorization and Navigation

`AdminCapabilities` gains `canReadConfig` and `canUpdateConfig`, derived only from
`admin:config:read` and `admin:config:update` (with the existing legacy administrator rule retained
where applicable). The menu item is enabled only for an authenticated identity with read access, an
available config operation, and no other feature workspace/modal open. Read-only users may inspect
the workspace; Save remains unavailable without update permission. (AR-11, AR-14)

### Service Boundary

The service validates every API entry from `unknown`: exact key set, scalar type, group, unit,
bounds/allowed values, application mode, and safe display strings. Invalid or incomplete server
responses become the existing fixed Admin read-failure state rather than reaching widgets. Save
sends one `setMany()` call containing changed keys only, then reloads authoritative entries. It
never retries automatically. (AR-2, AR-9, AR-11)

### State Model

The state owns catalog-ordered loaded entries, raw input text, and derived validated native values.
Numerically equivalent valid text compares equal to the loaded number; changed invalid or empty
text is dirty and disables Save. Restoring the original valid value clears that field's dirty state.
Only validated native values enter the batch. (PF-008)

Derived state provides:

- `dirtyKeys`: keys whose draft differs from the loaded native value.
- `validation`: exact metadata-driven validity for every dirty key.
- `canSave`: read/write authority, at least one dirty key, all dirty values valid, and not busy.
- `busy`: blocks duplicate saves and close actions during the one active request.
- `restartRequired`: the most recent successful update result until acknowledged/reloaded.

Changing tabs never discards drafts. Successful save reloads authoritative values and returns the
workspace to clean state. A failed save keeps drafts visible and reloads displayed state only when
the failure is partial or unknown; there is no retry/merge/concurrency flow. (AR-9, AR-11)

### Layout

The window caption is `System Configuration`. A TabPane owns four tabs in catalog group order. Each
tab uses Layout DSL exclusively:

- padding 1 around the tab content;
- one blank DSL row between field rows;
- label columns wide enough for the complete approved human labels;
- bounded single-line input widths rather than horizontal growth;
- unit and inclusive range/allowed-values help adjacent to or immediately below each input;
- a small inline `Restart required` note for the five startup fields;
- no invasive warning banner and no unnecessary group box or scroll surface.

The persistent footer provides `Save` and `Cancel`. Cancel closes immediately when clean and opens
one ordinary discard confirmation when dirty. The window follows existing full-page workspace
geometry. Calculate a configuration-specific minimum width/height from actual field rows, gaps,
inline help, tab/frame chrome and the persistent two-row footer. Keep help inline at the fitting
width. Below that minimum, show the existing resize-guidance surface instead of clipped editable
controls; retain drafts and restore the form after resizing. Geometry tests use that measured
minimum and one cell below it, not the organization's 49×19 size or a universal 48×12 assertion.
No scroller or responsive-layout framework is added. (AR-11, AR-14, AR-17; PF-007)

### Input and Duration Presentation

Integer widgets remain single-line text inputs so editing can represent a temporarily incomplete
draft. Validation requires a base-10 finite safe integer within metadata bounds. Locale uses the
metadata `allowedValues`. The exact stored seconds remain visible. Presentation-only duration text
uses the largest exact whole unit among days, hours, and minutes, with correct singular/plural;
otherwise it shows seconds. Examples: `60 → 1 minute`, `900 → 15 minutes`, `3600 → 1 hour`, and
`604800 → 7 days`. (AR-2, AR-7, AR-16)

### Save Result

After a runtime-only save, show a concise success status. If the batch result says
`restartRequired: true`, show a non-invasive message that every Porta server instance must be
restarted. Reload authoritative values after either success. (AR-3, AR-11)

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|---|---|---|
| Read denied | Menu disabled; server remains authoritative | AR-11 |
| Update denied | Workspace is readable; Save disabled | AR-11 |
| Invalid draft | Inline type/range/allowed-value message; Save disabled | AR-2, AR-11 |
| Invalid server response | Fixed workspace load failure; no partial form | AR-9 |
| Save unavailable/fails | Stop busy state, keep drafts, show safe message; no retry loop | AR-9, AR-11 |
| Dirty close | One discard confirmation | AR-11 |
| Compact terminal | Existing recoverable geometry behavior; no fixed 48×12 contract | AR-11, AR-14 |

## Testing Requirements

- Immutable workspace specifications for tabs, Layout DSL gaps/padding/widths, labels/help,
  validation, dirty Save, one batch, restart notice, discard confirmation, and compact geometry.
- Immutable application integration specifications for menu/capability/lifecycle behavior.
- Implementation tests for duration formatting, response validation, and state transitions.
- `yarn test:ui` remains a required regression gate even though the new surface is terminal-based.
  (AR-15)
