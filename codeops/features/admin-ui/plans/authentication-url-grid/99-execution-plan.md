# Task T-02: Unified OIDC authentication URL grid

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 4/4 tasks (100%)
> **Last Updated**: 2026-09-08 22:50
> **Phase baseline tree**: `266cc5d90b18cc364abe0c9609c59b8775ad7e3a`
> **Scope mode**: strict
> **Expected modification set**: `packages/cli/src/admin/{client-workspace,client-authentication-dialogs,application-client-features,client-dialogs,index}.ts`; focused OIDC client specification and implementation tests; this plan and the admin-ui/portfolio roadmaps.

## Objective

Replace the Authentication tab's three framed text lists and separate full-page editor with one
direct, padded DataGrid containing Redirect URI, Post-logout redirect URI, and Allowed origin rows.
The tab provides naturally sized Add, Edit, and Delete actions. Add and Edit use one compact DSL
dialog with a type selector and one single-line value field. Delete uses a confirmation dialog with
Keep as the safe default. Each confirmed operation rebuilds the existing three arrays and submits
one ETag-protected client update; no server or SDK API changes are introduced.

**Smallest viable design:** Flatten the three authoritative arrays into a UI-local discriminated
row type and rebuild them after a confirmed operation. Reuse the existing update controller,
validation rules, dialog lifecycle, DataGrid, and confirmation patterns. Exact duplicates are
rejected within one type; values may repeat across different types. Editing may change type. The
last Redirect URI cannot be deleted or converted because the server requires at least one. Remove
the superseded full-page editor and its dead tests; add no abstraction, dependency, or backend
endpoint.

## Tasks

- [x] T-02.1 Write immutable real-JSVision specifications first and record the expected red result:
      one unframed grid shows all three types; Add/Edit/Delete follow selection and capability
      state; focused dialogs edit one typed value; duplicate, syntax, count, and last-redirect
      invariants are enforced; deletion requires confirmation; confirmed operations emit exact
      three-array updates.
- [x] T-02.2 Implement the UI-local row projection, direct Authentication tab, compact Add/Edit
      dialog, and delete confirmation. Route confirmed mutations through the existing ETag-aware
      client update flow and remove the Edit authentication intent and full-page editor.
- [x] T-02.3 Add implementation coverage for flatten/rebuild identity, selection retention,
      cancellation/abort ownership, compact geometry, and authoritative reload. Remove superseded
      editor implementation tests and dead exports.
- [x] T-02.4 Run `yarn workspace @portaidentity/cli verify` on Node 24 LTS and `git diff --check`.
      Do not run root `yarn verify`.

**Verify**: `yarn workspace @portaidentity/cli verify` on Node 24 LTS. Root `yarn verify` is
explicitly excluded for these UI experiments.

**Quality review**: [Passed after one bounded fix and re-review](01-quality-review.md).
