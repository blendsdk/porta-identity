# Ambiguity Register: Invitation Localization (#179)

> **Status**: ✅ GATE PASSED — all 17 decisions resolved; original assurance failure retained as unclassified
> **Last Updated**: 2026-10-30 10:27
> **CodeOps Artifact Schema**: 1

## Planning scope contract

| Boundary                         | Authorized scope                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning target                  | GitHub #179: localized invitation emails and acceptance flow, with complete Dutch support. Standalone plan in the existing `user-invitations` feature.                                                                                                                                                                                                     |
| Context artifacts                | Current invitation, email, locale, configuration and password code; their tests; public and maintainer documentation; historical invitation and global-configuration plans as read-only context.                                                                                                                                                           |
| Modification set during planning | This register and, only after the gate passes, the new plan's documents and its row in `codeops/features/user-invitations/00-roadmap.md`. The portfolio is deferred on this non-integration branch. No product source/tests, historical plans, upstream requirements, policy, hidden workflow configuration, or release artifacts are changed by planning. |

Normal mode; strict scope. No automatic design delegation or scope exploration is active.
This is a new capability, so it receives a full standalone plan rather than a maintenance mini-plan.
The existing invitation feature uses standalone plan-owned requirements; no upstream RD exists here.

## Decisions

| #   | Category                        | Ambiguity / gap                                                                                         | Options presented                                                                                                                                                                                                                            | User decision                                                                                                                                                                                                                                               | Status      |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Feature gaps; scope             | What does #179 deliver?                                                                                 | Localized invitation subject/body/expiry and acceptance flow; complete Dutch pack; keep English fallback.                                                                                                                                    | User: "i confirm" after the feasibility scope; complete flow including error text confirmed in the follow-up design-boundary answer.                                                                                                                        | ✅ Resolved |
| 2   | Behavioral gaps                 | Acceptance-page locale precedence.                                                                      | Browser preference → invitation locale → organization default → global default → English.                                                                                                                                                    | User: "i confirm" after that exact recommendation.                                                                                                                                                                                                          | ✅ Resolved |
| 3   | Naming; scope                   | Feature and plan ownership.                                                                             | Existing `user-invitations` feature / new localization feature.                                                                                                                                                                              | User selected `user-invitations (Recommended)` and the proposed `plans/invitation-localization/` path.                                                                                                                                                      | ✅ Resolved |
| 4   | Technical; integration          | Existing architecture and future language installation.                                                 | Reuse i18next/Handlebars, full packaged allowlisted bundles plus rebuild, no dependency or runtime language-loader framework; other email types unchanged.                                                                                   | User selected `Approve boundary (Recommended)`.                                                                                                                                                                                                             | ✅ Resolved |
| 5   | Non-functional; verification    | Local and CI gates.                                                                                     | Focused local tests/server checks, structure/docs/UI/pentests and registered production-security harness; full verification in CI only. No product changes or test execution during planning.                                                | User selected `Use project policy (Recommended)`; harness failures remain blockers unless separately resolved.                                                                                                                                              | ✅ Resolved |
| 6   | Technical; integration          | Minimal invitation-email rendering design and safe interpolation.                                       | Invitation-only translated context / per-render helper in the shared renderer.                                                                                                                                                               | User selected `Translated context (Recommended)`: complete text strings, existing context variables/template lookup preserved, escaped HTML and literal plaintext; other email renderers unchanged.                                                         | ✅ Resolved |
| 7   | Data/state; concurrency         | Tenant override readiness, isolation, and unavailable translation resources.                            | Await existing override reads using a small invitation-facing preparation API; retain request-local maps and existing missing/malformed-override fallback.                                                                                   | User selected `Approve remaining register`, including awaited tenant overrides; no shared mutable language or new cache/loader subsystem.                                                                                                                   | ✅ Resolved |
| 8   | Security/compliance; edge cases | Uniform rejection locales, CSRF ordering, safe locale identifiers, and output escaping.                 | Scoped valid-token and email-conflict checks before invitation-language authority; baseline locale for every generic rejection including late acceptance rejection; CSRF before token lookup; packaged identifiers before filesystem access. | User selected `Approve remaining register` after independent challenge and the visible security design table. Existing security assertions remain intact.                                                                                                   | ✅ Resolved |
| 9   | Data/migration; compatibility   | Existing invitations, mixed-version deployments, rollback, and English-only configuration expectations. | Temporary language-only differences during rolling upgrade / homogeneous cutover.                                                                                                                                                            | User selected `Allow temporary difference (Recommended)`: upgrade every instance before global `nl`; restore `en` and confirm propagation before rollback. Keep stored locale, token lifetime/state and delivery outcomes unchanged; no migration/backfill. | ✅ Resolved |
| 10  | UX/presentation                 | Dutch tone, complete translation content, and validation/page-title coverage.                           | Neutral `je/jij` / formal `u/uw`; keep names, brands and personal messages untranslated.                                                                                                                                                     | User selected **`U/uw`**. Full invitation error text/titles are in scope; add a small internal password failure reason without changing rules or legacy English errors for other callers.                                                                   | ✅ Resolved |
| 11  | Integration; data/state         | Email locale precedence when input is absent or unsupported; regional language tags.                    | Explicit supported email input → organization → global → English, with no browser language; normalize regional tags, select packaged locales, skip unsupported candidates and browser `q=0`/invalid quality values.                          | User selected `Approve remaining register` after this exact chain and the normalization/quality recommendation. OIDC priority order stays unchanged.                                                                                                        | ✅ Resolved |
| 12  | Scope; testing                  | Exact superseded English-only assertions and new specification/test ownership.                          | Replace only requirements superseded by #179 and directly affected presentation/mocks; preserve unrelated bounds, security assertions and historical evidence.                                                                               | User selected `Approve remaining register`. The exact bounded future test modification set is recorded below; no tests are edited during planning.                                                                                                          | ✅ Resolved |
| 13  | Naming; technical               | Component/test names, small-helper API, domain lenses, phase decomposition and coverage goals.          | Three specification-first phases: locale resources/contracts, email, acceptance and final verification. Existing framework, configured quality thresholds and standard coverage targets remain; no new framework/infrastructure.             | User selected `Approve remaining register`. Internal lexical names carry no new public API contract; document them in the component specs.                                                                                                                  | ✅ Resolved |

