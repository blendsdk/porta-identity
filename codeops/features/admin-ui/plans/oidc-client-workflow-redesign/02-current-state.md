# Current State: OIDC Client Workflow Redesign

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta already persists 1–10 redirect URIs, post-logout URIs, allowed origins, nullable client login
method overrides, computed effective methods, multiple hashed confidential-client secrets, optional
expiry, revocation, and one-time plaintext generation. The Admin UI already has immutable
organization-scoped state, controller ownership, a maximized OIDC Clients list surface, detail and
secret projections, and server-backed update operations.

The usability problem is concentrated in presentation. One 843-line dialog module builds a fixed
78×23 four-tab form. Each tab is wrapped in a feature-local scroller with a manually supplied extent.
The collection editor keeps grid selection and its Value input separate, so Edit does not naturally
edit the selected row. Login methods are represented as mutually exclusive radio choices even though
the server accepts an array. Secret expiry is entered as an unassisted timestamp string.

### Relevant Files

| File | Purpose | Changes Needed |
|---|---|---|
| `packages/server/src/routes/clients.ts` | Admin create/update and secret routes | Add initial-secret expiry; enforce strict future ISO instants and control-free secret labels |
| `packages/server/src/clients/validators.ts` | Shared client compatibility and URI validation | Reject exact duplicates in redirect, logout, and origin arrays |
| `packages/server/src/clients/secret-service.ts` | Hashes and stores secrets | Reuse unchanged; omission continues to store `null` expiry |
| `packages/sdk/src/types/clients.ts` | Public client and secret inputs | Add optional `secretExpiresAt` to create input |
| `packages/sdk/src/domains/clients.ts` | Runtime response validation and requests | Preserve response validation; exercise the added request field |
| `packages/cli/src/admin/client-dialogs.ts` | All current client dialogs and form helpers | Retain facade; split direct responsibilities and remove giant editor |
| `packages/cli/src/admin/client-workspace.ts` | Client list, detail, and credentials projections | Add sectioned detail and natural action layout |
| `packages/cli/src/admin/client-controller.ts` | Context-safe reads and mutations | Continue to Overview after successful creation |
| `packages/cli/src/admin/application-client-features.ts` | Dialog/controller orchestration | Wire compact registration and focused editors |
| `packages/cli/src/admin/index.ts` | Public Admin barrel | Remove obsolete shared-tab exports after direct consumers migrate |
| existing OIDC workspace tests | Immutable behavior and current tab/scroller implementation | Replace only assertions superseded by revised RD-04 and preserve valid safety/layout assertions |

### Code Analysis

- `createClientSchema` already accepts URI arrays and login arrays but has only `secretLabel` for
  initial generation (`packages/server/src/routes/clients.ts:75`).
- The confidential create route generates the initial secret without expiry
  (`packages/server/src/routes/clients.ts:252`).
- Rotated-secret input accepts an optional coerced date but does not reject past values
  (`packages/server/src/routes/clients.ts:151`).
- `GenerateSecretInput` exposes only optional string expiry and already represents `Never` by
  omission (`packages/sdk/src/types/clients.ts:156`).
- `collectionEditor` provides Add/Edit/Remove but does not copy the selected row into its input
  (`packages/cli/src/admin/client-dialogs.ts:334`).
- `ClientFormScroller` and `scrollPage` hard-code form extents
  (`packages/cli/src/admin/client-dialogs.ts:380`).
- The detail view renders all metadata as one long text block and scatters section actions in one row
  (`packages/cli/src/admin/client-workspace.ts:201`).
- JSVision 1.7.0 already exports `GroupBox`, `DatePicker`, `DataGrid`, and Layout DSL primitives.
- JSVision 1.7.0 already exports `ListBox`, so section navigation needs no router or new component.

## Gaps Identified

### Gap 1: Registration is configuration-heavy

**Current Behavior:** Create presents nearly every protocol field at once.

**Required Behavior:** RD-04 AC-08 limits registration to identity, type, one redirect URI, and
initial confidential-secret settings.

**Fix Required:** Replace create mode with the compact form and omit advanced fields.

### Gap 2: Client detail has no information architecture

**Current Behavior:** A button row and raw multiline metadata block lead back into one shared form.

**Required Behavior:** RD-04 AC-09 defines six logical sections on the module surface.

**Fix Required:** Add feature-local section state with one existing `ListBox` and focused editors
without introducing a router.

### Gap 3: Collection editing is not usable

**Current Behavior:** The selected row is not the edit value and invalid operations fail silently.

**Required Behavior:** RD-04 AC-09 and acceptance criterion 8 require synchronized selection,
visible validation, exact duplicate rejection, and staged Save.

**Fix Required:** Use one selectable collection region over the existing array update input and
enforce exact uniqueness in the existing shared server validator.

### Gap 4: Secret policy is not represented

**Current Behavior:** Initial secrets cannot receive expiry and rotation requires typing an ISO
timestamp.

**Required Behavior:** RD-04 AC-11–AC-12 define presets, custom calendar date, Never, and warnings.

**Fix Required:** Add the narrow create field, future-date validation, and DatePicker-based UI.

## Dependencies

### Internal Dependencies

- Existing client route, service, SDK domain, Admin UI service/state/controller, and session wiring.
- Existing JSVision 1.7.0 controls and primary module workspace recipe.
- Existing one-time secret non-retention and organization-context protections.

### External Dependencies

- None added.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Plaintext secret retained by new navigation | Low | High | Keep presentation callback transient and test state/redraw/context boundaries |
| Past, malformed, or non-ISO expiry accepted | Medium | High | Strict route-local ISO schema plus future-instant tests |
| Secret label contains terminal control characters | Low | Medium | One route-local control-free label schema for create and rotation |
| Public client receives secret fields | Low | High | Closed create payload builder and server behavior tests |
| Redirect editor or direct API submits partial or duplicate data | Medium | Medium | Stage arrays, validate exact duplicates in UI and shared server validator, submit once |
| New detail layout redraw artifacts | Medium | Medium | Remove hard-coded scroller and test 80×24, 48×12, and resize cycles |
| File split grows into a framework | Low | Medium | Preserve facade and use only direct feature modules per AR-14 |
| Optional API field breaks older callers | Low | Medium | Optional additive field; omission preserves Never semantics |
