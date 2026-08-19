# Ambiguity Register: Porta Test Assurance Program

> **Status**: ✅ GATE PASSED — all material items resolved
> **Created**: 2026-08-09
> **Root Invocation ID**: `AD-TA-20260809-1421`
> **Auto-Design Policy**: 1
> **Parent**: [Plan Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Zero-Ambiguity Gate

The requirements ambiguity register owns product and program choices. This register resolves only
implementation planning choices. Every decision is inside the user-confirmed scope and changes no
Porta product contract.

| #   | Area             | Question                                         | Decision                                                                                                                                                                                                         | Authority      | Status |
| --- | ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| 1   | Scope            | Which requirements are implemented?              | All seven `test-assurance` RDs in one phased program                                                                                                                                                             | User           | ✅     |
| 2   | Delivery         | Big-bang or incremental?                         | Eleven independently verifiable phases; Porta remains publishable                                                                                                                                                | User           | ✅     |
| 3   | Harness          | New runner or retained harness?                  | Retain Docker/Playwright externally and root Node/tsx internally; add no harness workspace/package or extra test framework                                                                                       | User           | ✅     |
| 4   | Product changes  | Fix discovered behavior inline?                  | No by default; only the separately authorized organization, tenant/admin, and Phase 7 protocol corrections recorded below may be fixed in this program                                                            | User           | ✅     |
| 5   | Evidence home    | Where do durable definitions live?               | Versioned definitions under `test-harness/assurance/`; generated results stay ignored                                                                                                                            | AI             | ✅     |
| 6   | Claim format     | Markdown, JSON, or both?                         | JSON claim records validated by TypeScript/Zod, rendered to Markdown summaries                                                                                                                                   | AI             | ✅     |
| 7   | Oracle boundary  | May production code calculate expectations?      | No; production imports are arrangement-only and assertions use public boundaries                                                                                                                                 | User/AI        | ✅     |
| 8   | Test execution   | How are independent tests distinguished and run? | Root-owned `tsx --test` runs harness `*.spec.test.ts`/`*.impl.test.ts`; Playwright owns only directory-scoped external `*.spec.test.ts`; root owns direct dependencies, typecheck, lint, and structure contracts | Standards/User | ✅     |
| 9   | Reset ownership  | Who owns state reset?                            | Typed controller quiesces traffic, stops Porta, recreates/migrates/seeds PostgreSQL, resets Redis/mail, restarts/verifies; uncertain partial mutation poisons the stack                                          | User           | ✅     |
| 10  | Fixture topology | How many tenants and actors?                     | Alpha/bravo own users, clients, sessions/tokens/data; apps/roles are global; all admin actors live in the super-admin org and vary permissions against alpha/bravo targets                                       | User           | ✅     |
| 11  | Parallelism      | Increase workers now?                            | Keep one worker until 100 consecutive completed shuffled runs show zero flakes                                                                                                                                   | AI             | ✅     |
| 12  | Coverage         | How is server-process execution captured?        | `NODE_V8_COVERAGE`, clean container shutdown, matching source maps, separate report                                                                                                                              | AI             | ✅     |
| 13  | Coverage tooling | Which conversion path is planned?                | Pin direct dev dependencies `@bcoe/v8-coverage@1.0.2`, `ast-v8-to-istanbul@1.0.5`, and `acorn@8.18.0`; abort rollout if the attribution spike fails                                                              | AI             | ✅     |
| 14  | Thresholds       | Apply the current 80/75 thresholds?              | No; exact reproducible baselines first, no-regression ratchets second, slice floors later                                                                                                                        | User/AI        | ✅     |
| 15  | Faults           | How are tests challenged?                        | Versioned curated patches applied only in disposable worktrees/build contexts                                                                                                                                    | AI             | ✅     |
| 16  | Mutation         | Whole repository or targeted pilot?              | Curated faults are mandatory; automated mutation is a bounded compatibility pilot after reliability                                                                                                              | AI             | ✅     |
| 17  | Clients          | Source workspaces or publishable artifacts?      | Install `yarn pack` outputs in an isolated consumer directory and exercise public exports/bin                                                                                                                    | AI             | ✅     |
| 18  | CI               | Which command changes?                           | Preserve `yarn verify`; prepare a non-enforcing harness/fault proposal only; adoption is a separate authorized policy/workflow task                                                                              | User/AI        | ✅     |
| 19  | Standards        | Certification claim?                             | Use applicable OIDC/OAuth/JWT/ASVS controls as oracles; claim no certification                                                                                                                                   | User/AI        | ✅     |
| 20  | Security tooling | Include Codex Security?                          | No; retain as a future footnote outside this plan                                                                                                                                                                | User           | ✅     |
| 21  | RED evidence     | When does a failing command count as success?    | Only the registered expected assertion signature counts as RED evidence; unexpected non-zero is failure and required existing lanes remain green                                                                 | User           | ✅     |
| 22  | Endpoint leasing | How do concurrent worktrees avoid collision?     | Atomic complete port-block lease, persisted owner identity, one generated endpoint manifest, fenced cleanup, proven stale-owner recovery                                                                         | User           | ✅     |
| 23  | Runtime profiles | Which environment proves production controls?    | Use exact IDs `operational` (development-mode diagnostics) and `production-security`; claims declare one                                                                                                         | User           | ✅     |
| 24  | Token boundary   | Which JWT is independently validated?            | Validate issued ID tokens independently; access-token tests respect Porta's opaque-token contract and target real consumers                                                                                      | User           | ✅     |
| 25  | Fault ordering   | When is fault sensitivity available?             | Runner/spec foundation precedes risk slices; each slice executes its own fault tuples; mutation roll-up remains later                                                                                            | User           | ✅     |
| 26  | Packed clients   | When are packed artifacts introduced?            | Pack/install/provenance foundation follows coverage and applicable packed journeys run inside each owning slice                                                                                                  | User           | ✅     |
| 27  | Reliability math | What does 100-run `<1%` mean?                    | 100 consecutive completed runs with zero flakes; invalid/incomplete runs restart the sequence and retries stay visible                                                                                           | User           | ✅     |
| 28  | CI authority     | What may this plan change?                       | Observation baselines and a concrete non-enforcing workflow proposal only; adoption requires a separate authorized policy/workflow task                                                                          | User           | ✅     |
| 29  | Command model    | Where is the exact command contract defined?     | A root-owned `test-harness/assurance/commands.ts` module is the single typed source for aliases, selectors, prerequisites, timeouts, artifacts, exit precedence, signals, cleanup, and `assurance:all` composition | AI (runtime)   | ✅     |
| 30  | Static boundary  | How are RED specs checked before runtime modules exist? | A dedicated root-owned assurance TypeScript/ESLint project checks specs against declaration-only planned interfaces; runtime `.ts` files remain absent until their implementation tasks | AI (runtime)   | ✅     |
| 31  | Alias bootstrap  | What do registered aliases do before their owning handlers exist? | The shared dispatcher exposes exact help/contract data and otherwise fails closed as `setup-failure` until the planned owning phase installs the handler; it never reports placeholder success | AI (runtime)   | ✅     |
| 32  | Foundation selector | How does one selector verify sequential foundation tasks without changing immutable oracles? | A permanent collection wrapper registers the already-authored cases owned by the implemented foundation components; later tasks add their pre-authored case groups to the same suite without changing assertions | AI (runtime)   | ✅     |
| 55  | Slice baseline | What counts as Task 6.4 evidence when no existing exact E2E/pentest sentinel reaches the protected tenant/admin boundary? | Record strict `missing-live-sentinel` RED evidence; never treat setup failure, partial lower-level tests, or early authentication denial as product evidence | User (runtime) | ✅     |
| 56  | Live slice execution | How does the Playwright-owned security command execute the immutable Node oracle and packed-client adjuncts without creating a second oracle? | Use one owned-stack, three-block orchestration with explicit live mode, deterministic resets, and lifecycle-owned Porta-only restart | User (runtime) | ✅     |
| 57  | Live contract ruling | Is a client registered to one organization allowed to initiate authorization under another organization's issuer, is bootstrap-user archive applicable, and may Phase 6 fix the confirmed role-removal defect? | Enforce strict issuer/client tenant binding; mark bootstrap-user archive non-applicable; fix protected bootstrap-role removal and strengthen its role-assignment observer | User (runtime) | ✅     |
| 58  | Packed evidence checkpoints | How can Task 6.5 commit verified raw/product changes and later execute packed clients from the mandatory clean revision? | Split the task into raw/product, packed-capability, and clean-live-evidence checkpoints; never synthesize or stash a dirty-tree revision | User (runtime) | ✅     |
| 59  | Live fault execution | How can tenant/admin sentinels challenge real Porta controls without admitting arbitrary production patches or unrelated failures? | Use one reviewed fault ID per semantic production patch, a code-owned target/sub-sentinel registry, lifecycle-owned disposable stacks, and separate specification, capability, and clean-campaign checkpoints | AI (runtime) | ✅     |
| 70  | Phase 6 quality correction | How are provenance, signal/recovery, traceability, and live-observation review defects corrected without production hooks or weaker claims? | Use evidence-backed public observation proofs, a persistent owner-fenced control-check run record, and executable Markdown/JSON traceability consistency | AI (runtime) | ✅     |
| 72  | Protocol live evidence | How can Task 7.5 add raw/JOSE and packed-client evidence while preserving clean packed provenance and one authoritative oracle? | Split independent JOSE, raw live observation, packed capability, and clean packed evidence; raw HTTP/independent JOSE remains authoritative and packed journeys cover only public SDK/CLI protocol surfaces | AI (runtime) | ✅     |
| 73  | Protocol rejection observation | How can the immutable protocol oracle observe required privacy-safe rejection logs when Porta currently emits no such event and ordinary logs retain query strings? | Add one separately verified product checkpoint using typed provider events plus explicit pre-provider observation, server-generated correlation, closed event classes, client-ID digests, deduplication, and path-only ordinary logs | User/AI (runtime) | ✅     |
| 74  | Authorization redirect oracle | Must missing/plain PKCE be rejected by a direct 400 once the client and registered redirect have already been validated? | No; require a 303 `invalid_request` only to the exact registered redirect, while an unregistered redirect remains a direct 400 `invalid_redirect_uri` with no redirect or code | AI (runtime) | ✅     |
| 75  | Live token defects | May Phase 7 correct concurrent refresh reuse and cross-tenant UserInfo acceptance found by its immutable live oracle? | Yes; atomically consume durable refresh artifacts and bind opaque UserInfo tokens to the resolved issuer organization, preserving provider-compatible public errors and privacy-safe observation | User/AI (runtime) | ✅     |
| 42  | Fixture spec verification | How can Tasks 3.1–3.2 verify before commit when attributed validation requires a clean tree? | Use structure, assurance TypeScript, and harness ESLint as the pre-commit gate; keep runtime specs outside required collection until the exact RED checkpoint, and retain clean-tree validation for committed roll-ups | AI (runtime)   | ✅     |
| 43  | Fixture association oracle | How are shared OIDC vocabulary, global app purposes, and an unprivileged admin control represented without false contradictions? | Treat scopes as shared allowlisted protocol vocabulary, never tenant identity; type applications as OIDC/RBAC/mixed; require purpose-matched client/role associations; permit exactly the typed unprivileged admin role to have zero permissions | AI (runtime)   | ✅     |
| 44  | Product defect remediation | May Phase 3 fix the confirmed organization-scoped user-route exposure that blocks its immutable oracle? | Yes; audit every user-specific route under an organization prefix, add cross-tenant read/write/status sentinels, enforce organization membership after authentication and permission checks, and keep standalone global-admin routes unchanged | User (runtime) | ✅     |
| 46  | Coverage spec verification | How can Task 4.1 verify before commit when attributed validation requires a clean tree? | Use structure, assurance TypeScript, and harness ESLint as the pre-commit gate; keep runtime coverage specs outside required collection until the exact RED checkpoint, and retain clean-tree validation for committed coverage checkpoints | AI (runtime)   | ✅     |
| 47  | Coverage RED bridge | How can RED prove absent capture/conversion without accepting missing-module setup failure? | Use one exact current-surface assertion for the complete capture, mount, converter, and handler gap set; require the known mapping fixture to exist and keep immutable runtime specs outside collection | AI (runtime)   | ✅     |
| 48  | Coverage mount ownership | How can one Compose topology enable a host-retained V8 mount without instrumenting other services or ordinary runs? | Give only Porta an empty-by-default NODE_V8_COVERAGE value and a run-owned bind target; the coverage command supplies an allowlisted canonical result path and activates `/app/.v8-coverage` | AI (runtime)   | ✅     |

## Delegated Decision Rationale

### AR-5 and AR-6 — Evidence definitions

**Objective**: make assurance claims reviewable and mechanically valid without creating another
test harness. **Decision**: store one small JSON record per claim and validate it with a harness-local
TypeScript schema. The generated report links evidence but does not duplicate requirements.
**Rejected**: Markdown-only cannot enforce completeness; a database adds state and another service.
**Reopen if**: JSON review becomes materially harder than the generated view or schema drift cannot
be controlled. **Confidence**: High.

### AR-9 and AR-10 — Lifecycle and fixtures

**Objective**: eliminate stale-state false passes while keeping runtime bounded. **Decision**: a
fresh Compose project per job, a fatal project/risk-slice reset of PostgreSQL, dedicated Redis,
MailHog, and process caches, then scenario namespaces and fresh client contexts. The manifest names
two disjoint tenants and role/lifecycle variants. **Rejected**: best-effort cleanup is unsafe;
container recreation per test is too slow. **Reopen if**: shuffled runs leak state or reset time
approaches full recreation. **Confidence**: Medium until the reset spike passes.

### AR-12 through AR-14 — Coverage attribution

**Objective**: measure the assembled server process honestly. **Decision**: mount a raw V8 output
directory into the Porta container, bind raw output to the built revision/image, stop Node cleanly,
merge V8 process records, and remap compiled JavaScript to TypeScript through the emitted source
maps. Promote `@bcoe/v8-coverage@1.0.2`, `ast-v8-to-istanbul@1.0.5`, and `acorn@8.18.0` to exact
direct development dependencies; do not import Vitest internals. Keep this report separate from
Vitest until two fixed-seed runs have identical
covered/total counts and a sampled source-map audit passes. **Rejected**: accepting false zeroes or
merging unmatched builds. **Reopen if**: material ranges cannot be mapped or repeated totals drift.
**Confidence**: Medium; the phase is explicitly a stop/go spike.

### AR-15 and AR-16 — Fault sensitivity

**Objective**: show that selected critical assertions fail for the intended reason. **Decision**:
keep reviewed patches outside production source, validate their target hash, apply each to a
disposable worktree/build, run only its named sentinels, and classify killed, survived, invalid, or
infrastructure-failed. Build/setup failure never counts as a kill. An automated mutation pilot may
proceed only after curated execution is reliable and must be abandoned without weakening curated
coverage if TypeScript ESM/infrastructure compatibility is poor. **Confidence**: High for curated
faults, Medium for automation.

### AR-17 — Live client compatibility

**Objective**: detect drift hidden by mock-only SDK and CLI suites. **Decision**: build and pack the
SDK and CLI, install tarballs into a temporary non-workspace consumer, import only declared SDK
exports, and invoke the packed CLI binary. Record package name/version/integrity with results.
**Rejected**: importing workspace source repeats the current blind spot. **Confidence**: High.

### AR-21 through AR-28 — Preflight corrections

**Authority**: User accepted the preflight recommendations; implementation mechanisms may be
refined under `--auto-design` without changing product behavior or policy. **Decision**: make RED
signatures explicit, use atomic endpoint leases and a poisoned-stack reset state machine, bind
claims to real Porta authority/data boundaries and runtime profiles, establish fault and packed-
client foundations before their consumers, define the 100-run denominator exactly, and stop at a
non-enforcing CI proposal. **Rejected**: a second harness workspace/package or extra test framework,
fictional tenant-local
administrators, production fault hooks, registry-resolved local compatibility, and implicit CI
promotion. **Strongest counterargument**: the stricter lifecycle and earlier foundations increase
up-front work; this is accepted because otherwise a green result can be vacuous or non-repeatable.
**Confidence**: High. **Hardening**: the preflight challenger converged on these corrections.
**Reopen if**: Porta's authority/data model changes, the existing harness cannot safely own atomic
leases, or a separately authorized policy decision changes CI/promotion scope.

## Hardening Record

An independent challenger reviewed the coupled security and test-infrastructure choices. The final
design incorporates its findings: cleanup is fatal; fixture tenants and roles are disjoint; server
coverage is process-owned and provenance-bound; exact counts precede ratchets; fault kills require
the intended assertion; packed clients run outside the workspace; and promotion requires measured
flake/runtime evidence.

**Gate result**: zero unresolved scope, security, data, concurrency, integration, error-handling,
verification, or rollout decisions remain.

## Runtime Decisions

### AR-29 — Machine-readable command contract

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal architecture for an
already-approved command surface; it changes no product behavior, acceptance criterion, CI policy,
or scope. **Objective**: keep root aliases, validation, reporting, and tests synchronized with the
frozen command contract. **Decision**: export the versioned command definitions and exit precedence
from `test-harness/assurance/commands.ts`; package scripts remain thin entry points. **Evidence**:
the testing strategy requires exact, mechanically validated selectors, prerequisites, timeouts,
artifacts, signals, cleanup, and outcomes for eleven aliases, while the target structure already
uses TypeScript/Zod for root-owned assurance definitions. **Rejected alternatives**: embedding the
table only in the CLI dispatcher makes validation and reporting depend on command control flow;
keeping it only in README text cannot provide machine-checked completeness and would duplicate the
test oracle. **Strongest counterargument**: a public internal module adds one file and must remain
versioned as the command surface evolves. **Confidence**: High — the boundary is small, reversible,
and specification-tested. **Hardening**: forced reframing found no safer simpler source of truth;
independent challenge was not required because this is reversible internal plumbing inside the
approved design. **Policy version**: 1. **Root invocation ID**: `AD-TA-EXEC-20260810-P1`.
**Reopen triggers**: command definitions move to a generated schema, aliases cease sharing one
dispatcher, or another consumer requires a language-neutral contract.

### AR-30 — Assurance-only static project during RED

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: reversible test-tooling design
inside the approved root-owned harness boundary; no product, CI, or acceptance behavior changes.
**Objective**: typecheck and lint the isolated specification tests while their runtime modules are
intentionally absent, without pulling unrelated dormant SPA/BFF typing defects into this phase.
**Decision**: use `test-harness/tsconfig.assurance.json` and the root harness ESLint configuration
for `test-harness/assurance/**/*.ts`; declaration-only files describe the already-specified public
interfaces until the matching runtime TypeScript files replace them. **Evidence**: the existing
`test-harness/tsconfig.json` covers legacy BFF/browser files that currently fail TypeScript 7 for
unrelated arithmetic, unknown-data, and NodeNext-extension issues, while the execution phase is
strictly scoped to `test-harness/assurance/`. **Rejected alternatives**: fixing legacy harness
typing expands scope; excluding the RED specs defeats the static boundary; creating runtime stubs
would make the missing-foundation oracle dishonest. **Strongest counterargument**: declarations
can drift from later implementations. **Confidence**: High — Task 1.7 typechecks declarations and
implementations together, making drift a hard error. **Hardening**: the design preserves both the
RED runtime absence and static completeness; no independent challenge was needed for this local,
reversible tooling boundary. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260810-P1`. **Reopen triggers**: legacy harness typing becomes clean and enters the
required lane, or runtime modules cannot implement the declared boundary without changing the
independent specification.

### AR-31 — Fail-closed alias bootstrap

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: reversible command-dispatch
mechanism inside the approved frozen alias surface; it changes no product behavior, acceptance
criterion, CI lane, or external policy. **Objective**: make every root alias discoverable and
machine-checkable now without manufacturing successful assurance evidence before later phases
install their handlers. **Decision**: route all aliases through one allowlisted dispatcher; exact
`--help` and machine-readable contract inspection succeed without side effects, while normal
execution without an installed handler exits as `setup-failure` with a stable marker. **Evidence**:
Phase 1 owns the full command schema, but lifecycle, coverage, faults, packed clients, and campaign
handlers are explicitly delivered by later phases. **Rejected alternatives**: placeholder success
would create false evidence; missing scripts would leave the frozen root contract unverifiable;
eagerly implementing later handlers would violate task ordering and phase scope. **Strongest
counterargument**: callers cannot yet complete a real campaign through most aliases. **Confidence**:
High — failure is explicit, deterministic, and replaced only by each handler's owning task.
**Hardening**: forced reframing found fail-closed registration to be the only option preserving
both honest evidence and phase ordering; independent challenge was unnecessary for this local,
reversible bootstrap. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260810-P1`. **Reopen triggers**: a later handler cannot retain the shared dispatcher
or an alias can produce evidence before its prerequisites and implementation are installed.

### AR-32 — Progressive foundation collection

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal test-collection and
sequencing mechanism within the approved immutable specification suite; it changes no oracle,
product behavior, acceptance criterion, or phase scope. **Objective**: let Tasks 1.5 and 1.6 each
run the required `assurance-foundation` selector after their own implementation while preserving
the already-recorded global RED evidence. **Decision**: use one permanent suite wrapper that first
registers the pre-authored schema cases, then adds the pre-authored evidence/path cases when their
owning runtime modules exist. The wrapper contains collection only and no expected behavior.
**Evidence**: the original RED loader intentionally waits for every foundation file, while the
execution contract requires the same targeted selector to pass after each sequential component
task. **Rejected alternatives**: committing both implementations atomically would violate the
per-task checkpoint contract; conditional test skipping would create vacuous evidence; writing new
implementation-derived assertions would violate the immutable-oracle rule. **Strongest
counterargument**: the umbrella selector's collected case count grows once during foundation
assembly. **Confidence**: High — every collected assertion existed before implementation and the
final governance suite re-collects the complete immutable loader. **Hardening**: forced reframing
found collection-only composition to be the sole option that preserves RED provenance, task
verification, and oracle immutability; independent challenge was unnecessary for this reversible
test-runner mechanism. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260810-P1`. **Reopen triggers**: a wrapper introduces expected values, skips a
registered case, or the final complete loader does not collect the same case implementations.

### AR-33 — Phase 1 quality-gate correction boundary

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: in-scope technical corrections
required by the independent phase reviewers; no product, workflow, policy, or acceptance decision
changes. **Objective**: prevent foundation tooling from manufacturing assurance through mutable
oracles, caller-asserted evidence, incomplete traceability, dirty source, retained personal data,
or orphaned child processes. **Decision**: separate requirement-derived root specifications from
implementation diagnostics; use a canonical reviewed test inventory and owned-run manifest loaded
through module-private context identity; validate mappings against an independent Must/node/source
inventory; record raw and normalized RED exits separately; require a clean committed worktree and
content digests before passing evidence; redact and scan personal data before persistence; and run
children in signal-forwarding process groups with bounded termination. **Rejected alternatives**:
waiving post-implementation spec edits, accepting optional inventory context, trusting `current:
true`, treating the graph's derived nodes as its own completeness proof, attributing dirty runs to
HEAD, retaining PII for diagnostics, or allowing the dispatcher to exit before descendants.
**Strongest counterargument**: clean-tree evidence cannot be generated before the correcting commit.
This is intentional: code verification runs before commit, while attributable ignored evidence is
generated from the clean committed revision immediately afterward. **Confidence**: High.
**Hardening**: independent correctness and security reviewers converged on the same false-assurance
root causes; the single re-review must confirm the correction diff. **Policy version**: 1. **Root
invocation ID**: `AD-TA-EXEC-20260810-P1-QG`. **Reopen triggers**: validation context becomes
caller-constructible, source-tree cleanliness is relaxed, a specification changes after this
checkpoint, or a command introduces a child outside managed process-group ownership.

### AR-34 — Residual correction after the single Phase 1 re-review

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: mandatory technical fixes for
open and newly identified Major findings in the single permitted re-review; no finding is waived,
dismissed, or moved outside the approved Phase 1 scope. **Objective**: ensure a caller cannot mutate
loaded authority, fabricate a manifest, synchronize a wrong trace source, or leave a resistant
descendant after the direct child exits. **Decision**: return an opaque frozen validation token
backed by a module-private snapshot; re-derive commit/tree/tool/definition identities and exact
result/fault summaries before branding a manifest; derive `RD-0N#RN.X` from the requirement ID;
and keep bounded TERM/KILL escalation active until the whole process group is absent, treating a
survivor as cleanup failure. **Rejected alternatives**: freezing caller-visible nested objects
still exposes authority for replacement; trusting manifest summaries repeats the original
caller-assertion defect; comparing two mutable trace files cannot ground either; cancelling group
escalation on direct-child close leaks descendants. **Strongest counterargument**: provenance
recomputation makes valid fixture setup and assurance loading more expensive. The cost is bounded
and occurs at an explicit assurance boundary where false attribution is materially worse.
**Confidence**: High. **Hardening**: the independent re-review supplied concrete exploits for the
mutable-context and descendant cases; final corrections are covered by focused adversarial tests
and full verification. A third review is forbidden by the quality profile. **Policy version**: 1.
**Root invocation ID**: `AD-TA-EXEC-20260810-P1-QG-RR`. **Reopen triggers**: an authority snapshot
becomes caller-visible, manifest summaries are accepted without exact artifacts/current-tree
checks, source clauses cease to be derived, or group-absence verification is removed.

### AR-35 — Layered lifecycle controller and spawned operating-system contracts

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal testability and
architecture for the already-approved fenced lifecycle/reset behavior; it changes no product
behavior, security policy, acceptance criterion, CI lane, or feature scope. **Objective**: make
every ownership, reset-order, poison, and recovery rule deterministic to specification-test while
still proving the operating-system boundaries that adapters cannot simulate faithfully.
**Decision**: specification-test a typed controller created by
`createLifecycleController(dependencies)`, with `start(request)`, `reset(ownedRun)`, and
`stop(ownedRun)` operations plus recovery from a validated run UUID/canonical-worktree lookup in a
fresh process. Ordinary destructive operations accept only an opaque owned-run handle; recovery
reloads the durable lease internally and never accepts caller-supplied resource identities. Add narrow spawned CLI contracts for
atomic filesystem leasing, persisted crash/poison state, signal delivery, and shell-free
argument/environment propagation; keep the retained shell scripts as compatibility callers.
Persist a process-start fingerprint with every PID, label and identity-check Compose resources,
durably write the resetting/poison marker before the first mutation, and quarantine malformed
leases rather than treating unreadable ownership as absence. **Evidence**: the current start path
hard-codes endpoints and the default Compose identity, the stop path performs an unfenced
project-wide `down -v`, and the plan requires typed modules instead of shell-embedded lifecycle
logic. **Rejected alternatives**: controller-only tests cannot prove filesystem atomicity, crash
state, or real signals; CLI-only tests make durable-boundary failure coverage slow and opaque;
shell/PATH fakes test incidental shell behavior and weaken typed validation. **Strongest
counterargument**: the layered boundary costs more and can duplicate adapter coverage; spawned
cases are therefore limited to boundaries whose semantics depend on the real OS, while final
two-worktree/Compose smokes prove integration. **Confidence**: High. **Hardening**: an independent
challenger selected the layered design and warned that leases coordinate harness runs but cannot
prevent arbitrary external binders, which must instead fail endpoint preflight. **Policy version**:
1. **Root invocation ID**: `AD-TA-EXEC-20260811-P2`. **Reopen triggers**: the retained scripts
cannot remain thin callers, a required boundary cannot be observed through the typed controller or
spawned CLI, or real Compose behavior contradicts the injected adapter contract.

### AR-36 — Pre-commit verification for specification-author tasks

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: execution sequencing for two
test-only tasks inside the frozen verification policy; it changes no oracle, product behavior,
acceptance criterion, or evidence provenance rule. **Objective**: preserve the verified-before-
commit gate without manufacturing attributed evidence from an uncommitted source tree.
**Decision**: Tasks 2.1–2.2 use `yarn test:structure` as their targeted pre-commit binding and rely
on unchanged `yarn verify` for TypeScript/ESLint verification. Their isolated runtime specs remain
outside required collection until Task 2.3 records RED. Attributed `assurance:validate` evidence is
run only from a clean committed tree at the owning roll-up checkpoint. **Evidence**: Phase 1's
security correction intentionally makes `assurance:validate` exit setup-failure 30 on every dirty
tree, so requiring it before committing a changed task is circular. **Rejected alternatives**:
allowing dirty evidence reopens the provenance vulnerability; committing before verification
violates the execution contract; temporarily hiding changes validates the wrong source.
**Strongest counterargument**: structure verification alone does not execute the new runtime
oracles. That is intentional until the separately required exact RED task, while full verification
still statically checks the authored TypeScript. **Confidence**: High. **Hardening**: forced
reframing found no other path that preserves both clean-tree provenance and the pre-commit gate;
independent review is reserved for the complete phase diff. **Policy version**: 1. **Root
invocation ID**: `AD-TA-EXEC-20260811-P2`. **Reopen triggers**: validation gains a sound
non-persisting dirty-tree mode, the commit gate changes, or the specification files enter required
runtime collection before Task 2.3.

### AR-37 — Transitional current-surface RED evidence

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: test execution and bounded
process-capture design inside the approved RED checkpoint; it changes no product behavior,
acceptance criterion, lifecycle oracle, or scope. **Objective**: prove the four known current
harness gaps through one exact assertion without accepting the intentionally missing future module
as RED. **Decision**: retain the controller/reset specifications as the authoritative lifecycle
oracle and add one narrow requirement-derived current-surface specification that reports the exact
ordered gap marker for non-fatal reset, fixed endpoints, unfenced cleanup, and absent poison state.
The RED handler uses a hard-coded signature-to-argv allowlist, never executes the registry command
string, captures stdout/stderr separately under a combined 256 KiB ceiling, requires raw exit 1,
zero passes, exactly one failure, one literal marker occurrence, and returns wrapper success only
for that complete match. Overflow, setup, signal, timeout, cleanup, partial diagnosis, or unrelated
failure cannot count as RED. **Evidence**: the future lifecycle runtime is declaration-only at this
checkpoint, while the frozen execution contract explicitly forbids module-load/setup failure from
counting as RED. **Rejected alternatives**: a temporary current-behavior adapter would shape the
oracle around intended implementation and add disposable machinery; accepting missing-module
failure has no behavioral sensitivity; broad shell black-box fakes cannot prove poison-state
absence proportionately. **Strongest counterargument**: a static surface check can be satisfied
cosmetically. It therefore proves only the pre-implementation RED baseline and can never promote a
claim; later controller/reset specifications and real Compose/concurrency/signal smokes remain the
green authority. **Confidence**: High. **Hardening**: an independent challenger selected this
bounded bridge and required exact-set matching, allowlisted argv, bounded capture, and no raw-output
persistence; the implementation adopts all four constraints. **Policy version**: 1. **Root
invocation ID**: `AD-TA-EXEC-20260811-P2`. **Reopen triggers**: the future runtime becomes
available before RED is recorded, the bridge enters claim evidence, output is persisted or
unbounded, or signature execution becomes data-driven from a command string.

### AR-38 — Atomic lease storage and progressive lifecycle collection

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal concurrency,
persistence, and test-collection mechanisms implementing the approved lifecycle contract; no
product behavior, topology, acceptance criterion, or scope changes. **Objective**: coordinate
complete endpoint blocks across worktrees, preserve crash evidence, and verify each sequential
implementation task without collecting specifications whose owning implementation is deliberately
later. **Decision**: use an owner-only shared temporary lease root whose `block-<base-port>`
directory is acquired by atomic `mkdir`; persist an owner UUID directory and fsynced schema-
validated lease record containing PID start fingerprint, canonical worktree, Compose identity,
planned container/bind-volume identities, owned paths, and the immutable endpoint manifest.
Malformed/incomplete records are never absence and move only to an exact quarantine path. A
loopback bind probe detects external occupation before acquisition but does not claim to reserve
ports against arbitrary processes. The `lifecycle` selector progressively collects the already-
committed immutable groups: leasing in Task 2.4, cleanup/compatibility in Task 2.5, then outcomes
and reset groups in Task 2.6; Task 2.8 re-collects the complete suite. **Evidence**: the outcomes
file contains reset cases whose implementation is owned by Task 2.6, so collecting it in Task 2.5
would either advance a sibling task or create a knowingly failing gate; one selector is
bound to Tasks 2.4–2.7, while their approved implementation responsibilities are sequential and
the specification files were frozen before RED. **Rejected alternatives**: one monolithic Task
2.4 implementation would advance sibling tasks; conditional skips create vacuous green; random
uncoordinated ports race across worktrees; holding listener sockets across Docker startup is not
portable and cannot reserve Docker's bind transaction. **Strongest counterargument**: the
collected case count grows between tasks. No expectation changes and every group is permanently
included once its owner exists; the final suite proves complete collection. **Confidence**: High.
**Hardening**: the earlier independent concurrency challenge required atomic lease coordination,
PID-reuse resistance, Compose identity, malformed-state quarantine, and explicit external-port
limits; this design incorporates each condition. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260811-P2`. **Reopen triggers**: a supported host lacks a reliable process-start
identity, Docker binding contradicts the preflight assumption, lease durability fails under crash
tests, or a progressive selector omits a group after its owning task.

### AR-39 — Atomic ownership transfer after poisoned recovery

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal recovery,
concurrency, persistence, and capability mechanisms within the already approved poisoned-stack
contract; no product behavior, topology, acceptance criterion, or scope change. **Objective**:
ensure a stack rebuilt by a fresh process is exclusively manageable and can never remain owned by
the dead process. **Decision**: a poisoned recovery first proves the recorded owner and Compose
project absent, then uses a durable lease-store compare-and-swap to transfer only `ownerProcess`;
every resource identity remains exact. It rechecks Compose absence after takeover, recreates the
complete stack, and returns a new opaque `OwnedRun` on success and on every post-takeover failure.
The recovery command holding that capability must be a long-lived lifecycle supervisor; a
short-lived command may not report successful adoption. The filesystem CAS publishes a fully
written claim atomically, rejects live/unreadable claimants, permits a proven-dead claimant to be
reclaimed, replaces the exact lease with file and directory durability, and never restores the old
owner after takeover. Ready stale cleanup retains its existing release behavior. **Evidence**:
`recover()` previously returned only a plain outcome and `LeaseStateAdapter` had no ownership
transfer, so a successful fresh-process rebuild retained a dead PID and no valid cleanup
capability. **Rejected alternatives**: release after rebuild leaves a live collision-prone stack;
dead-owner reuse makes exact fencing reject later cleanup; overwrite without CAS permits duplicate
destructive recovery; returning a serializable record permits fabricated deletion authority;
automatic stop defeats reusable recovery. **Strongest counterargument**: the compatible optional
recovery capability and CAS add state-machine complexity. That complexity is required because the
previous successful outcome was operationally unusable. **Confidence**: High. **Hardening**:
independent concurrency challenger required the CAS, post-takeover probe, capability on every
post-takeover outcome, and long-lived supervisor invariant; all are adopted. **Policy version**:
1. **Root invocation ID**: `AD-TA-EXEC-20260811-P2`. **Reopen triggers**: the runtime cannot keep
the recovery supervisor alive, the filesystem cannot provide atomic link/rename and directory
durability, or crash tests show two successful owners or malformed committed lease state.

### AR-40 — Transitional retained-harness reset boundary

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal sequencing of two
already-approved phases; it changes no product behavior, acceptance criterion, topology, CI policy,
or scope. **Objective**: make retained-harness resets fail closed now without inventing a database
oracle from the legacy single-tenant, randomly generated seed. **Decision**: the Phase 2 runtime
uses the lifecycle controller for owned startup, prerequisite validation, Redis reset, MailHog reset,
and fatal reset outcomes. The complete database-recreate/migrate/bootstrap/deterministic-seed state
machine remains implemented and specification-tested behind the controller, but the retained runtime
does not activate it until Phase 3 installs the approved multi-actor fixture manifest, exact migration
revision/digest, fixture digest, and count oracle. Phase 3 must replace the transitional prerequisite
adapter with the complete reset dependency adapter before any fixture-backed claim is eligible.
**Evidence**: the current seed creates one organization and random client credentials, so a runtime
database reset cannot independently prove the approved alpha/bravo actor cardinality or stable fixture
digest. Redis and MailHog already have exact isolated reset operations and must never remain non-fatal.
**Rejected alternatives**: treating the current idempotent seed as the approved oracle would make reset
evidence implementation-derived; duplicating Phase 3 fixtures in Phase 2 would violate task ownership
and create two manifests; leaving legacy best-effort cleanup would preserve the known false-green path.
**Strongest counterargument**: Task 2.8 cannot yet demonstrate the complete database-reset sequence
through the live retained harness. That evidence is deliberately blocked rather than overstated, while
the full state machine and every interruption boundary remain executable with independent fixtures.
**Confidence**: High. **Hardening**: the dependency was verified against the current seed and the
approved Phase 3 fixture ownership; the decision is reversible when the fixture manifest lands and
does not weaken any runtime failure. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260811-P2`. **Reopen triggers**: Phase 3 completes its deterministic fixture manifest,
the current seed becomes independently revision/digest-bound, or the retained runtime begins producing
fixture-backed evidence.

### AR-41 — Phase 2 lifecycle quality correction

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal lifecycle safety and
truthfulness corrections inside the approved Phase 2 harness boundary; no product source, fixture
ontology, CI workflow, publishing, deployment, or public API changes. **Objective**: resolve every
Major and Minor root cause accepted from the first independent Phase 2 quality review. **Decision**:
the retained runtime distinguishes narrow transient preparation from complete reset; complete reset
fails closed until Phase 3 installs its deterministic database fixture adapter. Startup owns one
atomic worktree intent before mutation, persists actual Docker container/network/volume identities
and PID-reuse-resistant SPA/BFF process identities, serializes lifecycle controls, and applies
aborting operation deadlines. Cleanup requires complete persisted identity, retains a collision
tombstone for unreadable leases, supports dead-supervisor recovery through a validated lookup, and
keeps its control socket owner-only. Bounded candidate exhaustion releases only the losing startup
intent. **Evidence**: the corrective specifications recorded five exact RED cases before the
implementation and now run 259/259 green. Live validation observed five immutable container IDs,
one immutable network ID, no declared volumes, two PID-fingerprinted host processes, one winner from
two simultaneous same-worktree starters, malformed-control containment, successful SIGTERM cleanup
with exit 143 and no residue, successful forced-crash recovery, and all six retained SPA/BFF
journeys. **Rejected alternatives**: predicted Compose names
cannot fence deletion; missing discovery cannot prove absence; in-memory child ownership cannot
recover after a supervisor crash; overlapping reset/stop operations violate poison ordering; and a
best-effort reset result would overstate assurance. **Strongest counterargument**: the full database
reset remains unavailable in the live retained runtime. That is the truthful boundary already fixed
by AR-40; Phase 3 owns the independent fixture oracle required to activate it. **Confidence**: High.
**Hardening**: independent correctness and security/concurrency reviewers supplied the accepted
failure cases; the single permitted re-review identified deadline joining, startup-intent, and
immutable cleanup residuals, which were corrected and covered by focused live and implementation
evidence before unchanged full verification. **Policy
version**: 1. **Root invocation ID**: `AD-TA-EXEC-20260811-P2`. **Reopen triggers**: a live adapter
cannot reproduce the specification outcome, cleanup accepts incomplete identity, concurrent
starters create more than one stack, or the re-review reports a residual Major or Critical finding.

### AR-42 — Pre-commit verification for fixture specification tasks

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: execution sequencing for two
test-only tasks inside the frozen verification and provenance policy; it changes no fixture oracle,
product behavior, acceptance criterion, evidence authority, or scope. **Objective**: preserve both
verified-before-commit execution and the rule that attributed evidence comes only from a clean,
committed source tree. **Decision**: Tasks 3.1–3.2 run repository structure tests, the assurance
TypeScript project, and harness ESLint before commit. Their immutable runtime specifications remain
outside required collection until Task 3.3 records the exact RED signature. Clean-tree
`assurance:validate` remains mandatory at committed roll-up checkpoints. **Evidence**:
`inspectFoundationProvenance()` rejects every staged, unstaged, or untracked path, so the original
Task 3.1–3.2 binding could not succeed before the commit it was meant to gate; Phase 2 used the same
static boundary successfully without relaxing evidence provenance. **Rejected alternatives**:
adding a dirty-tree evidence mode would reopen the provenance vulnerability; committing before
verification violates the execution contract; temporarily hiding changes verifies a different
tree. **Strongest counterargument**: static checks do not execute the new runtime oracle. That is
intentional until the separate exact RED checkpoint, while the unchanged full repository verify
still checks compilation and lint. **Confidence**: High — this is a small, reversible sequencing
correction already exercised in Phase 2. **Hardening**: forced reframing found no alternative that
preserves both clean evidence provenance and pre-commit verification; independent challenge is not
required for this reversible internal checkpoint. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260811-P3`. **Reopen triggers**: validation gains a sound non-persisting dirty-tree
mode, the commit gate changes, or the specification files enter required runtime collection before
Task 3.3.

### AR-43 — Purpose-aware fixture association oracle

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: necessary pre-implementation
correction of a specification-author defect so the immutable fixture oracle matches the approved
requirements and Porta's existing OIDC/RBAC model; it changes no product behavior, acceptance
criterion, security policy, or scope. **Objective**: reject ambiguous tenant ownership without
making valid OIDC clients, role-oriented applications, or an authenticated unprivileged control
actor impossible. **Decision**: valid authorization clients use only an independently declared
allowlist of Porta's shared standard scopes and include `openid`; scope names never represent
tenant ownership. Tenant identity, redirects, origins, and protected credential references remain
disjoint, while invalid redirect and origin candidates carry structured rejection expectations.
Global applications declare `oidc`, `rbac`, or `mixed` purpose and expose the corresponding client
and/or role associations. Administrative roles declare a permission profile: full is a strict
superset of limited, limited is nonempty, and the explicitly unprivileged control is empty;
administrative actors are explicitly active. **Evidence**: Porta exposes one fixed global OIDC
scope vocabulary and requires `openid`; it has no tenant-specific custom-scope registration. Roles
belong globally to an application; the `porta-admin` application owns administrative roles; and a
zero-permission authenticated actor is required to distinguish authentication from authorization
denial. **Rejected alternatives**: whole-scope-set disjointness invalidates OIDC; inventing custom
tenant scopes contradicts Porta's provider; asymmetric standard-scope subsets weaken equivalent
cross-tenant comparisons; requiring clients on every application confuses OIDC and RBAC purposes;
and requiring permissions on every role eliminates the negative control. **Strongest
counterargument**: the extra purpose and structured-invalidity fields increase fixture-model size.
They make ownership and negative metadata mechanically testable without inventing product
capability, so the bounded complexity is necessary. **Confidence**: High. **Hardening**: an
independent blind challenger and a repository-grounded follow-up rejected both whole-set and custom
scope disjointness, then converged on shared allowlisted scopes plus purpose-aware associations.
**Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260811-P3`. **Reopen triggers**: Porta no longer requires `openid`, applications stop
owning roles/clients, or the unprivileged control is replaced by a different authenticated denial
mechanism.

### AR-44 — Authorized organization-scoped user-route remediation

**Authority**: User — explicitly authorized after the corrected public oracle reproduced the
blocking defect. **Objective**: close the concrete tenant data exposure without broadening Phase 3
into unrelated product work. **Decision**: Phase 3 may modify product routes only to enforce that
every user-specific operation beneath an organization-prefixed API addresses a user owned by that
organization. Immutable public sentinels cover cross-tenant read, write, status, role, two-factor,
export, and history boundaries and verify no mutation. The shared guard runs after admin
authentication and the route's permission middleware so it cannot disclose membership to an actor
who lacks the operation's permission. Standalone `/api/admin/users/:userId` routes remain unchanged
because their documented contract intentionally has no organization path. **Evidence**: a live
authenticated request for a Bravo user through an Alpha path returned `200`; the organization-
prefixed handler used a global `getUserById` lookup and ignored `ctx.params.orgId`. The same pattern
exists across user mutation/status/export/history handlers and the organization-prefixed role
router; the two-factor router already performs an equivalent per-handler check. **Rejected
alternatives**: weakening the oracle recreates the original false green; a router parameter hook
runs before route permission middleware and can disclose membership through `403`/`404` differences;
changing standalone routes would alter a separate documented API contract. **Strongest
counterargument**: an extra user lookup adds latency to affected operations. Correct tenant
authorization dominates that bounded administrative-route cost, and later refactoring may reuse a
scoped user loaded by the guard. **Confidence**: High. **Hardening**: independent correctness and
security reviews required the real boundary probe; the live reproduction and source audit converge
on the same root cause. **Root invocation ID**: `AD-TA-EXEC-20260811-P3`. **Reopen triggers**: user
organization ownership becomes mutable, routes gain a different authoritative tenant context, or a
permission middleware no longer precedes the membership guard.

### AR-45 — Phase 3 residual evidence and lifecycle correction design

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: necessary testing, recovery,
concurrency, and failure-classification mechanisms inside the already approved fixture/lifecycle
scope; the user separately authorized the only product-behavior change under AR-44. **Objective**:
prevent Phase 3 from becoming green through a synthetic principal, aggregate-count cancellation,
an admission-marker surrogate, leaked bootstrap argv, or a supervisor child that outlives its
command. **Decision**: (1) run real authorization-code/PKCE journeys for both ordinary tenants and
both persisted client classes, exchange each code, and verify userinfo for the intended synthetic
principal; (2) treat invalid redirect/origin definitions as negative candidates applied to a
persisted same-kind control client, require exact pre-interaction redirect rejection, and publish a
stable fixture-to-observation matrix; (3) attribute organization-scoped admin route isolation to
the full administrative actor and exact target/path organizations rather than an ordinary actor;
(4) compare canonical redacted SHA-256 digests of PostgreSQL identities, session/token identities,
Redis keys, and MailHog message identities before and after each sequence; (5) keep owned ingress
stopped through private reset verification, explicitly restore ingress after every pre-mutation
failure, and reopen only in the final resume step; (6) create the initial bootstrap password in an
owner-only run file and execute the same host-side bootstrap path used by reset; (7) install startup
signal ownership before spawning the detached supervisor, join cleanup for the exact run on every
failed/interrupted readiness outcome, and (8) execute admitted Playwright projects as supervisor-
owned bounded process groups whose assertion failures remain product failures, whose launch/
collection failures remain test/setup failures, and whose cancellation is immediate rather than
queued behind stop. **Evidence**: the bounded re-review directly observed a fixed password in
`docker exec` argv, a full-admin token behind the ordinary-actor label, invalid-client fixtures
excluded from persistence, count-only residue, nginx restarted before poison clearance, signal
handlers installed after detach, and Playwright nonzero results collapsed through exit 30.
**Rejected alternatives**: retaining aggregate counts permits delete-and-replace cancellation;
persisting deliberately invalid clients contradicts the negative-registration contract; using
ordinary tokens fabricated directly in `oidc_payloads` does not prove an authentication journey;
marker-only admission does not fence the network; external command timeouts cannot kill a child
owned by the supervisor; and weakening public sentinels would recreate the original false green.
**Strongest counterargument**: four OIDC journeys and stable store digests add phase runtime. They
replace vacuous evidence at the exact identity-provider boundaries this program exists to test, so
the bounded cost is justified. **Confidence**: High — each mechanism is independently observable
and uses the retained harness rather than a new test framework. **Hardening**: the correctness and
security auditors independently converged on these residuals during the single permitted
re-review; this correction implements their strongest compatible recommendation, and no third
review will be dispatched. **Policy version**: 1. **Root invocation ID**:
`AD-TA-EXEC-20260811-P3`. **Reopen triggers**: provider interaction fields change, a client class
cannot complete its declared grant, reset verification requires public ingress, or Playwright
introduces a structured exit/report contract that supersedes the current stage mapping.

### AR-46 — Pre-commit verification for coverage specifications

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: execution sequencing for one
test-only task inside the frozen provenance policy; it changes no coverage oracle, product
behavior, acceptance criterion, evidence authority, or scope. **Objective**: preserve verified-
before-commit execution without attributing evidence to an uncommitted source tree. **Decision**:
Task 4.1 runs repository structure tests, the assurance TypeScript project, and harness ESLint
before commit. Its immutable runtime specifications remain outside required collection until Task
4.2 records the exact RED signature. Clean-tree `assurance:validate` remains mandatory at committed
coverage checkpoints. **Evidence**: `inspectFoundationProvenance()` rejects every staged,
unstaged, or untracked path, so the original binding could not succeed before the commit it was
meant to gate; the same static boundary preserved both provenance and spec-first ordering in
Phases 2 and 3. **Rejected alternatives**: accepting dirty evidence would weaken provenance;
committing before verification violates the execution contract; temporarily hiding changes
verifies a different tree. **Strongest counterargument**: static checks do not execute the new
runtime oracle. That is intentional until the exact RED checkpoint, while unchanged full
repository verification still checks compilation and lint. **Confidence**: High — this is a small,
reversible sequencing correction already exercised twice. **Hardening**: forced reframing found no
alternative that preserves both clean evidence provenance and pre-commit verification;
independent challenge is unnecessary for this reversible internal checkpoint. **Policy version**:
1. **Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: validation gains a sound
non-persisting dirty-tree mode, the commit gate changes, or the specifications enter required
runtime collection before Task 4.2.

### AR-47 — Transitional server-process coverage RED evidence

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: bounded test-execution design
inside the approved RED checkpoint; it changes no coverage oracle, product behavior, acceptance
criterion, or scope. **Objective**: prove the known missing server-process capture and conversion
surface for the intended reason, never through module-load or setup failure. **Decision**: retain
the three coverage specification files as immutable runtime oracles and add one narrow current-
surface specification that reports the exact ordered absence of Porta-scoped V8 capture, its raw
mount, the converter entry point, and the registered coverage handler. The bridge first requires
the independent mapping fixture to exist. The existing bounded RED wrapper accepts only one raw
exit 1, zero passing cases, exactly one failing case, and one literal marker occurrence for
ST-19. Partial/stale diagnosis, collection failure, timeout, cleanup failure, or unrelated output
cannot count. **Evidence**: the converter is declaration-only at this checkpoint and the command
handler intentionally fails closed as unavailable, while the execution contract prohibits using
missing-module failure as RED. **Rejected alternatives**: executing the declaration-only specs
would produce setup noise; a temporary fake converter would shape the oracle around disposable
implementation; accepting the unavailable-handler exit would not prove the missing capture
surface. **Strongest counterargument**: a static bridge can be satisfied cosmetically. It proves
only the required pre-implementation RED baseline; the real raw-envelope, mapping, provenance,
reproducibility, and live capture specs remain the green authority. **Confidence**: High — the
same exact-marker pattern already proved lifecycle and fixture RED states without weakening their
runtime oracles. **Hardening**: forced reframing retained the smallest exact-set bridge and rejected
all setup-failure-based alternatives; independent challenge is deferred to the full Phase 4
review. **Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen
triggers**: any coverage capability exists before RED is recorded, the bridge enters claim
evidence, or signature execution becomes data-driven from the registry command string.

### AR-48 — Porta-only run-owned coverage mount

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal capture, filesystem,
and cleanup design inside the approved coverage policy; it changes no product behavior, runtime
security policy, acceptance criterion, or scope. **Objective**: retain raw V8 output on the host
while keeping instrumentation absent from every non-Porta service and inactive during ordinary
harness runs. **Decision**: the base Compose service gives only Porta a
`NODE_V8_COVERAGE` value that is empty by default and mounts one lifecycle-run-owned directory at
`/app/.v8-coverage`. Ordinary runs use an ignored runtime-directory target and produce no V8
output. `assurance:coverage` creates a UUID-owned ignored result directory, validates that its
canonical absolute path remains below `test-harness/.assurance-results`, makes only the handoff
directory writable to the non-root container, and supplies the non-empty Node path. The command
discovers the exact label-bound Porta container, snapshots its compiled output, sends SIGTERM,
waits for exit/flush, validates raw JSON, and writes revision/image/lock/fixture/process
provenance before fenced lifecycle cleanup. **Evidence**: the retained Compose adapter already
passes a manifest-derived environment and cleans exact bind-owning container/network identities;
an optional override file would make the committed RED bridge inspect the wrong topology, while a
named volume would require a second extraction boundary before host conversion. **Rejected
alternatives**: instrumenting every ordinary run creates unrequested overhead and residue;
instrumenting another service corrupts server attribution; a named volume obscures host artifact
ownership; caller-selected arbitrary bind paths create write/traversal risk. **Strongest
counterargument**: ordinary runs still mount an empty directory. It is lifecycle-owned and ignored,
Node receives an empty coverage setting, and exact cleanup removes its run directory, so the small
mount cost avoids a second Compose topology without collecting data. **Confidence**: High — the
path, service, signal, and provenance boundaries are directly testable. **Hardening**: forced
reframing favored one manifest-owned topology over override and volume extraction alternatives;
the full Phase 4 security/correctness review remains the independent challenge. **Policy
version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: Node treats an
empty variable as active coverage, Compose changes bind interpolation semantics, the container UID
cannot write/read the handoff, or graceful SIGTERM does not produce complete raw records.

### AR-49 — Container-to-host raw coverage handoff

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal filesystem ownership,
recovery, and evidence-extraction design inside the approved coverage scope; it changes no product
behavior, coverage oracle, acceptance criterion, or policy. **Objective**: make raw V8 evidence
readable by the invoking host user without weakening non-root container execution, provenance, or
cleanup ownership. **Decision**: replace the host-writable bind handoff with one Compose-project-
owned named volume mounted only into Porta. After sending SIGTERM to the immutable label-verified
container, require `docker wait` and inspection to prove a stopped, non-OOM, zero-exit process;
then use `docker cp` without archive ownership preservation to copy the volume contents into a
fresh owner-only staging directory. Validate bounded regular files, exact names, JSON envelopes,
and sizes before atomically promoting staging to the previously absent final `raw` directory.
Retain only allowlisted stage diagnostics and let exact lifecycle cleanup remove the recorded
volume on every outcome. Reopen Task 4.7 because AR-48's container-UID readability trigger fired;
Task 4.8 remains the clean two-run evidence gate. **Evidence**: the first clean live capture
produced six validly named mode-`0600` files owned by container UID/GID `100:101` beneath a
host-owned mode-`0777` bind directory, so host validation failed before a manifest could be
written. The lifecycle already discovers, validates, persists, and deletes exact labeled Compose
volume identities. **Rejected alternatives**: changing the container user or making raw files
world-readable weakens the non-root boundary; retaining the bind still requires Docker-mediated
extraction and leaves a world-writable inbox; replacing a nonempty bind directory cannot be one
atomic rename and risks mixed evidence. **Strongest counterargument**: a named volume exists on
ordinary harness runs even when coverage is disabled. It remains empty, project-labeled, and
exactly lifecycle-owned, so its bounded creation cost is preferable to a writable host handoff.
**Confidence**: High — the failure was reproduced from file ownership and the lifecycle already
implements exact volume fencing. **Hardening**: a blind independent challenger preferred the
named-volume design, required final container-state verification, bounded regular-file validation,
and allowlisted stage-only diagnostics; those requirements are adopted. **Policy version**: 1.
**Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: Docker copy ownership
semantics change, the lifecycle cannot prove exact volume ownership, graceful Porta termination
returns nonzero/OOM state, or output cannot be promoted without mixing captures.

### AR-50 — Compose volume resource finalization

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: necessary consistency fix in
the already approved lifecycle resource-fencing mechanism; it changes no product behavior,
acceptance criterion, cleanup authority, or scope. **Objective**: allow a provisional empty lease
to gain an exact label-verified Compose volume identity without allowing any authority field to
change. **Decision**: treat `volumeNames` exactly like `containerIds` and `networkIds` in the
non-resource authority comparison, while retaining the separate monotonic resource-discovery
check and exact persisted-record compare-and-swap. Add a real filesystem-adapter regression case
that starts with empty resource arrays, finalizes exact container/network/volume identities, and
rejects later replacement. Reopen Task 4.7 again before Task 4.8 clean evidence. **Evidence**: the
first named-volume startup created five correctly labeled containers, one network, and one labeled
volume, but `sameLeaseAuthority()` cleared containers, networks, and host processes while leaving
`volumeNames`; the empty provisional lease therefore could never equal discovered ownership and
startup failed closed with exit 60. **Rejected alternatives**: omitting the volume from discovery
would make cleanup incapable of deleting it safely; precomputing the Compose-generated name would
replace observation with naming convention; weakening the complete-record CAS would permit
authority drift. **Strongest counterargument**: excluding another field from the authority
comparison could mask mutation. The separate monotonic resource check permits only empty-to-exact
discovery or exact equality, and the final persisted replacement remains a full CAS. **Confidence**:
High — the failing comparison is direct and the correction mirrors the existing container/network
model. **Hardening**: the independent challenger required exact lifecycle ownership; this fix
preserves that requirement instead of bypassing it. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260811-P4`. **Reopen triggers**: volumes gain mutable ownership fields, discovery is
no longer label-bound, or resource finalization permits nonempty replacement.

### AR-51 — Non-root named-volume initialization

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: test-image filesystem ownership
inside the approved non-root coverage capture mechanism; it changes no production image, product
behavior, acceptance criterion, or policy. **Objective**: let the existing non-root Porta process
write V8 output into its exact named volume without granting world write access. **Decision**: in
the harness Dockerfile only, create `/app/.v8-coverage` before `USER porta` with owner/group
`porta:porta` and mode `0700`. Keep the Compose volume mount and Docker-mediated host extraction;
add a structure assertion that the owner-only initialization precedes the non-root user boundary.
Reopen Task 4.7 before clean evidence. **Evidence**: a live clean run had
`NODE_V8_COVERAGE=/app/.v8-coverage`, UID/GID `100:101`, and a named-volume mount root owned by
`root:root` with mode `0755`; graceful zero-exit shutdown therefore produced no files. A separate
Docker copy probe proved default `docker cp` creates host-user-owned mode-`0600` files correctly.
**Rejected alternatives**: mode `0777` recreates the insecure bind inbox; running Porta as root
violates the project security boundary; entrypoint-time privilege changes are impossible after
the image switches to the non-root user and would mix capture concerns into product startup.
**Strongest counterargument**: image-directory ownership relies on Docker's named-volume initial
copy behavior. That is the standard local-volume initialization path and is directly verified by
the clean live capture; any engine that disables copy will fire the no-output gate rather than
produce false evidence. **Confidence**: High. **Hardening**: the selected correction preserves the
challenger's owner-only staging and non-root requirements with the smallest harness-only change.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: the
runtime UID changes, Compose enables `volume-nocopy`, or a supported container engine initializes
the mountpoint with different ownership semantics.

### AR-53 — Coverage evidence fail-closed correction

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: necessary security,
concurrency, provenance, and evidence-integrity corrections inside the approved attributed
coverage scope; they change no product behavior, coverage threshold, CI policy, or release gate.
**Objective**: ensure an accepted observation proves exactly which clean source and owned process
ran, while every ambiguous, failed, or interrupted collection remains visibly ineligible.
**Decision**: bind the clean revision, dependency lock, and server source-tree digest into the
immutable harness image and revalidate them before conversion; authorize inspection and SIGTERM
only against the exact Porta container ID persisted in the durable lifecycle lease and its full
ownership labels. A failed or competing startup never invokes unscoped cleanup. Conversion runs
as a separately managed child with a fixed deadline and TERM-to-KILL escalation while lifecycle
ownership stays in the parent. Only a completely successful project, graceful flush, extraction,
classification, mapping, and non-interrupted conversion emits an observation summary; every other
outcome emits a distinct sanitized failure record. Runtime dependencies must match an inventory
generated inside the attributed image. Pathless scripts are explicit deferred inputs rather than
assumed Node internals, and exact exclusions, unmapped inputs, deferred records, and collection
failures survive rejection. The graceful-flush implementation receives direct outcome tests and
a bounded disposable-container forced-termination smoke. Clean-provenance initialization uses the
same guarded failure path, and `NODE_V8_COVERAGE` is removed from every auxiliary Porta CLI
invocation; a capture containing more than one process ID is ineligible. **Evidence**: the independent phase
review found that host metadata was sampled after execution, container selection was not compared
with the lease, a losing concurrent command could stop the winner, conversion ignored parent
cancellation, failed projects still wrote baseline-shaped summaries, path prefixes stood in for
dependency proof, and the forced-termination specification used only a synthetic envelope. The
bounded re-review then caught an unguarded dirty-provenance exception and reproducible
CLI/migration contamination; both were corrected, and the replacement captures contain only the
server PID.
**Rejected alternatives**: trusting the current Git `HEAD`, Compose project labels, or filesystem
prefixes does not bind executed bytes; retaining in-process conversion cannot guarantee prompt
signal cleanup; writing an observation with a failure flag keeps a dangerous baseline-shaped
artifact; treating blank URLs as declared internals invents provenance. **Strongest
counterargument**: image labels and a managed converter add build and process machinery. The
additional identities are small, deterministic, independently inspectable, and necessary because
this evidence is intended to support later security claims. **Confidence**: High. **Hardening**:
independent correctness and security reviewers converged on the same provenance and fail-closed
boundaries; both correction sets are adopted without waiver. **Policy version**: 1. **Root
Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: Docker label/build semantics
change, conversion cannot be terminated with absence proof, dependency inventory is not bound to
the selected image, or any failed command can leave a baseline-eligible observation.

### AR-52 — Open-ended Istanbul mapping columns

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: converter validation detail
inside the approved exact source-mapping mechanism; it changes no coverage target, product
behavior, acceptance criterion, or gate policy. **Objective**: accept the pinned converter's
documented-by-output open-ended end-column sentinel without accepting unbounded values in any
position used for line attribution. **Decision**: permit positive infinity only for an Istanbul
statement location's `end.column`; continue requiring finite positive lines, finite nonnegative
start columns, exact nonnegative integer counters, and validated source paths. Attribution and
line totals continue to use only `start.line`. Re-run the retained clean artifact through every
eligible file before another clean capture. **Evidence**: the first complete host-owned capture
classified successfully but rejected 52 eligible modules; direct schema diagnostics showed exact
`Infinity` values only at `statementMap.*.end.column`, emitted by the pinned
`ast-v8-to-istanbul` converter. The same objects contained valid exact `s`, `f`, and `b` counters
and mapped source paths. **Rejected alternatives**: coercing infinity to a guessed source-column
changes third-party mapping semantics; allowing arbitrary non-finite values weakens validation;
dropping affected statements silently lowers totals. **Strongest counterargument**: accepting a
non-JSON number can make artifacts unstable. The location map is never serialized; only exact
derived integer counts and source-line sets are written, and the exception is limited to the
unused end column. **Confidence**: High. **Hardening**: the full retained capture is the stronger
integration oracle and must convert without any unmapped eligible input before completion.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260811-P4`. **Reopen triggers**: the
converter emits a non-finite start position, totals depend on end columns, or the pinned converter
changes its location representation.

### AR-54 — Curated-fault revision and command identity

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal provenance and execution
mechanism for the approved disposable curated-fault runner; it changes no product behavior, fault
policy, acceptance criterion, production source, or CI/release gate. **Objective**: keep a reviewed
fault executable across later assurance commits without allowing mutable revisions, unreviewed
target bytes, or catalog-provided shell commands. **Decision**: each fault records an immutable
full-commit ancestor floor, an exact SHA-256 of its one canonical regular target file, a repository-
owned unified patch, and closed allowlisted build/sentinel command identifiers. The runner requires
the clean execution revision to descend from the floor, verifies the exact target hash before
applying the patch in a disposable worktree, and never evaluates catalog strings as shell.
**Evidence**: the fault catalog is committed in the same evolving branch that later slices extend,
so pinning the exact catalog commit would make every subsequent commit ineligible; the target hash
and patch precondition bind the security-relevant bytes more precisely than a mutable branch name.
**Rejected alternatives**: exact current `HEAD` is self-invalidating after the next task; a branch
or tag range is mutable; arbitrary command arrays or shell strings turn reviewed data into an
injection boundary. **Strongest counterargument**: an ancestor floor admits later commits. The
exact target hash, patch check, clean-tree provenance, and closed command registry ensure those
later commits cannot silently change the patched control or executed command. **Confidence**: High
— the mechanism is deterministic and directly testable. **Hardening**: forced reframing retained
the ancestor floor only when paired with exact bytes and closed commands; neither check alone is
sufficient. **Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260812-P5`. **Reopen
triggers**: a fault spans multiple semantic targets, generated patches are introduced, or a slice
requires a command not representable by the closed runner registry.

### AR-55 — Tenant/admin baseline evidence without an exact existing sentinel

**Authority**: User — accepted the recommended strict evidence boundary on 2026-08-14.
**Objective**: record an honest Task 6.4 baseline without counting setup failure, mock behavior, or
an early unauthenticated denial as tenant/admin assurance. **Observed constraint**: the declared
`assurance:baseline` alias has no runtime handler yet. The audited E2E/pentest candidates either
stop at authentication, use fake credentials, accept broad status outcomes, or exercise mocked
lookup behavior; none proves an authorized control reaches the protected handler before the exact
tenant, permission, cache, or super-admin variation is denied without target mutation.
**Decision**: implement a sanitized baseline artifact that records ST-28 through
ST-32 as `natural-red: missing-live-sentinel`. Keep the immutable specification selector green,
record every rejected candidate and its reason, and distinguish missing executable evidence from
a product defect. Task 6.5 then replaces the transparent requirements adapter with live raw and
packed-client observations. **Rejected alternative**: admitting unit/integration tests as partial
legacy-green evidence weakens the exact external-boundary eligibility rule. **Rejected
interpretation**: dispatcher setup failure is not RED evidence, and a 401
before handler reachability is vacuous for these claims. **Rationale**: this decision
preserves the plan's exact E2E/pentest boundary and makes the current evidence gap visible instead
of overstating assurance. **Strongest counterargument**: “natural RED” usually describes observed
product behavior, whereas this result describes missing evidence. The explicit
`missing-live-sentinel` subtype prevents that conflation and must never be reported as a product
failure. **Confidence**: High. **Hardening**: grounded against the command dispatcher and the
existing tenant/admin pentest candidates; no exact external sentinel with authorized control,
handler reachability, varied target, and independent non-mutation was found. **Reopen triggers**:
an existing exact external sentinel is identified, or the user authorizes a different evidence
eligibility boundary.

### AR-56 — Live tenant/admin oracle and packed-client orchestration

**Authority**: User — explicitly authorized the recommended architecture on 2026-08-14.
**Objective**: make the immutable tenant/admin specifications observe live
Porta behavior while preserving one oracle, one harness owner, exact cleanup, packed-package
provenance, and the fresh-process meaning of ST-31. **Observed constraint**: the security harness
currently runs only one Playwright project inside its owned stack, while the five immutable
tenant/admin files run under Node and their adapter still delegates to a requirements-only rig.
The packed compatibility foundation runs separately against an already-owned stack and currently
proves package surfaces and credential isolation rather than tenant/admin journeys.
**Decision**: use one owned-stack command with three ordered evidence blocks:
(1) existing Playwright security, (2) the unchanged immutable Node specifications using an
explicit fail-closed `live` adapter and raw HTTP as the canonical oracle, and (3) packed SDK/CLI
adjunct journeys whose effects are independently checked through raw HTTP or fixture state. Reset
deterministically between blocks and mutable scenarios. Add a lifecycle-owned Porta-only restart
capability for ST-31; a fresh client and a full fixture reset do not prove a fresh server process.
Packed clients remain outside the raw-HTTP adapter contract. **Rejected alternative**: duplicating
the cases as Playwright-native security specs leaves the named Node oracle synthetic, creates a
second assertion implementation that can drift, and still does not solve packed provenance or the
fresh-process boundary. **Strongest counterargument**: the recommended orchestration is longer and
adds a restart capability. Staging the three blocks with typed resets and cleanup precedence is
more work, but it is the only reviewed design that preserves the existing immutable oracle and
proves ST-31 honestly. **Confidence**: High. **Hardening**: independent architecture challenge
confirmed the recommendation and required explicit adapter mode, block/scenario resets, separate
packed adjuncts, independent effect checks, and lifecycle-owned Porta restart. **Reopen triggers**:
the immutable specifications become runner-neutral, packed clients gain an independently complete
oracle, or lifecycle ownership cannot provide a bounded Porta-only restart.

### AR-57 — Live tenant/admin contract ruling

**Authority**: User approved on 2026-08-14. **Objective**: preserve the separation between independent
assurance, product-policy decisions, oracle corrections, and product remediation after the live
oracle reaches real Porta boundaries. **Observed behavior**: an alpha client ID submitted to the
bravo authorization endpoint returns a 303 interaction. Public tenancy documentation implies that
this must be hidden, while the implementation deliberately models cross-organization third-party
applications; this is a product-policy ambiguity until the intended contract is ruled. The
bootstrap-user archive case is an oracle defect because users have neither an archived state nor a
public archive operation; it must become non-applicable or a named future gap, not a new route added
for the test. The existing public role-removal route returns success for the protected bootstrap
user despite its documented forbidden contract; this is a product defect. Its observer must also
fingerprint role assignments rather than infer non-mutation from the user profile. Deactivate,
purge/delete, lock, 2FA management, and suspend are correctly forbidden; real OIDC session
revocation is rejected by existing, fresh-client, and fresh-Porta-process retries. **Current
boundary**: enforce strict issuer/client tenant binding, treat bootstrap-user archive as
non-applicable, repair the protected bootstrap-role removal path, and observe the actual role
assignment before and after the request. Cross-organization third-party client support is not part
of the current product contract. Do not invent an archive route or weaken the forbidden
role-removal expectation. **Reopen triggers**: product authority later elects to support
cross-organization third-party clients or adds a real bootstrap-user archive lifecycle.

### AR-58 — Clean packed-client evidence checkpoints

**Authority**: User approved the three-checkpoint refinement on 2026-08-14. **Objective**: preserve both CodeOps' verified-task commit
gate and the compatibility runner's clean reachable-revision provenance. **Observed constraint**:
the raw/product correction is green but uncommitted; the compatibility foundation rejects staged,
unstaged, and untracked primary-tree changes and builds packed clients from committed `HEAD`. A
single task cannot commit its raw correction before packed evidence, while packed evidence cannot
represent that correction until it is committed. Implementing new packed adjunct tooling after the
raw commit would dirty the tree again, so a two-part split is also insufficient. **Recommended
boundary**: refine the original outcome into three independently verifiable checkpoints: raw/product
green and commit; packed-adjunct capability with fail-closed tests and commit; then clean-revision
live SDK/CLI evidence and final slice admission. Preserve the Phase 6 closure gate until the third
checkpoint. **Rejected**: synthetic `commit-tree`, stash, temporary WIP branch commits, or testing
`HEAD` clients against a dirty-built server; these introduce an unapproved provenance class or a
false current-triplet claim. **Confidence**: High. **Hardening**: an independent provenance
challenge confirmed the three-checkpoint pattern already used by Phase 5. **Reopen trigger**: a
checkpoint cannot be verified independently without weakening clean-revision provenance or the
Phase 6 closure gate.

### AR-59 — Closed live tenant/admin fault execution

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: security-testing mechanism and
implementation sequencing inside the approved curated-fault and tenant/admin scope; this changes
no Porta product contract, accepted risk, claim requirement, CI policy, or production interface.
**Objective**: prove that each tenant/admin sentinel detects a representative broken production
control for the intended reason while keeping the primary worktree and every owned runtime resource
unchanged. **Decision**: refine the remaining Phase 6 work into three checkpoints: immutable
invariant-specific fault specifications, a closed live-mutant capability, then clean-revision
campaign evidence. Each semantic fault has its own ID, reviewed one-file patch, base-revision floor,
original and patched target digests, and exact claim/sub-sentinel/signature tuple. TypeScript owns an
exact fault-ID-to-production-target and sub-sentinel registry; catalog data cannot choose arbitrary
source paths, commands, test files, or name patterns. The disposable worktree retains its reviewed
uncommitted patch and is identified by the clean base commit/tree, patch digest, exact changed path,
patched target digest, and built image identity. A staged runner uses the existing lifecycle owner
to build and start a fresh patched stack, execute only the registered live Node sub-sentinel, and
prove stack/worktree absence before classification. The outer exact one-line failure grammar stays
unchanged; an inner TAP parser may emit it only when one registered live subtest fails, its allowed
control ran, and no unrelated failure, cancellation, or skip occurred. Organization-membership
coverage receives an explicit ordinary-tenant actor carrying a Porta role so the existing admin-
organization check is externally observable; unsupported organization reassignment/removal remains
a separate named gap. **Evidence**: the foundation runner currently accepts only its own fixture
target and cannot exercise real tenant/admin controls; ST-28–ST-32 are broad matrix tests, so a
whole-suite non-zero cannot identify the intended assertion. The clean-revision provenance rule
also means capability implementation must be committed before its live campaign runs. **Rejected
alternatives**: harness-only mutants prove the harness rather than Porta; a broad server-source
target regex turns catalog edits into arbitrary patch authority; a mega-fault destroys attribution;
the full security suite admits unrelated failures; a synthetic Git commit leaves shared object
residue and invents a provenance class; direct Docker commands bypass lifecycle fencing.
**Strongest counterargument**: one fresh stack and exact sub-sentinel per fault costs more runtime
than a shared stack. The self-contained lifecycle and cleanup proof is more important than speed for
initial P0 evidence; optimization may follow only after reliability evidence exists. **Confidence**:
High. **Hardening**: a blind independent architecture challenge converged on the same closed staged
executor. **Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260814-P6-F`.
**Reopen triggers**: lifecycle cannot admit an explicitly provenanced uncommitted mutant without
weakening normal clean-source evidence, a selected sentinel cannot isolate one invariant-specific
failure, or a required control spans more than one semantic target.

### AR-60 — Defensive terminology for tenant/admin sensitivity checks

**Authority**: User. **Objective**: describe Phase 6 as verification of Porta's own defensive test
surface, without language that implies intrusion into an external system. **Decision**: Task 6.10
and its operator-facing evidence use `control sensitivity`, `isolated source variant`, and
`designated check`. This initial naming decision was superseded by AR-66: the current public
outcomes use `check-invalid`, and tenant/admin checks no longer use the `assurance:fault` alias.
Historical schema fields remain compatibility implementation details and are not broadened or
exposed as arbitrary execution. Every check runs only from the current repository
against a disposable local worktree and lifecycle-owned local stack. No production endpoint,
credential, bypass switch, deployable test hook, or third-party target is introduced. Avoiding the
sensitivity checks entirely was rejected because a naturally green test still needs independent
evidence that it notices removal of its governing control. **Confidence**: High. **Reopen trigger**:
a check requires a production hook, external target, arbitrary catalog command/path, or behavior
beyond the repository-owned disposable environment.

### AR-61 — Isolated variant verification before dependency linking

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal verification ordering
inside the approved local control-sensitivity capability; this changes no Porta behavior, security
policy, scope, acceptance criterion, or external interface. **Objective**: prove that an isolated
source transformation changes exactly its registered file while still reusing the repository's
frozen dependencies for the later build and live check. **Observed behavior**: the first clean
campaign stopped at variant preparation because the runtime created the `node_modules` symlink
before exact changed-path verification. Git therefore reported the intended source file plus the
otherwise safe dependency symlink, and the experiment correctly failed closed. **Decision**:
apply the registered transformation, verify that its target is the sole changed path, and only then
link the exact primary `node_modules` directory. Add a real detached-worktree regression test for
this ordering. **Rejected alternatives**: ignoring all untracked paths would weaken the one-target
boundary; teaching the shared fault verifier to special-case `node_modules` would broaden a sound
primitive used by other campaigns; copying dependencies would be slower and create more mutable
residue. **Strongest counterargument**: a narrowly allowlisted symlink exception could be safe,
but verifying before the link is simpler and preserves the existing exact verifier unchanged.
**Confidence**: High. **Hardening**: the failure is reproduced directly with Git, which reports
only the registered source file and the dependency symlink. **Policy version**: 1. **Root
Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: a build prerequisite must exist
before the transformation or exact changed-path verification.

### AR-62 — Build-valid registered source variants

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal test-capability
validation inside the approved local control-sensitivity campaign; no product source, contract,
security policy, or acceptance criterion changes. **Objective**: ensure every registered isolated
source variant reaches the live check only when it remains a valid build of Porta. **Observed
behavior**: after variant ordering was corrected, the first campaign reached the build stage and
failed because removing the tenant predicate also made a required function parameter unused under
the repository's strict TypeScript settings. The runner classified this as `experiment-invalid`
and cleaned its resources. **Decision**: keep the missing-scope semantics but explicitly consume
the now-unused parameter in the reviewed replacement, and strengthen the real-worktree
implementation test to prepare and build all seven registered variants. **Rejected alternatives**:
relaxing TypeScript unused checks changes the product build contract; treating a build failure as
detection would produce false evidence; discovering build validity one live campaign at a time is
needlessly slow and leaves the registry under-tested. **Strongest counterargument**: building all
seven variants adds focused-test runtime, but it is bounded and substantially cheaper than seven
failed Docker campaigns. **Confidence**: High. **Hardening**: the exact compiler diagnostic was
reproduced in a disposable worktree. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: a registered transformation cannot preserve both
its intended missing-control semantics and the ordinary server build contract.

### AR-63 — Observable foreign-credential outcomes

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: test-observer mechanics inside
the approved tenant-read control check; no Porta behavior, tenant policy, or acceptance criterion
changes. **Objective**: distinguish a real tenant-scoped login rejection from authenticated
cross-tenant continuation without treating browser timing or an unrelated page as evidence.
**Observed behavior**: the build-valid tenant-read campaign reached its designated check. After
the foreign credential submission, the existing observer waited only for the login form to become
visible again. Under the isolated source variant, Porta continued beyond login, so that one-sided
wait timed out and the runner correctly classified the result as `experiment-invalid` rather than
`detected`. **Decision**: observe a closed three-state browser boundary: the login form becoming
visible is `not-found`; a real consent form or the registered callback carrying an authorization
code is `allowed`; any other state remains invalid. Add a pure classification regression and race
only those exact DOM/URL observations. **Rejected alternatives**: treating any navigation or
missing login form as acceptance creates false detections; accepting the timeout as detection
weakens the exact-signature rule; replacing the public OIDC boundary with a database query would no
longer test the exposed behavior. **Strongest counterargument**: consent presence alone precedes
final code issuance, but it is already proof that the foreign credentials authenticated across the
tenant boundary; callback-with-code remains the second independently valid acceptance state.
**Confidence**: High. **Hardening**: a disposable live stack reproduced the precise Playwright
timeout after successful build/start/fixture setup, with full cleanup afterward. **Policy
version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: the public
interaction changes its stable login, consent, or registered-callback contract.

### AR-64 — Missing issuer organization as observable mismatch

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal observation-domain
correction for the approved issuer-separation check; it changes no product issuer requirement or
accepted result. **Objective**: let the immutable exact-tenant oracle evaluate a missing or unknown
issuer tenant segment instead of losing that observation to a setup error. **Observed behavior**:
the isolated issuer variant completed both OIDC journeys and discovery requests, then the live
adapter threw `concurrent issuer omitted its organization` because its observation type admitted
only `alpha|bravo`. The outer runner correctly marked the experiment invalid. **Decision**: add
`none` to the observed tenant-organization domain, map missing or unknown issuer path segments to
that value, and let the unchanged exact-match oracle produce its designated signature. Add a pure
mapping regression. **Rejected alternatives**: treating the thrown error as detection conflates
observer bugs with security evidence; coercing the value to either tenant fabricates data; changing
the requirement to accept a tenantless issuer weakens OIDC isolation. **Strongest counterargument**:
an open string domain captures future tenant names, but the fixture matrix is deliberately closed
to alpha/bravo and every other value is semantically the same mismatch. **Confidence**: High.
**Hardening**: the exact missing-segment state was reproduced after successful build, startup,
fixture setup, OIDC login, and discovery, followed by complete cleanup. **Policy version**: 1.
**Root Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: the fixture tenant set or
issuer-path contract changes.

### AR-65 — Public cache-scope sensitivity observation

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: black-box test-orchestration
mechanism inside the approved organization-cache sensitivity check; no product cache policy,
endpoint, credential, or acceptance criterion changes. **Objective**: prove that the ST-30 cache
sentinel detects removal of organization scoping through independently observable public behavior.
**Observed behavior**: the shared-key source variant built and ran but was `not-detected`. The
existing concurrent adapter assigned `cacheOrganization` from the discovery issuer rather than
observing cache state; the issuer is path-scoped separately, so the synthesized field remained
correct even when the organization cache was wrong. **Decision**: keep the concurrent observer for
issuer isolation and add a dedicated cache-scope observation. Through existing public APIs, refresh
alpha with its current name to force a known alpha cache write, then present alpha's existing opaque
token to bravo UserInfo. Exact 2xx means the shared cache crossed the tenant boundary; 401/404 means
isolation held; all other responses invalidate the experiment. The requirements-only rig returns
the same closed baseline shape. **Rejected alternatives**: inspecting or editing Redis bypasses the
public boundary; continuing to infer cache identity from issuer data is tautological; making the
source variant more destructive would test a different control. **Strongest counterargument**: an
idempotent organization refresh writes `updatedAt` and an audit event, but it occurs only inside the
disposable owned stack and provides the only deterministic public cache write without adding a
production hook. **Confidence**: High. **Hardening**: repository code confirms organization update
invalidates and immediately re-caches the returned organization, while tenant resolution reads the
slug cache before token consumption. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: organization refresh no longer writes the slug
cache, UserInfo stops resolving tenant context, or an existing read-only public operation gains a
stronger deterministic cache-write contract.

### AR-66 — Neutral public control-check command and taxonomy

**Authority**: User. **Objective**: make the current Porta-owned verification work unambiguously
read as local quality assurance rather than an attempt to access or compromise another system.
**Decision**: the tenant/admin campaign uses the dedicated public command
`yarn assurance:control-check --check <registered-check>` and the neutral selectors
`tenant-read-scope`, `tenant-write-scope`, `issuer-separation`, `organization-cache-scope`,
`stale-authority-recheck`, `admin-organization-membership`, and `admin-permission-rbac`. Its exact
signatures end in `CONTROL_ABSENCE`, and its outcomes are `detected`, `not-detected`,
`check-invalid`, `environment-failed`, and `timed-out`. The general `assurance:fault` command
remains a separate compatibility surface for the plan's curated fault campaigns and no longer
dispatches tenant/admin control checks. The local executor still creates only one disposable
source variant and lifecycle-owned local stack; it accepts no arbitrary path, command, endpoint,
or external target. **Rejected alternatives**: skipping the seven checks would leave naturally
green claims without independent sensitivity evidence; globally renaming the later curated-fault
program would change unrelated phases; keeping the old public alias would preserve the ambiguity
the user explicitly asked to remove. **Confidence**: High. **Reopen trigger**: the public command
can select an unregistered check, arbitrary source path/command, non-local target, or retained
tenant/admin result still exposes the old public taxonomy.

### AR-67 — Authorization continuation as the cache-scope observation

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal black-box observer
mechanics inside the approved organization-cache check; no Porta behavior, cache policy, or
acceptance criterion changes. **Objective**: make the cache negative control observable through a
public tenant-resolution boundary that is not independently rejected by token ownership.
**Observed behavior**: the UserInfo probe selected by AR-65 remained `not-detected` after the
shared cache-key variant ran successfully. UserInfo independently binds the opaque token and
client context, so its denial did not reveal which organization tenant resolution supplied.
**Decision**: retain the public alpha organization refresh as the deterministic cache write, then
request bravo authorization with bravo's registered public client. A real interaction continuation
is the allowed baseline; exact not-found is the negative-control detection; every other status or
redirect state invalidates the check. **Rejected alternatives**: accepting the surviving UserInfo
result would create false evidence; reading Redis would cease to be black-box; adding a production
test hook would expand the product surface. **Strongest counterargument**: authorization has more
moving parts than a direct cache query, but it is an existing public boundary and its registered
client gives an exact, independently observable continuation. **Confidence**: High. **Hardening**:
the route and cache-service flow show that the refreshed alpha slug value is read before the
provider validates bravo's registered client against the resolved organization. **Policy
version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: authorization
stops binding its registered client to the resolved organization or no longer reaches a stable
interaction URL after successful tenant resolution.

### AR-68 — Cache lookup negative control at tenant resolution

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: exact local source-variant
selection inside the approved cache-scope check; no product behavior, public contract, or security
policy changes. **Objective**: ensure the public authorization observer actually depends on the
tenant-scoped cache lookup being checked. **Observed behavior**: the AR-67 observer completed
cleanly against the shared-key cache-module variant but remained `not-detected`. The cache module
variant changed both writer and reader together, leaving the public path insufficiently
discriminating in the integrated stack. **Decision**: move this negative control to the cache
consumer in `tenant-resolver.ts`: after alpha is cached through the existing public refresh, the
isolated variant resolves bravo from alpha's cache key. The unchanged registered bravo client must
then receive exact not-found from the existing client-to-resolved-organization binding. The variant
still changes one reviewed file and exposes no production hook. **Rejected alternatives**: another
opaque-token probe has an independent consumer rejection; Redis inspection is not black-box;
dropping the check leaves the named cache-scope claim without sensitivity evidence. **Strongest
counterargument**: a fixed alpha lookup is deliberately direct, but that is appropriate for a
negative control whose sole purpose is to prove the sentinel observes loss of request-scoped cache
selection. **Confidence**: High. **Hardening**: the middleware order shows tenant resolution reads
the cache before the existing client-tenant binding compares the resolved organization ID.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**: tenant
resolution stops using the slug cache or client binding no longer compares against its resolved
organization.

### AR-69 — Stale-authority negative control at the live recheck

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: exact local source-variant
selection inside the approved stale-authority check; no product behavior, role policy, or public
contract changes. **Objective**: prove the live role-removal sentinel depends on Porta re-reading
the actor's current authority for every administrative request. **Observed behavior**: six checks
were detected, but the RBAC-cache invalidation variant survived. `admin-auth.ts` reads the actor's
current role assignments from PostgreSQL on each request and resolves administrative permissions
from those roles; it does not consume the token-claims cache changed by the surviving variant.
**Decision**: move the isolated stale-authority negative control to that actual recheck and retain
the removed actor's previously valid `porta-auditor` role in the disposable build. The unchanged
live scenario must observe acceptance after public role removal and emit only its exact
`CONTROL_ABSENCE` signature. **Rejected alternatives**: keeping the unrelated cache target creates
false confidence; changing the observer to token claims would test a different surface; dropping
the check leaves stale administrative authority without sensitivity evidence. **Strongest
counterargument**: retaining a known fixture role is direct, but this is a closed local negative
control and the sentinel independently performs and verifies the public role removal first.
**Confidence**: High. **Hardening**: the live route and middleware show the role-removal mutation
updates PostgreSQL before the next request calls `getUserRoles` and derives permissions.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260815-P6-C`. **Reopen trigger**:
administrative authorization stops reading current role assignments per request or the fixture
limited role changes.

### AR-70 — Phase 6 quality-correction architecture

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: assurance observation,
provenance, cleanup, signal, and traceability mechanisms inside the already-approved Phase 6
contract; no Porta product behavior, security policy, or acceptance criterion changes.
**Objective**: prevent vacuous or synthetic tenant/admin evidence and make every retained local
control-check result independently attributable and recoverable. **Decision**: introduce three
bounded abstractions. First, administrative reachability uses paired route-specific public controls,
concurrency uses actual overlapping request intervals and distinct public/lifecycle-owned identity
observations, and prohibited side effects use a closed exhaustive observer with real session and
audit checks. Second, every control check persists an owner-only run record containing clean
source/tree, target/variant, dependency, image, fixture, signal, stage, and cleanup identities;
signals retain 130/143 semantics after cleanup, and failed stop preserves recovery context until
owned-resource absence is proven. Third, executable validation expands and compares the human
traceability matrix with the JSON graph, including Tasks 6.11–6.12 for R5.3. **Rejected
alternatives**: status-only reachability and default-false observations are the reviewed defects;
production test hooks violate the approved boundary; narrowing issuer/cache/session/audit claims
changes acceptance criteria; deleting recovery state after failed stop loses the only safe owner;
revision-only artifact labels do not prove the executed tree, variant, image, or fixture.
**Strongest counterargument**: lifecycle-owned cache inspection is less purely black-box than HTTP,
but the cache identity has no independent public representation and the inspection is confined to
the already-owned disposable stack while product effects remain public-boundary observations.
**Confidence**: High. **Hardening**: an independent correctness reviewer and tenant-isolation
auditor found the defects, and a blind correction challenge converged on the same three shared
abstractions. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260818-P6-Q`. **Reopen trigger**: any retained check lacks one required identity,
an upstream denial can satisfy reachability, an unobserved side effect maps to false, overlap is
inferred rather than measured, or recovery can succeed while an owned resource remains.

### AR-71 — Clean-revision protocol baseline checkpoint

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal verification sequencing
inside the approved protocol baseline task; no product behavior, acceptance criterion, or scope
changes. **Objective**: preserve the baseline command's clean-source provenance boundary while
still implementing and testing its protocol registry before evidence is recorded. **Decision**:
split the baseline task into a capability checkpoint and a clean-revision evidence checkpoint. The
first checkpoint installs the closed protocol selector, candidate audit, schemas, persistence, and
tests, then commits only after full verification. The second starts from that clean pushed revision,
runs the exact baseline command, validates its owner-only artifact, updates the execution record,
and commits the evidence record. **Rejected alternatives**: bypassing the clean-tree check weakens a
security boundary; a synthetic Git snapshot introduces an unapproved provenance class; marking the
task complete without executing the documented root command leaves its contract unverified.
**Strongest counterargument**: the extra checkpoint adds one verification cycle, but it is required
to prove that the recorded commit, tree, and tool digest identify the implementation that produced
the evidence. **Confidence**: High. **Hardening**: this follows the already verified packed-client
and live-evidence checkpoint pattern and changes only execution order. **Policy version**: 1.
**Root Invocation ID**: `AD-TA-EXEC-20260818-P7`. **Reopen trigger**: the baseline command can safely
bind an explicitly approved non-commit source identity, or clean provenance is no longer required.

### AR-72 — Protocol live and packed evidence checkpoints

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal test implementation and
verification sequencing inside the approved protocol task; no Porta product contract, acceptance
criterion, or external interface changes. **Objective**: make the immutable protocol oracle live
without duplicating it in Playwright, while keeping packed SDK/CLI evidence bound to a clean
reachable revision. **Decision**: split Task 7.5 into four independently verifiable checkpoints.
Task 7.5a implements and verifies the independent ES256/P-256 trusted-JWKS verifier and the explicit
opaque-token no-parse boundary. Task 7.5b replaces the non-evidentiary adapter with raw HTTP and
those independent JOSE observations and runs the same immutable specifications inside the owned
protocol stack. Task 7.5c adds immutable packed-protocol adjunct specifications and capability for
only the public client surfaces that directly participate in the slice: browser-assisted CLI
authorization-code/PKCE login and SDK refresh-token use. Raw HTTP/JOSE observations independently
verify their effects; packed clients never replace malicious-input probes. Task 7.5d starts from
the clean pushed capability revision, runs the packed adjunct, validates server/archive/fixture
identities and cleanup, and admits its evidence. **Rejected alternatives**: running packed evidence
from a dirty tree weakens the existing provenance boundary; duplicating the protocol oracle in
Playwright creates two sources of truth;
treating every SDK/CLI administration operation as protocol evidence expands this slice into the
later compatibility phase; omitting applicable login/refresh journeys leaves current public client
behavior mock-only. **Strongest counterargument**: four checkpoints add three verification cycles,
but each boundary has a distinct completion oracle and implementation cannot truthfully share a
commit with clean-revision package evidence. **Confidence**: High. **Hardening**: the split reuses
the verified Phase 6 packed checkpoint architecture and the current swappable immutable adapter;
no new runner or provenance
class is introduced. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260818-P7-B`. **Reopen trigger**: another public packed protocol surface becomes
required for this slice, or compatibility evidence can safely bind a separately approved source
identity.

### AR-73 — Privacy-safe protocol rejection observation

**Authority**: User — authorized by the instruction to proceed through the remaining program;
architecture refined under `--auto-design`. **Eligibility**: necessary product correction for the
already approved immutable protocol-log oracle. **Objective**: provide independently observable
security-rejection events without exposing authorization artifacts in either the new event or
ordinary request/error logs. **Decision**: insert Task 7.5b1 before the live adapter. A focused
observer registers server-generated request correlation against the shared raw request, listens to
typed `oidc-provider` rejection events, and is called explicitly only at approved pre-provider
security boundaries. It emits one closed event name, closed location-oriented event classes, and a
domain-separated SHA-256 digest of a bounded public client identifier. Duplicate request/class
events are suppressed. Unknown client identity is represented without inventing or exposing an
identifier. Ordinary request and unhandled-error logs record only the URL path. Public responses,
status codes, protocol decisions, and cryptographic behavior remain unchanged. **Rejected
alternatives**: deriving evidence from every outer 4xx is ambiguous; `renderError` misses JSON and
redirected failures; logging inside validators duplicates provider internals; accepting the absent
event as a named gap prevents the approved live claim from ever becoming evidentiary. **Strongest
counterargument**: product logging changes can themselves leak data, so the checkpoint is
specification-first, emits an exact minimal payload, performs no database lookup, and includes
query-string/secret canary regressions. **Confidence**: High. **Hardening**: an independent design
challenge confirmed typed provider events plus explicit pre-provider calls as the narrowest sound
capture points. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260818-P7-C`. **Reopen trigger**: the provider event contract changes, a new enabled
protocol endpoint enters the assurance slice, or the public log schema changes.

### AR-74 — Authorization-error redirect classification

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: correction of an independently
wrong protocol oracle; no product behavior or security-policy change. **Objective**: distinguish
errors that are safe to return through a previously validated redirect URI from an attacker-chosen
redirect mismatch. **Decision**: the missing-PKCE and unsupported plain-PKCE cases require a 303
authorization error containing `invalid_request` at the exact registered callback and no code. A
one-character redirect mismatch remains a direct 400 containing `invalid_redirect_uri` and must
not redirect. The positive flow retains the provider's observed 303 redirect contract. **Rejected
alternatives**: requiring every
authorization error to be direct contradicts the established authorization-response channel after
redirect validation; accepting a redirect for the mismatched URI would create an open-redirect and
code-disclosure risk. **Strongest counterargument**: a direct error is simpler to test, but it loses
the client-visible error channel without improving safety once the callback is already known and
exactly registered. **Confidence**: High. **Hardening**: the correction preserves exact redirect
matching and was made after separating the valid-redirect PKCE cases from the invalid-redirect
case, rather than normalizing all 3xx behavior. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260818-P7-D`. **Reopen trigger**: the authorization server can no longer prove the
redirect URI exact before emitting the error, or the approved Porta redirect status changes.

### AR-75 — Atomic refresh consumption and UserInfo issuer binding

**Authority**: User — authorized by the instruction to continue through completion; architecture
refined under `--auto-design`. **Eligibility**: necessary corrections for two confirmed live
failures inside the approved token replay and tenant-isolation scope. **Objective**: ensure one
refresh predecessor creates at most one replacement and an opaque access token discloses identity
only beneath the issuer organization that owns its client. **Decision**: make PostgreSQL consume a
single conditional, unexpired update and return generic `invalid_grant` when another request has
already claimed the artifact. At UserInfo, resolve exactly one bounded header or form token through
the provider, require its active client to belong to the resolved organization, and otherwise emit
the existing privacy-safe rejection event plus provider-compatible `401 invalid_token`. Malformed,
ambiguous, absent, and unknown tokens remain provider-owned decisions. **Rejected alternatives**:
serializing in one Node process would fail across replicas; trusting the CORS lookup would turn a
best-effort header mechanism into authorization; weakening the immutable live expectations would
retain both defects. **Strongest counterargument**: outer UserInfo validation partially duplicates
provider token extraction, so the boundary accepts only the provider's documented mechanisms and
delegates every ambiguous input. **Confidence**: High. **Hardening**: an independent challenge
converged on both mechanisms and identified Redis authorization-code atomicity plus the synthetic
wrong-client UserInfo subcase as explicit follow-up inputs to Tasks 7.6–7.7, not grounds to claim
the broader replay slice complete at this checkpoint. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-EXEC-20260818-P7-E`. **Reopen trigger**: access tokens cease to be opaque, UserInfo token
transport changes, the provider changes adapter failure semantics, or durable token storage moves
away from PostgreSQL.

### AR-76 — Packed CLI manual-mode selection

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal assurance execution
mechanism within the approved packed CLI login boundary; no product behavior or acceptance
criterion changes. **Objective**: exercise the distributed CLI's real authorization-code and PKCE
flow non-interactively without patching the CLI or accepting a synthetic login. **Decision**: set
the CLI's documented `PORTA_CONTAINER=1` environment and omit `--no-browser`. The first clean run
proved that Yargs interprets the published option name as negation of an undeclared `browser`
option and exits with `Unknown argument: browser`; the environment is an existing public manual-
mode mechanism implemented by `isContainerized()`. Record the flag behavior as a product defect
outside this assurance correction. **Rejected alternatives**: fixing CLI option parsing is a
separately authorized product change; launching the host browser is not deterministic or owner-
fenced; importing CLI internals would bypass the packed executable. **Strongest counterargument**:
container-mode selection is environment-dependent, but the value is explicit, allowlisted, and
drives the same public manual callback flow the option intended to select. **Confidence**: High.
**Hardening**: live reproduction against an owned stack returned the exact Yargs error before any
authorization request, while direct code inspection confirmed `PORTA_CONTAINER=1` is the supported
override. **Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260818-P7-F`.
**Reopen trigger**: the CLI removes the environment override, repairs and tests `--no-browser`, or
manual mode stops using the same authorization-code/PKCE path.

### AR-77 — Packed manual callback observation

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: internal assurance observation
mechanism within the approved packed CLI flow; no product or acceptance-criterion change.
**Objective**: observe the CLI's fixed manual callback deterministically after real browser login
without importing CLI internals or retaining authorization material. **Decision**: bind an owner-
local IPv4 HTTP listener to `127.0.0.1:11111` before the packed process starts, accept one bounded
GET to the exact `/callback` path with only `code`, `state`, and optional `iss`, return a no-store
text response, retain the URL in memory only, and close the listener under the same cleanup
precedence as the CLI process. Port zero is available only to implementation tests. The existing
state parser and token exchange remain the authoritative callback validation. **Rejected
alternative**: Playwright route fulfillment was attempted twice against a live owned stack and
still produced `ERR_CONNECTION_REFUSED`; reading a failed browser URL is browser-dependent, while
changing the CLI's redirect is a product change. **Strongest counterargument**: a loopback listener
briefly owns a fixed local port, but early exclusive binding, a closed request grammar, one-response
semantics, bounded waiting, and mandatory close make that ownership explicit and recoverable.
**Confidence**: High. **Hardening**: live diagnosis observed the provider's exact callback request,
then the owner-bound listener completed that same redirect without changing Porta or the packed
CLI. **Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260818-P7-G`. **Reopen trigger**:
the CLI changes its manual redirect, starts its own callback listener in manual mode, or the
provider's successful authorization response parameters change.

### AR-78 — Packed CLI optional email claim

**Authority**: AI — delegated by `--auto-design`. **Eligibility**: correction of a harness-only
credential parser that was stricter than the distributed CLI contract; no product behavior or
assurance requirement changes. **Objective**: admit a successful packed login when the admin ID
token legitimately omits the optional email claim, without weakening subject or token evidence.
**Decision**: accept the CLI's published string representation for `userInfo.email`, including its
documented empty-string fallback, while continuing to require a non-empty subject, access token,
refresh token, ID token, expiry, server, organization, and client. Independent JOSE verification
still requires the exact fixture subject; email is not an assurance oracle. **Rejected
alternative**: requiring Porta to emit an email solely for this test would turn a harness defect
into a product change; deleting identity validation would weaken the public contract. **Strongest
counterargument**: an empty email is less informative, but the CLI's credential type permits it and
the tested authorization identity is the OIDC `sub`, not an optional profile claim. **Confidence**:
High. **Hardening**: a live packed-equivalent login exited zero with every required token and an
empty email only; the new regression accepts that exact shape and rejects an empty subject.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260818-P7-H`. **Reopen trigger**: the
CLI credential contract makes email mandatory or the protocol adjunct begins claiming email
identity assurance.

### AR-79 — Defensive single-use consistency scope

**Authority**: User — explicitly authorized redefining the current work to avoid source-changing,
process-interruption, and offensive-testing mechanics; implementation details refined under
`--auto-design`. **Eligibility**: the user owns the acceptance-criterion change; the delegated
decision chooses the smallest truthful defensive test architecture inside that boundary.
**Objective**: preserve useful evidence that authorization codes and refresh tokens remain
single-use under ordinary concurrency, response loss, retry, and graceful restart without making
disposable Porta variants or terminating processes at storage boundaries. **Decision**: replace the
ten barrier/interruption scenarios with six single-use consistency scenarios: one public concurrent
duplicate case, one real-store conditional-consume case, and one committed-response-loss plus
graceful-restart case for each artifact family. Use the retained owned harness, real Redis or
PostgreSQL state, and the existing graceful `restart-porta` capability. Exact pre/post-commit
interruption and the uncommitted-timeout branch are named deferred resilience gaps and receive no
assurance credit. Task 7.6 owns the revised specification checkpoint; Task 7.6b owns live delivery.
**Evidence**: the current authorization-code adapter performs a Redis read/modify/write sequence,
the refresh-token adapter performs a conditional PostgreSQL update, and the lifecycle already owns
a graceful store-preserving Porta restart. The prior architecture required source variants,
coordination barriers, response-holding proxies, and forced process termination, which are no
longer within the user-approved task. **Rejected alternatives**: retaining the prior mechanics under
softer terminology would be cosmetic and contradict the request; deleting concurrency and restart
coverage would discard meaningful defensive evidence; treating missing interruption cases as green
would make the assurance report false. **Strongest counterargument**: omitting exact commit-boundary
interruption leaves a real resilience blind spot, so it remains visible as deferred work rather than
being erased. **Confidence**: High. **Hardening**: an independent challenge confirmed the prior
design genuinely depended on disposable source changes and process termination; its recommendation
was rejected because those mechanisms are precisely what the user removed from scope, while its
store-ordering evidence informed the retained consistency cases. **Policy version**: 1. **Root
Invocation ID**: `AD-TA-EXEC-20260819-P7-I`. **Reopen trigger**: the user separately authorizes an
advanced resilience campaign, the lifecycle gains a production-safe transactional observation
boundary, or protocol storage moves away from the current Redis/PostgreSQL adapters.

### AR-80 — Ordinary-lane consistency campaign discontinued

**Authority**: User — explicitly authorized changing the wording, settings, and taxonomy again and
avoiding these tests when they cannot be performed as ordinary defensive verification.
**Eligibility**: the user owns this acceptance-criterion reduction; `--auto-design` records the
smallest truthful downstream plan correction. **Objective**: continue the assurance program without
source variants, race campaigns, response-loss simulation, forced termination, or a new live
consistency harness. **Decision**: do not implement the Task 7.7 live adapter. Keep ST-49–ST-51 as
a requirements-only deferred consistency catalog, retain existing sequential public replay tests
as the ordinary lane, and move all concurrency/response-loss/restart/commit-boundary claims to
DEF-3. Record the authorization-code Redis adapter's non-atomic read/modify/write behavior as
blocked product defect DEF-4; do not weaken its expected one-winner contract and do not fix product
code inside this assurance task. Phase 8 follows the same sequential-only boundary. **Evidence**:
the discarded local implementation run observed two accepted authorization-code store consumes and
two accepted public code exchanges, matching the current Redis adapter's separate GET/TTL/SET
sequence. The experimental live adapter and all response-loss/restart additions were removed before
this checkpoint; the retained branch contains no such executable machinery. **Rejected
alternatives**: renaming the same mechanics would not honor the user's request; treating the Redis
result as green would make the claim false; automatically changing product code would violate the
plan's separate-authorization boundary. **Strongest counterargument**: sequential reuse cannot
establish atomicity, so the program must not claim it does; DEF-3 and DEF-4 preserve that limitation
prominently. **Confidence**: High. **Hardening**: the decision follows direct live observation,
source review, complete cleanup, and restoration of the clean pre-experiment implementation tree.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-EXEC-20260819-P7-J`. **Reopen trigger**: the
user separately authorizes the product fix and a bounded defensive concurrency regression, or the
storage implementation becomes atomic through another authorized change.
