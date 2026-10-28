# Execution Plan: Invitation Localization

> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-10-28 22:10
> **Progress**: 1/40 tasks (2.5%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement [the owning requirements](01-requirements.md) under the passed AR #1–13 decisions.
This plan is not execution authorization. No task below was performed during planning.

## Implementation Phases

| Phase | Title                                            | Tasks |
| ----- | ------------------------------------------------ | ----- |
| 1     | Complete locale resources and closed contracts   | 15    |
| 2     | Localized invitation email and preview           | 10    |
| 3     | Acceptance flow, security and final verification | 15    |

**Total: 40 tasks across 3 phases and 9 sessions.** Tasks are bounded reviewable changes, not
fabricated hour estimates. Dependencies are Phase 1 → Phase 2 → Phase 3; within each phase,
specifications precede red evidence, implementation, green evidence and implementation tests.

> **Execution rule:** These checkboxes are the sole mutable progress authority. A task appears
> once. On implementation mark `[~]` with an actual timestamp; after its stated verification mark
> `[x]`. Update this header and the applicable feature roadmap immediately after every task.
> Resume the first `[~]`, otherwise the first `[ ]`. A blocker becomes `[!]` with `Blocked:` and
> a concrete reason on the same line. Only `[x]` counts complete; timestamps come from the clock.
> Record phase baseline trees using the exec-plan workflow. Do not infer completion from this
> document's existence, a roadmap row or an unrelated CI run.

Execution uses the confirmed verification policy in [07](07-testing-strategy.md#verification-commands).
Resolve protected-file approvals and resource ownership before runners start. Commit/push modes
belong to exec-plan and the git-commit skill; neither publication nor release is preauthorized.
Keep the existing physical test inventories current in each task that adds files, before its
commit; later hardening tasks independently recheck the totals. The browser detector's sole
permitted extension and runtime-oracle supersession are in the preflight supplement to AR #12.
Task 3.3.4 has the explicit clean-revision checkpoint in 07: progress is written before its
candidate commit and after the run, never during provenance-sensitive collection.
Intermediate green checks use 07's task-owned assertion groups. Full phase specification suites
remain in their explicit red/final-green tasks; do not claim future consumer or template
assertions passed after implementing only a prerequisite. Adapt necessary existing-test setup
with the dependency-changing task; hardening tasks recheck it.

## Phase 1: Complete Locale Resources and Closed Contracts

> **Reasoning**: high — closed configuration compatibility and request-language selection
> **Lenses**: security, api-surface
> **Phase baseline tree**: `30c7038e7d3a429a450d0de9237310a2b4169f27`
> **Execution started**: 2026-10-28 22:00 — `--ask-commit`; strict scope; normal decision mode

The entry gate confirmed the nine-document passed preflight hash before execution edits:
`05ed3970c35765b9bf85181c39b0abeb8dcbccf83c90d44347021d7109d193c1`.
The phase began with a clean worktree at `db204637b3fe8ae2b1dd01f3fd3f18af3228e232`;
its committed tree is therefore the complete phase baseline. Recording that existing tree avoids
unnecessary broad re-staging of protected files into a temporary snapshot.

**Expected Phase 1 modification set (strict):** English `invitation.json`/`emails.json`, the eleven
Dutch namespace JSON files under `packages/server/locales/default/`; `src/auth/i18n.ts` and
`src/lib/system-config-catalog.ts` under `packages/server/`; the locale spec/implementation tests,
existing i18n/catalog/runtime/API specifications and API fixture named below; the existing server
inventory and global-configuration documentation specifications; the five documentation files in
tasks 1.2.8–1.2.9; this plan's execution/status/review evidence and owning feature roadmap.
The portfolio cascade remains deferred on this non-integration branch. Task 1.1.1 is bounded to
its new locale specification, the exact catalog supersession and the physical inventory count.

### Session 1.1 — Specification Tests

Reference: [03-01](03-01-locales.md); AR #1, #4, #10–13.

- [x] 1.1.1 [spec-author] Write `packages/server/tests/unit/auth/invitation-locales.spec.test.ts` from ST-01–ST-06 (including isolated resource-loss subcases) and resolver-only ST-07/ST-08; apply only the catalog-spec supersession in AR #12 before implementation. Direct preparation and send/preview assertions belong to Phase 2. Validate unit discovery and current physical inventory. ✅ (completed: 2026-10-28 22:10)
- [ ] 1.1.2 [spec-author] Update the existing system-config API/runtime and global-configuration documentation specifications only at AR #12 and its PF-002 supplement's superseded locale clauses (ST-02, ST-28–ST-29); retain unrelated expectations, malformed/fallback/cache/diagnostic assertions. Validate collection/syntax independently of source.
- [ ] 1.1.3 Record focused behavioral red results for 1.1.1–1.1.2 with the explicit unit and documentation selectors from 07; distinguish expected failures from configuration/import errors and inherited passing cases.

**Task 1.1.1 verification (2026-10-28):** Independent specification author
`ses_e7bad270effeRZZyVNl8nRJbmF` wrote the tests without reading implementation or locale values.
The parent reviewed the exact supersession, documentation and unchanged security boundaries;
formatting-only follow-up preserved every assertion. Vitest `list --project unit` collected
80 locale and 284 catalog cases without import errors; the new 80 case names are unique.
The physical server inventory is exactly 372. Server lint, typecheck and build passed;
`pnpm test:structure` passed 142/142. The initial `pnpm test:changed` baseline also passed
142 structure checks and selected no product tests before authoring. These results verify this
task's specification-authoring/collection gate, not prospective Dutch behavior. The explicit
behavioral red run remains task 1.1.3; no later task is completed by this evidence.

### Session 1.2 — Implementation

- [ ] 1.2.1 Add the approved invitation copy/duration/validation resources to `packages/server/locales/default/en/invitation.json` and `emails.json` per 03-01–03-03 and ST-11–ST-14/ST-20–ST-22. Parse both JSON files and validate placeholder structure.
- [ ] 1.2.2 Add formal-Dutch `common.json`, `invitation.json`, `emails.json` under `packages/server/locales/default/nl/` per 03-01/AR #10. Validate this three-file batch against the corresponding resource cases.
- [ ] 1.2.3 Add Dutch `login.json`, `consent.json`, `logout.json` in that directory per 03-01/AR #10. Validate this batch's JSON, keys, placeholders and formal wording.
- [ ] 1.2.4 Add Dutch `forgot-password.json`, `reset-password.json`, `magic-link.json` per 03-01/AR #10. Validate this batch without changing those email senders/templates.
- [ ] 1.2.5 Add Dutch `errors.json`, `two-factor.json` per 03-01/AR #10. Validate this batch and the complete pack's key/placeholder parity before allowlist activation.
- [ ] 1.2.6 Add `nl` to `packages/server/src/lib/system-config-catalog.ts` and update the directly affected server API fixture metadata per 03-01/AR #12. Verify ST-01–ST-02 without changing any other catalog contract.
- [ ] 1.2.7 Extend locale selection and browser-quality handling in `packages/server/src/auth/i18n.ts` per 03-01 §Selection API. Verify ST-03–ST-06 and resolver-only ST-07/ST-08, including the untouched three-argument priority order.
- [ ] 1.2.8 Update locale-choice claims in `docs/guide/environment.md`, `docs/guide/deployment.md`, `docs/api/config.md` per 03-01 and ST-28, keeping default English and the exact other catalog rows.
- [ ] 1.2.9 Update the same closed-choice claim in `docs/cli/infrastructure.md` and `techdocs/reference/configuration.md` per AR #12; validate the affected documentation specifications.
- [ ] 1.2.10 Record green results for Session 1.1's phase-owned immutable cases using the same focused selectors, including runtime locale and resource-loss oracles; fix implementation if expected outputs differ. No Phase 2 API is required by this gate.

### Session 1.3 — Implementation Tests and Hardening

- [ ] 1.3.1 Add `packages/server/tests/unit/auth/invitation-locales.impl.test.ts` and adapt existing `i18n.test.ts` preload/available-locale fixtures per AR #12. Verify boundary/invalid-candidate branches without changing the new specifications.
- [ ] 1.3.2 Recompute actual added-test inventory in `repo-tests/monorepo/server-package.spec.test.mjs`, run the Phase 1 gates below and complete the required independent phase review; record and resolve findings through exec-plan.

**Verify:** Start with `pnpm test:changed`; explicitly select the locale/catalog/API/runtime/i18n unit
files and documentation specifications when affected selection is empty or incomplete. Run server
lint/typecheck/build, `pnpm test:structure` and `pnpm docs:build`. Full verification stays in CI.
Apply phase-review outcomes before Phase 2. Test-infrastructure changes are not authorized here:
the inventory expectation update is the existing contract's response to actual added files.

## Phase 2: Localized Invitation Email and Preview

> **Reasoning**: high — safe interpolation, tenant override readiness and delivery compatibility
> **Lenses**: security, api-surface, concurrency
> **Phase baseline tree**: Record through exec-plan before changes.

### Session 2.1 — Specification Tests

Reference: [03-01](03-01-locales.md#prepared-tenant-translation-api), [03-02](03-02-email.md);
AR #6–7, #9–11.

- [ ] 2.1.1 [spec-author] Write `packages/server/tests/unit/auth/invitation-email-localization.spec.test.ts` from send/preview ST-07, direct-preparation/no-path-read ST-08 and ST-09–ST-15, using real resources/Handlebars and the planned async translator contract. Validate discovery and current inventory; keep implementation logic forbidden to the spec author.
- [ ] 2.1.2 [spec-author] Write `packages/server/tests/integration/services/invitation-localization.spec.test.ts` from ST-16 and its mapped cases, reusing existing SMTP/database fixtures. Validate collection with the integration project.
- [ ] 2.1.3 Record behavioral red evidence from the explicit unit/integration files; preserve the expected literal text and report any setup-only failure separately.

### Session 2.2 — Implementation

- [ ] 2.2.1 Add the awaited companion to `getTranslationFunction` in `packages/server/src/auth/i18n.ts` per 03-01 §Prepared Tenant Translation API. Verify only direct unsafe preparation ST-08 and direct-translator readiness/isolation subcases of ST-09–ST-10; actual email callers are verified after 2.2.2 wires them.
- [ ] 2.2.2 Localize shared invitation context, subject and lifetime formatting in `packages/server/src/auth/email-service.ts` per 03-02, with required existing-test setup adaptations. Verify real send/preview selection/awaiting (ST-07/ST-09/ST-10), subjects (ST-11) and context/lifetime/literal-value subcases (ST-11–ST-14) through existing custom-template fixtures. Shipped-template assertions belong to 2.2.3.
- [ ] 2.2.3 Replace only shipped invitation copy in `packages/server/templates/default/emails/invitation.hbs` and `invitation.txt.hbs` per 03-02 §Template Rendering; verify all rendered ST-11–ST-15 assertions, including heading/greeting, action/instructions/expiry, literal plaintext, escaped HTML and custom-template compatibility.
- [ ] 2.2.4 Record green results for Session 2.1's unit/integration cases; keep the shared email renderer and other email types unchanged.

### Session 2.3 — Implementation Tests and Hardening

- [ ] 2.3.1 Add `packages/server/tests/unit/auth/invitation-email-localization.impl.test.ts` for preparation/error/interpolation branches per 03-01–03-02; verify with the immutable email cases.
- [ ] 2.3.2 Recheck necessary unit `email-service.test.ts` setup/additive context checks and file-local awaited i18n initialization in `packages/server/tests/integration/services/email.service.test.ts`, adapted with 2.2.2 per AR #12/PF-007; rerun existing expiry, English-copy, SMTP delivery and failure assertions unchanged.
- [ ] 2.3.3 Update the actual server test inventory, run the Phase 2 gates below and complete independent correctness/security phase review through exec-plan. Preserve any failed assertion as a blocker.

**Verify:** Start with `pnpm test:changed`; run explicit new email unit/integration files plus
existing unit email-service/renderer tests and `tests/integration/services/email.service.test.ts`.
Run server lint/typecheck/build and `pnpm test:structure`.
Use 07's owned infrastructure lifecycle for SMTP/database tests. The final registered security
and browser gates remain mandatory in Phase 3; this does not waive discovered security failures.

## Phase 3: Acceptance Flow, Security and Final Verification

> **Reasoning**: max — sensitive public-token rendering and indistinguishable rejection authority
> **Lenses**: security, api-surface, concurrency
> **Phase baseline tree**: Record through exec-plan before changes.

### Session 3.1 — Specification Tests

Reference: [03-03](03-03-acceptance.md), [07](07-testing-strategy.md); AR #2, #5, #8–13.

- [ ] 3.1.1 [spec-author] Write `packages/server/tests/unit/routes/invitation-localization.spec.test.ts` from ST-17–ST-27, including the planned internal password failure reason; keep expected output independent of implementation.
- [ ] 3.1.2 [spec-author] Write `packages/server/tests/pentest/auth-bypass/invitation-localization.spec.test.ts` for ST-23–ST-27 alongside unchanged invitation enumeration/attack baselines. Validate pentest-project discovery.
- [ ] 3.1.3 [spec-author] Write `packages/server/tests/ui/flows/invitation-localization.spec.test.ts` and `repo-tests/monorepo/invitation-localization.spec.test.mjs` from ST-28–ST-30 using existing fixtures. For the short-password step, remove only the test page's password `minlength` attributes and prove the server POST/error and pending token. Apply the exact PF-004 inventory matcher supplement with the real count; validate discovery, inventory and documentation syntax.
- [ ] 3.1.4 Record focused behavioral red evidence for the route, security, browser and documentation cases; retain any cases already green as explicit baseline evidence, not a reason to weaken them.

### Session 3.2 — Implementation

- [ ] 3.2.1 Add closed failure reasons to `packages/server/src/users/password.ts` and retain legacy-policy/English assertions in its existing unit tests per 03-03 §Copy, Titles and Validation. Verify minimum/maximum/success compatibility before route use.
- [ ] 3.2.2 Add baseline/valid locale contexts and pre-render conflict/late-rejection handling to `packages/server/src/routes/invitation.ts` per 03-03, with necessary async-helper test mocks. Verify only the locale/account-state and security-authority subcases of ST-17–ST-19/ST-23–ST-27 plus unchanged enumeration assertions. Exact localized titles/copy are verified after 3.2.3.
- [ ] 3.2.3 Localize invitation titles, validation and success/error contexts in that route per 03-03. Verify all exact presentation subcases, including ST-17's titles and ST-20–ST-22, without policy or CSRF changes.
- [ ] 3.2.4 Record green route/pentest/browser results for the Session 3.1 feature cases. Fix implementation only when immutable cases fail; preserve real single-use and tenant-bound behavior.
- [ ] 3.2.5 Update `docs/guide/custom-ui.md`, `docs/api/users.md`, `docs/cli/users.md` for the approved localization and source/build contract; verify ST-28 against the documentation specification.
- [ ] 3.2.6 Document AR #9's rollout/rollback in `docs/guide/deployment.md` and update the relevant maintainer security/configuration references under the existing techdocs opt-in. Verify ST-29; do not perform a deployment or edit historical plans.

### Session 3.3 — Implementation Tests and Hardening

- [ ] 3.3.1 Add `packages/server/tests/unit/routes/invitation-localization.impl.test.ts` for helper sequencing and unexpected presentation-error branches; verify it alongside the immutable route/security cases.
- [ ] 3.3.2 Recheck actual server/browser inventory expectations in `repo-tests/monorepo/server-package.spec.test.mjs`, including that the bounded PF-004 matcher preserves old `.spec.ts` matches and includes new `.spec.test.ts` files; run structure and the new documentation specification.
- [ ] 3.3.3 Run the final focused/product gates from 07: affected selection, applicable unit/integration regressions, server checks, structure, docs build, `pnpm test:ui` and `pnpm test:pentest`. Record exact revision and failures; no full local verification.
- [ ] 3.3.4 Establish 07's authorized clean committed checkpoint, including this task's pending/running state, and resolve exact-path runner approvals. Keep the worktree unchanged while running registered `pnpm assurance:harness --project security --profile production-security`; after exit/cleanup record candidate commit/tree, run, observers and exit outcome. Block if the commit mode cannot supply the checkpoint. Failed assertions/new gaps remain blockers; incomplete evidence is never a full pass.
- [ ] 3.3.5 Complete required independent phase/security review and Dutch-copy review, confirm full CI plus separate branch jobs on the authorized published revision, update feature tracking and record final owned-resource cleanup. If branch/PR publication has not been authorized, ask rather than publishing. `main` and releases remain excluded.

**Verify:** Use the exact gates in [07](07-testing-strategy.md#verification-commands), retaining
existing invitation enumeration, replay, tenant isolation, expiry and delivery coverage. Required
security profiles are `owasp-web`, `auth-protocol`, `tenant-isolation`; use the existing independent
review roles and stop-on-major policy. CI's full `pnpm verify` and separate jobs must be green
before mergeability is claimed. Cleanup evidence must show that only owned resources were
removed. Unrelated roadmap blockers are not cleared by this feature.

## Success and Handoff

Completion means all tasks verified under 07 and all owning requirements met. No unused helper,
unsafe cast, undocumented public/internal non-trivial behavior or planning identifier is left in
source comments. Technical-documentation updates follow the repository's opt-in after verified
phases; preserve historical assurance evidence and keep public/maintainer documentation separate.

Use the git-commit skill only under the execution workflow's selected commit mode. Integration
targets `develop`; publication, `main` promotion and Release dispatch require separate authority.
