# Task T-03: Tab-based application details

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 4/4 tasks (100%)
> **Last Updated**: 2026-09-09 00:55
> **Phase baseline tree**: `620ca7a70cab117e09e9fbacc3e04ffc81fae9fe`
> **Scope mode**: strict
> **Expected modification set**: `packages/cli/src/admin/application-workspace.ts`; focused
> Application workspace specification and implementation tests; the CLI test-count repository
> contract; this plan and the admin-ui roadmap.
> **Quality review**: RV-001 resolved after the user-approved correction; the required review and
> single re-review are complete.

## Objective

Replace the selected Application view's stacked Application and Modules group boxes with a
full-width `TabView` matching the established OIDC Client detail pattern. The two tabs are
`Overview` and `Modules`. Each tab directly hosts its existing content with padding `1`, while
`Back to applications` remains below the tabs as view-level navigation.

Existing metadata, lifecycle behavior, module CRUD behavior, capability checks, dialogs,
controller operations, retained failure states, and authoritative reloads remain unchanged. The
Modules tab always displays its DataGrid, including when there are no modules. The active tab is
retained across reloads of the same application and resets to Overview when another application is
selected. All buttons keep their natural size through the Layout DSL.

**Smallest viable design:** Refactor only `renderDetail` in the existing Application workspace.
Reuse JSVision `TabView`, the existing signals and action builders, and the OIDC detail layout
pattern. Add one local selected-tab signal and one selected-application identifier. Remove the
superseded detail `GroupBox` composition and empty-state replacement; add no shared abstraction,
new dependency, service, controller, API, SDK, or Roles and Permissions behavior.

## Tasks

- [x] T-03.1 Update immutable real-JSVision specifications first and record the expected red result:
      Application details expose Overview and Modules tabs without group boxes; metadata and
      application actions belong to Overview; the module grid and operations belong to Modules;
      navigation remains below the tabs; an empty Modules tab still contains a DataGrid; all
      action buttons use natural DSL sizing. ✅ (completed: 2026-09-08 23:43; expected red: 4
      failing, 15 passing)
- [x] T-03.2 Implement the tab-based Application detail composition and make the focused
      specifications green without changing controller or service behavior. ✅ (completed:
      2026-09-08 23:49; focused specification tests: 19 passed)
- [x] T-03.3 Add implementation coverage for active-tab retention on same-application reload,
      reset on application change, focus ownership, compact geometry, and clean replacement of the
      former stacked surfaces. ✅ (completed: 2026-09-08 23:52; focused tests: 31 passed)
- [x] T-03.4 Run the focused Application workspace tests, `yarn workspace
      @portaidentity/cli verify`, `yarn test:structure`, and `git diff --check` on Node 24 LTS. Do
      not run root `yarn verify`. ✅ (completed: 2026-09-09 00:24; CLI: 79 files and 1,096 tests;
      structure: 97 tests)

**Verify**: `yarn workspace @portaidentity/cli verify`, `yarn test:structure`, and
`git diff --check` on Node 24 LTS. Root `yarn verify` is explicitly excluded for this UI task.
