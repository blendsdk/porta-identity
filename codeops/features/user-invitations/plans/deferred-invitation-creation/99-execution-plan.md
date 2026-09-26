# Execution Plan: Deferred Invitation Creation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-26 20:53
> **Progress**: 31/68 tasks (46%)
> **CodeOps Artifact Schema**: 1

## Overview

Stop creating a user account at invite time. The invitation becomes an email/org-keyed, single-use,
TTL-bounded token; the user is created when the invitation is accepted, inside one transaction. The
work covers the migration, token repository, acceptance service, invite/accept routes, confirmation
page, SDK/CLI/Admin UI contract, documentation, security coverage, full verification, and a final
gated release phase.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| ----- | ----- | ----- |
| 1 | Invitation storage foundation | 12 |
| 2 | Invite and accept routes, confirmation page | 19 |
| 3 | SDK, CLI, and Admin UI contract | 16 |
| 4 | Documentation | 5 |
| 5 | Security hardening and coverage | 4 |
| 6 | Full verification | 6 |
| 7 | Release (gated) | 6 |

**Total: 68 tasks across 7 phases** (scope bounded by the task-size criteria; no fabricated hour
estimates)

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp —
>    `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` —
>    `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** (`> **Progress**: X/Y tasks (Z%)`) and the Last Updated stamp
>    after EVERY task — never batch updates. Only `[x]` counts as complete.
> 4. **Resume** by scanning the phase sections top-to-bottom: the first `[~]` task is resumed first,
>    else the first `[ ]` task.
> 5. **On blocker:** mark the task `[!]` and append `Blocked: <short reason>` on the same line. The
>    plan lifecycle is `Ready`, `Executing`, `Done`, or `Blocked`, derived from these markers.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'` — never invented. Failure to keep the marks current
> means progress is invisible after crashes, context resets, or session handoffs.

---

## Phase 1: Invitation storage foundation

> **Phase baseline tree**: base `8d0035d6`; at phase start the worktree carried only `codeops/00-roadmap.md` (modified) plus the untracked `codeops/features/user-invitations/` plan set. No product files were modified.

### Step 1.1: Specification tests (BEFORE implementation)

**Reference**: [03-01](03-01-invitation-data-model.md) · [07](07-testing-strategy.md) ST-1–ST-4, ST-16, ST-17, ST-21–ST-23, ST-25, ST-26 · AR-3, AR-4, AR-10, AR-12

- [x] 1.1.1 [spec-author] Write migration spec tests (ST-1) — `packages/server/tests/integration/migrations/invitation-deferral.spec.test.ts` ✅ (completed: 2026-09-26 20:22)
- [x] 1.1.2 [spec-author] Write token-repository spec tests (ST-2–ST-4) — `packages/server/tests/unit/auth/invitation-token-repository.spec.test.ts` ✅ (completed: 2026-09-26 20:22)
- [x] 1.1.3 [spec-author] Write acceptance-service spec tests (ST-16, ST-17, ST-21–ST-23, ST-25, ST-26) — `packages/server/tests/integration/services/invitation-deferred-acceptance.spec.test.ts` ✅ (completed: 2026-09-26 20:22)
- [x] 1.1.4 Run the new spec tests and record the red-phase failures ✅ (completed: 2026-09-26 20:22)

### Step 1.2: Implementation

**Reference**: [03-01](03-01-invitation-data-model.md) · AR-3, AR-4, AR-10, AR-12

- [x] 1.2.1 Add migration `033_invitation_deferred_user_creation.sql` — `packages/server/migrations/033_invitation_deferred_user_creation.sql` ✅ (completed: 2026-09-26 20:23)
- [x] 1.2.2 Add deferred invitation storage: `DeferredInvitationTokenRecord`, `replaceInvitation`, `findDeferredInvitationToken` (org match), `lockValidInvitationForUpdate`, `consumeInvitation`; keep the legacy user-joined lookup and insert until Phase 2 — `packages/server/src/auth/token-repository.ts` ✅ (completed: 2026-09-26 20:23)
- [x] 1.2.3 Add transaction-aware user helpers: `insertUserWithClient`, `emailExistsWithClient`; make `insertUser` delegate — `packages/server/src/users/repository.ts` ✅ (completed: 2026-09-26 20:23)
- [x] 1.2.4 Add `acceptInvitation` transaction and export it — `packages/server/src/users/invitation-service.ts`, `packages/server/src/users/index.ts` ✅ (completed: 2026-09-26 20:23)
- [x] 1.2.5 Run the spec tests and confirm they pass (green phase) ✅ (completed: 2026-09-26 20:23)

### Step 1.3: Implementation tests and verification

**Reference**: [07](07-testing-strategy.md) implementation-test table

