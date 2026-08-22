# Ambiguity Register: Porta Test Assurance

> **Status**: ✅ GATE PASSED — all 26 items resolved
> **Last Updated**: 2026-08-09 14:27
> **CodeOps Artifact Schema**: 1
> **Auto-design root**: `AD-TA-20260809-1421` · policy version 1

|   # | Category       | Ambiguity / Gap                                                    | Options Presented                                                                                 | User Decision                                                                                                                                | Status      |
| --: | -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
|   1 | Scope          | Feature identity and authorized boundary                           | New `test-assurance` feature / maintenance task / monorepo-migration extension                    | New `test-assurance` feature with the confirmed in/out scope                                                                                 | ✅ Resolved |
|   2 | Scope          | Whether assurance work may stop publishing or ordinary development | Big-bang freeze / incremental parallel program                                                    | Incremental parallel program; Porta remains publishable and usable                                                                           | ✅ Resolved |
|   3 | Technical      | External system-assurance environment                              | Extend existing harness / create another harness / collapse into server tests                     | Extend the existing `test-harness`; create no replacement harness                                                                            | ✅ Resolved |
|   4 | Scope          | Treatment of the 4,307 existing tests                              | Rewrite / delete weak tests / retain and audit incrementally                                      | Retain existing suites and audit incrementally; never weaken the pentest baseline                                                            | ✅ Resolved |
|   5 | Scope          | External AI security scanner                                       | Integrate now / pilot now / defer                                                                 | Keep Codex Security as a footnote and outside this feature                                                                                   | ✅ Resolved |
|   6 | Behavioral     | Strength of the assurance claim                                    | Absolute absence of exploits / bounded evidence with no known unresolved exploit                  | Bounded, evidence-backed assurance; never claim absolute absence of exploits                                                                 | ✅ Resolved |
|   7 | Behavioral     | Authority for expected behavior                                    | Current code / current tests / requirements and normative standards                               | Requirements, security invariants, public contracts, and applicable standards own expectations                                               | ✅ Resolved |
|   8 | Integration    | Traceability model                                                 | File-level notes / requirement-control-test-evidence ledger / coverage-only dashboard             | Requirement-control-test-evidence ledger with named gaps                                                                                     | ✅ Resolved |
|   9 | Technical      | Fixture setup versus oracle observation                            | Public setup only / internal setup allowed / direct database assertions                           | Internal setup is allowed only for arrangement; assertions observe public surfaces                                                           | ✅ Resolved |
|  10 | Data & state   | Tenant fixture topology                                            | One tenant / two fixed tenants / per-test container                                               | At least two deterministic tenants with distinct users, apps, clients, roles, and secrets                                                    | ✅ Resolved |
|  11 | Edge cases     | State isolation and cleanup failure                                | Best-effort cleanup / fail hard / recreate the complete stack for every test                      | Deterministic scoped reset; required cleanup or reset failures fail the affected suite                                                       | ✅ Resolved |
|  12 | Technical      | Harness extension mechanism                                        | More standalone scripts / Playwright projects in the existing harness / another runner            | Add protocol, security, and compatibility projects to existing Playwright configuration                                                      | ✅ Resolved |
|  13 | Technical      | Coverage attribution for assembled-server execution                | Accept current zeros / run server in worker / collect and merge process coverage                  | Capture Docker-server V8 coverage separately, prove source-map attribution, then merge matching-build reports only                           | ✅ Resolved |
|  14 | Non-functional | Coverage enforcement                                               | Immediate global thresholds / advisory forever / baseline plus changed-surface ratchet            | Observe first, commit exact baselines, then add no-regression and changed-surface ratchets; no immediate historical threshold                | ✅ Resolved |
|  15 | Technical      | Defect-detection proof for legacy tests                            | Line coverage / manual fault injection / selective mutation / full-repository mutation            | Version curated reproducible fault patches first, then add targeted automated mutation where useful                                          | ✅ Resolved |
|  16 | Behavioral     | Red-phase handling for already implemented behavior                | Require artificial red / accept pre-existing green / prove sensitivity through controlled faults  | Record naturally green legacy specs and require a controlled fault or mutation to prove sensitivity                                          | ✅ Resolved |
|  17 | Behavioral     | Assertion strictness                                               | Broad allowed-status assertions / exact contract assertions / smoke-only checks                   | Exact externally observable contract assertions; no silent conditional exits or setup skips                                                  | ✅ Resolved |
|  18 | Scope          | Audit priority                                                     | File order / coverage-lowest order / security-risk order                                          | Security-risk order: tenant/RBAC, OIDC/tokens, sessions/recovery/2FA, then P1 surfaces                                                       | ✅ Resolved |
|  19 | Scope          | Handling product defects found during the audit                    | Fix inside assurance work / ignore / record and route separately                                  | Record and reproduce defects; fix them through separate authorized product tasks before closing the affected slice                           | ✅ Resolved |
|  20 | Integration    | SDK and CLI compatibility evidence                                 | Mock-only / direct live-server checks / full replacement of unit suites                           | Add focused live-server contract journeys while retaining existing SDK and CLI unit suites                                                   | ✅ Resolved |
|  21 | Non-functional | Expensive assurance execution                                      | Put everything in `yarn verify` / separate CI lanes / manual only                                 | Preserve `yarn verify`; run harness assurance in its existing lane and fault/mutation campaigns on demand until promoted                     | ✅ Resolved |
|  22 | Security       | Test data and credentials                                          | Reuse developer data / synthetic ephemeral fixtures / production snapshots                        | Synthetic ephemeral fixtures only; generated artifacts and secrets remain uncommitted                                                        | ✅ Resolved |
|  23 | Scope          | Browser expansion                                                  | Chromium only / add Firefox and WebKit / cross-browser matrix                                     | Retain Chromium in this feature; broader browser support requires separate scope approval                                                    | ✅ Resolved |
|  24 | Integration    | External certification                                             | Claim standards conformance / run relevant normative cases without certification / omit standards | Use applicable OIDC, OAuth, JWT, PKCE, and OWASP requirements as oracles without claiming certification                                      | ✅ Resolved |
|  25 | Non-functional | Slice completion evidence                                          | Passing tests only / coverage target only / traceability plus fault sensitivity and verification  | All Must criteria traced, exact specs green, fault sensitivity proven, full verification green, and gaps named                               | ✅ Resolved |
|  26 | Security       | Known security failures and release safety                         | Continue regardless / severity-based risk acceptance / invariant violation blocks completion      | A verified security-invariant violation blocks slice completion and follows existing security policy; this feature grants no risk acceptance | ✅ Resolved |

