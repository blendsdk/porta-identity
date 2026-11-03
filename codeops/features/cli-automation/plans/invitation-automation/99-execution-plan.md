# Execution Plan: CLI Invitation Automation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Implements**: cli-automation/T-01
> **Last Updated**: 2026-11-03 15:52
> **Progress**: 0/49 tasks (0%)
> **Commit mode**: --auto-commit requested; verified green checkpoints only
> **CodeOps Artifact Schema**: 1

## Implementation Phases

| Phase | Title                                              | Tasks |
| ----- | -------------------------------------------------- | ----- |
| 1     | Classified JSON errors across the conventional CLI | 26    |
| 2     | Invitation claim input                             | 10    |
| 3     | Sequential bulk email-file invitations             | 13    |

**Total:49 tasks across3 phases and9 sessions.** Phase1 → phase2 → phase3. No hour estimate is
invented. Each task names a bounded change; larger mechanical caller integration is split into
groups rather than hidden in one refactor (AR-16).

> **Execution rule:** These phase checklists are the sole mutable task authority. Mark a task
> `[~]` immediately after implementation with the real timestamp, then `[x]` only after its
> stated verification passes. Update Progress and Last Updated after every change. Resume the
> first `[~]`, otherwise first `[ ]`. On a blocker use `[!]` plus `Blocked: <reason>` on that task.
> Specification expectations are immutable. An intended-red task's evidence proves red only,
> never a green product or commit. No existing failure may be skipped or retried away.

Execution uses exec-plan and the git-commit skill in push mode, not raw Git instructions in this
document. Auto-commit applies only when all required checkpoint checks are green. Keep intended
red work uncommitted until a green checkpoint; if execution-mode requirements conflict, obtain a
bounded ruling before proceeding rather than publish failing tests or weaken gates. Each phase
must finish independent review/security audit and owned-resource cleanup before phase completion.
Credential/file approvals and any real service creation are checked at execution time, not granted
by this plan. No merge, issue mutation, publishing or deployment is authorized (AR-5/16).

## Phase1: CLI-wide JSON errors

> **Phase baseline tree**: Recorded at execution entry without indexing protected files.
> **Lenses**: api-surface
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — executable output compatibility and sensitive error handling

### Session1.1 — Specifications and red

References:03-01;07 ST-1–15/47;AR-13/16/17. Start with07's first local selection.

- [ ] 1.1.1 [spec-author] Write formatter/human compatibility specifications ST-1–3/7 — `packages/cli/tests/json-errors.spec.test.ts`; verify against07.
- [ ] 1.1.2 [spec-author] Write actual parser/executable specifications ST-5/6/15 — `packages/cli/tests/json-errors-entry.spec.test.ts`; verify no credential access.
- [ ] 1.1.3 [spec-author] Write secret-marker and public SDK auth-provenance specifications ST-4/6/47 — `packages/cli/tests/security/json-error-redaction.spec.test.ts`; verify from03-01 and AR-17, without real credential access.
- [ ] 1.1.4 [spec-author] Write direct-failure/report compatibility specifications ST-8–14 — `packages/cli/tests/commands/json-errors-legacy.spec.test.ts`; verify legacy exits/stdout.
- [ ] 1.1.5 Run07 phase1 selector and record each intended red before implementation; document already-green legacy cases without claiming new behaviour.

### Session1.2 — Implementation and green

References:03-01;AR-13. Each caller group preserves exact legacy semantics and runs its relevant
existing command tests plus the phase1 selector. Do not enlarge scope to fix unrelated exits.