## Runtime Runner Path Approval

| # | Category | Discovery | Proposed bounded resolution | Decision | Status |
| --- | --- | --- | --- | --- | --- |
| 16 | Verification environment (runtime) | The approved long temporary root yields a 167-byte harness control-socket pathname; Linux supports 108 bytes. The clean-candidate run exited 30 before producing assurance evidence. | Permit task-owned synthetic fixtures, browser profiles, sockets and metadata under `/tmp/opencode/porta-il-20261029/`, configure only runner `TMPDIR`, retain all source/oracles/lifecycle ownership, and clean the exact directory afterward. | User selected “Allow short path (Recommended)” for this exact fixture location and purpose on 2026-10-29 | ✅ Resolved |

Evidence: `test-harness/fixtures/lifecycle-validation.ts:22–29` constructs the socket under
`os.tmpdir()`. A bounded local socket probe rejects the configured pathname with `AF_UNIX path
too long`. The first run used clean commit `28f94101d8a02585d652950351c20654c9c4b0b4`, tree
`b488e8cdb165e17f4f9d76ab5e225b736dc3f8bc`, and produced no assurance result directory. Its
source stayed clean throughout. The proposed fix is environment configuration, not runner or
product code. Existing protected paths remain subject to their exact approvals.

## Runtime Assurance Evidence Gap

| # | Category | Discovery | Required disposition | Decision | Status |
| --- | --- | --- | --- | --- | --- |
| 17 | Verification evidence (runtime) | Clean run `6ebcf584-1f5a-4df0-8072-bfc468703bc8` exited 21 at the live functional-authentication case. The parent summary retained its failure/counts but discarded the diagnostic detail. The unchanged complete diagnostic replay passed; the earlier failure cannot be classified as runtime versus semantic assertion. | Retain the first failure as unclassified, credit the complete passing run as current verification, perform no speculative correction or further green-only reruns, then publish for full CI. | User explicitly approved this limited evidence disposition with “do it” on 2026-10-30 after reviewing the limitation and completed focused investigation. No assertion change or claim that the first run passed is authorized. | ✅ Resolved |

Both runs used commit `abd9b756e2a836c5798af7fff44af6904b1d01e2`, tree
`6583c4f96fec17dcaf2220a232ec8879e9236d88`, unchanged source/oracles/timeouts and the approved
short `TMPDIR`. The later run `238cd90b-da68-42b0-a32e-272e31a1218f` exited 0 with exposure
11/11, functional 7/7, second-factor 4/4, tenant/admin 17/17 and recovery 5/5; zero skipped cases.
Exposure artifacts from both runs confirm all eleven observations passed with no missing/failed
arrays and successful recovery. The parent explicitly owns the diagnostic-capture loss.

The independent security auditor, session `ses_e77cdec77ffe1BNO7LQjsfTtE4`, reviewed this exact
evidence limitation. It requires holding the gate rather than treating the passing replay as
classification of the earlier failure. No product defect is established, but neither is an
environmental cause. Additional passes alone cannot recover the discarded diagnostic.

On 2026-10-30 the user selected “Investigate further (Recommended)”: focused diagnostics may
reuse the existing functional-authentication suite and harness with unchanged assertions. Source,
oracle or infrastructure changes require a further decision. This authorizes investigation only;
the evidence gap remains open until supported resolution is available.

