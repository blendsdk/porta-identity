# Execution Plan: Applications and OIDC Clients

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-30 18:38
> **Progress**: 41/49 tasks (84%)
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

> **Phase baseline tree**: `69319bb66147243e3a4b8b4bf3f253d04f34c88f`
> **Scope mode**: strict — focused RD-04 validation, nested ownership, App Admin permission, PKCE,
> and overlapping-secret corrections only
> **Expected modification set**: `packages/server/src/`, `packages/server/tests/`,
> `packages/server/migrations/`, the server test-inventory structure assertion, this execution plan,
> and incremental maintainer architecture docs

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-server-safety-and-data.md) · server ST-01–ST-15B · AR-4, AR-5, AR-7, AR-8

- [x] 1.1.1 [spec-author] Add immutable validation, dual-permission, secret parent/state and 10-active bound, migration-precondition, lifecycle-runtime, and PKCE specifications — focused server `*.spec.test.ts` files ✅ (completed: 2026-08-30 12:50)
- [x] 1.1.2 [spec-author] Add real-provider Basic/post overlap, legacy, revocation, expiry, and failure specifications plus the focused deterministic middleware handoff specification — named integration files from 07 ✅ (completed: 2026-08-30 12:52)
- [x] 1.1.3 Run every server ST case against unchanged production code and record the expected-red boundary without changing expectations ✅ (completed: 2026-08-30 12:54)

  Expected-red evidence: Node 24 focused Vitest collected 50 cases across all nine Phase 1
  specification files; 38 failed on the missing approved behavior and 12 passed against unchanged
  production code. ESLint and server typecheck passed. No expectation changed.

### Step 1.2: Implementation and Green Phase

- [x] 1.2.1 Share the protocol/URI/origin compatibility validator between Admin routes and import, and align provider PKCE metadata — client validators, Admin routes, import, OIDC configuration ✅ (completed: 2026-08-30 12:58)
- [x] 1.2.2 Enforce client-create's two permissions; confidential/non-revoked secret list/mutation state; the atomic 10-active-secret bound in a short parent-row-lock transaction; and parent-qualified module/secret operations — application/client modules ✅ (completed: 2026-08-30 13:17)
- [x] 1.2.3 Add `admin:org:read` to App Admin and add the ordered idempotent migration with the no-mutation over-10 active-secret precondition — admin permissions and migration ✅ (completed: 2026-08-30 13:01)
- [x] 1.2.4 Implement indexed modern matching, at-most-10 sequential legacy checks, non-queuing single-batch admission, the existing 30-per-5-minute issuer/client Redis limit, fixed 429/Retry-After denial without credential classification, and canonicalization without replacing provider authentication — secret service/repository, post-parse guard, and middleware ✅ (completed: 2026-08-30 13:17)
- [x] 1.2.5 Run every server ST case and make the implementation green without changing expectations ✅ (completed: 2026-08-30 13:18)

### Step 1.3: Implementation Tests and Verification

- [x] 1.3.1 Add focused implementation tests for validator branches, parent-qualified SQL, migration idempotency, indexed/legacy verification work bounds, fail-closed dependencies, and AR-8's deferred-dependency middleware handoff ✅ (completed: 2026-08-30 13:23)
- [x] 1.3.2 Run the exact Phase 1 commands in 07, including browser, retained OIDC, protocol assurance, and Node 24 LTS `yarn verify` ✅ (completed: 2026-08-30 13:52)

  Verification evidence: unit 2,904/2,904; integration 386/386; E2E 128/128; pentest 224/224;
  browser 132/132; retained SPA/BFF harness 6/6; protocol assurance 15/15; Node 24 root
  `yarn verify` passed after the server test-inventory assertion was mechanically updated from 253
  to 266 files. The initial unit rerun exposed 35 compatibility/mock regressions; all were fixed
  without changing immutable expectations before the complete gate sequence passed. After the
  independent phase review, focused fixes passed 150 tests, a final Node 24 `yarn verify`, the
  retained harness 6/6, and operational protocol assurance 15/15.

**Deliverables:** truthful protocol validation, parent integrity, usable App Admin, and safe overlapping-secret runtime.