- [x] 1.3.1 Write implementation tests for transaction ordering, rollback, single-use, and the concurrent replace conflict — `packages/server/tests/unit/users/invitation-service.impl.test.ts` ✅ (completed: 2026-09-26 20:36)
- [x] 1.3.2 Extend existing token-repository tests for the replaced predicates — `packages/server/tests/unit/auth/token-repository.test.ts` ✅ (completed: 2026-09-26 20:36)
- [x] 1.3.3 Phase verification: `yarn workspace @portaidentity/server test:unit && yarn workspace @portaidentity/server test:integration && yarn workspace @portaidentity/server typecheck` ✅ (completed: 2026-09-26 20:36)

**Deliverables**:
- [x] Migration, repository, and acceptance service implemented ✅ (completed: 2026-09-26 20:36)
- [x] All Phase 1 spec and implementation tests passing ✅ (completed: 2026-09-26 20:36)
- [x] Server typecheck passes (legacy token API still compiles) ✅ (completed: 2026-09-26 20:36)

**Verify**: `yarn workspace @portaidentity/server test:unit && yarn workspace @portaidentity/server test:integration && yarn workspace @portaidentity/server typecheck`

---

## Phase 2: Invite and accept routes, confirmation page

> **Phase baseline tree**: _(recorded by the exec-plan skill)_

### Step 2.1: Specification tests (BEFORE implementation)

**Reference**: [03-02](03-02-accept-flow-and-routes.md) · [07](07-testing-strategy.md) ST-5–ST-15, ST-18–ST-20, ST-24, ST-34 · AR-5, AR-6, AR-7, AR-8, AR-11, AR-16

- [x] 2.1.1 [spec-author] Write invite-route spec tests (ST-5–ST-9, ST-34) — `packages/server/tests/unit/routes/invitation-deferral.spec.test.ts` ✅ (completed: 2026-09-26 20:40)
- [x] 2.1.2 [spec-author] Write accept GET spec tests (ST-10–ST-15) — same file ✅ (completed: 2026-09-26 20:40)
- [x] 2.1.3 [spec-author] Write accept POST route error-path spec tests (ST-18–ST-20, ST-24) — same file ✅ (completed: 2026-09-26 20:40)
- [x] 2.1.4 Run the new route spec tests and record the red-phase failures ✅ (completed: 2026-09-26 20:40)

### Step 2.2: Implementation

**Reference**: [03-02](03-02-accept-flow-and-routes.md)

- [x] 2.2.1 Replace create-at-invite with `replaceInvitation` and the new response body; map a concurrent replace conflict to `409` — `packages/server/src/routes/users.ts` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.2 Allow the invitation email to send without a user row: optional recipient id, `userId`-free audit with `invitationId` metadata, and drop the preview placeholder id — `packages/server/src/auth/email-service.ts`, `packages/server/src/routes/users.ts` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.3 Add the confirmation step to the accept GET and the email-conflict rejection — `packages/server/src/routes/invitation.ts` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.4 Route the accept POST through `acceptInvitation`; pass the created user id to `applyPreAssignments` — `packages/server/src/routes/invitation.ts` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.5 Add the confirmation page template — `packages/server/templates/default/pages/confirm-invite.hbs` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.6 Add confirmation locale keys and pass `orgName` on both GET renders — `packages/server/locales/default/en/invitation.json` ✅ (completed: 2026-09-26 20:43)
- [x] 2.2.7 Run the new route spec tests and confirm they pass (green phase) ✅ (completed: 2026-09-26 20:43)

### Step 2.3: Test migration, legacy removal, verification

**Reference**: [07](07-testing-strategy.md) ST-10–ST-15, ST-18–ST-20

- [x] 2.3.1 Write route implementation tests for edge and error paths — `packages/server/tests/unit/routes/invitation.impl.test.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.2 Update the email-service tests for the deferred recipient — `packages/server/tests/unit/auth/email-service.test.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.3 Update the existing invite and accept unit tests that mock the token repository to the deferred API — `packages/server/tests/unit/routes/invitation.test.ts`, `packages/server/tests/unit/routes/users.test.ts`, `packages/server/tests/unit/auth/system-config-consumers.spec.test.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.4 Update the UI fixture and global setup to create invitation records instead of users — `packages/server/tests/ui/fixtures/db-helpers.ts`, `packages/server/tests/ui/setup/global-setup.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.5 Update the browser invitation flow for the confirmation step — `packages/server/tests/ui/flows/invitation.spec.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.6 Update the integration specs that seed invitations to the deferred API — `packages/server/tests/integration/services/invitation-enhanced.test.ts`, `packages/server/tests/integration/services/invitation-deleted-preassignments.spec.test.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.7 Rename the deferred API to the final `InvitationTokenRecord`/`findValidInvitationToken`, remove the legacy user-joined lookup and `insertInvitationToken`, and confirm no consumer imports remain — `packages/server/src/auth/token-repository.ts`, `packages/server/src/routes/invitation.ts`, `packages/server/src/routes/users.ts` ✅ (completed: 2026-09-26 20:53)
- [x] 2.3.8 Phase verification: `yarn workspace @portaidentity/server test:unit && yarn test:structure && yarn workspace @portaidentity/server typecheck` ✅ (completed: 2026-09-26 20:53)

