# Execution Plan: CLI Invitation Automation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Implements**: cli-automation/T-01
> **Last Updated**: 2026-11-04
> **Progress**: 48/49 tasks (98%)
> **Commit mode**: --auto-commit active by current user confirmation; unpublished locally verified source commit, then assurance-qualified evidence checkpoint and push
> **CodeOps Artifact Schema**: 1

## Implementation Phases

Execution invocation `invitation-execution-20261103`: user requested Bundle A through completion
and explicitly selected both --auto-design and --auto-commit for this run. Auto-design policy1
applies to eligible implementation mechanisms only; reserved authority and strict scope remain.
Entry validation matched all nine preflight hashes before any plan state change. Node24.20.0 is
available for active verification. The initial changed selection passed; product source is not
yet implemented. Phase task evidence is recorded below as work proceeds.

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

The only tracked-update timing exception is07's source-checkpoint/assurance provenance group:
pre-record its pending state, freeze tracked writes from the local source commit through both
gate runs, then immediately record the evidence and justified task states. This explicit PF-001
ruling prevents task bookkeeping from invalidating the source being tested. No verification or
push gate is waived.

Execution uses exec-plan and the git-commit skill, not raw Git instructions in this document.
Follow07's clean-source sequence: finish applicable local checks/review, commit source locally
without push while assurance tasks remain pending, then run security and packed gates against
that clean source without tracked edits between them. Record outcomes only after those runs end;
verify and commit evidence, and push only after all required gates and dispositions permit.
The local source commit is not phase completion or completed assurance. Keep intended-red and
known-failing tests uncommitted; never relax provenance or publish failures. This bounded PF-001
sequencing ruling governs the source/evidence split in auto-commit mode, without waiving a gate.
Each phase must finish independent review/security audit and owned cleanup before completion.
Credential/file approvals and any real service creation are checked at execution time, not granted
by this plan. No merge, issue mutation, publishing or deployment is authorized (AR-5/16).

## Phase1: CLI-wide JSON errors

> **Phase baseline tree**: 9e9105feeaa7016c65b65eef6f1fa0555940b2ad (clean HEAD tree; protected files not indexed)
> **Scope mode**: strict — JSON boundary, listed conventional callers, new focused tests, related public/technical docs, test inventory and execution evidence only.
> **Lenses**: api-surface
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — executable output compatibility and sensitive error handling

### Session1.1 — Specifications and red

References:03-01;07 ST-1–15/47;AR-13/16/17. Start with07's first local selection.

- [x] 1.1.1 [spec-author] Write formatter/human compatibility specifications ST-1–3/7 — `packages/cli/tests/json-errors.spec.test.ts`; verify against07. ✅ (completed: 2026-11-03 17:12; independent contract/static review passed)
- [x] 1.1.2 [spec-author] Write actual parser/executable specifications ST-5/6/15 — `packages/cli/tests/json-errors-entry.spec.test.ts`; verify no credential access. ✅ (completed: 2026-11-03 17:12; independent contract/static review passed)
- [x] 1.1.3 [spec-author] Write secret-marker and public SDK auth-provenance specifications ST-4/6/47 — `packages/cli/tests/security/json-error-redaction.spec.test.ts`; verify from03-01 and AR-17, without real credential access. ✅ (completed: 2026-11-03 17:12; independent contract/static review passed)
- [x] 1.1.4 [spec-author] Write direct-failure/report compatibility specifications ST-8–14 — `packages/cli/tests/commands/json-errors-legacy.spec.test.ts`; verify legacy exits/stdout. ✅ (completed: 2026-11-03 17:12; independent contract/static review passed)
- Commits deferred until a green source checkpoint, as required by07; intended-red specifications are not published.
- [x] 1.1.5 Run07 phase1 selector and record each intended red before implementation; document already-green legacy cases without claiming new behaviour. ✅ (completed: 2026-11-03 17:12; local Node24 red confirmed:43 failed/8 passed, two missing-module collection failures;08 owns evidence)

### Session1.2 — Implementation and green

References:03-01;AR-13. Each caller group preserves exact legacy semantics and runs its relevant
existing command tests plus the phase1 selector. Do not enlarge scope to fix unrelated exits.