## Resolution Notes

### AR-1 — Feature identity and boundary

Authority: User — confirmed the recommended `test-assurance` feature and the presented in/out scope on 2026-08-09. Product fixes, another harness, external scanner integration, immediate unreliable coverage gates, wholesale test rewrites, and publishing changes are excluded.

### AR-2 — Release-safe delivery

Authority: User — explicitly required Porta to remain publishable and usable while assurance work proceeds, then confirmed the incremental scope.

### AR-3 — Single harness

Authority: User — explicitly rejected inventing another harness and approved extension of `test-harness`.

### AR-4 — Existing suite preservation

Authority: User — accepted the consolidated incremental audit direction. The project security policy independently prohibits deleting, skipping, or weakening the pentest baseline.

### AR-5 — Scanner deferral

Authority: User — “keep the openai's security tool as a footnote for now.”

### AR-6 — Assurance claim

Authority: User — confirmed a functional and security assurance feature after the explicit limitation that no finite test program can prove the absolute absence of exploit paths. Completion therefore concerns independently specified behavior, known findings, reviewed surfaces, and named residual gaps.

### AR-7 — Oracle authority

Authority: AI — delegated by `--auto-design`.
Eligibility: Testing strategy within the confirmed assurance scope; it changes no Porta product behavior.
Objective: Prevent implementation-derived tests from becoming self-validating oracles.
Decision: Expected behavior comes from approved requirements, Porta security invariants, published contracts, and applicable normative standards; current code and legacy tests are evidence only.
Evidence: The inventory records 275 undifferentiated test files, extensive mocking, broad assertions, and no mutation testing.
Rejected alternatives: Current code repeats the original concern; current tests inherit the same provenance risk.
Strongest counterargument: Requirements and standards may be incomplete or misinterpreted.
Confidence: High — reopen if an authoritative product contract conflicts with an RD.
Hardening: Independent challenge pending only for coupled technical mechanisms, not this authority hierarchy.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Conflicting approved requirements or a newly adopted normative compatibility target.

### AR-8 — Evidence ledger

Authority: AI — delegated by `--auto-design`.
Eligibility: Internal traceability mechanism.
Objective: Make every assurance claim auditable without treating coverage or test counts as proof.
Decision: Maintain mappings from requirement/control to test, evidence type, result, and named gap; do not duplicate the owning specifications.
Evidence: The current inventory describes surfaces but explicitly cannot establish oracle quality.
Rejected alternatives: File notes do not close gaps systematically; coverage-only dashboards measure execution, not correctness.
Strongest counterargument: Traceability creates maintenance overhead.
Confidence: High — reopen if automated validation cannot keep mappings current at reasonable cost.
Hardening: In-context review retained the ledger but forbids duplicated requirement text.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Persistent drift or evidence that the ledger does not improve review decisions.

