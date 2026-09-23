# Focused Editors: OIDC Client Workflow Redesign

> **Document**: 03-03-focused-editors.md
> **Parent**: [Index](00-index.md)

## Overview

Focused editors expose the supported Porta configuration without the current cross-tab form or
manual scrolling extent. They build ordinary Layout DSL dialogs from existing JSVision controls and
return one bounded `UpdateClientInput` to the existing controller (AR-4–AR-8, AR-10, AR-14).

## Architecture

### Authentication Collections

Authentication edits redirect URIs, post-logout redirect URIs, and allowed origins. One three-choice
collection selector switches one reused DataGrid, one single-line Value input, visible
Add/Edit/Remove buttons, and one compact validation message. One parent-local value stages all three
arrays, so switching collections or resizing does not lose edits. Selecting a row copies its exact
value into the input. Add appends a new valid non-duplicate value. Edit replaces the selected row
without changing order. Remove deletes the selected row except the final redirect URI. Buttons are
enabled only when their operation is valid (AR-5, AR-10).

All edits are dialog-local. Save validates every collection and returns complete replacement arrays
in one `UpdateClientInput`; Cancel returns no mutation. The editor does not call the SDK itself
(AR-10).

The existing shared server compatibility validator also rejects exact-string duplicates in all
three arrays. UI validation provides immediate feedback, but it is not the authority for direct SDK
or Admin API callers. No second validator or service layer is added.

### Protocol

The protocol editor retains the supported grant check group, fixed `code` response type, scope,
token endpoint authentication method, and PKCE switch. Existing server compatibility rules remain
authoritative. The UI keeps its current direct affordances for public versus confidential clients
but does not add a second protocol-policy engine (AR-3–AR-4, AR-9).

The immutable editor specifications exercise each update field and the existing compatibility
matrix: public clients use `none`, exclude `client_credentials`, and require PKCE; confidential
clients use one supported secret authentication method, may use `client_credentials`, and preserve
their explicit PKCE choice. Scope is mapped unchanged after control-free validation.

### Login Experience

The editor contains `Use organization defaults`, Password, and Magic link controls. When inheritance
is selected, the method controls display the effective returned values and are not editable. When
inheritance is off, the two methods are independently editable and Save requires at least one.
Inherited Save emits `loginMethods: null`; explicit Save emits the selected non-empty array. The
section names the selected organization and always displays `effectiveLoginMethods` from the server
(AR-8).

### Secret Expiry Selector

One direct feature-local control composition is implemented completely with registration in Phase 2
and reused unchanged by credential generation in Phase 4:

- expiration choice: 3 months, 6 months, 12 months, 24 months, Custom, or Never;
- initial selection: 6 months;
- Custom displays JSVision `DatePicker` with tomorrow as its minimum and no maximum;
- preset months use JSVision calendar-month arithmetic from the current civil date;
- dated choices serialize as 00:00:00.000Z on the day after the selected date;
- a date more than 24 calendar months away shows a small non-blocking rotation warning; and
- Never omits expiry and shows: `This secret will remain valid until it is revoked. Regular rotation
  is recommended.`

No extra confirmation is shown for long-lived or non-expiring secrets (AR-6–AR-7). The composition
is a small feature helper, not a public widget or generalized date policy (AR-14).

### Credentials

The Credentials section always renders its metadata DataGrid, including when empty. Generate opens a
focused label and expiry dialog. Revoke is visible and disabled until an active secret is selected.
Plaintext continues to flow only into the existing one-time dialog and never into retained workspace
or credential-grid state (AR-4, AR-6).

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|---|---|---|
| Empty, invalid, wildcard, fragmented, or overlength URI | Show fixed local validation and disable Add/Edit/Save | AR-5 |
| Exact duplicate value | Show fixed duplicate validation; preserve rows and selection | AR-5 |
| Remove final redirect URI | Keep Remove disabled | AR-5 |
| No explicit login method | Disable Save until Password or Magic link is selected | AR-8 |
| Custom date missing or before tomorrow | Disable Generate/Create and show fixed validation | AR-6–AR-7 |
| Date beyond 24 months | Show warning without disabling submission | AR-6 |
| Never selected | Show warning and omit expiry | AR-6–AR-7 |
| Update/generate failure | Preserve authoritative projection and publish existing sanitized status; user may reopen the focused editor | AR-10, AR-13 |
| Organization/session changes while a focused editor or update is active | Cancel the owned dialog; existing controller ownership rejects any late result | RD-04 AC-13 |

## Testing Requirements

- Selection-to-input synchronization, collection switching at 48×12, staged-value preservation,
  and exact-order replacement.
- Every URI/origin empty, 1, 10, 11, syntax, duplicate, final-row, cancel, and one-save boundary,
  including server-authoritative duplicate rejection.
- Table-driven protocol payload and public/confidential compatibility behavior.
- Login inheritance and all valid explicit method combinations.
- Frozen-date tests with exact preset civil dates and ISO outputs, a month-end clamp row, custom
  next-day UTC conversion, >24-month warning, and Never.
- Empty credential grid, selection-dependent Revoke, one-time plaintext handling, and natural button
  sizing at supported geometries.
- One representative focused-editor context abort and one continuation late-result case when the
  changed controller branch is not already covered by an existing immutable test.