- [x] 1.2.1 Implement safe envelope/classifier and local input discriminators — `packages/cli/src/error-format.ts`; verify ST-1–4. ✅ (completed: 2026-11-03 17:16; formatter/redaction/legacy handler selector60 tests passed; documentation self-check passed)
- [x] 1.2.2 Integrate explicit JSON and non-terminating reporting into the existing boundary — `packages/cli/src/error-handler.ts`; verify ST-1–4/7 and existing handler tests. ✅ (completed: 2026-11-03 17:16;60 formatter/redaction/legacy handler tests passed; documentation self-check passed)
- [x] 1.2.3 Implement public-yargs mode resolution and safe parser entry — `packages/cli/src/cli.ts`, `packages/cli/src/index.ts`; verify ST-5/6/15. ✅ (completed: 2026-11-03 17:18;36 actual-parser/executable cases passed; documentation self-check passed)
- [x] 1.2.4 Integrate handler JSON options — `packages/cli/src/commands/user.ts`, `user-role.ts`, `user-claim.ts`; verify user command tests and ST-14. ✅ (completed: 2026-11-03 17:19;58 selected user cases passed;14 unrelated cases excluded by name selector; full phase gate pending; doc self-check passed)
- [x] 1.2.5 Integrate handler JSON options — `packages/cli/src/commands/org.ts`, `app.ts`; verify their command tests and ST-14. ✅ (completed: 2026-11-03 17:20;55 existing +2 targeted contract cases passed; broad first selector also hit still-red future bulk/import paths, final full phase gate remains pending; doc self-check passed)
- [x] 1.2.6 Integrate handler JSON options — `packages/cli/src/commands/app-role.ts`, `app-permission.ts`, `app-claim.ts`; verify their command tests and ST-14. ✅ (completed: 2026-11-03 17:21;45 application/RBAC cases passed; representative application JSON case passed in1.2.5; full matrix gate pending; doc self-check passed)
- [x] 1.2.7 Integrate handler JSON options — `packages/cli/src/commands/app-module.ts`, `client.ts`, `client-secret.ts`; verify their command tests and ST-14. ✅ (completed: 2026-11-03 17:21;86 existing contract/command +1 focused JSON case passed; doc self-check passed)
- [x] 1.2.8 Integrate handler JSON options — `packages/cli/src/commands/keys.ts`, `sessions.ts`, `audit.ts`; verify their command tests and ST-14. ✅ (completed: 2026-11-03 17:22;40 existing/frozen cases +1 focused JSON case passed; exact two-argument human key boundary retained; doc self-check passed)
- [x] 1.2.9 Integrate handlers/direct failures — `packages/cli/src/commands/stats.ts`, `config.ts`, `bulk.ts`; verify ST-9–11/14 and legacy tests. ✅ (completed: 2026-11-03 17:23;49 existing/frozen +5 focused contract cases passed; legacy exits/order/stdout retained; doc self-check passed)
- [x] 1.2.10 Integrate handlers/structured rejection summary — `packages/cli/src/commands/exports.ts`, `export.ts`, `import.ts`; verify ST-12/14 and portability tests. ✅ (completed: 2026-11-03 17:24;26 portability +6 exports +1 focused contract cases passed; no frozen tests changed; doc self-check passed)
- [x] 1.2.11 Integrate login/health/missing-credential failures — `packages/cli/src/commands/login.ts`, `health.ts`, `whoami.ts`; verify ST-8/13 and existing auth/health tests. ✅ (completed: 2026-11-03 17:25;14 existing command/health +69 auth +3 focused contract cases passed; doc self-check passed)
- [x] 1.2.12 Add safe JSON diagnostic failure summary — `packages/cli/src/commands/doctor.ts`; verify ST-12 and unchanged report tests. ✅ (completed: 2026-11-03 17:26;26 doctor/legacy contract cases passed; stdout array and exit retained; doc self-check passed)
- [x] 1.2.13 Audit03-01's complete integration matrix and run phase1 green; retain exact two-argument human calls under PF-004, changing only directly affected implementation-test signatures, never immutable expectations. ✅ (completed: 2026-11-03 17:27;91 phase cases passed,86 callers audited; new spec ANSI regex received only an explanatory lint exemption, no assertion change; workspace checkpoint pending)

### Session1.3 — Implementation tests, documentation and hardening

