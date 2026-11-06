# Task T-01: Admin Terminal Invite Role Pre-Assignment

> **Type**: Task (lightweight) · **Feature**: admin-terminal · **CodeOps Artifact Schema**: 1
> **Progress**: 10/10 tasks (100%)
> **Reasoning**: high — a new modal interaction crosses capability gating, exact invite payloads and
> an existing asynchronous role catalog; the change is bounded and reuses established seams.

## Objective

Let an administrator select one or more application roles in the `porta admin` user-invitation
dialog and send the exact validated `roles` array with `users.invite`. The selection is available
only when the current verified session has `canAssignRoles`, `canReadApplications` and
`canReadRoles`. The independent security review also found a pre-existing canonical-role
delegation gap on the invitation path; this task includes the necessary server-side correction so
the feature cannot expose a super-admin escalation. Closes GitHub #182.

**Smallest viable design:** Keep the existing invite form and add one compact "Roles" row that opens
one focused checklist modal. The checklist reuses the existing application catalog read and
per-application role reads, then returns a local selection to the invite form. No preflight GET of
the invitation, no retries, no second role-assignment path, and no new dependency or framework.

## Scope

In scope:

- Server invitation authorization applies the existing canonical Admin delegation ceiling and
  requires `admin:role:assign` for human role-bearing invitations. The bound machine lane keeps its
  approved binding-policy authority and the same delegation ceiling.
- `AdminInviteUserInput` gains the SDK's existing `roles` shape and the invite payload validation
  accepts exact `{applicationId, roleId}` pairs, rejects malformed pairs and duplicate pairs, and
  omits the property when no role is selected.
- The invite dialog gains a capability-gated "Roles" row and a focused checklist modal. The modal
  loads the readable application catalog and each application's roles, supports arbitrary checked
  combinations, preserves the previous selection on cancel, and shows fixed load-failure text.
- The user controller passes the role catalog source only when the verified session has the two
  required capabilities; existing injected dialog seams remain compatible.
- The email preview stays independent from role assignment; the final invitation forwards the exact
  selected roles.
- Behavior specs, implementation tests, user documentation, independent review and CI.

Out of scope:

- Custom-claim selection in the terminal dialog; SDK/OIDC changes; role creation or
  assignment after invitation; role editing from the invite dialog; bulk invitation changes;
  retries or optimistic concurrency; the retired web GUI.

## Decisions (auto-design provenance)

| ID  | Decision | Rationale |
| --- | -------- | --------- |
| D1  | Roles only, no claims | GitHub #182 acceptance criteria name roles; claims are already available through the conventional CLI and remain a separate follow-up. |
| D2  | One nested checklist modal, not inline multi-select | The invite form already fills a 24-line terminal; a focused modal keeps the primary form readable and reuses the existing `CheckGroup`, `Scroller` and modal seams. |
| D3  | Load the complete readable catalog once when the checklist opens | The existing role dialog already reads the application catalog and per-application roles. This task needs a finite selection set, not incremental server-side role assignment. |
| D4  | Gate on `canAssignRoles`, `canReadApplications` and `canReadRoles` | Matches the existing role dialog and the server role-read permission. Missing capabilities hide the feature rather than producing an avoidable failure. |
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
   collected input includes `roles` only when the selection is non-empty. The email preview omits
   roles because it renders content only; the final invitation remains authoritative.
5. **Controller wiring.** Extend `AdminUserControllerDialogs.invite` with an optional fourth
   parameter. The controller builds the source from `readState()`, `readApplicationOperations()` and
   `readRbacOperations()` only when authenticated and all three capabilities are true; otherwise it
   passes `undefined`. No extra network call is made when the feature is unavailable.
6. **Server authorization correction.** Reuse one canonical Admin role delegation check in the
   direct user-role route and the shared invitation workflow. A human invitation carrying roles
   also requires `admin:role:assign`; the machine lane keeps its approved binding policy. Rejection
   happens before invitation persistence, email delivery or audit effects.
