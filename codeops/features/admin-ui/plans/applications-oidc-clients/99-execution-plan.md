# Execution Plan: Applications and OIDC Clients

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-30 10:47
> **Progress**: 0/49 tasks (0%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-04 in six specification-first phases: secure the existing server contract, correct
SDK and conventional CLI contracts, add immutable Admin state/services, build the global
Applications workspace, build the organization-scoped OIDC Clients workspace, then integrate and
prove the packed journey. Every phase stays feature-specific (AR-1, AR-2).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                                  | Tasks |
| ----- | ------------------------------------------------------ | ----: |
| 1     | Server safety, runtime, and role data                  |    10 |
| 2     | SDK and conventional CLI contracts                     |     8 |
| 3     | Admin state, services, and controllers                 |     8 |
| 4     | Global Applications workspace                          |     7 |
| 5     | Organization OIDC Clients workspace                    |     8 |
| 6     | Shell integration, packed journey, docs, and assurance |     8 |

**Total: 49 tasks across 6 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth. The executor must:
>
> 1. mark a task `[~]` with `implemented: YYYY-MM-DD HH:MM` after implementation;
> 2. promote it to `[x]` with `completed: YYYY-MM-DD HH:MM` only after verification passes;
> 3. update Progress and Last Updated after every task; only `[x]` counts as complete;
> 4. resume the first `[~]`, otherwise the first `[ ]`, scanning top-to-bottom;
> 5. mark a blocker `[!]` with its concise reason on the same task line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Specification expectations are immutable after
> their expected-red checkpoint. Commit and push behavior belongs to exec-plan/git-commit, not task
> shell commands.

---

## Phase 1: Server Safety, Runtime, and Role Data

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — focused RD-04 validation, nested ownership, App Admin permission, PKCE,
> and overlapping-secret corrections only

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-server-safety-and-data.md) · server ST-01–ST-15B · AR-4, AR-5, AR-7, AR-8

- [ ] 1.1.1 [spec-author] Add immutable validation, dual-permission, secret parent/state and 10-active bound, migration-precondition, lifecycle-runtime, and PKCE specifications — focused server `*.spec.test.ts` files
- [ ] 1.1.2 [spec-author] Add real-provider Basic/post overlap, legacy, revocation, expiry, and failure specifications plus the focused deterministic middleware handoff specification — named integration files from 07
- [ ] 1.1.3 Run every server ST case against unchanged production code and record the expected-red boundary without changing expectations

### Step 1.2: Implementation and Green Phase

- [ ] 1.2.1 Share the protocol/URI/origin compatibility validator between Admin routes and import, and align provider PKCE metadata — client validators, Admin routes, import, OIDC configuration
- [ ] 1.2.2 Enforce client-create's two permissions; confidential/non-revoked secret list/mutation state; the atomic 10-active-secret bound in a short parent-row-lock transaction; and parent-qualified module/secret operations — application/client modules
- [ ] 1.2.3 Add `admin:org:read` to App Admin and add the ordered idempotent migration with the no-mutation over-10 active-secret precondition — admin permissions and migration
- [ ] 1.2.4 Implement indexed modern matching, at-most-10 sequential legacy checks, non-queuing single-batch admission, the existing 30-per-5-minute issuer/client Redis limit, fixed 429/Retry-After denial without credential classification, and canonicalization without replacing provider authentication — secret service/repository, post-parse guard, and middleware
- [ ] 1.2.5 Run every server ST case and make the implementation green without changing expectations

### Step 1.3: Implementation Tests and Verification

- [ ] 1.3.1 Add focused implementation tests for validator branches, parent-qualified SQL, migration idempotency, indexed/legacy verification work bounds, fail-closed dependencies, and AR-8's deferred-dependency middleware handoff
- [ ] 1.3.2 Run the exact Phase 1 commands in 07, including browser, retained OIDC, protocol assurance, and Node 24 LTS `yarn verify`

**Deliverables:** truthful protocol validation, parent integrity, usable App Admin, and safe overlapping-secret runtime.

**Verify:** every Phase 1 command in 07's Exact Integration and Assurance Commands table

---

## Phase 2: SDK and Conventional CLI Contracts

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — current application/client SDK and existing conventional CLI consumers only

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-sdk-and-cli-contracts.md) · ST-16–ST-23 · AR-1, AR-2

- [ ] 2.1.1 [spec-author] Add immutable SDK application/client type and transport contract specifications, including a focused TypeScript oracle where exact absence matters — SDK tests
- [ ] 2.1.2 [spec-author] Add conventional CLI contract specifications for every exact application, module, client, and secret command inventoried in 03-02 — CLI command tests
- [ ] 2.1.3 Run ST-16–ST-23 against unchanged public contracts and record expected red