- [x] 1.3.1 Add internal classifier/metadata/mode tests after green — `packages/cli/tests/json-errors.impl.test.ts`; verify03-01 and07. ✅ (completed: 2026-11-03 17:30;107 specification/internal cases passed; doc self-check passed)
- [x] 1.3.2 Document the public error/legacy-exit contract — `docs/cli/overview.md`, `packages/cli/README.md`, `techdocs/architecture/api-design.md`; verify links and07 docs build. ✅ (completed: 2026-11-03 17:32; docs build passed; local target/heading reviewed; existing architecture intent retained, no ADR superseded)
- [x] 1.3.3 Reconcile actual owned CLI test-file inventory — `repo-tests/monorepo/server-package.spec.test.mjs`; run07 local checkpoint checks, bounded coverage and pentest without weakening assertions. ✅ (completed: 2026-11-03 17:41; CLI verify111 files/1,607 tests +lint/typecheck/build; structure158; pentest330;28 affected modules meet coverage goals; inventory111; owned stack removed; doc self-check passed)
- [x] 1.3.4 Complete independent correctness/API review and dedicated security audit, resolve findings, and create07's unpublished locally verified source checkpoint; leave clean-provenance gates pending. ✅ (completed: 2026-11-03 21:41; independent reviews found no findings; source cebfbe13 and unchanged-source group verified; tracked timing exception ended after both runs)
- [x] 1.3.5 Run phase1 registered production-security and packed p1-admin gates against the same clean committed source without tracked edits between runs; preserve temporary observations until recording evidence. ✅ (completed: 2026-11-03 21:41; same-source qualification passed: security11/11, packed6/6, both exit0, no prohibited output; first failed attempt and log-credit limitation preserved; cleanup verified)
- [x] 1.3.6 Immediately record gate evidence, exact source identities, authorized dispositions and cleanup; run07 checkpoint checks, then evidence-commit and push via git-commit only after all gates permit. ✅ (completed: 2026-11-03 21:46; CLI1,607+lint/typecheck/build and structure158 reverified; source cebfbe13 and evidence0ea671c2 pushed and remote confirmed;08 contains all dispositions)
- [x] 1.3.7 Validate phase1 docs/evidence links, exact resource restoration and all relevant existing CLI tests; record remaining accepted harness limitations without claiming a full pass. ✅ (completed: 2026-11-03 21:46; links/current1,607-test evidence/111-file inventory/Docker identities verified; correlation-credit and initial-failure limitations explicit; generated-file cleanup follows user ruling)
- [x] 1.3.8 Re-evaluate phase2 scope/inputs and minimum-sufficient design against AR-12 before continuing; confirm no unauthorized dependency or support machinery entered phase1. ✅ (completed: 2026-11-03 21:50; manifests/dependencies/SDK/server unchanged; only approved formatter and parser-construction seams added; phase2 fits existing211-line parsers/593-line user module; Node24 deep-input encoding counterexample qualified without a fixed depth policy)

**Deliverable:** R1–R3 and ST-1–15/47, independently reviewed and verified. **Verify:**07 phase1,
checkpoint, security, docs and packed selectors; full root verification belongs to CI.

## Phase2: Invitation claims

> **Phase baseline tree**: 3c7a722f0d4f35a27d19d97947105ab9d695b388 (clean phase1 closeout commit387bea5f)
> **Scope mode**: strict — claim parser/encoding guard, single-invite wiring, focused tests, related docs, inventory and execution evidence only; no SDK/server/dependency change.
> **Lenses**: api-surface
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — JSON parsing and authorization-assignment payloads

### Session2.1 — Specifications and red

- [x] 2.1.1 [spec-author] Write claim grammar/payload/cardinality/encoding specifications ST-16–23/49/50 — `packages/cli/tests/commands/user-invite-claims.spec.test.ts`; verify from03-02, not implementation. ✅ (completed: 2026-11-03 22:04; independent36-case oracle reviewed against contract; only external client/HTTP mocked, encoding runtime-qualified)
- [x] 2.1.2 Run07 phase2 selector, record intended red failures and existing no-claim passes before implementation. ✅ (completed: 2026-11-03 22:04; parent confirmed31 expected failures/39 passes;08 records compatibility-only passes and missing behaviour before implementation)

### Session2.2 — Implementation and green

- [x] 2.2.1 Implement parseClaimAssignments, runtime element guards, worklist finite-number validation and complete-invitation encodability helper with safe typing — `packages/cli/src/parsers.ts`; verify ST-17–21/49/50 and unchanged role parser tests. ✅ (completed: 2026-11-03 22:07;127 claim/parser/user cases passed; worklist, explicit records, unchanged role parser and public helper documentation reviewed)
- [x] 2.2.2 Register repeatable claims with requiresArg and prepare/check the complete invitation before client creation — `packages/cli/src/commands/user.ts`; verify ST-16–23/49/50 green. ✅ (completed: 2026-11-03 22:07;127 relevant cases passed; new local human rejection sets exitCode3 and returns without yargs reformatting; legacy roles/human calls/result shapes retained; docs self-check passed)

