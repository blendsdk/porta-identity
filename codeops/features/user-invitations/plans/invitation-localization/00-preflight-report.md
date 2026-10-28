# Preflight Report: Invitation Localization

> **Status**: ✅ PREFLIGHT PASSED — all 7 findings resolved
> **Iteration**: 3 — PF-001 task-gate correction and direct dependencies only
> **Artifact**: Full implementation plan at `codeops/features/user-invitations/plans/invitation-localization/`
> **Code baseline**: `cc57de14e5f4a7a1f68538191bdb1484da006ac5` (v1.14.2)
> **Branch**: `plan/179-invitation-localization`
> **Initial artifact SHA-256**: `6d93f7038166366ef060eea7d289001562c3a09cb3c941dfecd065e5655c5e30`
> **Passed artifact SHA-256**: `05ed3970c35765b9bf85181c39b0abeb8dcbccf83c90d44347021d7109d193c1`
> **Last Updated**: 2026-10-28
> **CodeOps Artifact Schema**: 1

## Scope and Authority

The audit target is the nine documents listed in the index: `00-index.md`,
`00-ambiguity-register.md`, `01-requirements.md`, `02-current-state.md`, `03-01-locales.md`,
`03-02-email.md`, `03-03-acceptance.md`, `07-testing-strategy.md`, and `99-execution-plan.md`.
This report is generated evidence, excluded from the target content hash. Hashing concatenates
each sorted filename, one NUL byte, then its raw contents, using SHA-256.

Source, tests, manifests, project guidance, public/maintainer documentation, historical plans and
roadmaps are context only. No sibling artifact receives a pass from this review. Authorized
modifications are this plan, its audit report and its feature-roadmap summary. The portfolio
cascade is deferred on this non-integration branch.

Strict product scope remains AR #1–13: localized invitation delivery/acceptance, complete formal
Dutch, English fallback, unchanged authority, lifetime, persistence and delivery outcomes. The
minimum design reuses i18next, Handlebars and existing runners. No optional expansion or material
support-system escalation was found.

The user confirmed the existing own branch and **Apply and commit** for in-scope plan corrections,
rechecking, audit/roadmap updates and a local commit. Implementation and publication are separate
workflows. Auto-design delegates only eligible technical resolutions; it does not waive risk or
change product/security policy. Root invocation: `invitation-preflight-20261028`; policy version 1.

The plan was not authored during this audit workflow. Fresh independent contexts reviewed five
dimension clusters and all three selected domain lenses. No pinned specialist role was required;
generic read-only agents received complete dynamic packets and the same safety boundaries.

## Codebase Context

| Area | Verified evidence |
| --- | --- |
| Stack | TypeScript ESM, Koa, PostgreSQL, i18next/filesystem backend and Handlebars; `packages/server/package.json:49–74` |
| Locale resources and selection | Eleven namespaces; existing allowlist preloading, permissive browser parsing and per-translator override maps; `packages/server/src/auth/i18n.ts:46–98,180–268,289–389` |
| Email | Shared invitation context for send/preview, English lifetime/subject, independent HTML/plaintext lookup; `packages/server/src/auth/email-service.ts:285–420`, `email-renderer.ts:96–126` |
| Acceptance | Scoped lookup, GET conflict check, CSRF-first POST, atomic acceptance and generic rejection; `packages/server/src/routes/invitation.ts:172–365`, `packages/server/src/users/invitation-service.ts:55–91` |
| Persistence | Explicit/null locale is stored and copied to the accepted account; `packages/server/src/users/invite-service.ts:318–325`, `invitation-service.ts:74–82` |
| Existing renderer | Per-render translation helper and explicit title support already exist; `packages/server/src/auth/template-engine.ts:301–337` |
| Security oracle | Identical rejection context/audit and token secrecy; `packages/server/tests/unit/security/invitation-enumeration.spec.test.ts:281–358,389–429` |
| Verification boundary | Vitest project selectors, existing SMTP/browser fixtures, exact physical inventory and clean-source assurance admission are available; evidence detailed below |

