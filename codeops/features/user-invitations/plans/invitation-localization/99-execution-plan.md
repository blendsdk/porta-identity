# Execution Plan: Invitation Localization

> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-10-30 10:38
> **Progress**: 39/40 tasks (97.5%)
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

**Commit preference:** After task 1.1.1, the user selected commit and push, then instructed
“proceed until all tasks are done.” The approved checkpoint was published as `df0210e1`.
Further routine commit questions are deferred until completion; the clean-revision assurance
checkpoint remains subject to the explicit authorization rule in 07.

On 2026-10-29 the user explicitly selected “Commit + push” for the clean assurance checkpoint,
evidence commits and feature-branch CI publication, then instructed “use --auto-commit from now
on.” Auto-commit is active for the remaining work. The approved clean-revision checkpoint contains
task 3.3.4's pending state per 07; its source remains frozen during collection/cleanup. Publication
is confined to this feature branch. No merge, main promotion or release is authorized.

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

- [x] 1.1.1 [spec-author] Write `packages/server/tests/unit/auth/invitation-locales.spec.test.ts` from ST-01–ST-06 (including isolated resource-loss subcases) and resolver-only ST-07/ST-08; apply only the catalog-spec supersession in AR #12 before implementation. Direct preparation and send/preview assertions belong to Phase 2. Validate unit discovery and current physical inventory. ✅ (completed: 2026-10-28 22:23; test adapter types repaired without changing assertions)
- [x] 1.1.2 [spec-author] Update the existing system-config API/runtime and global-configuration documentation specifications only at AR #12 and its PF-002 supplement's superseded locale clauses (ST-02, ST-28–ST-29); retain unrelated expectations, malformed/fallback/cache/diagnostic assertions. Validate collection/syntax independently of source. ✅ (completed: 2026-10-28 22:23)
- [x] 1.1.3 Record focused behavioral red results for 1.1.1–1.1.2 with the explicit unit and documentation selectors from 07; distinguish expected failures from configuration/import errors and inherited passing cases. ✅ (completed: 2026-10-28 22:25)

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

**Additional verification discovery:** The server's configured typecheck excludes test files.
A focused TypeScript check of the new locale specification found five adapter/mock typing errors
against the current pre-feature API: its organization argument is required and its configuration
getter currently returns the literal type `en`. Task 1.1.1 was reopened for a test-scaffolding-only
repair. Expected inputs, outputs and assertions remain immutable; production code is not changed
to hide this test-authoring defect.

The independent author repaired the external mock and reflective invocation typing without
changing any input/output case. Focused strict TypeScript compilation now passes for the new
locale specification and runtime specification; collection retains all 80 locale cases and
focused lint passes. A broader standalone compiler probe exposes 20 existing catalog/API test
typing diagnostics; an isolated copy of those exact tests from `db204637` reproduces identical
diagnostic signatures. They are outside the repository's configured typecheck and unchanged by
this feature; no unrelated test refactor is included.

**Task 1.1.2 verification:** The independent specification author updated only API/runtime locale
clauses and the closed documentation choice. Vitest collected 88 API and 43 runtime cases;
all four Phase 1 specification files total 495 cases. `node --check` passed for the documentation
specification, focused lint passed, and runtime specification strict compilation passed. Existing
authorization, storage, cache, malformed-value and safe-diagnostic assertions remain intact.

**Task 1.1.3 red evidence:** The four explicit unit specifications ran 495 cases: 46 expected
failures and 449 inherited passes, with no skipped cases or collection/import failure. Failures
are 41 locale-pack/selection cases (including the intentionally absent Dutch resource files),
three English-only catalog assertions, one native-Dutch runtime case and one API metadata case.
The exact documentation selector ran 18 cases: two expected closed-choice failures in environment
and deployment guidance, 16 passes. Missing Dutch content is the promised feature absence,
not a missing test dependency. All suites reached their cases. Implementation may now begin;
the immutable expected values remain unchanged until the full Phase 1 green gate.

### Session 1.2 — Implementation

