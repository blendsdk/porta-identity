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
| 4   | Product changes  | Fix discovered behavior inline?                  | No; reproduce, block the claim, and route a separate product task                                                                                                                                                | User           | ✅     |
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
| 42  | Fixture spec verification | How can Tasks 3.1–3.2 verify before commit when attributed validation requires a clean tree? | Use structure, assurance TypeScript, and harness ESLint as the pre-commit gate; keep runtime specs outside required collection until the exact RED checkpoint, and retain clean-tree validation for committed roll-ups | AI (runtime)   | ✅     |

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
