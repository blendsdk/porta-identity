# Task T-01: Admin Terminal Invite Role Pre-Assignment

> **Type**: Task (lightweight) · **Feature**: admin-terminal · **CodeOps Artifact Schema**: 1
> **Progress**: 0/9 tasks (0%)
> **Reasoning**: high — a new modal interaction crosses capability gating, exact invite payloads and
> an existing asynchronous role catalog; the change is bounded and reuses established seams.

## Objective

Let an administrator select one or more application roles in the `porta admin` user-invitation
dialog and send the exact validated `roles` array with `users.invite`. The selection is available
only when the current verified session has both `canAssignRoles` and `canReadApplications`; no
server, SDK or public wire contract changes. Closes GitHub #182.

**Smallest viable design:** Keep the existing invite form and add one compact "Roles" row that opens
one focused checklist modal. The checklist reuses the existing application catalog read and
per-application role reads, then returns a local selection to the invite form. No preflight GET of
the invitation, no retries, no second role-assignment path, and no new dependency or framework.

## Scope

In scope:

- `AdminInviteUserInput` gains the SDK's existing `roles` shape and the invite payload validation
  accepts exact `{applicationId, roleId}` pairs, rejects malformed pairs and duplicate pairs, and
  omits the property when no role is selected.
- The invite dialog gains a capability-gated "Roles" row and a focused checklist modal. The modal
  loads the readable application catalog and each application's roles, supports arbitrary checked
  combinations, preserves the previous selection on cancel, and shows fixed load-failure text.
- The user controller passes the role catalog source only when the verified session has the two
  required capabilities; existing injected dialog seams remain compatible.
- The preview callback receives the same selected roles as the final invite.
- Behavior specs, implementation tests, user documentation, independent review and CI.

Out of scope:

- Custom-claim selection in the terminal dialog; server/SDK/OIDC changes; role creation or
  assignment after invitation; role editing from the invite dialog; bulk invitation changes;
  retries or optimistic concurrency; the retired web GUI.

## Decisions (auto-design provenance)

| ID  | Decision | Rationale |
| --- | -------- | --------- |
| D1  | Roles only, no claims | GitHub #182 acceptance criteria name roles; claims are already available through the conventional CLI and remain a separate follow-up. |
| D2  | One nested checklist modal, not inline multi-select | The invite form already fills a 24-line terminal; a focused modal keeps the primary form readable and reuses the existing `CheckGroup`, `Scroller` and modal seams. |
| D3  | Load the complete readable catalog once when the checklist opens | The existing role dialog already reads the application catalog and per-application roles. This task needs a finite selection set, not incremental server-side role assignment. |
| D4  | Gate on both `canAssignRoles` and `canReadApplications` | Matches the existing role dialog's capability boundary and issue #182. Missing capabilities hide the feature rather than producing an avoidable failure. |
| D5  | Keep invite usable without roles when catalog loading fails | Roles are optional in the invitation contract; a role-read outage must not block an otherwise valid invitation. The failure is shown locally and no retry loop is added. |
| D6  | Reject duplicate and malformed role pairs before dispatch | Duplicate pairs are meaningless and a malformed pair would otherwise become a server validation error after a user has completed the form. |
| D7  | No new role-count limit | The server owns the accepted set and the catalog is finite. The existing conventional CLI `--role` flag also has no local count limit; this change follows that contract. |
| D8  | Extract the shared dialog host/size/run helpers before adding the second dialog module | Avoids a runtime import cycle and duplicated modal lifecycle code while keeping both files below the repository's file-size guidance. |

AI resolved D1–D8 under `--auto-design`; no user-owned public policy, scope or security decision is
changed. The issue's acceptance criteria remain the authoritative behavior baseline.

## Technical design

1. **Input contract.** Change `AdminInviteUserInput` to
   `Omit<InviteUserInput, 'organizationId' | 'claims'>`, which keeps the SDK's existing optional
   `roles?: Array<{ applicationId: string; roleId: string }>`. Extend `inviteInput` in
   `user-service.ts` with a closed role validator: array of plain objects with exactly the two UUID
   keys, no duplicate application/role pair. Omit `roles` when absent or empty. Do not add a limit.