- [x] 1.2.1 Add the approved invitation copy/duration/validation resources to `packages/server/locales/default/en/invitation.json` and `emails.json` per 03-01–03-03 and ST-11–ST-14/ST-20–ST-22. Parse both JSON files and validate placeholder structure. ✅ (completed: 2026-10-28 22:26; JSON/placeholders valid, all existing English leaves preserved)
- [x] 1.2.2 Add formal-Dutch `common.json`, `invitation.json`, `emails.json` under `packages/server/locales/default/nl/` per 03-01/AR #10. Validate this three-file batch against the corresponding resource cases. ✅ (completed: 2026-10-28 22:27; three immutable resource-parity cases passed)
- [x] 1.2.3 Add Dutch `login.json`, `consent.json`, `logout.json` in that directory per 03-01/AR #10. Validate this batch's JSON, keys, placeholders and formal wording. ✅ (completed: 2026-10-28 22:28; three resource cases passed, formal wording checked)
- [x] 1.2.4 Add Dutch `forgot-password.json`, `reset-password.json`, `magic-link.json` per 03-01/AR #10. Validate this batch without changing those email senders/templates. ✅ (completed: 2026-10-28 22:29; three resource cases passed, formal wording checked)
- [x] 1.2.5 Add Dutch `errors.json`, `two-factor.json` per 03-01/AR #10. Validate this batch and the complete pack's key/placeholder parity before allowlist activation. ✅ (completed: 2026-10-28 22:29; all 13 shipped-pack completeness/parity cases passed before activation)
- [x] 1.2.6 Add `nl` to `packages/server/src/lib/system-config-catalog.ts` and update the directly affected server API fixture metadata per 03-01/AR #12. Verify ST-01–ST-02 without changing any other catalog contract. ✅ (completed: 2026-10-28 22:30; 428 pack/catalog/API/runtime assertions passed; resolver cases belong to 1.2.7)
- [x] 1.2.7 Extend locale selection and browser-quality handling in `packages/server/src/auth/i18n.ts` per 03-01 §Selection API. Verify ST-03–ST-06 and resolver-only ST-07/ST-08, including the untouched three-argument priority order. ✅ (completed: 2026-10-28 22:33; all 495 Phase 1 unit specification cases passed)
- [x] 1.2.8 Update locale-choice claims in `docs/guide/environment.md`, `docs/guide/deployment.md`, `docs/api/config.md` per 03-01 and ST-28, keeping default English and the exact other catalog rows. ✅ (completed: 2026-10-28 22:34; 18 documentation assertions passed)
- [x] 1.2.9 Update the same closed-choice claim in `docs/cli/infrastructure.md` and `techdocs/reference/configuration.md` per AR #12; validate the affected documentation specifications. ✅ (completed: 2026-10-28 22:35; 18 documentation assertions and exact CLI/maintainer choice checks passed)
- [x] 1.2.10 Record green results for Session 1.1's phase-owned immutable cases using the same focused selectors, including runtime locale and resource-loss oracles; fix implementation if expected outputs differ. No Phase 2 API is required by this gate. ✅ (completed: 2026-10-28 22:35; 495 unit/18 documentation green evidence reconciled against original red selectors)

**Phase 1 specification green evidence:** The exact four unit selectors used at the red gate
passed 495/495 after task 1.2.7; all three real-resource fallback cases are included. No assertion
was changed to obtain green. Tasks 1.2.8–1.2.9 changed documentation only; their exact documentation
selector passed 18/18. These results close every original Phase 1 red failure without requiring
the Phase 2 preparation companion. Later implementation tests and phase-wide gates remain pending.

### Session 1.3 — Implementation Tests and Hardening

- [x] 1.3.1 Add `packages/server/tests/unit/auth/invitation-locales.impl.test.ts` and adapt existing `i18n.test.ts` preload/available-locale fixtures per AR #12. Verify boundary/invalid-candidate branches without changing the new specifications. ✅ (completed: 2026-10-28 22:38; 124 locale spec/implementation/regression cases, strict new-test types and affected lint passed)
- [x] 1.3.2 Recompute actual added-test inventory in `repo-tests/monorepo/server-package.spec.test.mjs`, run the Phase 1 gates below and complete the required independent phase review; record and resolve findings through exec-plan. ✅ (completed: 2026-10-28 22:44; affected tests/server/docs gates passed; independent correctness, Dutch-copy and security reviews found no issues)

Phase evidence: [Phase 1 quality review](00-phase1-quality-review.md). All fifteen Phase 1 tasks
are verified. The technical-documentation hook updated the existing configuration reference;
no additional architecture document or ADR was needed.