- [ ] 1.2.1 Implement safe envelope/classifier and local input discriminators — `packages/cli/src/error-format.ts`; verify ST-1–4.
- [ ] 1.2.2 Integrate explicit JSON and non-terminating reporting into the existing boundary — `packages/cli/src/error-handler.ts`; verify ST-1–4/7 and existing handler tests.
- [ ] 1.2.3 Implement public-yargs mode resolution and safe parser entry — `packages/cli/src/cli.ts`, `packages/cli/src/index.ts`; verify ST-5/6/15.
- [ ] 1.2.4 Integrate handler JSON options — `packages/cli/src/commands/user.ts`, `user-role.ts`, `user-claim.ts`; verify user command tests and ST-14.
- [ ] 1.2.5 Integrate handler JSON options — `packages/cli/src/commands/org.ts`, `app.ts`; verify their command tests and ST-14.
- [ ] 1.2.6 Integrate handler JSON options — `packages/cli/src/commands/app-role.ts`, `app-permission.ts`, `app-claim.ts`; verify their command tests and ST-14.
- [ ] 1.2.7 Integrate handler JSON options — `packages/cli/src/commands/app-module.ts`, `client.ts`, `client-secret.ts`; verify their command tests and ST-14.
- [ ] 1.2.8 Integrate handler JSON options — `packages/cli/src/commands/keys.ts`, `sessions.ts`, `audit.ts`; verify their command tests and ST-14.
- [ ] 1.2.9 Integrate handlers/direct failures — `packages/cli/src/commands/stats.ts`, `config.ts`, `bulk.ts`; verify ST-9–11/14 and legacy tests.
- [ ] 1.2.10 Integrate handlers/structured rejection summary — `packages/cli/src/commands/exports.ts`, `export.ts`, `import.ts`; verify ST-12/14 and portability tests.
- [ ] 1.2.11 Integrate login/health/missing-credential failures — `packages/cli/src/commands/login.ts`, `health.ts`, `whoami.ts`; verify ST-8/13 and existing auth/health tests.
- [ ] 1.2.12 Add safe JSON diagnostic failure summary — `packages/cli/src/commands/doctor.ts`; verify ST-12 and unchanged report tests.
- [ ] 1.2.13 Audit03-01's complete integration matrix and run phase1 green; update directly affected implementation-test call signatures without changing immutable expectations.

### Session1.3 — Implementation tests, documentation and hardening

- [ ] 1.3.1 Add internal classifier/metadata/mode tests after green — `packages/cli/tests/json-errors.impl.test.ts`; verify03-01 and07.
- [ ] 1.3.2 Document the public error/legacy-exit contract — `docs/cli/overview.md`, `packages/cli/README.md`, relevant `techdocs/` reference; verify links and07 docs build.
- [ ] 1.3.3 Reconcile actual owned CLI test-file inventory — `repo-tests/monorepo/server-package.spec.test.mjs`; run07 checkpoint commands without weakening structure assertions.
- [ ] 1.3.4 Run07 phase1 security gates with registered production-security profile; record exact outcomes and owned cleanup.
- [ ] 1.3.5 Complete independent correctness/API review and dedicated security audit; resolve findings through the authorized ruling gate and record phase1 evidence.
- [ ] 1.3.6 Verify clean green source provenance, run07 packed adjunct with owned cleanup, and checkpoint through git-commit skill in push mode; update this plan immediately.
- [ ] 1.3.7 Validate phase1 docs/evidence links, exact resource restoration and all relevant existing CLI tests; record remaining accepted harness limitations without claiming a full pass.
- [ ] 1.3.8 Re-evaluate phase2 scope/inputs and minimum-sufficient design against AR-12 before continuing; confirm no unauthorized dependency or support machinery entered phase1.

**Deliverable:** R1–R3 and ST-1–15/47, independently reviewed and verified. **Verify:**07 phase1,
checkpoint, security, docs and packed selectors; full root verification belongs to CI.

## Phase2: Invitation claims

> **Phase baseline tree**: Recorded after verified phase1.
> **Lenses**: api-surface
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — JSON parsing and authorization-assignment payloads

### Session2.1 — Specifications and red

- [ ] 2.1.1 [spec-author] Write claim grammar/payload specifications ST-16–23 — `packages/cli/tests/commands/user-invite-claims.spec.test.ts`; verify from03-02, not implementation.
- [ ] 2.1.2 Run07 phase2 selector, record intended red failures and existing no-claim passes before implementation.

### Session2.2 — Implementation and green

- [ ] 2.2.1 Implement parseClaimAssignments and documented safe typing — `packages/cli/src/parsers.ts`; verify ST-17–21 and existing role parser tests.
- [ ] 2.2.2 Register/forward the repeatable claim option before client creation — `packages/cli/src/commands/user.ts`; verify ST-16–23 green.