### AR-9 — Arrangement and observation boundary

Authority: AI — delegated by `--auto-design`.
Eligibility: Test fixture architecture inside the approved harness.
Objective: Keep setup practical while preserving an independent black-box oracle.
Decision: Harness setup may use Porta services to create correctly encoded fixtures, but specification assertions use public HTTP, browser, SDK, CLI, email, or protocol surfaces only.
Evidence: The existing seed script imports Porta services for hashing while journeys already observe external clients.
Rejected alternatives: Public-only setup would add unrelated bootstrap complexity; internal assertions would repeat implementation behavior.
Strongest counterargument: Internal setup can conceal defects in public provisioning paths.
Confidence: High — provisioning behavior receives separate public compatibility cases.
Hardening: In-context review added an explicit prohibition on internal expected-value calculation.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Fixture setup mutates state that cannot be reproduced through supported product behavior.

### AR-10 — Multi-tenant fixtures

Authority: AI — delegated by `--auto-design`.
Eligibility: Reversible test-data topology.
Objective: Make cross-tenant attacks and ownership errors observable.
Decision: Seed at least two isolated tenants, each with distinct identities, applications, public/confidential clients, roles, and credentials.
Evidence: The current harness seeds one organization, one user, and two clients, which cannot prove negative tenant boundaries.
Rejected alternatives: One tenant cannot exercise cross-tenant access; per-test containers are too slow for every case.
Strongest counterargument: Fixed shared tenants can create order coupling.
Confidence: High — scoped reset and unique scenario resources address coupling.
Hardening: Challenger converged and added super-admin, role-diverse, locked, suspended, 2FA, and recovery fixtures where required by a slice.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Parallel execution or scenario volume makes fixed fixture isolation unreliable.

### AR-11 — Deterministic reset

Authority: AI — delegated by `--auto-design`.
Eligibility: Failure and recovery design for test infrastructure.
Objective: Ensure a passing result never depends on stale state or ignored cleanup failure.
Decision: Reset mutable state at a documented suite/scenario boundary; required reset failures are fatal. Full stack recreation remains available for destructive scenarios, not every test.
Evidence: The current global setup catches Redis and MailHog cleanup failures and continues; Playwright runs serially because state is shared.
Rejected alternatives: Best-effort cleanup can create false passes; recreating the full stack for every test is disproportionate.
Strongest counterargument: Scoped reset code may itself become complex and incomplete.
Confidence: Medium pending an implementation spike.
Hardening: Challenger converged on job-level ephemeral infrastructure, project-level database/cache/mail reset plus Porta restart, and scenario-prefixed resources. It rejected per-scenario stack rebuild as too slow unless leakage persists.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Any order-dependent result, state leak, or reset duration comparable to stack recreation.

### AR-12 — Harness project structure

Authority: AI — delegated by `--auto-design`.
Eligibility: Internal organization using the existing Playwright dependency.
Objective: Separate browser journeys, raw protocol behavior, attacks, and client compatibility without another harness.
Decision: Extend Playwright with `protocol`, `security`, and `compatibility` projects alongside `spa` and `bff`.
Evidence: The configuration already uses named projects and Playwright provides browser and request contexts.
Rejected alternatives: Standalone scripts lose reporting/fixtures; another runner violates confirmed scope.
Strongest counterargument: One Playwright configuration could become a catch-all.
Confidence: High — component directories and ownership rules keep boundaries explicit.
Hardening: In-context review retained one runner but separates projects and fixtures.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: A required protocol test cannot be expressed safely with Playwright or Node primitives.

### AR-13 — Coverage attribution

Authority: AI — delegated by `--auto-design`.
Eligibility: Instrumentation mechanism that does not change product behavior.
Objective: Measure code executed by the actual server process without falsely attributing browser or client execution.
Decision: Set `NODE_V8_COVERAGE` for the Dockerized Node process, persist raw output to a mounted directory, stop cleanly, remap compiled output through matching source maps, bind evidence to the exact commit/image, and keep the report separate until merge equivalence is proven.
Evidence: Vitest global setup runs assembled-server code outside instrumented workers; the production build emits source maps.
Rejected alternatives: Accepting false zeros is misleading; moving startup into a worker weakens production-boundary fidelity.
Strongest counterargument: V8 path normalization and source-map remapping can be brittle.
Confidence: Medium until a spike demonstrates stable attribution.
Hardening: Challenger converged and required matching-build provenance plus separate reporting before merge.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Unmapped ranges are material, reports change without source/test changes, or clean shutdown cannot reliably emit data.

