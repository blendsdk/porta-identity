# Ambiguity Register: Invitation Localization (#179)

> **Status**: ✅ GATE PASSED — all 13 items resolved
> **Last Updated**: 2026-10-27 15:24
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