**Verify:** every Phase 1 command in 07's Exact Integration and Assurance Commands table

---

## Phase 2: SDK and Conventional CLI Contracts

> **Phase baseline tree**: `605722dfa75b86fc94c52f2f1f45e7beff2eefe8`
> **Scope mode**: strict — current application/client SDK and existing conventional CLI consumers only
> **Expected modification set**: `packages/sdk/src/domains/applications.ts`,
> `packages/sdk/src/domains/clients.ts`, their public application/client types and focused tests;
> existing application/module/client/secret command files and focused tests under `packages/cli/`;
> this execution plan and the phase review record

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-sdk-and-cli-contracts.md) · ST-16–ST-23 · AR-1, AR-2

- [x] 2.1.1 [spec-author] Add immutable SDK application/client type and transport contract specifications, including a focused TypeScript oracle where exact absence matters — SDK tests ✅ (completed: 2026-08-30 14:44)
- [x] 2.1.2 [spec-author] Add conventional CLI contract specifications for every exact application, module, client, and secret command inventoried in 03-02 — CLI command tests ✅ (completed: 2026-08-30 14:43)
- [x] 2.1.3 Run ST-16–ST-23 against unchanged public contracts and record expected red ✅ (completed: 2026-08-30 14:44)

  Expected-red evidence: Node 24 focused Vitest collected 20 SDK cases (12 passed, 8 failed) and
  23 conventional CLI cases (10 passed, 13 failed). The permanent SDK TypeScript oracle reported
  20 diagnostics for the stale public shapes and absent/present operations. Failures were limited
  to the approved lifecycle, nested-route, field-name, response-wrapper, and removed-surface gaps;
  focused lint passed and no production expectation changed.

### Step 2.2: Implementation and Green Phase

- [x] 2.2.1 Correct documented public application/module types and domain operations — SDK types and `domains/applications.ts` ✅ (completed: 2026-08-30 14:49)
- [x] 2.2.2 Correct documented public client/secret types, response wrappers, and domain operations — SDK types and `domains/clients.ts` ✅ (completed: 2026-08-30 14:49)
- [x] 2.2.3 Align existing conventional application/client CLI commands and fixtures with the corrected SDK without adding command families — CLI commands/tests ✅ (completed: 2026-08-30 14:49)
- [x] 2.2.4 Run ST-16–ST-23 and make the implementation green without changing expectations ✅ (completed: 2026-08-30 14:49)

  Green evidence: Node 24 focused SDK specifications passed 20/20, conventional CLI
  specifications passed 23/23, the permanent SDK TypeScript oracle passed, SDK and CLI lint passed,
  and CLI typecheck passed after the ignored SDK build refreshed local declarations.

### Step 2.3: Implementation Tests and Verification

- [x] 2.3.1 Add SDK/CLI implementation regressions for serialization, pagination rejection, wrappers, IDs, optional secrets, and fixed output, then run both package verifies and Node 24 LTS `yarn verify` ✅ (completed: 2026-08-30 15:06)

  Verification evidence: final SDK verify passed 455/455 tests; final CLI verify passed 792/792
  tests; focused server route regressions passed 33/33; SDK, CLI, and server lint/typecheck passed;
  repository structure passed 96/96 after its physical-file inventory was mechanically updated to
  38 SDK and 59 CLI tests; final Node 24 root `yarn verify` passed in 11m39s. Independent review
  fixes validated response envelopes and secret wrappers, internal UUID targeting, terminal-safe
  human output and prompts, closed public aliases, empty JSON output, and complete client-list
  projections. The permitted final re-review accepted every fix; no critical or major finding
  remains. The incremental techdocs hook required no change because Phase 2 corrected existing
  public contracts without changing system architecture.

**Deliverables:** accurate public application/client contracts and aligned current CLI consumers.