**Verify:** Start with `pnpm test:changed`; explicitly select the locale/catalog/API/runtime/i18n unit
files and documentation specifications when affected selection is empty or incomplete. Run server
lint/typecheck/build, `pnpm test:structure` and `pnpm docs:build`. Full verification stays in CI.
Apply phase-review outcomes before Phase 2. Test-infrastructure changes are not authorized here:
the inventory expectation update is the existing contract's response to actual added files.

## Phase 2: Localized Invitation Email and Preview

> **Reasoning**: high — safe interpolation, tenant override readiness and delivery compatibility
> **Lenses**: security, api-surface, concurrency
> **Phase baseline tree**: `2996a0801bc9a72cba24804308501978d62b6f2d`
> **Execution started**: 2026-10-28 22:45 — strict scope; routine commits deferred

The complete Phase 2 baseline was captured with an isolated index and explicit Phase 1 paths,
including untracked resources and review evidence; the real index was not changed. Expected
modifications are `packages/server/src/auth/i18n.ts`, `email-service.ts`, the two shipped
invitation email templates, the new email unit/integration/implementation specifications below,
necessary existing email unit/SMTP setup, the exact server inventory count, and owning
plan/roadmap/review evidence. The shared email renderer and other email types remain outside the
modification set. No new testing or deployment infrastructure is introduced.

Runtime AR #15 adds only `packages/server/tests/e2e/helpers/mailhog.ts` to correct the existing
v2 MIME-envelope location. The user explicitly approved this shared-observer prerequisite and
affected consumer regression checks; no feature assertion or decoding algorithm is changed.

### Session 2.1 — Specification Tests