**Deliverables**:
- [x] Invite route creates no user ✅ (completed: 2026-09-26 20:53)
- [x] Confirmation page before the password form ✅ (completed: 2026-09-26 20:53)
- [x] All Phase 2 tests passing ✅ (completed: 2026-09-26 20:53)
- [x] Legacy token API removed; server typecheck passes ✅ (completed: 2026-09-26 20:53)

**Verify**: `yarn workspace @portaidentity/server test:unit && yarn test:structure && yarn workspace @portaidentity/server typecheck`

---

## Phase 3: SDK, CLI, and Admin UI contract

> **Phase baseline tree**: _(recorded by the exec-plan skill)_

### Step 3.1: Specification tests (BEFORE implementation)

**Reference**: [03-03](03-03-contracts-cli-admin-docs.md) · [07](07-testing-strategy.md) ST-27–ST-29 · AR-7, AR-19

- [ ] 3.1.1 [spec-author] Update the SDK result contract tests (ST-27) — `packages/sdk/tests/type-contracts/users-contract.spec.test.ts`, `packages/sdk/tests/domains/users-contract.spec.test.ts`, `packages/sdk/tests/agent/agent.test.ts`
- [ ] 3.1.2 [spec-author] Update the CLI invite contract tests (ST-28) — `packages/cli/tests/commands/user-contract.spec.test.ts`
- [ ] 3.1.3 [spec-author] Update the Admin UI invite result tests (ST-29) — `packages/cli/tests/admin/user-service.spec.test.ts`, `packages/cli/tests/admin/user-dialogs.spec.test.ts`
- [ ] 3.1.4 Run the updated spec tests and record the red-phase failures

### Step 3.2: Implementation

**Reference**: [03-03](03-03-contracts-cli-admin-docs.md)

- [ ] 3.2.1 Change `InviteUserResult` to the new shape — `packages/sdk/src/types/users.ts`
- [ ] 3.2.2 Update CLI invite output and wording — `packages/cli/src/commands/user.ts`
- [ ] 3.2.3 Update Admin UI types and the response validator to the new shape — `packages/cli/src/admin/user-service-types.ts`, `packages/cli/src/admin/user-service.ts`
- [ ] 3.2.4 Remove the post-invite user reconcile and update success copy/state — `packages/cli/src/admin/user-controller.ts`, `packages/cli/src/admin/user-state.ts`, `packages/cli/src/admin/index.ts`
- [ ] 3.2.5 Update the assurance harness issuance step: parse `invitationId` and stop expecting a pre-acceptance user id — `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts`
- [ ] 3.2.6 Update the assurance harness presentation step: follow the confirmation page to `?step=password` before submitting — same file
- [ ] 3.2.7 Update the assurance harness consumption and expiry steps: resolve the accepted account through the admin users search and capture state around it — same file
- [ ] 3.2.8 Run the spec tests and confirm they pass (green phase)
- [ ] 3.2.9 Write/extend implementation tests for the validator and output — `packages/cli/tests/admin/user-service.impl.test.ts`, `packages/cli/tests/commands/user.test.ts`

### Step 3.3: Descriptor polish and verification

- [ ] 3.3.1 Update the SDK agent descriptor text if it references the old fields — `packages/sdk/src/agent.ts`
- [ ] 3.3.2 Phase verification: `yarn workspace @portaidentity/sdk verify && yarn workspace @portaidentity/cli verify`
- [ ] 3.3.3 Root type and lint verification (includes `test-harness`): `yarn typecheck && yarn lint`

**Deliverables**:
- [ ] SDK/CLI/Admin UI expose `{ invitationId, email, invitationSent, expiresAt }`
- [ ] Assurance harness follows the confirmation step and validates the post-acceptance account

**Verify**: `yarn workspace @portaidentity/sdk verify && yarn workspace @portaidentity/cli verify && yarn typecheck && yarn lint`

---

## Phase 4: Documentation

> **Phase baseline tree**: _(recorded by the exec-plan skill)_

**Reference**: [03-03](03-03-contracts-cli-admin-docs.md) · AR-22

- [ ] 4.1.1 Rewrite the invite API section and the status-lifecycle note — `docs/api/users.md`
- [ ] 4.1.2 Update SDK and CLI guides — `docs/guide/sdk.md`, `docs/cli/users.md`
- [ ] 4.1.3 Update the audit event description — `docs/api/audit.md`
- [ ] 4.1.4 Update the invitation token data model — `techdocs/architecture/data-model.md`
- [ ] 4.1.5 Phase verification: `yarn docs:build && yarn test:structure`