2. **Catalog source.** Add a small `AdminInviteRoleSource` in the admin user-service boundary:
   `listApplications()` (the existing application catalog read) and
   `listRoles(applicationId, signal)` (the existing RBAC role read). This is a structural subset of
   the already-wired operations, not a new service.
3. **Checklist modal.** Add `packages/cli/src/admin/invite-role-dialog.ts` with
   `showInviteRoleDialog(host, signal, source, selected)`. It loads applications, then all roles in
   parallel, flattens them to labelled options, renders a `CheckGroup` inside a `Scroller`, and
   returns the checked options on Done. Cancel returns the previous selection unchanged. Failures
   show one fixed message; Reload is manual. The modal uses the shared dialog host/size/run helpers.
4. **Dialog integration.** Add an optional `roleSource` parameter to `showInviteUserDialog`. When
   present, render a one-line "Roles: N selected" row and a "Select…" button; the button opens the
   checklist modal. The current selection is retained across Preview and validation failures. The
   collected input includes `roles` only when the selection is non-empty. Preview forwards the same
   input.
5. **Controller wiring.** Extend `AdminUserControllerDialogs.invite` with an optional fourth
   parameter. The controller builds the source from `readState()`, `readApplicationOperations()` and
   `readRbacOperations()` only when authenticated and both capabilities are true; otherwise it
   passes `undefined`. No extra network call is made when the feature is unavailable.
6. **Documentation.** Update `docs/cli/users.md` to describe the invite role selector, its
   capability requirements, optionality and the fact that assignments apply on acceptance.

## Tasks

### Phase 1 — Behavior oracle and red

- [ ] T-01.1 Add an immutable behavior spec for capability gating, role selection, exact invite
  payload, preview forwarding, no-roles omission and catalog-failure behavior; observe the intended
  red against the current implementation. Keep existing invite expectations intact.
- [ ] T-01.2 Add implementation tests for role-pair validation, duplicate rejection and exact
  forwarding through the user service; observe the intended red.

### Phase 2 — Implementation and green

- [ ] T-01.3 Extract `AdminUserDialogHost`, `dialogSize`, `runDialog`, `actionRow` and `inputRow`
  into `user-dialog-support.ts`; update imports without behavior change.
- [ ] T-01.4 Extend `AdminInviteUserInput` and `inviteInput` role validation in `user-service.ts`.
- [ ] T-01.5 Implement the role checklist modal in `invite-role-dialog.ts`.
- [ ] T-01.6 Wire the invite dialog row and nested modal, then pass the capability-gated catalog
  source from `user-controller.ts`; keep existing three-parameter dialog injections working.
- [ ] T-01.7 Re-run the behavior and implementation tests until green; run the focused CLI admin
  suite and fix only task-caused failures.

### Phase 3 — Hardening, review and delivery

- [ ] T-01.8 Update `docs/cli/users.md` and the feature/portfolio roadmap; run CLI lint, typecheck,
  build, the focused admin suite, structure tests and the repository's affected test selection.
- [ ] T-01.9 Obtain independent review, close necessary findings, run the full applicable gate and
  CI, merge through `develop`, close #182 and record final evidence and cleanup.

**Verify**: `pnpm --filter @portaidentity/cli lint && pnpm --filter @portaidentity/cli typecheck && pnpm --filter @portaidentity/cli build && pnpm --filter @portaidentity/cli test && pnpm test:structure`

## Evidence plan

- Record the exact spec-red output and the green focused counts.
- Record the final CLI full-suite count, structure count, lint/typecheck/build results and CI run.
- Record the independent reviewer verdict and every finding disposition.
- Record the eventual merge commit and #182 closure. No server, SDK, assurance or release claim is
  made unless the executed diff actually requires it.