### Step 2.2: Implementation and Green Phase

- [ ] 2.2.1 Correct documented public application/module types and domain operations — SDK types and `domains/applications.ts`
- [ ] 2.2.2 Correct documented public client/secret types, response wrappers, and domain operations — SDK types and `domains/clients.ts`
- [ ] 2.2.3 Align existing conventional application/client CLI commands and fixtures with the corrected SDK without adding command families — CLI commands/tests
- [ ] 2.2.4 Run ST-16–ST-23 and make the implementation green without changing expectations

### Step 2.3: Implementation Tests and Verification

- [ ] 2.3.1 Add SDK/CLI implementation regressions for serialization, pagination rejection, wrappers, IDs, optional secrets, and fixed output, then run both package verifies and Node 24 LTS `yarn verify`

**Deliverables:** accurate public application/client contracts and aligned current CLI consumers.

**Verify:** focused TypeScript oracle · `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 3: Admin State, Services, and Controllers

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — two feature-specific immutable workflows; no generalized framework,
> persistence, polling, or multi-operator coordination

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-admin-state-services.md) · ST-24–ST-31 · AR-2

- [ ] 3.1.1 [spec-author] Add immutable application/client validation, all-or-nothing list, fixed-failure, context ownership, capability parsing, production SDK injection, and session-operation specifications — Admin service/state spec tests
- [ ] 3.1.2 [spec-author] Add controller specifications for capability recheck, duplicate activation, refresh replay, indeterminate reconciliation, late results, and plaintext disposal — Admin controller spec tests
- [ ] 3.1.3 Run ST-24–ST-31 against unchanged Admin UI and record expected red

### Step 3.2: Implementation and Green Phase

- [ ] 3.2.1 Add immutable application/client projections, bounded validators, fixed failures, and the minimal feature-local workspace/dialog contracts controllers require — Admin state/type and contract files
- [ ] 3.2.2 Add thin SDK services plus production capability parsing, application/client domain injection, and session operations with whole-response validation — Admin service/session files
- [ ] 3.2.3 Add feature-specific application and client controllers with generation, dialog, capability, context, and reconciliation ownership — Admin controller files
- [ ] 3.2.4 Run ST-24–ST-31 and make the implementation green without changing expectations

### Step 3.3: Implementation Tests and Verification

- [ ] 3.3.1 Add implementation regressions for hostile responses, generation races, aborts, refresh, retained projections, and every plaintext terminal transition; run CLI verify and Node 24 LTS `yarn verify`

**Deliverables:** validated global application and organization client workflows independent of rendering.

**Verify:** `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 4: Global Applications Workspace

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — Applications list/detail/modules/lifecycle UI using existing JSVision patterns

### Step 4.1: Specification Tests

**Reference**: [03-04](03-04-applications-workspace.md) · ST-32–ST-38, ST-50–ST-52 · AR-2

- [ ] 4.1.1 [spec-author] Add application DataGrid, exact field-boundary, authoritative mutation reload/failure, detail, global notice, capability, module, lifecycle, focus, movement, resize, and redraw specifications — Admin workspace/dialog spec tests
- [ ] 4.1.2 Run the focused Applications workspace/dialog specifications and record expected red

### Step 4.2: Implementation and Green Phase

- [ ] 4.2.1 Implement the full-height global application DataGrid and detail/module projection with Layout DSL — application workspace files
- [ ] 4.2.2 Implement movable create/edit and exact lifecycle confirmation dialogs with one-row inputs and visible-disabled actions — application dialog files
- [ ] 4.2.3 Implement movable module create/edit/deactivate dialogs and parent-safe intents — application dialog/workspace files
- [ ] 4.2.4 Run ST-32–ST-38 and applicable ST-50–ST-52 cases green without changing expectations

### Step 4.3: Implementation Tests and Verification

- [ ] 4.3.1 Add geometry, DataGrid, focus, mouse, modal teardown, small-terminal, and artifact-free redraw implementation tests; run CLI verify and Node 24 LTS `yarn verify`

**Deliverables:** complete deployment-global Applications UI with no tenant mislabeling.