### Session2.3 — Implementation tests, documentation and hardening

- [ ] 2.3.1 Add parser internal edge tests after green — `packages/cli/tests/invitation-claims.impl.test.ts`; run07 phase2 selector.
- [ ] 2.3.2 Document claim quoting, repetition and deferred result — `docs/cli/users.md`, `packages/cli/README.md`; verify help, links and docs build.
- [ ] 2.3.3 Reconcile actual new test inventory and run07 checkpoint commands — `repo-tests/monorepo/server-package.spec.test.mjs`.
- [ ] 2.3.4 Run07 phase2 security gates, independent correctness/API review and dedicated security audit; resolve findings and record exact evidence/cleanup.
- [ ] 2.3.5 Run07 packed adjunct from a clean green checkpoint, preserve provenance and cleanup, then checkpoint through git-commit skill in push mode.
- [ ] 2.3.6 Verify phase2 evidence/docs and re-evaluate phase3 against AR-12; no claim-definition catalogue or server policy change is permitted.

**Deliverable:** R4 and ST-16–23. **Verify:**07 phase2, checkpoint, security, docs and packed selectors.

## Phase3: Sequential bulk invitation

> **Phase baseline tree**: Recorded after verified phase2.
> **Lenses**: api-surface, concurrency
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — bounded input, partial side effects and unknown delivery outcomes

### Session3.1 — Specifications and red

- [ ] 3.1.1 [spec-author] Write file/normalization specifications ST-24–30/40/46 — `packages/cli/tests/bulk-invite-input.spec.test.ts`; verify from03-03.
- [ ] 3.1.2 [spec-author] Write sequential/failure/auth-provenance specifications ST-31–38/42–44/48 — `packages/cli/tests/bulk-invite.spec.test.ts`; keep SDK/HTTP/filesystem as external boundaries.
- [ ] 3.1.3 [spec-author] Write command/report specifications ST-39/41/45 — `packages/cli/tests/commands/bulk-invite.spec.test.ts`; verify exact output/exit contract.
- [ ] 3.1.4 Run07 phase3 selector and record intended red before implementing any bulk code.

### Session3.2 — Implementation and green

- [ ] 3.2.1 Implement bounded descriptor read, pure parsing and shared preflight — `packages/cli/src/bulk-invite-input.ts`; verify ST-24–30/40/46.
- [ ] 3.2.2 Implement the direct sequential runner, safe discriminated results and counts — `packages/cli/src/bulk-invite.ts`; verify ST-31–44.
- [ ] 3.2.3 Register/format the command and safe aggregate error — `packages/cli/src/commands/bulk-invite.ts`, `packages/cli/src/commands/bulk.ts`; verify all phase3 specs green without changing bulk execute.

### Session3.3 — Implementation tests, documentation and hardening

- [ ] 3.3.1 Add bounded-read/cleanup/loop implementation edges after green — `packages/cli/tests/bulk-invite.impl.test.ts`; verify07 selectors.
- [ ] 3.3.2 Document file, output, delivery, stop and repeat-run behaviour — `docs/cli/users.md`, `packages/cli/README.md`, relevant `techdocs/` reference; verify help/links/docs build.
- [ ] 3.3.3 Reconcile actual inventory and run07 checkpoint checks — `repo-tests/monorepo/server-package.spec.test.mjs`; preserve all existing assertions.
- [ ] 3.3.4 Run07 phase3 security gates, independent correctness/API/concurrency review and dedicated security audit; resolve findings and record exact cleanup/evidence.
- [ ] 3.3.5 Run07 packed adjunct from clean green provenance, restore owned resources and checkpoint through git-commit skill in push mode.
- [ ] 3.3.6 Complete R1–R12/ST-1–48 evidence, technical-doc review, task/feature-roadmap status and integration-time portfolio handoff; record CI requirements and no merge/release claim.

**Deliverable:** R5–R12 and ST-24–46/48. **Verify:**07 phase3, checkpoint, security, docs and packed selectors.

## Success criteria

Every task is verified, every requirement has its07 evidence, all review findings have authorized
dispositions, documentation is current and owned artifacts/resources are gone. CI must be green
before integration. This plan does not execute bundles C/D/E or authorize a publication.