### Session2.3 — Implementation tests, documentation and hardening

- [x] 2.3.1 Add parser internal edge tests after green — `packages/cli/tests/invitation-claims.impl.test.ts`; run07 phase2 selector. ✅ (completed: 2026-11-03 22:09;84 claim/parser/internal cases passed;14 post-green edge cases, safe typing/docs reviewed)
- [x] 2.3.2 Document claim quoting, repetition and deferred result — `docs/cli/users.md`, `packages/cli/README.md`; verify help, links and docs build. ✅ (completed: 2026-11-03 22:10; docs build passed, actual invite help exposes qualified repeated claims and quoting; no new document links; deferred outcome semantics reviewed)
- [x] 2.3.3 Reconcile actual new test inventory and run07 local checkpoint checks, bounded coverage and pentest — `repo-tests/monorepo/server-package.spec.test.mjs`. ✅ (completed: 2026-11-03 22:17; CLI1,657+lint/typecheck/build, structure158, changed600, pentest330; coverage parsers100%/user93.6%; inventory113; owned stack removed and all Docker identities restored; initial PTY observation retained)
- [x] 2.3.4 Complete independent correctness/API review and dedicated security audit, resolve findings and create07's unpublished locally verified source checkpoint with assurance tasks pending. ✅ (completed: 2026-11-03 22:45; no review findings; source63a1f68c qualified unchanged through both gates; tracked timing exception ended)
- [x] 2.3.5 Run phase2 production-security and packed p1-admin gates without tracked edits between runs; immediately record outcomes/source/cleanup/dispositions afterwards, verify and evidence-commit/push only after all gates permit. ✅ (completed: 2026-11-03 22:47; same-source security11/11 and packed6/6 exit0; cleanup passed; CLI1,657/structure158 reverified; source63a1f68c and evidencef0fc3d4d pushed/remote confirmed)
- [x] 2.3.6 Verify phase2 evidence/docs and re-evaluate phase3 against AR-12; no claim-definition catalogue or server policy change is permitted. ✅ (completed: 2026-11-03 22:49; links/inventory/source/cleanup checked; SDK/server/dependencies unchanged; phase3 fits approved bounded input and direct sequential loop, no added catalogue or support machinery)

**Deliverable:** R4 and ST-16–23/49/50. **Verify:**07 phase2, checkpoint, coverage, security, docs and packed selectors.

## Phase3: Sequential bulk invitation

> **Phase baseline tree**: 71a38c62bc8ea8e20de7d898697f67d630403784 (clean phase2 closeout8df8f88f)
> **Scope mode**: strict — three focused bulk modules, registration, specification/internal tests, related docs, exact inventory and execution evidence; unchanged SDK/server/dependencies/Admin UI.
> **Lenses**: api-surface, concurrency
> **Security profiles**: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — bounded input, partial side effects and unknown delivery outcomes

### Session3.1 — Specifications and red

- [x] 3.1.1 [spec-author] Write file/normalization/nonblocking-FIFO/encoding specifications ST-24–30/40/46/50 — `packages/cli/tests/bulk-invite-input.spec.test.ts`, `bulk-invite-file.spec.test.ts`; verify from03-03. ✅ (completed: 2026-11-03 23:10; parent contract/static review passed for file/preparation oracles before nonexistent bulk implementation; SDK read breach affects separate auth qualification, not file grammar/bounds; no assertion changed)
- [x] 3.1.2 [spec-author] Write sequential/failure/auth-provenance specifications ST-31–38/42–44/48 — `packages/cli/tests/bulk-invite.spec.test.ts`, `bulk-invite-auth.spec.test.ts`, `bulk-invite-auth-independent.spec.test.ts`; keep SDK/HTTP/filesystem as external boundaries. ✅ (completed: 2026-11-03 23:15; clean fresh author independently supplied6 auth oracles without implementation/initial-suite reads; all original assertions retained; parent contract review passed; initial breach remains disclosed, not credited as sole independent auth evidence)
- [x] 3.1.3 [spec-author] Write command/report/cardinality specifications ST-39/41/45/49 — `packages/cli/tests/commands/bulk-invite.spec.test.ts`, `bulk-invite-preflight.spec.test.ts`; verify exact output/exit contract. ✅ (completed: 2026-11-03 23:15; parent reviewed exact schema, derived counts, safe reports, factory failure, preflight/cardinality and human-output oracles against contract; only external boundaries mocked)
- [x] 3.1.4 Run07 phase3 selector and record intended red before implementing any bulk code. ✅ (completed: 2026-11-03 23:15; parent confirmed55 expected failures/7 compatibility-only passes plus4 missing-module collection failures;08 owns red and authorship qualification evidence; no implementation preceded red)