**Verify:** focused TypeScript oracle · `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 3: Admin State, Services, and Controllers

> **Phase baseline tree**: `b6ab2c17fdc06bdc250f6d7e1acfcf39ea01c7fd`
> **Scope mode**: strict — two feature-specific immutable workflows; no generalized framework,
> persistence, polling, or multi-operator coordination

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-admin-state-services.md) · ST-24–ST-31 · AR-2

- [x] 3.1.1 [spec-author] Add immutable application/client validation, all-or-nothing list, fixed-failure, context ownership, capability parsing, production SDK injection, and session-operation specifications — Admin service/state spec tests ✅ (completed: 2026-08-30 15:51)
- [x] 3.1.2 [spec-author] Add controller specifications for capability recheck, duplicate activation, refresh replay, indeterminate reconciliation, late results, and plaintext disposal — Admin controller spec tests ✅ (completed: 2026-08-30 15:51)
- [x] 3.1.3 Run ST-24–ST-31 against unchanged Admin UI and record expected red ✅ (completed: 2026-08-30 15:51)

  Expected-red evidence: Node 24 focused Vitest collected 58 immutable cases and failed all 58
  against unchanged Phase 3 production code. Fifty-four failures identify the four absent
  feature-local service/controller modules, two identify absent application/client capability
  parsing, and two identify absent production session-domain injection. Focused ESLint and diff
  checks passed; no expectation changed.

### Step 3.2: Implementation and Green Phase

- [x] 3.2.1 Add immutable application/client projections, bounded validators, fixed failures, and the minimal feature-local workspace/dialog contracts controllers require — Admin state/type and contract files ✅ (completed: 2026-08-30 16:03)
- [x] 3.2.2 Add thin SDK services plus production capability parsing, application/client domain injection, and session operations with whole-response validation — Admin service/session files ✅ (completed: 2026-08-30 16:03)
- [x] 3.2.3 Add the feature-specific application and client controller foundations for list loading, generation, dialog, capability, context, and reconciliation ownership; add intent-specific methods with their concrete Phase 4/5 views — Admin controller files ✅ (completed: 2026-08-30 16:03)
- [x] 3.2.4 Run ST-24–ST-31 and make the implementation green without changing expectations ✅ (completed: 2026-08-30 16:03)

### Step 3.3: Implementation Tests and Verification

- [x] 3.3.1 Add implementation regressions for hostile responses, generation races, aborts, refresh, retained projections, and every plaintext terminal transition; run CLI verify and Node 24 LTS `yarn verify` ✅ (completed: 2026-08-30 16:42)

  Verification evidence: the immutable Phase 3 oracle passed 58/58 and the combined focused suite
  passed 84/84 after independent-review fixes. CLI verify passed 873/873; repository structure
  passed 96/96; final Node 24 `yarn verify` passed with SDK 455/455, CLI 873/873, server unit
  2,913/2,913, integration 392/392, E2E 128/128, and pentest 224/224. Correctness and security
  re-review accepted every fix; no critical or major finding remains.

**Deliverables:** validated global application and organization client workflows independent of rendering.

**Verify:** `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 4: Global Applications Workspace

> **Phase baseline tree**: `f694491ed00c8527ddbd9fdca1db82ff9a3e4d1c`
> **Scope mode**: strict — Applications list/detail/modules/lifecycle UI using existing JSVision patterns
> **Expected modification set**: application workspace/dialog/controller/state files and their focused
> tests under `packages/cli/`; the CLI test-inventory structure assertion; this execution plan,
> phase review evidence, and incremental maintainer architecture docs

### Step 4.1: Specification Tests

**Reference**: [03-04](03-04-applications-workspace.md) · ST-32–ST-38, ST-50–ST-52 · AR-2

- [x] 4.1.1 [spec-author] Add application DataGrid, exact field-boundary, authoritative mutation reload/failure, detail, global notice, capability, module, lifecycle, focus, movement, resize, and redraw specifications — Admin workspace/dialog spec tests ✅ (completed: 2026-08-30 17:00)
- [x] 4.1.2 Run the focused Applications workspace/dialog specifications and record expected red ✅ (completed: 2026-08-30 17:00; expected red: missing application workspace/dialog modules)

### Step 4.2: Implementation and Green Phase