The authorized bounded investigation completed two reset-isolated executions of the unchanged
functional specification on clean checkpoint `2777c661217af2783756865030f4f6536d827b2e`.
Both passed 7/7 with no skipped/cancelled cases (445.044 and 442.917 seconds). Each retained 892
safe browser-operation events. The twenty expected negative-login callback waits per run were
handled by the existing observer; no uncaught error or semantic failure reproduced. The natural
expiry wait was observed in both runs. No source, oracle, timeout or infrastructure was changed.
This closes the authorized diagnostic exercise, not the evidence gap. Further unchanged passing
replays alone are not a supported resolution, and no speculative code correction is justified.

**Final user disposition (2026-10-30):** After the investigation, the user requested a simple
resolution and approved retaining the original failure as unclassified, using the complete
exit-0 run as current verification and proceeding to full CI. This is an explicit evidence
acceptance with a retained limitation, not a technical diagnosis or an assertion waiver. Earlier
auditor advice and all failed outcomes remain above. No known failed semantic assertion is
deleted, weakened or reclassified, and no claim of failure-free execution history is made.

## Systematic review

The register covers all twelve universal categories. Stakeholder conflict review finds the
administrator's selected invitation language and the recipient's browser preference separated by
the approved precedence in AR #2. The implementation must not add multi-operator Admin UI behavior.
Selected domain lenses are web application, data and migration (stored language and template
compatibility), and distributed/concurrent (per-render isolation, awaited overrides, mixed-version
operation). No new persistence, job, cache, or infrastructure is authorized.

## Bounded specification supersession (AR #12)

Execution may update only the following obsolete expectations and required supporting setups:

- `packages/server/tests/unit/lib/system-config-catalog.spec.test.ts`: the locale metadata entry,
  exact English-only allowlist and rejection of `nl`; retain the eighteen-key catalog, native-value
  checks, every numeric bound, complete-namespace requirement and unrelated assertions.
- `packages/server/tests/unit/routes/system-config-api.spec.test.ts` and
  `system-config-api-fixtures.ts`: accept native `en`/`nl`, reject unknown/malformed values and
  preserve exact authorization/storage behavior.
- `repo-tests/monorepo/global-configuration-docs.spec.test.mjs`: replace only the English-only
  documentation choice with the new closed pair; keep all other catalog and security checks.
- `packages/server/tests/unit/auth/i18n.test.ts`: preload/available-locale fixtures and the newly
  approved language-selection behavior; these are implementation-facing tests, not authority to
  change a feature specification after it is authored.
- Existing invitation/email/password tests may receive new API mocks and additive internal reason
  expectations while retaining their unchanged English, transaction, delivery and security checks.
  The invitation enumeration specification's assertions may not be weakened or removed.
- `repo-tests/monorepo/server-package.spec.test.mjs`: recompute physical inventory counts only for
  actual test additions; retain exact inventory protection rather than lowering the requirement.

These are future implementation changes, not additions to the current planning modification set.
Historical global-configuration and invitation requirements/plans remain unchanged as delivery
evidence. This new standalone plan owns the prospective `en`/`nl` contract.

## Independent challenge and minimum-sufficient design

One blind, read-only design challenger reviewed AR #6–9 and #11; session
`ses_e826858c5ffeiM2oQ0mpmqTZb1`. It recommended the invitation-only context bundle, awaited
existing overrides, two locale contexts for acceptance, closed internal password failure reasons,
and explicit mixed-version precautions. The parent reconciled those controls before presenting
them. User authority is the three final design answers above, not the challenger verdict.

The per-render-helper alternative was viable but not selected. No machinery beyond ordinary
feature helpers and existing test infrastructure is needed; the complexity-escalation trigger was
checked and did not fire. Standing specialist detection is completed after phase decomposition;
no custom agent creation is authorized.

All thirteen decisions were presented or imported from explicit confirmations. The final answer
`Approve remaining register` confirmed the complete remaining register, together with the chosen
rendering and rollout options. There are no deferred or unresolved material decisions. The gate
permits plan authoring only, not implementation, tests, commits, pushes, releases, or deployment.

## Preflight Supplement — 2026-10-28

The decisions above retain their original planning authority. The user subsequently authorized
in-scope plan corrections and a local commit under `--auto-design`. The complete delegated
resolution records are in [the preflight report](00-preflight-report.md); root invocation
`invitation-preflight-20261028`, policy version 1. This supplement closes technical omissions in
AR #12 without changing the approved product contract or allowing arbitrary specification edits.

- **PF-002:** Also supersede only the native-`nl` invalid-value clause in
  `packages/server/tests/unit/lib/system-config-runtime.spec.test.ts`. Replace that invalid
  candidate with unsupported `de`; add native `en`/`nl` success cases with no fallback warning.
  Retain missing/corrupt/unavailable storage, malformed values, safe diagnostics, cache and all
  unrelated assertions. Author the changed oracle before activating Dutch in the catalog.