7. **Documentation.** Update `docs/cli/users.md` to describe the invite role selector, its
   capability requirements, optionality and the fact that assignments apply on acceptance; update
   `docs/api/users.md` with the role-assign requirement and delegation ceiling.

## Tasks

### Phase 1 — Behavior oracle and red

- [x] T-01.1 Add an immutable behavior spec for capability gating, role selection, exact invite
  payload, email-preview independence, no-roles omission and catalog-failure behavior; observe the intended
  red against the current implementation. Keep existing invite expectations intact. ✅ (completed:
  12 failures/2 controls red; 6 behavior cases now green)
- [x] T-01.2 Add implementation tests for role-pair validation, duplicate rejection and exact
  forwarding through the user service; observe the intended red. ✅ (completed: 7 validation and
  forwarding cases red, then green; empty selection still omitted)

### Phase 2 — Implementation and green

- [x] T-01.3 Extract `AdminUserDialogHost`, `dialogSize`, `runDialog`, `actionRow` and `inputRow`
  into `user-dialog-support.ts`; update imports without behavior change. ✅ (completed: shared helpers
  used by both dialog modules; existing dialog behavior unchanged)
- [x] T-01.4 Extend `AdminInviteUserInput` and `inviteInput` role validation in `user-service.ts`.
  ✅ (completed: exact pairs, UUIDs, closed keys, duplicate rejection, empty omission)
- [x] T-01.5 Implement the role checklist modal in `invite-role-dialog.ts`. ✅ (completed: loading,
  ready, failure, empty, reload, done/cancel and preserved selection)
- [x] T-01.6 Wire the invite dialog row and nested modal, then pass the capability-gated catalog
  source from `user-controller.ts`; keep existing three-parameter dialog injections working. ✅
  (completed: all three capabilities required; absent source hides the row; controller tests cover
  each missing capability and the stale-session guard)
- [x] T-01.7 Re-run the behavior and implementation tests until green; run the focused CLI admin
  suite and fix only task-caused failures. ✅ (completed: focused 14/14; admin 942/942; existing
  projection expectation updated for the now-supported role field)

### Phase 3 — Hardening, review and delivery

- [x] T-01.8 Update `docs/cli/users.md` and the feature/portfolio roadmap; run CLI lint, typecheck,
  build, the focused admin suite, structure tests and the repository's affected test selection. ✅
  (completed: docs build pass; CLI lint/typecheck/build pass; CLI full 1,850; structure 158; inventory
  127)
- [x] T-01.9 Apply the security-review corrections: canonical Admin delegation ceiling on the
  invitation path, `admin:role:assign` for human role-bearing invitations, and the role checklist's
  read-capability, reserved-role, label, focus, extent, preview and recovery fixes. ✅ (completed:
  2026-11-06; focused server specs 20 passed, focused CLI admin suite 951 passed, lint/typecheck
  passed; full gate in T-01.10)
- [x] T-01.10 Obtain scoped re-review, run the full applicable server/CLI gate and CI, merge through
  `develop`, close #182 and record final evidence and cleanup. ✅ (completed: 2026-11-06; scoped
  correctness/security re-reviews closed every finding; CLI1,861, server unit4,427,
  integration1,164, pentest334, E2E134, structure158, lint/typecheck/build and docs pass; PR #221
  all six CI jobs pass; production-security exits0 with 11/11 exposure passes and no incomplete
  cases; merge and issue closure are the final integration actions)

**Verify**: `pnpm --filter @portaidentity/cli lint && pnpm --filter @portaidentity/cli typecheck && pnpm --filter @portaidentity/cli build && pnpm --filter @portaidentity/cli test && pnpm --filter @portaidentity/server lint && pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server test && pnpm test:structure`

## Evidence plan

- Record the exact spec-red output and the green focused counts.
- Record the final CLI full-suite count, structure count, lint/typecheck/build results and CI run.
- Record the independent reviewer verdict and every finding disposition.
- Record the eventual merge commit and #182 closure. No server, SDK, assurance or release claim is
  made unless the executed diff actually requires it.