### AR-14 — Coverage enforcement

Authority: AI — delegated by `--auto-design`.
Eligibility: Testing and CI mechanism within the user-confirmed “no immediate unreliable gate” boundary.
Objective: Prevent regressions without rewarding meaningless padding or blocking releases on invalid data.
Decision: Start observation-only; commit exact covered/total baselines and exclusions after reproducibility is proven; then require no regression and changed-line/branch evidence for security-sensitive changes. Raise per-slice floors only as audited slices close.
Evidence: Current configured thresholds fail and assembled-server attribution is incomplete.
Rejected alternatives: Immediate historical thresholds block releases for inherited debt; permanent advisory reporting cannot prevent regression.
Strongest counterargument: Baseline ratchets can preserve mediocre historical coverage.
Confidence: High because risk-slice completion separately requires exact specs and fault sensitivity.
Hardening: Challenger converged and required exact counts rather than rounded percentages.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: A reproducible baseline cannot be established or ratchets incentivize low-value tests.

### AR-15 — Mutation strategy

Authority: AI — delegated by `--auto-design`.
Eligibility: Defect-detection validation mechanism.
Objective: Demonstrate that critical tests fail when security behavior is broken at manageable runtime and maintenance cost.
Decision: Store reviewed, reproducible fault patches outside production source and apply them to temporary worktrees/build contexts. Every curated fault must be killed by designated black-box claims; setup/build failure is not a kill. Add targeted automated mutation only after the curated pilot is reliable.
Evidence: The repository has no mutation runner, and a whole TypeScript ESM plus infrastructure campaign would be slow and noisy.
Rejected alternatives: Line coverage does not prove sensitivity; hand edits are not repeatable; whole-repository mutation is disproportionate initially.
Strongest counterargument: A curated catalog can miss unanticipated defect classes.
Confidence: High for the pilot, medium for later automated mutation selection.
Hardening: Challenger converged and added representative faults for tenant scope, RBAC, redirect/PKCE/JWT validation, replay, CSRF/cookies, rate limits, and information disclosure.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Faults produce false kills, equivalent-mutant noise dominates, or runtime exceeds its approved lane budget.

### AR-16 — Legacy red-phase evidence

Authority: AI — delegated by `--auto-design`.
Eligibility: Test workflow for already implemented behavior.
Objective: Preserve specification-first independence when a correct implementation already exists.
Decision: A legacy specification may be green on first run, but the audit must record that fact and prove sensitivity with a controlled mutation or deliberate fault before claiming assurance.
Evidence: Artificially forcing red would encourage false expectations or needless production changes.
Rejected alternatives: Waiving red provides no detection proof; changing expected behavior merely to force red corrupts the oracle.
Strongest counterargument: Deliberate faults add execution cost.
Confidence: High — apply only to audited controls, not every historical assertion.
Hardening: In-context review narrowed the obligation to assurance claims.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: A safer automated mutation mechanism makes deliberate faults unnecessary.

### AR-17 — Assertion semantics

Authority: AI — delegated by `--auto-design`.
Eligibility: Test quality mechanism.
Objective: Eliminate false passes.
Decision: Specification tests assert exact observable contracts and fail on unmet prerequisites; broad status allowlists, “not 500” as the sole oracle, silent conditional exits, and non-fatal required setup are prohibited.
Evidence: The inventory identified those patterns in current pentest cases and harness setup.
Rejected alternatives: Smoke assertions remain permissible only when the requirement itself is availability smoke, not correctness or security.
Strongest counterargument: Exact assertions can overfit unstable error presentation.
Confidence: High — assert stable public semantics, not incidental formatting.
Hardening: In-context review distinguishes contract fields from unstable presentation.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: An approved contract explicitly permits multiple outcomes.

### AR-18 — Risk ordering

Authority: User — accepted the consolidated priority order: tenant isolation/RBAC; OIDC, JWT, PKCE, signing, and rotation; sessions, recovery, and 2FA; then rate limits, validation, import/export/bulk, and live compatibility.

### AR-19 — Defect routing

Authority: User — confirmed scope excludes product fixes. The migration constraint also requires discovered product defects to be recorded for later rather than combined with structural work. A separate authorized task owns each fix and regression; the assurance slice cannot close while a governing Must criterion remains violated.

### AR-20 — Live compatibility

