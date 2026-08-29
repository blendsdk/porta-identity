# Task T-01: Unauthenticated authentication gate

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 4/4 tasks (100%)
> **Last Updated**: 2026-08-29 12:36
> **Phase baseline tree**: `a41ca3c6a388f03b652ae125ad08b7855b1ccd04`
> **Scope mode**: strict
> **Expected modification set**: `packages/cli/src/admin/{application,organization-dialogs,presentation}.ts`;
> focused admin application/dialog specification and implementation tests; CLI and maintainer
> documentation; this plan and the admin-ui/portfolio roadmaps.

## Objective

Replace the unusable unauthenticated landing state with one small blocking JSVision dialog. After
server selection or stored-session verification reaches `unauthenticated`, the application opens
the dialog automatically with **Authenticate** focused and **Quit** as the only alternative.
Keyboard Enter and mouse activation start the existing authentication operation. Escape and window
close must not expose the disabled application beneath the dialog. Authentication cancellation,
sanitized failure, or later session invalidation returns to the same gate; successful
authentication closes it and continues to the existing organization chooser.

The existing browser/manual Authorization Code with PKCE flow, cancellation ownership, terminal
restoration, responsive resize-only fallback, and `Alt-X` exit remain unchanged. A terminal too
small for the dialog keeps only the existing resize guidance and Quit; restoring usable geometry
reopens the gate. This task adds no authentication mechanism, framework, dependency, server or SDK
change, workflow, runtime matrix, or administrative screen.

## Tasks

- [x] T-01.1 Write immutable real-JSVision specifications first and record the expected red result:
      unauthenticated startup opens the gate; Authenticate is initially focused and works by Enter
      and mouse click; Quit exits; Escape/window-close cannot dismiss; cancellation, sanitized
      failure, session invalidation, and resize recovery reopen the gate; successful authentication
      proceeds to the existing organization chooser. ✅ (completed: 2026-08-29 12:24; expected red:
      5 failing, 1 passing)
- [x] T-01.2 Implement the gate in the existing dialog module and add the minimum application-owned
      modal lifecycle needed to open, close, and reopen it. Reuse the existing session operation and
      dialog surface, remove the superseded landing-view Enter affordance/focus code, and make the
      focused specifications green without changing their expectations. ✅ (completed:
      2026-08-29 12:25)
- [x] T-01.3 Add focused implementation coverage for single-modal ownership, disposal, resize,
      cancellation, and late completion. Update the existing CLI and maintainer documentation to
      describe the automatic Authenticate/Quit gate. ✅ (completed: 2026-08-29 12:34)
- [x] T-01.4 Run formatting checks, `yarn workspace @portaidentity/cli verify`, and
      `yarn docs:build` on Node 24 LTS. Manually smoke the clean-credential playground path and
      confirm that no server, SDK, dependency, workflow, or matrix file changed. ✅ (completed:
      2026-08-29 12:36)

**Verify**: `yarn workspace @portaidentity/cli verify` and `yarn docs:build` on Node 24 LTS.