**Deliverables**:
- [ ] Documentation matches deferred creation and the new result shape

**Verify**: `yarn docs:build && yarn test:structure`

---

## Phase 5: Security hardening and coverage

> **Phase baseline tree**: _(recorded by the exec-plan skill)_

### Step 5.1: Security specification tests and coverage

**Reference**: [07](07-testing-strategy.md) ST-30–ST-32 · AR-8, AR-9, AR-16

- [ ] 5.1.1 [spec-author] Write enumeration-resistance specs: unknown, expired, foreign, and email-conflict all render identically — `packages/server/tests/unit/security/invitation-enumeration.spec.test.ts`
- [ ] 5.1.2 Add invitation replay, cross-tenant, and email-conflict penetration coverage — `packages/server/tests/pentest/auth-bypass/`
- [ ] 5.1.3 Assert the plaintext token never reaches logs and only its hash is stored — same security spec file
- [ ] 5.1.4 Phase verification: `yarn test:pentest && yarn lint && yarn typecheck`

**Deliverables**:
- [ ] Enumeration, replay, and token-storage assertions in place

**Verify**: `yarn test:pentest && yarn lint && yarn typecheck`

---

## Phase 6: Full verification

**Reference**: `AGENTS.md` verification workflow · AR-25, AR-26

- [ ] 6.1.1 No-dead-code sweep: remove the create-at-invite remnants, unused imports, and stale fixtures; confirm no `userId`/`created` references remain
- [ ] 6.1.2 Full repository verification: `yarn verify`
- [ ] 6.1.3 Browser verification: `yarn test:ui`
- [ ] 6.1.4 Commit a clean checkpoint (use the git-commit skill), then run the packed-client compatibility gate: `yarn assurance:compat --select tenant-admin`
- [ ] 6.1.5 Production-security assurance: `yarn assurance:harness --project security --profile production-security`
- [ ] 6.1.6 Documentation and format gates: `yarn docs:build && yarn format:check`

**Deliverables**:
- [ ] All verification commands pass; no dead code; clean committed revision for compat

**Verify**: `yarn verify && yarn test:ui && yarn assurance:compat --select tenant-admin && yarn assurance:harness --project security --profile production-security`

> **Note:** `assurance:compat` and `assurance:harness` require PostgreSQL, Redis, MailHog, Docker,
> and a clean committed worktree. `assurance:harness` result semantics follow the repository's exit
> taxonomy; review the artifact rather than treating a nonzero value as an automatic test failure.

---

## Phase 7: Release (gated)

> **Phase baseline tree**: _(recorded by the exec-plan skill)_

**Reference**: [01](01-requirements.md) acceptance criteria · AR-25

> **Gate:** this phase changes `main` and triggers publication. It must not be executed as an
> ordinary task. The `develop` → `main` merge and the Release dispatch each require explicit user
> authorization at execution time.

- [ ] 7.1.1 Commit the verified work and push the feature branch (git-commit skill, push mode)
- [ ] 7.1.2 Open a pull request from the feature branch into `develop` and merge it through the repository flow
- [ ] 7.1.3 Confirm the `Build and Test` workflow is green on `develop` HEAD
- [ ] 7.1.4 With explicit authorization, integrate `develop` into `main` through the repository's designated flow and confirm `Build and Test` is green on `main`
- [ ] 7.1.5 With explicit authorization, dispatch the manual `Release` workflow on `main` (this is the publication authorization)
- [ ] 7.1.6 Verify the published artifacts: npm packages with provenance, the GitHub Release, the Docker image, and the `develop` sync

**Deliverables**:
- [ ] Feature released on `main`
- [ ] `develop` synchronized

**Verify**: Release workflow completes successfully; published version and GitHub Release exist; Docker image dispatched; `develop` synced.

---

## Dependencies

```
Phase 1 (storage)
    ↓
Phase 2 (routes)
    ↓
Phase 3 (contracts)
    ↓
Phase 4 (docs)
    ↓
Phase 5 (security coverage)
    ↓
Phase 6 (full verification)
    ↓
Phase 7 (release, gated)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`, `yarn test:ui`, `yarn assurance:compat --select tenant-admin`, `yarn assurance:harness --project security --profile production-security`)
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules
5. ✅ Security hardened — enumeration-safe rejections, single-use tokens, transactional acceptance, parameterized SQL
6. ✅ Documentation updated and `yarn docs:build` passing
7. ✅ Code reviewed through the repository quality loop
8. ✅ Post-completion project re-analysis (handled by the exec-plan skill)