Reference: [03-01](03-01-locales.md#prepared-tenant-translation-api), [03-02](03-02-email.md);
AR #6–7, #9–11.

- [x] 2.1.1 [spec-author] Write `packages/server/tests/unit/auth/invitation-email-localization.spec.test.ts` from send/preview ST-07, direct-preparation/no-path-read ST-08 and ST-09–ST-15, using real resources/Handlebars and the planned async translator contract. Validate discovery and current inventory; keep implementation logic forbidden to the spec author. ✅ (completed: 2026-10-28 23:02; 68 cases collected, strict test types/lint passed, physical inventory 374)
- [x] 2.1.2 [spec-author] Write `packages/server/tests/integration/services/invitation-localization.spec.test.ts` from ST-16 and its mapped cases, reusing existing SMTP/database fixtures. Validate collection with the integration project. ✅ (completed: 2026-10-28 23:14; 8 cases collected, strict types/lint passed, physical inventory 375)
- [x] 2.1.3 Record behavioral red evidence from the explicit unit/integration files; preserve the expected literal text and report any setup-only failure separately. ✅ (completed: 2026-10-28 23:16; 64 expected unit failures/4 passes and 6 expected integration failures/2 passes; no setup/import failures)

**Task 2.1.1 authoring evidence:** Independent author `ses_e7b8272aaffexEIvOztvCEocSz` used no
implementation reads. A mechanical packet completion supplied the existing public override key
`emails.invitation.subject` and preserved English action literal `Accept Invitation`; no product
decision changed. The 68 cases use real translation resources/Handlebars and independently
selectable direct-preparation, actual caller/context and shipped-template groups. Missing future
exports are checked per case, so collection and strict test compilation pass before implementation.

**Task 2.1.2 authoring evidence:** The same independent author added six real SMTP/preview parity
cases, one durable failure/no-retry case and one permission-denial case. The parent corrected only
Koa body-parser type augmentation and typed router context setup; every behavioral oracle remains
unchanged. Collection, strict standalone compilation and lint pass. The established SMTP suite
also passes 6/6 against the owned `porta-invitation-localization-20261028` Compose project. All
three service images pre-existed. Because root `.env` is absent, this scratch stack uses explicit
test ports and `--env-file /dev/null`; no operator configuration file was created.

**Task 2.1.3 red evidence:** All 68 unit and eight integration cases executed without skips or
unhandled/import errors. Eleven unit cases fail because the promised preparation API is absent;
53 further unit cases and six integration cases fail on untranslated/unselected copy or missing
template output. Four English-subject unit cases and the real permission-denial/durable-failed-
delivery integration cases pass as existing behavior. The verified SMTP baseline rules out a
service-setup explanation. Phase 2 implementation may now begin without changing these oracles.

### Session 2.2 — Implementation

- [x] 2.2.1 Add the awaited companion to `getTranslationFunction` in `packages/server/src/auth/i18n.ts` per 03-01 §Prepared Tenant Translation API. Verify only direct unsafe preparation ST-08 and direct-translator readiness/isolation subcases of ST-09–ST-10; actual email callers are verified after 2.2.2 wires them. ✅ (completed: 2026-10-28 23:19; 11 direct-preparation cases, 124 locale regressions, server types and affected lint passed)
- [x] 2.2.2 Localize shared invitation context, subject and lifetime formatting in `packages/server/src/auth/email-service.ts` per 03-02, with required existing-test setup adaptations. Verify real send/preview selection/awaiting (ST-07/ST-09/ST-10), subjects (ST-11) and context/lifetime/literal-value subcases (ST-11–ST-14) through existing custom-template fixtures. Shipped-template assertions belong to 2.2.3. ✅ (completed: 2026-10-29 00:13; 52 caller/context, 22 existing unit and 6 SMTP cases passed; server types/lint passed)

Before AR #14 resolution, task 2.2.2 passed 50/52 selected caller/context cases; both failures
were the same literal-data fixture mismatch. The user approved correcting only that fixture's
subject key on 2026-10-29. No expected output was changed and no failure was waived. The owning
selector and remaining existing unit/SMTP/type/lint checks now require verification. The owned
stack and temporary artifacts were fully cleaned during the decision pause.

After the exact approved fixture correction, all 52 caller/context cases pass. The remaining
22 existing email unit cases, six real SMTP cases, server typecheck and affected lint also pass.
The scratch stack was recreated with its own project name; all images were already present.
- [x] 2.2.3 Replace only shipped invitation copy in `packages/server/templates/default/emails/invitation.hbs` and `invitation.txt.hbs` per 03-02 §Template Rendering; verify all rendered ST-11–ST-15 assertions, including heading/greeting, action/instructions/expiry, literal plaintext, escaped HTML and custom-template compatibility. ✅ (completed: 2026-10-29 00:15; 68 complete email specification cases and 10 renderer regressions passed)
- [x] 2.2.4 Record green results for Session 2.1's unit/integration cases; keep the shared email renderer and other email types unchanged. ✅ (completed: 2026-10-29 09:04; 68 unit and 8 integration specifications green; 6 SMTP, 9 recovery integration and 13 affected E2E regressions passed)

Task 2.2.4 evidence: 68/68 immutable email unit cases pass. Integration has six failures at the
delivered-body observer and two passing authority/durability cases. All six pre-MIME full-output
comparisons pass. A controlled probe confirms a pre-existing MailHog API-shape mismatch, recorded
in AR #15. No assertion is weakened; no product implementation change is inferred from this
observer defect. The user subsequently approved the bounded shared-helper correction in AR #15;
the unchanged integration assertions and affected consumer checks now require verification.

After the approved MIME-location correction, all eight unchanged SMTP/preview specifications
pass, as do the six existing email delivery cases. The other direct integration consumers pass
nine recovery/magic-link cases, and both MailHog-consuming E2E files pass 13 cases. The 68-case
unit specification result remains green; the observer-only correction does not change that code.
Browser magic-link and production-driver consumers retain their mandatory Phase 3 UI/security
gates. The shared email renderer and other product email types have not been modified.

### Session 2.3 — Implementation Tests and Hardening

- [x] 2.3.1 Add `packages/server/tests/unit/auth/invitation-email-localization.impl.test.ts` for preparation/error/interpolation branches per 03-01–03-02; verify with the immutable email cases. ✅ (completed: 2026-10-29 09:10; 82 immutable/implementation cases, strict types and affected lint passed; inventory 376)
- [x] 2.3.2 Recheck necessary unit `email-service.test.ts` setup/additive context checks and file-local awaited i18n initialization in `packages/server/tests/integration/services/email.service.test.ts`, adapted with 2.2.2 per AR #12/PF-007; rerun existing expiry, English-copy, SMTP delivery and failure assertions unchanged. ✅ (completed: 2026-10-29 09:13; 32 existing email/renderer unit cases and 6 real SMTP cases passed unchanged)
- [x] 2.3.3 Update the actual server test inventory, run the Phase 2 gates below and complete independent correctness/security phase review through exec-plan. Preserve any failed assertion as a blocker. ✅ (completed: 2026-10-29 09:30; affected/server gates passed; independent correctness/concurrency/security reviews found no issues; owned stack cleaned)

Phase evidence: [Phase 2 quality review](00-phase2-quality-review.md). All ten Phase 2 tasks are
verified. The technical-documentation hook requires no extra architecture artifact; final
invitation/security/rollout documentation remains in Phase 3.

**Verify:** Start with `pnpm test:changed`; run explicit new email unit/integration files plus
existing unit email-service/renderer tests and `tests/integration/services/email.service.test.ts`.
Run server lint/typecheck/build and `pnpm test:structure`.
Use 07's owned infrastructure lifecycle for SMTP/database tests. The final registered security
and browser gates remain mandatory in Phase 3; this does not waive discovered security failures.

## Phase 3: Acceptance Flow, Security and Final Verification

> **Reasoning**: max — sensitive public-token rendering and indistinguishable rejection authority
> **Lenses**: security, api-surface, concurrency
> **Phase baseline tree**: `7fa9417cd0b1f205c1aa367e82ceaaf6e9fa4d4e`
> **Execution started**: 2026-10-29 09:45 — strict scope; routine commits deferred

The baseline includes all completed Phase 1/2 work and review evidence, captured through an
isolated index with explicit owned paths. Expected Phase 3 modifications are the invitation
route and password validator, their necessary existing test setups, the new route/pentest/UI/
documentation/implementation specifications below, the precise browser inventory matcher and
counts, named public invitation/deployment guidance, relevant maintainer security/configuration
references, and owning plan/roadmap/review evidence. Existing security assertions remain fixed.
The internal password reason names in 03-03 make AR #13's approved naming freedom concrete before
specification authoring; they add no public response field or password-policy rule.

### Session 3.1 — Specification Tests

Reference: [03-03](03-03-acceptance.md), [07](07-testing-strategy.md); AR #2, #5, #8–13.

- [x] 3.1.1 [spec-author] Write `packages/server/tests/unit/routes/invitation-localization.spec.test.ts` from ST-17–ST-27, including the planned internal password failure reason; keep expected output independent of implementation. ✅ (completed: 2026-10-29 11:01; fixture repaired; all 55 cases execute, strict types/lint pass)
- [x] 3.1.2 [spec-author] Write `packages/server/tests/pentest/auth-bypass/invitation-localization.spec.test.ts` for ST-23–ST-27 alongside unchanged invitation enumeration/attack baselines. Validate pentest-project discovery. ✅ (completed: 2026-10-29 11:28; 17 cases collected, strict types/lint passed, actual inventory 378)
- [x] 3.1.3 [spec-author] Write `packages/server/tests/ui/flows/invitation-localization.spec.test.ts` and `repo-tests/monorepo/invitation-localization.spec.test.mjs` from ST-28–ST-30 using existing fixtures. For the short-password step, remove only the test page's password `minlength` attributes and prove the server POST/error and pending token. Apply the exact PF-004 inventory matcher supplement with the real count; validate discovery, inventory and documentation syntax. ✅ (completed: 2026-10-29 12:04; two browser journeys collected, strict types/lint and documentation syntax passed; browser inventory 26 preserves all 25 old matches)
- [x] 3.1.4 Record focused behavioral red evidence for the route, security, browser and documentation cases; retain any cases already green as explicit baseline evidence, not a reason to weaken them. ✅ (completed: 2026-10-29 12:22; all four selectors reached expected behavior failures with no skips/setup errors/retries)

**Task 3.1.1 authoring evidence:** Independent author `ses_e79218db1ffeaH3kis7PHYBQ1k` created
55 cases in separately selectable password-reason, locale/account-state, security-authority and
translated-presentation groups. Real i18next, page rendering and ordinary password validation are
retained. The parent completed two missing nullable user-fixture fields and included the existing
Koa organization-state type augmentation for isolated compilation; no assertion changed. Existing
invitation-enumeration specifications are untouched.

The early red-readiness probe exposed a missing external tenant-cache fixture: pre-populating
Koa state does not bypass the real router's tenant resolver. The fixture now makes that same
organization available through the external cache boundary, retaining the real middleware and
every request, expected result and assertion. This is setup repair, not a product/oracle change.
The corrected readiness run executes all 55 cases: 24 expected behavior failures and 31 existing
passes, with no setup/import failures or skipped cases. The missing prospective enum is a
per-case behavioral failure. Only a sanitized case/count summary is retained for the red gate.

**Task 3.1.2 authoring evidence:** The same independent author added 17 live cases using the
existing HTTP/database fixtures. A scoped, test-only consumption trigger exercises late-null
rollback and is removed in `finally`; no production hook or harness was added. Cases cover
generic rejection, CSRF, tenant/language isolation, escaping, read-only GET, stored locale and
single-use replay. Leak assertions use booleans so generated credentials do not enter diagnostics.
Existing invitation attack/enumeration assertions remain untouched.

**Task 3.1.3 authoring evidence:** The same independent author added two real Chromium journeys
and 15 semantic documentation cases. Browser fixtures use the existing token creator plus a
small file-local, closed PostgreSQL connection for scoped locale/state observations. The browser
matcher extension is exactly the preflight-approved clause; all old matches remain. Chromium
launch/close prerequisites pass. No product source, target documentation or security baseline
was read to derive the new expected outputs, and no new runner/shared fixture was introduced.

**Phase 3 red evidence:** Unit: 24 expected failures/31 existing passes; live pentest: 15 expected
failures/two existing passes; Chromium: both journeys fail on language selection/document title;
documentation: 11 expected failures/four existing passes. No suite has setup/import failures,
skipped cases or retries. Existing invitation attack baseline passes 5/5. Browser error metadata
confirms the two semantic assertions; raw credential-bearing output was not displayed or retained
in the sanitized summaries. These 89 prospective cases are the unchanged green-gate oracles.

For this conversation the user explicitly approved task-owned browser profiles, synthetic
credentials and TLS artifacts under the named `invitation-execution-tests` temporary directory
and `test-harness/.assurance-runtime`, plus task-owned `test-harness/.assurance-results` reports
and ownership-metadata inspection. This records current runner permission, not future-session
authority or permission to expose/commit secret values or disturb another run.

### Session 3.2 — Implementation

- [x] 3.2.1 Add closed failure reasons to `packages/server/src/users/password.ts` and retain legacy-policy/English assertions in its existing unit tests per 03-03 §Copy, Titles and Validation. Verify minimum/maximum/success compatibility before route use. ✅ (completed: 2026-10-29 12:38; 16 password contract/legacy validation/hashing cases, server types and affected lint passed)
- [x] 3.2.2 Add baseline/valid locale contexts and pre-render conflict/late-rejection handling to `packages/server/src/routes/invitation.ts` per 03-03, with necessary async-helper test mocks. Verify only the locale/account-state and security-authority subcases of ST-17–ST-19/ST-23–ST-27 plus unchanged enumeration assertions. Exact localized titles/copy are verified after 3.2.3. ✅ (completed: 2026-10-29 12:54; 32 authority/state cases and 49 existing invitation/deferral/enumeration cases passed; server types/lint passed)

Baseline language is selected without invitation data; translators are prepared only in rendering
branches. A late rejection creates its own baseline translator and cannot regain invitation
authority through the processing-error catch. Existing form fields are read as own strings without
coercion or duplicated password-length rules. Necessary awaited-translator mocks were added to
the four existing invitation route/security fixtures without changing any assertion.
- [x] 3.2.3 Localize invitation titles, validation and success/error contexts in that route per 03-03. Verify all exact presentation subcases, including ST-17's titles and ST-20–ST-22, without policy or CSRF changes. ✅ (completed: 2026-10-29 13:04; all 55 acceptance cases and 49 existing route/security cases passed; server types/lint passed)

Every invitation render now supplies its translated title. Password errors select copy by the
closed reason and existing bounds; unexpected reasons use the generic message. Existing weak-
password fixtures gained the new reason and matching translator setup while retaining their exact
English assertions. No raw validation error is copied into invitation presentation.
- [x] 3.2.4 Record green route/pentest/browser results for the Session 3.1 feature cases. Fix implementation only when immutable cases fail; preserve real single-use and tenant-bound behavior. ✅ (completed: 2026-10-29 14:22; 55 unit, 17 live security, 5 existing attack and 2 Chromium journey cases passed)

The first browser green run timed out in both journeys without reaching a failing semantic
assertion. An instrumented English diagnostic then passed unchanged in eight seconds. The complete
two-journey selector subsequently passed in eleven seconds, one attempt per case, with tracing,
unchanged 30-second case limits and retries disabled. No code or assertion was changed for these
execution timeouts; their environmental cause was not conclusively established. The later complete
UI gate remains mandatory. Live security includes the real late-consumption rollback and preserved
stored locale; every original assertion remains intact.
- [x] 3.2.5 Update `docs/guide/custom-ui.md`, `docs/api/users.md`, `docs/cli/users.md` for the approved localization and source/build contract; verify ST-28 against the documentation specification. ✅ (completed: 2026-10-29 14:35; all 12 consumer/localization documentation cases passed)
- [x] 3.2.6 Document AR #9's rollout/rollback in `docs/guide/deployment.md` and update the relevant maintainer security/configuration references under the existing techdocs opt-in. Verify ST-29; do not perform a deployment or edit historical plans. ✅ (completed: 2026-10-29 14:48; all 33 localization/global-configuration documentation cases and VitePress build passed)

### Session 3.3 — Implementation Tests and Hardening

- [x] 3.3.1 Add `packages/server/tests/unit/routes/invitation-localization.impl.test.ts` for helper sequencing and unexpected presentation-error branches; verify it alongside the immutable route/security cases. ✅ (completed: 2026-10-29 15:09; 78 implementation/immutable/security cases, strict new-test types and lint passed; inventory 379)

Implementation coverage uses real translation, rendering and CSRF, with filesystem/store fault
fixtures. It proves that failed late-rejection rendering cannot regain invitation authority,
successful mutation is not retried after a presentation failure, and malformed/inherited form
values are rejected without coercion or premature invitation access.
- [x] 3.3.2 Recheck actual server/browser inventory expectations in `repo-tests/monorepo/server-package.spec.test.mjs`, including that the bounded PF-004 matcher preserves old `.spec.ts` matches and includes new `.spec.test.ts` files; run structure and the new documentation specification. ✅ (completed: 2026-10-29 15:17; 157 structure/documentation contracts passed; actual inventories 379/26 and all 25 old browser matches preserved)
- [x] 3.3.3 Run the final focused/product gates from 07: affected selection, applicable unit/integration regressions, server checks, structure, docs build, `pnpm test:ui` and `pnpm test:pentest`. Record exact revision and failures; no full local verification. ✅ (completed: 2026-10-29 16:13; affected 1,814 unit/157 structure, 23 integration, 307 pentest, 135 UI and server/docs gates passed)

Final local-gate candidate: HEAD `df0210e1b38f3981f89ca4f7b6e51d87a1f41189` plus owned worktree
tree `b43857af5a476aa2f5e08de83a5110fad5c563cc`. Affected selection passed 1,814 server unit
cases and 157 structure contracts; server lint/typecheck/build and docs build passed. Focused
SMTP/recovery integration passed 23/23. The first full pentest run passed 306/307 with one runtime
failure in the existing IDOR fixture's `beforeEach` at `idor.test.ts:31:3`, not a recorded failed
assertion. Its isolated diagnostic passed all five unchanged cases. The complete security category
still needs successful verification; the initial failure is retained, not waived. Complete UI
verification is running with one worker and zero retries. Independent read-only implementation/
Dutch/security review is running against the same candidate while final execution gates remain
open. The proposed checkpoint/publication question was dismissed; no new commit/push authority
has been granted.

Final completion evidence: the full UI category passed 135/135 with zero retries, skipped or flaky
cases. Complete pentest re-verification passed 307/307 with no source, assertion, selector or
timeout change. The earlier setup failure remains in the evidence; no failed assertion was waived.
Independent correctness/concurrency/Dutch and security reviews report no findings; all 22 locale
resource files received manual copy review. Hash comparison confirms that tested/reviewed product,
test and documentation content remains identical to the candidate tree. Review evidence:
[Phase 3 quality review](00-phase3-quality-review.md).

- [x] 3.3.4 Establish 07's authorized clean committed checkpoint, including this task's pending/running state, and resolve exact-path runner approvals. Keep the worktree unchanged while running registered `pnpm assurance:harness --project security --profile production-security`; after exit/cleanup record candidate commit/tree, run, observers and exit outcome. Block if the commit mode cannot supply the checkpoint. Failed assertions/new gaps remain blockers; incomplete evidence is never a full pass. ✅ (completed: 2026-10-30 10:27; complete clean-source run exited 0; user explicitly accepted AR #17's retained unclassified earlier outcome; owned cleanup complete)

The first clean checkpoint `28f94101` exited 30 before collecting assurance evidence. Runner
`TMPDIR` produced a 167-byte control-socket pathname; a direct local probe confirms Linux rejects
it. Run `3b7a642d-b47d-45fb-9727-ace379709478` left no owned containers/networks/volumes; its new
image and temporary fixtures were removed. Pre-existing generated public harness configuration
and browser-library copies were preserved. AR #16 explicitly approves the shorter runner-only
temporary location. No source/test/runner changes or failed-assertion waiver are involved.

Short-path candidate `abd9b756e2a836c5798af7fff44af6904b1d01e2`, tree
`6583c4f96fec17dcaf2220a232ec8879e9236d88`: first admitted run `6ebcf584-1f5a-4df0-8072-bfc468703bc8`
passed exposure 11/11 but exited 21 at the live functional-authentication case (suite 6/7). The
parent's overly narrow output capture discarded its error details. The unchanged diagnostic run
`238cd90b-da68-42b0-a32e-272e31a1218f` subsequently passed the entire registered command with exit 0:
exposure 11/11; functional 7/7; second-factor 4/4; tenant/admin 17/17; recovery 5/5; zero skips.
Source stayed clean throughout both runs and their lifecycle cleanup. Both results remain
recorded. Independent security review requires an evidence disposition rather than silently
classifying the earlier failure as environmental or retrying away a possible assertion failure.
The three historically incomplete forwarding observations now pass in both current artifacts;
they are not the present blocker. See AR #17 and the Phase 3 review for exact evidence identities.

The user authorized focused investigation on 2026-10-30. The next clean evidence checkpoint
records the unresolved failure and this permission. Diagnostics will use the existing owned
production-security lifecycle and unchanged functional-authentication specification, retaining
safe error types, source locations and operation timing. This is not another green-only rerun;
task 3.3.4 stays blocked until the evidence gap receives a supported resolution.

Focused run `22315201-51a6-4714-b216-bd8a690b64e7` used clean diagnostic checkpoint
`2777c661217af2783756865030f4f6536d827b2e`, whose product and harness content is unchanged from
`abd9b756`. Existing production-security lifecycle start, security-project admission, both resets
and stop all exited 0. Two executions of the unchanged functional specification passed 7/7,
with no skips/cancellations, in 445.044 and 442.917 seconds. Safe operation capture retained 892
events per run; twenty expected negative-login callback waits were caught by existing code, and
the 301.601-second expiry-wait gap was observed. No uncaught failure reproduced. This evidence
does not classify the earlier lost diagnostic; no further unchanged replay or speculative code
change is authorized as an automatic resolution. Tasks 3.3.4–3.3.5 remain blocked.

After interruption the runtime temporary root changed. The user explicitly approved synthetic
installer fixture creation/use/cleanup under the new session's
`/tmp/opencode/codeops/runtime-10bcd0c1-4211-41e0-a079-c0c7c79057ea/invitation-execution-tests/`.
The parent noticed the root change after one structure run had already created and removed its
synthetic fixtures there; no values were displayed. Future runners verify their exact approved
fixture location before access. The separately approved short harness `TMPDIR` remains fixed.

The user subsequently approved AR #17's limited evidence disposition on 2026-10-30: retain the
first failure as unclassified, credit the complete exit-0 run as current verification, and proceed
to CI. Earlier blocker statements above describe historical decisions, not current task state.
No cause has been invented, assertion weakened, or failed outcome relabeled as passed. This
explicit ruling closes the evidence decision while preserving its limitation in the final handoff.

- [~] 3.3.5 Complete required independent phase/security review and Dutch-copy review, confirm full CI plus separate branch jobs on the authorized published revision, update feature tracking and record final owned-resource cleanup. If branch/PR publication has not been authorized, ask rather than publishing. `main` and releases remain excluded. ⏳ (implemented: 2026-10-30 10:27; reviews/cleanup passed, user disposition recorded; feature publication and CI pending)

Published evidence revision `75a7a5cc` ran CI `41033985088`. UI, OIDC harness, public docs,
production Docker and dependency audit passed. Full monorepo verification exposed one missed
existing integration mock in `tests/integration/services/invitation-enhanced.test.ts:29–32`:
the new awaited translator export was absent. The bounded AR #12 setup permission covers adding
that single mock export; no assertion, production code or runner changes. Targeted verification
and a new published full CI run are required before this task can complete.

The mock-only correction passed all 20 affected existing/new invitation integration cases,
157 structure contracts, focused lint and whitespace checks. The owned regression stack/volume
was removed. All assertions and production source remain unchanged; only existing mock setup
and this evidence record differ from the independently reviewed implementation.

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