Authority: AI — delegated by `--auto-design`.
Eligibility: Test integration strategy; no public API change.
Objective: Detect drift hidden by mocked SDK and CLI unit suites.
Decision: Add minimal live-server journeys for supported SDK and CLI operations while retaining existing fast unit suites.
Evidence: All 404 SDK cases use mock transports; ordinary CLI command tests mock SDK calls.
Rejected alternatives: Replacing unit suites would slow feedback and discard useful error-path coverage; mocks alone cannot prove wire compatibility.
Strongest counterargument: Live journeys overlap harness protocol tests.
Confidence: High — compatibility cases assert consumer behavior, while protocol cases assert server contracts.
Hardening: In-context review separated consumer and provider ownership.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Supported clients gain their own independently versioned compatibility environment.

### AR-21 — Execution lanes

Authority: AI — delegated by `--auto-design`.
Eligibility: CI implementation sequencing inside the confirmed release-safe boundary.
Objective: Preserve feedback speed and publication while adding expensive assurance.
Decision: Keep `yarn verify` unchanged as the fast authoritative workspace check; extend the existing harness CI job for black-box claims; run curated fault and later mutation campaigns explicitly on demand until reproducibility, runtime, and flake evidence justify separate promotion.
Evidence: CI already separates verify, UI, harness, docs, Docker, and dependency audit jobs.
Rejected alternatives: Putting all campaigns in `yarn verify` violates release-safe delivery; manual-only execution provides no durable regression evidence.
Strongest counterargument: Separate on-demand lanes may be skipped.
Confidence: High for staged adoption.
Hardening: Challenger converged and required runtime/flakiness evidence before promotion.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Campaigns are not run at agreed milestones, flake rate exceeds 1%, or harness runtime threatens CI availability.

### AR-22 — Synthetic data

Authority: AI — delegated by `--auto-design`.
Eligibility: Test data protection mechanism under existing security policy.
Objective: Prevent test evidence from exposing real identities or credentials.
Decision: Use only synthetic, ephemeral fixtures and generated test credentials; generated configuration, certificates, reports, and secrets stay ignored and uncommitted.
Evidence: The harness already owns ephemeral volumes and generated configuration.
Rejected alternatives: Developer or production-derived data creates privacy and secret-handling risk without improving assurance.
Strongest counterargument: Synthetic data may miss production distributions.
Confidence: High — distribution testing can use generated boundary datasets.
Hardening: In-context review adds boundary generators without importing real data.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: A future approved, anonymized data program with explicit retention controls.

### AR-23 — Browser boundary

Authority: User — confirmed scope did not include browser-matrix expansion and explicitly authorized the presented out-of-scope boundary. Chromium remains the supported assurance browser for this feature; expansion requires a separate scope decision.

### AR-24 — Standards without certification

Authority: AI — delegated by `--auto-design`.
Eligibility: Selection of independent test-oracle sources; no public certification claim.
Objective: Ground identity and web-security expectations outside Porta's implementation.
Decision: Cite applicable sections of OIDC, OAuth, JWT, PKCE, and OWASP guidance in requirements and test plans; do not claim certification or comprehensive conformance.
Evidence: Porta is an identity provider with public OIDC behavior and explicit security invariants.
Rejected alternatives: Omitting standards weakens oracle independence; claiming certification requires an authorized external program.
Strongest counterargument: Standards mapping can become broad and expensive.
Confidence: High — map only behavior within the approved Porta surface.
Hardening: In-context review rejected certification language.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: User authorizes formal conformance or certification scope.

### AR-25 — Slice completion

Authority: AI — delegated by `--auto-design`.
Eligibility: Internal assurance definition of done within approved acceptance goals.
Objective: Prevent “tests pass” or “coverage increased” from closing an unaudited control.
Decision: A slice closes only when all Must criteria are mapped, exact specification tests pass, fault sensitivity is demonstrated, applicable full verification passes, reviewed/deferred surfaces are recorded, and no confirmed governing defect remains unresolved.
Evidence: Coverage and test counts alone cannot prove oracle strength.
Rejected alternatives: Coverage-only and pass-only completion recreate the original trust problem.
Strongest counterargument: The evidence burden increases delivery time.
Confidence: High — risk slicing bounds the work while preserving rigor.
Hardening: Challenger converged and added commit/image hashes, dependency versions, fixture manifest, test results, attributed coverage, fault results, and redacted logs to the evidence bundle.
Policy version: 1.
Root invocation ID: `AD-TA-20260809-1421`.
Reopen triggers: Evidence shows a required artifact is redundant or fails to prevent escaped defects.

### AR-26 — Security failure authority

Authority: User and governing project policy — security takes precedence over deadlines and convenience. This feature cannot accept risk, weaken assertions, or declare a slice complete over a verified security-invariant violation.