Initial deterministic checks passed: **9 documents, 43 local links/anchors, 10 requirements,
30 specification case IDs and 40 unique pending tasks**. No identifier, required-file or local-link
failure substituted for the semantic audit.

### External Standards

- [RFC 9110 §12.4.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2): `q` is
  case-insensitive; absent weight means 1; zero is not acceptable; the qvalue grammar permits
  `0` with up to three decimal digits or `1` with up to three zero digits.
- [RFC 9110 §12.5.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.4):
  `Accept-Language = #( language-range [ weight ] )`; applications may select the appropriate
  matching scheme. Stable tie ordering is this plan's explicit behavior, not a universal HTTP
  guarantee.
- [RFC 4647 §2.1 and §3.4](https://www.rfc-editor.org/rfc/rfc4647.html#section-2.1):
  language ranges match case-insensitively; lookup can fall back from regional to base language
  and requires application-defined defaults. The approved underscore convention is legacy input
  recovery, not standard wire syntax. Only packaged canonical identifiers reach resource lookup.

These checks found no additional standards defect. Existing password-policy compliance claims
were not re-certified; the plan preserves that policy and changes only presentation dispatch.

## Coverage and Findings

Counts use each finding's primary dimension; secondary coverage does not duplicate root causes.

| # | Dimension | Findings | Highest severity |
| --- | --- | --- | --- |
| 1 | Ambiguities | 0 | — |
| 2 | Implicit Assumptions | 1: PF-007 | Minor |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 0 | — |
| 5 | Dependency Issues | 1: PF-003 | Major |
| 6 | Feasibility Concerns | 0 | — |
| 7 | Testability | 2: PF-005, PF-006 | Minor |
| 8 | Security Blind Spots | 0 | — |
| 9 | Edge Cases | 0 | — |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 1: PF-001 | Major |
| 12 | Consistency | 0 | — |
| 13 | Codebase Alignment | 2: PF-002, PF-004 | Major |

| Severity | Findings | Final state |
| --- | --- | --- |
| Critical | 0 | None |
| Major | 3 | All resolved |
| Minor | 4 | All resolved |
| Observation | 0 | None |

| Domain lens | Result |
| --- | --- |
| Web application | Browser validation/inventory findings; no additional auth, tenant or CSRF defect |
| Data and migration | Omitted runtime specification; stored/null locale, template and rollback boundaries otherwise sound |
| Distributed and concurrent | No findings; awaited first reads, isolated translators and existing durable transaction ownership preserved |

All ten codebase-alignment subchecks were covered: phantom references, stale assumptions,
architecture, impact, redundancy, test impact, dependencies, conventions, proportionality and
migration/compatibility.

## Findings

Locations below identify the initial hashed artifact. Corrections retain these finding identities.
Every resolution below has **Authority: AI — delegated by --auto-design**, policy version 1,
root invocation `invitation-preflight-20261028`, and the user's separate authorization to apply
in-scope plan corrections. The original product decisions remain unchanged. Each decision was
checked against the smallest viable solution, a larger-budget alternative, the strongest opposing
case and observable invalidation conditions. The blind challenger reviewed the complete batch
without the lead's preferences; no risk was waived and no finding dismissed.

### PF-001: Phase 1 requires a Phase 2 API — 🟠 MAJOR

**Dimension:** Ordering & Sequencing; also contradictions, dependencies and testability.
**Location:** `07-testing-strategy.md:29–30,61,120–123`; `99-execution-plan.md:47,59,62,92`.
**Codebase Evidence:** `packages/server/src/auth/i18n.ts:180–184,289–318` has the existing resolver
and synchronous translator, but no `prepareTranslationFunction`.

Phase 1 requires all ST-01–ST-08 green, including direct unsafe preparation, while task 2.2.1
introduces that API. Avoiding collection failure does not make the missing API pass. ST-07 also
needs explicit resolver-versus-consumer ownership.

| Option | Benefit | Cost |
| --- | --- | --- |
| A: Split case ownership by phase | Preserves all assertions and existing implementation boundaries | Explicit mapping of resolver and consumer/preparation subcases |
| B: Move preparation and its specifications into Phase 1 | One early preparation foundation | Larger reorganization, including first-read/isolation specifications |

**Recommendation / Decision:** Option A — split assertion ownership; applied in 03-01, 07 and 99.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Technical testing and sequencing; retain all required assertions while making each phase independently verifiable |
| Rejected alternative | Move the companion to Phase 1: viable, but moves preparation/isolation work unnecessarily |
| Strongest counterargument | A single locale-foundation phase groups more related code together |
| Confidence / hardening | High; challenger converged; explicit ST-07 consumer ownership also retained |
| Reopen trigger | A Phase 1 selector still imports or demands a Phase 2-only API, or a consumer assertion loses its Phase 2 owner |

**Iteration 2 evidence:** Independent re-review closed the Phase 1 manifestation but reopened
PF-001: task 2.2.1 still demanded email callers before wiring in 2.2.2; task 2.2.2 demanded shipped
HTML/plaintext before template replacement in 2.2.3. The same task-gate root cause retains this
ID. Code evidence: `packages/server/src/auth/email-service.ts:312–336,357–364,418–420` and the
hardcoded invitation templates at `invitation.hbs:19–34` / `invitation.txt.hbs:1–16` under
`packages/server/templates/default/emails/`.

**Iteration 3 correction:** Extend the already-challenged split through the implementation tasks:
direct companion → wired callers/context/subject → shipped templates → full Phase 2 green run.
07 now owns an explicit task/assertion boundary table; 99 follows it. Inspection of the direct
downstream boundary found the same title-before-title-implementation risk in 3.2.2/3.2.3, now
separated into authority versus presentation subcases. Existing-test setup moves with its new
dependency and is rechecked during hardening. All 40 tasks, 30 case IDs and full phase gates are
retained; no assertion is skipped. This applies the same eligible technical ruling, not new
product scope or risk acceptance. No third broad independent review was dispatched.

**Iteration 3 verification — Resolved:** The lead checked the corrected 07 task-boundary table
and tasks 2.2.1–2.2.4/3.2.2–3.2.4 against the actual email caller/template and route/title
dependencies. Direct helper checks no longer demand unwired consumers; context checks no longer
demand unchanged shipped templates; route-authority checks no longer demand later titles. All
consumer/template/presentation assertions remain in their later task and complete phase gates.
The official plan parser still reports 40 pending tasks with no structural problem. No unresolved
direct consequence remains. Confidence: High; the selected correction remains aligned with both
the blind challenger and the independent re-review's explicit recommendation.

### PF-002: Runtime locale oracle omitted from bounded supersession — 🟠 MAJOR

**Dimension:** Codebase Alignment; also completeness and migration compatibility.
**Location:** `00-ambiguity-register.md:46–65`; `99-execution-plan.md:47–58`.
**Codebase Evidence:** `packages/server/tests/unit/lib/system-config-runtime.spec.test.ts:83–94`
expects stored native `nl` to fall back to English with a warning. Runtime reads use catalog
validation in `packages/server/src/lib/system-config.ts:97–109`.

The approved Dutch catalog makes that assertion obsolete, but the plan's exact supersession
omits it. Correct implementation would fail an immutable oracle outside the named update set.

Only one in-scope correction is viable: explicitly cover this existing runtime specification,
assert native `en`/`nl` without fallback warnings, and retain unknown/malformed, cache and safe
fallback coverage. Keeping Dutch invalid contradicts the approved product; skipping the test
weakens verification. Preserve the original AR history and identify the supplement separately.

**Recommendation / Decision:** Apply the exact runtime-spec supplement in the register and Phase 1
tasks/selectors; native Dutch succeeds without warning, unsupported `de` retains invalid fallback.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Testing alignment with already-approved native `en`/`nl`; no new product or configuration policy |
| Rejected alternatives | Keeping `nl` invalid contradicts R-1; skipping/deleting the invalid-value specification weakens coverage |
| Strongest counterargument | An immutable specification must not change merely to fit implementation; existing user-approved locale requirements, not implementation output, authorize this bounded supersession |
| Confidence / hardening | High; challenger converged; original AR decision preserved with a separately identified supplement |
| Reopen trigger | Any proposed change extends beyond the obsolete locale candidate and new valid-locale assertions |

### PF-003: Assurance gate lacks a clean committed checkpoint — 🟠 MAJOR

**Dimension:** Dependency Issues; also feasibility and sequencing.
**Location:** `99-execution-plan.md:25–35,136–138`; `07-testing-strategy.md:106,115–128`.
**Codebase Evidence:** `test-harness/assurance/scripts/source-provenance.ts:59–75` rejects any dirty
worktree. `test-harness/assurance/production-exposure/evidence.ts:156` invokes it during evidence
collection, not only before startup.

Required progress edits can invalidate the harness's source identity. The plan does not explain
how to supply and maintain a clean committed candidate, particularly with deferred/no commits.

| Option | Benefit | Cost |
| --- | --- | --- |
| A: Same-worktree clean checkpoint | Reuses the current verification setup | Pause repository writes for the entire run; commit authority is required |
| B: Separate clean verification worktree | Isolates source identity from tracking edits | Extra checkout/install/cleanup and exact-path configuration approvals |

Neither option may override a no-commit decision or weaken provenance. An unavailable authorized
candidate must block this gate.

**Recommendation / Decision:** Option A — a same-worktree authorized clean checkpoint; applied
in 07 and task 3.3.4. Retain candidate identity through collection and cleanup, then record results.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Verification sequencing and evidence integrity under existing commit permissions |
| Rejected alternative | Separate clean worktree is viable but adds checkout/install/cleanup surface without a demonstrated need |
| Strongest counterargument | A dedicated verification worktree is more isolated from ongoing tracking edits |
| Confidence / hardening | High; challenger converged and identified the additional exact `.npmrc` checksum-read prerequisite, now documented |
| Reopen trigger | The runner writes tracked source, other work prevents cleanliness, required access is unavailable, or active commit mode cannot establish the checkpoint |

### PF-004: Planned browser specification escapes inventory — 🟡 MINOR

**Dimension:** Codebase Alignment; also testability.
**Location:** `07-testing-strategy.md:67`; `99-execution-plan.md:120,135`.
**Codebase Evidence:** `repo-tests/monorepo/server-package.spec.test.mjs:420–423` counts only
`.spec.ts`, while the planned file ends in `.spec.test.ts`.

Increasing the count alone fails; retaining it leaves the new file unprotected. This is an
inventory mismatch, not a demonstrated Playwright discovery failure.

| Option | Benefit | Cost |
| --- | --- | --- |
| A: Extend the inventory matcher narrowly | Retains explicit `.spec.test.ts` naming and every existing match | Must authorize the precise detector change, not only a count update |
| B: Use native Playwright `.spec.ts` naming | Existing detector works unchanged | Requires a naming exception to the stated specification convention |

**Recommendation / Decision:** Option A — explicitly permit `/\.spec(?:\.test)?\.ts$/` in the
existing browser-inventory assertion. Apply it with the new browser file, retain all old matches,
and update exact inventories as files are added. Hardening tasks recheck rather than first repair
the counts. The register supplement and 07/99 now name the bounded change.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Test inventory compatibility within an existing assertion; no runner, shared setup or infrastructure addition |
| Rejected alternative | `.spec.ts` fits existing browser files but lacks an explicit exemption from the required `.spec.test.ts` convention |
| Strongest counterargument | Native Playwright naming would avoid even this small matcher change |
| Confidence / hardening | High; challenger converged; clarified that count-only authorization was insufficient |
| Reopen trigger | Matcher drops an existing file, additions escape counting, or implementation proposes wider test infrastructure changes |

### PF-005: Missing-resource fallback lacks an executable oracle — 🟡 MINOR

**Dimension:** Testability.
**Location:** `03-01-locales.md:20–23,103`; `07-testing-strategy.md:23–32,59–68`.
**Codebase Evidence:** `packages/server/src/auth/i18n.ts:79,243–245,369–389` owns bundle selection
and key fallback; `packages/server/locales/default/en/invitation.json:2` provides the independent
English literal `Accept your invitation`.

Pack completeness and missing tenant overrides do not prove English fallback when a selected
default resource is missing. Add bounded isolated real-resource subcases to the existing locale
specification. Keep completeness checks against unmodified shipped packs. Mock-only lookup or
expected values read from the same resource would not prove the promised behavior.

**Recommendation / Decision:** Add three Phase 1 real-resource subcases to ST-01: missing Dutch
`common`, missing invitation namespace, and missing invitation title. The latter two retain
selected `nl` and return the fixed English title. Applied in 03-01, 07 and Phase 1 task wording.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Tests for the already-promised resource fallback, separate from shipped-pack completeness |
| Rejected alternatives | Mocked translation or assertions read from the same resource cannot prove real English fallback; editing shipped resources violates fixture isolation |
| Strongest counterargument | Bundles are complete at build time and i18next already provides fallback |
| Confidence / hardening | High; challenger refined the correction to distinguish common-bundle selection from namespace/key fallback |
| Reopen trigger | Fixture loss changes shipped files, expected text is derived from implementation, or namespace loss incorrectly requires selected language to change |

### PF-006: Browser short-password case can stop before server validation — 🟡 MINOR

**Dimension:** Testability.
**Location:** `07-testing-strategy.md:52`; `99-execution-plan.md:120`.
**Codebase Evidence:** `packages/server/templates/default/pages/accept-invite.hbs:16–21` declares
`minlength="8"`; the existing browser test removes the constraint only in its fixture at
`packages/server/tests/ui/flows/invitation.spec.ts:206–218`.

ST-30 must prove Porta's translated server error, not merely remain on a Dutch form while native
browser validation prevents submission. Test-only constraint removal and programmatic form
submission are viable; neither requires changing production HTML validation.

**Recommendation / Decision:** Reuse test-only removal of `minlength` on both password inputs;
assert the POST, exact Dutch error/title/language and pending token. Applied in ST-30 and task 3.1.3.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Existing browser fixture technique that reaches the required server-validation boundary |
| Rejected alternative | Programmatic form submission is viable but bypasses more of the established user-action path |
| Strongest counterargument | Removing attributes changes the test DOM; scope it to this one deliberately invalid-input case |
| Confidence / hardening | High; challenger converged; the test must observe the actual POST rather than infer it from the displayed form |
| Reopen trigger | Production attributes change, no server POST occurs, or the token is consumed on validation failure |

### PF-007: Existing SMTP test omits the new translator prerequisite — 🟡 MINOR

**Dimension:** Implicit Assumptions; also direct-caller impact.
**Location:** `99-execution-plan.md:92–105`; `00-ambiguity-register.md:61–63`.
**Codebase Evidence:** `packages/server/tests/integration/services/email.service.test.ts:33–59`
initializes SMTP but not i18n; its real invitation call/assertions are at `:100–111`.
`packages/server/tests/integration/setup-worker.ts:25–28` initializes only database and Redis.

The sender gains real translation prerequisites, while the explicit adaptation/selector names
only the unit email-service tests. Add file-local awaited i18n initialization and name the
existing SMTP regression selector. Preserve its English and delivery assertions. Global worker
changes or production lazy initialization would unnecessarily broaden the dependency surface.

**Recommendation / Decision:** Name file-local awaited `initI18n()` and the existing SMTP selector
in 07 and task 2.3.2. The register supplement clarifies the already-permitted setup adaptation.

| Provenance | Record |
| --- | --- |
| Eligibility / objective | Direct-caller test setup for a new dependency, preserving existing English and delivery behavior |
| Rejected alternatives | Relying on another test file's initialization is order-dependent; global setup or production lazy initialization broadens the change |
| Strongest counterargument | Broad regression wording could imply this file, but cannot establish its independent initialization prerequisite |
| Confidence / hardening | High; challenger converged; actual future failure behavior remains unexecuted |
| Reopen trigger | The existing SMTP file cannot pass independently, or its English/expiry/delivery assertions are weakened |

## Independent Evidence

| Dispatch | Session | Result |
| --- | --- | --- |
| Document soundness | `ses_e7cad7fa1ffeEnjbB038mbVQcv` | PF-001 |
| Grounding | `ses_e7cad5147ffeSFaAqo0yPGPAYQ` | PF-001, PF-007 |
| Delivery | `ses_e7cad28dfffe93rJvj4gngfn7p` | PF-001–PF-004 |
| Risk | `ses_e7cad013dffegssOBum4hHQTs5` | No findings |
| Fit | `ses_e7cacdef4ffeAklh2fZQIpUKSI` | PF-001, PF-004, PF-005 |
| Web lens | `ses_e7cacb6a9ffe1pNruCxjvzo8ux` | PF-004, PF-006 |
| Data/migration lens | `ses_e7cac9125ffedQ1d2Bycsm3u9b` | PF-002 |
| Concurrency lens | `ses_e7cac2d88ffeNQdKSSLkdqhlE6` | No findings |
| Blind batch challenger | `ses_e7c4920a0ffe1aEaVOeGU7TP1C` | All seven confirmed; bounded corrections converged, with PF-003/PF-005 refinements recorded above |
| Bounded iteration-2 re-review | `ses_e7c4046afffeORJkSbF9ammNYz` | All 13 dimensions and three lenses rechecked; PF-002–PF-007 resolved, PF-001 reopened for the same task-gate root cause; reviewed target hash `e79c648bc30cae6b281ccdc4f5cd4a252e13d7bd1812b215aa18768c27636c44` |
| Targeted iteration-3 verification | Lead session | PF-001's correction and direct task dependencies verified; no new findings or unresolved consequences |

## Verification

| Check | Evidence |
| --- | --- |
| Initial links, identifiers and task shape | Passed: 43 local links; 10 requirements; 30 cases; 40 pending tasks |
| Final links, identifiers and task shape | Passed: 48 local links including report/feature roadmap; 10 requirements; 30 case IDs; 40 unique pending tasks in 15/10/15 phases |
| Read-only CodeOps plan parser | Ready; 0/40 verified; no structural problems |
| `pnpm test:changed` | Passed: 142 structure tests; no affected server/SDK/CLI product tests selected |
| Corrected-artifact rescan | All 13 dimensions and three lenses covered in iteration 2; remaining PF-001 correction/direct dependencies verified in iteration 3 |
| Roadmap counter engine | Passed on an isolated copy of the owning feature roadmap; no unrelated roadmap writes |
| Cleanup | Owned installer fixtures/compiler caches and temporary audit packets/log removed; Docker baseline unchanged: 27 containers, 14 networks, 40 volumes; no task-owned services started |

The final adversarial check asked whether prior design assumptions were being repeated, whether
the bounded HTTP-language behavior contradicted its standards, and what a dissenting reviewer
would find. Independent challenge and re-review exposed the sequencing issue; its remaining
manifestation was corrected rather than waived. No further in-scope defect remained.

Static plan review does not prove future Dutch translation quality or product behavior. Execution
must still perform every specified test, independent Dutch-copy/security review and CI gate.
Implementation remains **0/40**. The owning `T-02` roadmap row stays Backlog under the task-lane
convention and links this passed audit; it does not claim execution has begun. The nine-document
index records the plan pass. No sibling roadmap row or portfolio stage was advanced.