**Verify:** `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 5: Organization OIDC Clients Workspace

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — selected-organization clients, configuration, lifecycle, and secrets only

### Step 5.1: Specification Tests

**Reference**: [03-05](03-05-oidc-clients-workspace.md) · ST-39–ST-52 · AR-3, AR-7

- [ ] 5.1.1 [spec-author] Add client list/detail/context/capability and lifecycle workspace specifications — Admin client workspace spec tests
- [ ] 5.1.2 [spec-author] Add entry-tab, vertical Scroller, collection DataGrid row-action, exact field-boundary, server-default, mutation reload/failure, secret metadata, and non-editable one-time plaintext specifications — Admin client dialog spec tests
- [ ] 5.1.3 Run ST-39–ST-52 against unchanged client UI and record expected red

### Step 5.2: Implementation and Green Phase

- [ ] 5.2.1 Implement the full-height organization client DataGrid and complete client detail with application-name/ID fallback — client workspace files
- [ ] 5.2.2 Implement the movable Layout DSL `TabView` dialog with explicit entry tabs, vertical `Scroller`, and DataGrid-backed URI/origin Add/Edit/Remove actions — client dialog files
- [ ] 5.2.3 Implement lifecycle, metadata-only secret management, rotation/revoke, legacy transition, and non-editable one-time warning dialogs without an application Copy action — client dialog/workspace files
- [ ] 5.2.4 Run ST-39–ST-52 green without changing expectations

### Step 5.3: Implementation Tests and Verification

- [ ] 5.3.1 Add tabs, bounds, protocol combinations, single-line geometry, secret cleanup, focus, mouse, resize, modal teardown, and redraw implementation tests; run CLI verify and Node 24 LTS `yarn verify`

**Deliverables:** complete selected-organization OIDC Clients UI and one-time secret handling.

**Verify:** `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 6: Shell Integration, Packed Journey, Docs, and Assurance

> **Phase baseline tree**: _(recorded by exec-plan at phase start)_
> **Scope mode**: strict — existing shell, playground, public docs, and registered gates only

### Step 6.1: Specification Tests

**Reference**: [03-06](03-06-application-integration.md) · ST-25–ST-27, ST-39, ST-50–ST-53 · AR-6

- [ ] 6.1.1 [spec-author] Add the named shell/runtime specification for navigation, exact control inventory, organization/session transition, command ownership, focus, resize, reauthentication, and quit — `packages/cli/tests/admin/application-client-runtime.spec.test.ts`
- [ ] 6.1.2 [spec-author] Extend the packed Admin UI specification through application/module and organization client/secret operations with exact cleanup and terminal restoration — playground E2E spec
- [ ] 6.1.3 Run the focused shell and packed specifications against unchanged integration and record expected red

### Step 6.2: Implementation and Green Phase

- [ ] 6.2.1 Add the small feature-specific `application-client-features.ts` composition module and wire commands, permission-aware menus, controllers, workspace mounting, transitions, dialog ownership, focus, resize, reauthentication, quit, and disposal without further growing the shell entrypoint
- [ ] 6.2.2 Extend the existing packed PTY journey and owned cleanup without adding another harness — playground journey support
- [ ] 6.2.3 Run shell specifications and ST-53 on Node 24 LTS; make them green without changing expectations

### Step 6.3: Implementation Tests and Completion Gates

- [ ] 6.3.1 Update focused public Admin UI/operator/SDK/CLI documentation, including global ownership, the 10-active-secret safety bound and upgrade precondition, and AR-7's legacy transition; run every exact final command in 07 except clean-commit compatibility
- [ ] 6.3.2 Using the git-commit skill in the execution-selected commit mode, obtain a clean committed revision; run `yarn assurance:compat --select p1-admin` and `yarn assurance:compat --select protocol`, review their result taxonomy/provenance, update execution evidence and roadmap, and complete only if every required gate qualifies

**Deliverables:** fully integrated workspaces, packed proof, truthful docs, clean compatibility evidence, and synchronized roadmap.

**Verify:** every final command in 07's Exact Integration and Assurance Commands table, with both
compatibility selectors run from the clean auto-committed revision

---

## Dependencies

```text
Phase 1 server truth
    ↓
Phase 2 public SDK/CLI truth
    ↓
Phase 3 validated Admin workflows
    ├──→ Phase 4 Applications UI
    └──→ Phase 5 OIDC Clients UI
                 ↓
          Phase 6 integration and evidence
```

## Success Criteria

The feature is complete when:

1. All 49 tasks are verified and marked complete.
2. Every named specification case in 07 remains unchanged and passes.
3. Every exact phase and final command in 07 passes on Node 24 LTS.
4. Clean committed `p1-admin` and `protocol` compatibility results have qualified provenance and
   no unreviewed blocked/failure outcome.
5. No plaintext secret enters persistent UI state, logs, generated artifacts, or commits.
6. No generalized UI framework, unrelated feature, dependency, workflow, or runtime matrix is added.
7. Documentation and the Admin UI roadmap reflect the completed implementation.