- **PF-004:** In `repo-tests/monorepo/server-package.spec.test.mjs`, the browser inventory may
  narrowly change `/\.spec\.ts$/` to `/\.spec(?:\.test)?\.ts$/` so both existing Playwright tests
  and new immutable `.spec.test.ts` files are counted. Preserve every existing match and compute
  exact counts from actual files. This permits that detector clause as well as count updates,
  not a runner, shared setup or harness change. Keep inventories current when each test file is
  added, before the corresponding task commit; the later hardening tasks recheck the totals.
- **PF-007:** Existing permitted email-test setup adaptations explicitly include file-local,
  awaited `initI18n()` in `packages/server/tests/integration/services/email.service.test.ts`.
  Its English-copy, SMTP delivery and lifetime assertions remain unchanged.

All other original test boundaries remain in force. Current preflight changes documents only;
product test edits still belong to authorized execution.

## Runtime Resolution

| # | Category | Ambiguity / gap | Options presented | User decision | Status |
| --- | --- | --- | --- | --- | --- |
| 14 | Testing (runtime) | The send/preview literal-data cases supply an inviter but install only the no-inviter subject override, then expect that override to replace the inviter-specific subject. | Correct only this case's override fixture to target the inviter-specific key, preserving recipient/inviter input values and every expected assertion; or keep execution paused for review. | User selected “Correct fixture (Recommended)” on 2026-10-29: change only the fixture key, preserve all recipient/inviter data and every expected output/assertion, then resume. | ✅ Resolved |
| 15 | Testing; scope (runtime) | Existing MailHog client reads multipart data from `Content.MIME`, but the live v2 API exposes it at root `MIME`; delivered HTML is therefore reported as empty. | Correct only the v2 MIME-envelope location in the existing shared helper, preserve all feature assertions and verify affected consumers; or pause for review. | User selected “Fix helper (Recommended)” on 2026-10-29, explicitly authorizing the named file's scope addition, MIME-envelope correction and affected regression checks. | ✅ Resolved |

The approved subject contract distinguishes inviter and no-inviter variants (`03-02-email.md:20–25`).
The resource keys are `emails.invitation.subject_inviter` and `emails.invitation.subject`, and the
implementation selects the former when an inviter is supplied (`src/auth/email-service.ts:374–376`
under `packages/server/`). In `tests/unit/auth/invitation-email-localization.spec.test.ts:345–360`,
the literal-data case installs only the latter key but supplies `inviterName: '{{locale}}'`.
Consequently both send and preview receive the correct default inviter variant instead of the
fixture's expected `Welkom bij $& {{userName}}`. The other 50 caller/context cases pass.

Recommendation: keep the subject-variant contract and every immutable output assertion; correct
only the fixture key in those two parameterized cases. No product, security or persistence policy
change is needed. This requires an explicit ruling because it changes an authored specification's
runtime fixture. Confidence: high; grounded in the approved variant contract and exact failing
case. The expected value must not be changed to match current output.

The authorized correction targets `emails.invitation.subject_inviter` in this one literal-data
fixture, with the same `Welkom bij {{orgName}}` value. It changes no production subject selection,
other override fixture, recipient/inviter data, expected output or assertion.

### AR #15 — MailHog observer prerequisite

All 68 email unit specifications pass. The six real parity cases also pass their complete
pre-MIME send/preview comparisons and subject assertions, then fail because `received.html` is
empty. The existing helper declares and reads `item.Content.MIME` at
`packages/server/tests/e2e/helpers/mailhog.ts:57–67,232–245`.

A controlled plain/HTML diagnostic message sent only to the owned stack confirmed that the v2
response contains root-level `MIME.Parts`, no `Content.MIME`, and both `text/plain` and `text/html`
parts. Only schema flags/content types were reported; no invitation token or message body was
exposed. The diagnostic message was deleted afterward.

The necessary expanded modification set is one existing file:
`packages/server/tests/e2e/helpers/mailhog.ts`, plus these owning plan/status records. The proposed
change corrects its raw response type and MIME accessor location. It adds no parser, dependency,
runner or test framework and changes no product email behavior. Existing real integration cases
already provide the regression oracle; their assertions must remain unchanged. A local duplicate
decoder would add maintenance and leave the shared reader incorrect.

Recommendation: authorize the bounded shared-helper correction, then run the affected MailHog
consumer regression gates. The main tradeoff is that correcting a shared observer can expose
previously hidden failures in other tests; those must be investigated, not weakened or ignored.

The authorized correction moves the raw response's MIME field to the message root and reads
that field during parsing. The existing decoder and every feature assertion remain unchanged.