### Session3.2 — Implementation and green

- [x] 3.2.1 Implement nonblocking regular-descriptor validation, bounded read, pure parsing and full prepared-request encoding preflight — `packages/cli/src/bulk-invite-input.ts`, reusing phase2 parser helpers; verify ST-24–30/40/46/50. ✅ (completed: 2026-11-03 23:20;148 phase/legacy cases passed including actual FIFO, growth, raw-byte/UTF-8 bounds and shared request preflight; docs/type-safety self-check passed)
- [x] 3.2.2 Implement the direct sequential runner, safe discriminated results and counts — `packages/cli/src/bulk-invite.ts`; verify ST-31–44. ✅ (completed: 2026-11-03 23:20;148 phase/legacy cases passed; real public-SDK auth/refresh and conservative uncertainty oracles green; outcomes/counts/public docs reviewed)
- [x] 3.2.3 Register requiresArg claim cardinality, format the command and safe aggregate error — `packages/cli/src/commands/bulk-invite.ts`, `packages/cli/src/commands/bulk.ts`; verify all phase3 specs including ST-49 green without changing bulk execute. ✅ (completed: 2026-11-03 23:49; SA-3-001 corrected under AR-18 and closed by one scoped re-audit; full post-fix CLI1,795+lint/typecheck/build, structure158, coverage and rendering regressions pass; all original assertions retained)

### Session3.3 — Implementation tests, documentation and hardening

- [x] 3.3.1 Add bounded-read/cleanup/loop implementation edges after green — `packages/cli/tests/bulk-invite.impl.test.ts`; verify07 selectors. ✅ (completed: 2026-11-03 23:22;160 phase/legacy/internal cases passed;12 post-green edge cases; documentation/type-safety self-check passed)
- [x] 3.3.2 Document file, output, delivery, stop and repeat-run behaviour — `docs/cli/users.md`, `packages/cli/README.md`, `techdocs/architecture/api-design.md`; verify help/links/docs build. ✅ (completed: 2026-11-03 23:25; public docs build/actual bulk help passed; limits, count invariants, exits, delivery/creation distinctions and manual recovery documented; maintainer intent retained)
- [x] 3.3.3 Reconcile actual inventory and run07 local checkpoint checks, bounded coverage and pentest — `repo-tests/monorepo/server-package.spec.test.mjs`; preserve all existing assertions. ✅ (completed: 2026-11-03 23:51; post-fix CLI1,795+lint/typecheck/build, structure158, changed738, pentest330; coverage100/100/96.29/88.63% meets all goals; inventory123; owned cleanup checked; unrelated concurrent networks preserved)
- [x] 3.3.4 Complete independent correctness/API/concurrency review and dedicated security audit, resolve findings and create07's unpublished locally verified source checkpoint; leave assurance pending. ✅ (completed: 2026-11-04 00:21; source de4ff08e stayed clean through both final gates; independent review/re-audit closure and post-fix local checks verified; tracked timing exception ended)
- [x] 3.3.5 Run phase3 production-security and packed p1-admin gates without tracked edits between runs; immediately record source/outcomes/dispositions/cleanup afterwards, verify and evidence-commit/push only after all gates permit. ✅ (completed: 2026-11-04; same-source security11/11 and packed6/6 exit0; CLI1,795/structure158 reverified; source de4ff08e and evidence86463a97 pushed and remote confirmed; exact owned cleanup passed)
- [~] 3.3.6 Complete R1–R12/ST-1–50 evidence, technical-doc review, task/feature-roadmap status and integration-time portfolio handoff; record CI requirements and no merge/release claim. ⏳ (implemented: 2026-11-04; failed closing CI diagnosed as Node22 recursive test-comparator overflow; user explicitly approved an assertion-only structural repair under AR-19; fixture and product source unchanged; dual-runtime verification, closing CI and final scratch cleanup pending)

**Deliverable:** R5–R12 and ST-24–46/48–50. **Verify:**07 phase3, checkpoint, coverage, security, docs and packed selectors.

## Success criteria

Every task is verified, every requirement has its07 evidence, all review findings have authorized
dispositions, documentation is current and owned artifacts/resources are gone. CI must be green
before integration. This plan does not execute bundles C/D/E or authorize a publication.