- [x] 4.2.1 Implement the full-height global application DataGrid, detail/module projection, and matching controller intents with Layout DSL — application workspace/controller files ✅ (completed: 2026-08-30 17:34; review remediation verified)
- [x] 4.2.2 Implement movable create/edit and exact lifecycle confirmation dialogs with one-row inputs and visible-disabled controller actions — application dialog/controller files ✅ (completed: 2026-08-30 17:34; review remediation verified)
- [x] 4.2.3 Implement movable module create/edit/deactivate dialogs and parent-safe controller intents — application dialog/workspace/controller files ✅ (completed: 2026-08-30 17:34; review remediation verified)
- [x] 4.2.4 Run ST-32–ST-38 and applicable ST-50–ST-52 cases green without changing expectations ✅ (completed: 2026-08-30 17:34; 87 focused application/state tests passing)

### Step 4.3: Implementation Tests and Verification

- [x] 4.3.1 Add geometry, DataGrid, focus, mouse, modal teardown, small-terminal, and artifact-free redraw implementation tests; run CLI verify and Node 24 LTS `yarn verify` ✅ (completed: 2026-08-30 17:48; post-fix CLI 905 tests and full Node 24 verification passed)

**Deliverables:** complete deployment-global Applications UI with no tenant mislabeling.

**Verify:** `yarn workspace @portaidentity/cli verify` · Node 24 LTS `yarn verify`

---

## Phase 5: Organization OIDC Clients Workspace

> **Phase baseline tree**: `89940b63fbdbf443746d8877bd46699f48bf8755`
> **Scope mode**: strict — selected-organization clients, configuration, lifecycle, and secrets only
> **Expected modification set**: client workspace/dialog/controller/state files and their focused
> tests under `packages/cli/`; the CLI test-inventory structure assertion; this execution plan,
> phase review evidence, and incremental maintainer architecture docs

### Step 5.1: Specification Tests

**Reference**: [03-05](03-05-oidc-clients-workspace.md) · ST-39–ST-52 · AR-3, AR-7

- [x] 5.1.1 [spec-author] Add client list/detail/context/capability and lifecycle workspace specifications — Admin client workspace spec tests ✅ (completed: 2026-08-30 17:56)
- [x] 5.1.2 [spec-author] Add entry-tab, vertical Scroller, collection DataGrid row-action, exact field-boundary, server-default, mutation reload/failure, secret metadata, and non-editable one-time plaintext specifications — Admin client dialog spec tests ✅ (completed: 2026-08-30 17:56)
- [x] 5.1.3 Run ST-39–ST-52 against unchanged client UI and record expected red ✅ (completed: 2026-08-30 17:56; 55 expected-red failures: 9 missing client workspace, 46 missing client dialogs)

### Step 5.2: Implementation and Green Phase

- [x] 5.2.1 Implement the full-height organization client DataGrid, complete client detail with application-name/ID fallback, and matching controller intents — client workspace/controller files ✅ (completed: 2026-08-30 18:38)
- [x] 5.2.2 Implement the movable Layout DSL `TabView` dialog with explicit entry tabs, vertical `Scroller`, DataGrid-backed URI/origin Add/Edit/Remove actions, and bounded update intents — client dialog/controller files ✅ (completed: 2026-08-30 18:38)
- [x] 5.2.3 Implement lifecycle, metadata-only secret management, rotation/revoke, legacy transition, and non-editable one-time warning dialogs with their controller intents and without an application Copy action — client dialog/workspace/controller files ✅ (completed: 2026-08-30 18:38)
- [x] 5.2.4 Run ST-39–ST-52 green without changing expectations ✅ (completed: 2026-08-30 18:38; 156 focused client/state tests passed)

### Step 5.3: Implementation Tests and Verification

- [x] 5.3.1 Add tabs, bounds, protocol combinations, single-line geometry, secret cleanup, focus, mouse, resize, modal teardown, and redraw implementation tests; run CLI verify and Node 24 LTS `yarn verify` ✅ (completed: 2026-08-30 18:38; CLI 977 tests and full verification passed)

  Verification evidence: focused client/state suites passed 156/156; CLI verify passed 977/977;
  repository structure passed 96/96; final Node 24 `yarn verify` passed in 11m49s with SDK
  455/455, server unit 2,913/2,913, integration 392/392, E2E 128/128, and pentest 224/224.
  Independent correctness and security re-review accepted every fix with no remaining critical or
  major finding.

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
