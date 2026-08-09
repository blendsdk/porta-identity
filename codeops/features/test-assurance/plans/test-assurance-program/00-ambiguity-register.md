# Ambiguity Register: Porta Test Assurance Program

> **Status**: ✅ GATE PASSED — all 20 items resolved
> **Created**: 2026-08-09
> **Root Invocation ID**: `AD-TA-20260809-1421`
> **Auto-Design Policy**: 1
> **Parent**: [Plan Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Zero-Ambiguity Gate

The requirements ambiguity register owns product and program choices. This register resolves only
implementation planning choices. Every decision is inside the user-confirmed scope and changes no
Porta product contract.

| #   | Area             | Question                                    | Decision                                                                                                                                            | Authority | Status |
| --- | ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| 1   | Scope            | Which requirements are implemented?         | All seven `test-assurance` RDs in one phased program                                                                                                | User      | ✅     |
| 2   | Delivery         | Big-bang or incremental?                    | Eleven independently verifiable phases; Porta remains publishable                                                                                   | User      | ✅     |
| 3   | Harness          | New runner or retained harness?             | Extend the existing Docker/Playwright harness only                                                                                                  | User      | ✅     |
| 4   | Product changes  | Fix discovered behavior inline?             | No; reproduce, block the claim, and route a separate product task                                                                                   | User      | ✅     |
| 5   | Evidence home    | Where do durable definitions live?          | Versioned definitions under `test-harness/assurance/`; generated results stay ignored                                                               | AI        | ✅     |
| 6   | Claim format     | Markdown, JSON, or both?                    | JSON claim records validated by TypeScript/Zod, rendered to Markdown summaries                                                                      | AI        | ✅     |
| 7   | Oracle boundary  | May production code calculate expectations? | No; production imports are arrangement-only and assertions use public boundaries                                                                    | User/AI   | ✅     |
| 8   | Test naming      | How are independent tests distinguished?    | `*.spec.ts` for contract oracles; `*.impl.test.ts` for harness internals                                                                            | Standards | ✅     |
| 9   | Reset ownership  | Who owns state reset?                       | Typed harness fixture controller; reset failure is fatal and postconditions are verified                                                            | AI        | ✅     |
| 10  | Fixture topology | How many tenants and actors?                | Two ordinary tenants plus the existing super-admin tenant and role/lifecycle variants                                                               | AI        | ✅     |
| 11  | Parallelism      | Increase workers now?                       | Keep one worker until 100 shuffled representative runs show <1% flake                                                                               | AI        | ✅     |
| 12  | Coverage         | How is server-process execution captured?   | `NODE_V8_COVERAGE`, clean container shutdown, matching source maps, separate report                                                                 | AI        | ✅     |
| 13  | Coverage tooling | Which conversion path is planned?           | Pin direct dev dependencies `@bcoe/v8-coverage@1.0.2`, `ast-v8-to-istanbul@1.0.5`, and `acorn@8.18.0`; abort rollout if the attribution spike fails | AI        | ✅     |
| 14  | Thresholds       | Apply the current 80/75 thresholds?         | No; exact reproducible baselines first, no-regression ratchets second, slice floors later                                                           | User/AI   | ✅     |
| 15  | Faults           | How are tests challenged?                   | Versioned curated patches applied only in disposable worktrees/build contexts                                                                       | AI        | ✅     |
| 16  | Mutation         | Whole repository or targeted pilot?         | Curated faults are mandatory; automated mutation is a bounded compatibility pilot after reliability                                                 | AI        | ✅     |
| 17  | Clients          | Source workspaces or publishable artifacts? | Install `yarn pack` outputs in an isolated consumer directory and exercise public exports/bin                                                       | AI        | ✅     |
| 18  | CI               | Which command changes?                      | Preserve `yarn verify`; extend harness lane; keep fault/mutation on demand until promoted                                                           | User/AI   | ✅     |
| 19  | Standards        | Certification claim?                        | Use applicable OIDC/OAuth/JWT/ASVS controls as oracles; claim no certification                                                                      | User/AI   | ✅     |
| 20  | Security tooling | Include Codex Security?                     | No; retain as a future footnote outside this plan                                                                                                   | User      | ✅     |

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

## Hardening Record

An independent challenger reviewed the coupled security and test-infrastructure choices. The final
design incorporates its findings: cleanup is fatal; fixture tenants and roles are disjoint; server
coverage is process-owned and provenance-bound; exact counts precede ratchets; fault kills require
the intended assertion; packed clients run outside the workspace; and promotion requires measured
flake/runtime evidence.

**Gate result**: zero unresolved scope, security, data, concurrency, integration, error-handling,
verification, or rollout decisions remain.
