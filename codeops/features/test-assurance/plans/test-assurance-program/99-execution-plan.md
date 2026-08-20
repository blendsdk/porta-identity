# Execution Plan: Porta Test Assurance Program

> **Parent**: [Plan Index](00-index.md)
> **Status**: In Progress
> **Last Updated**: 2026-08-20 02:55
> **Progress**: 78/107 tasks (73%)
> **CodeOps Artifact Schema**: 1

## Execution Contract

Execute top-to-bottom. Mark the active task `[~]` with a timestamp, mark `[x]` only after its
verification contract succeeds, and mark blockers `[!]` with a concrete reason. Resume the first
`[~]`, otherwise the first `[ ]`. Update this file immediately after each task.

For a RED task, success means the isolated target exits non-zero with the exact registered
assertion/signature while every previously required lane and `yarn verify` stays green. Syntax,
collection, setup, timeout, cleanup, or unrelated failures never count as RED. A new red spec stays
outside required collection until its owning green task, but the red evidence is committed with the
task. Existing behavior that starts green uses its exact curated-fault tuple only for slices whose
sensitivity campaign remains in scope; deferred slices stay explicitly not-sensitivity-proven.

Tasks 1.1–1.4 use the exact bootstrap commands below. From Task 1.5 onward, every task runs the
alias/selector in the Targeted Verification Bindings table and then `yarn verify`. Product defects
preserve the oracle, block only affected claims, and are routed to separately authorized work. This
plan edits production behavior only for the separately authorized organization-route, Phase 6
tenant/admin blocking defects, and Phase 7 privacy-safe protocol observation, atomic refresh
consumption, and UserInfo tenant-binding corrections recorded in the ambiguity register, and never
edits the read-only CI workflow.

## Phase Overview

| Phase | Title                                               | Tasks |
| ----: | --------------------------------------------------- | ----: |
|     1 | Claim, command, and traceability foundation         |     8 |
|     2 | Fenced lifecycle and poisoned-stack reset           |     8 |
|     3 | Real actor fixtures, projects, and runtime profiles |     8 |
|     4 | Attributed server-process coverage                  |     8 |
|     5 | Fault runner and packed-client foundations          |    11 |
|     6 | Tenant isolation and administrative authorization   |    12 |
|     7 | OIDC, ID-token, and token lifecycle                 |    14 |
|     8 | Human authentication and recovery                   |     9 |
|     9 | P1 validation, exposure, and administrative data    |    10 |
|    10 | Mutation pilot and reliability qualification        |     8 |
|    11 | Roll-up, documentation, and promotion proposal      |     6 |

**Total: 102 tasks across 11 release-safe phases.**

## Targeted Verification Bindings

These selectors are registered suite IDs under the grammar in
[07-testing-strategy.md](07-testing-strategy.md). A task may run additional checks named in its
text, but it cannot substitute another command for this binding.

| Tasks     | Required targeted command before `yarn verify`                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1       | Bootstrap: `yarn test:structure`                                                                                                                             |
| 1.2       | Bootstrap RED: `yarn tsx --test test-harness/assurance/tests/assurance.spec.test.ts`; exact registered missing-foundation assertion must be the only failure |
| 1.3–1.4   | Bootstrap: `yarn test:structure` plus the task's explicit static command-schema check                                                                        |
| 1.5–1.6   | `yarn assurance:test --select assurance-foundation`                                                                                                          |
| 1.7       | `yarn assurance:test --select assurance-governance`                                                                                                          |
| 1.8       | `yarn assurance:validate` and `yarn assurance:report --run <task-run-uuid>`                                                                                  |
| 2.1–2.2   | `yarn test:structure`; the new isolated specs remain statically checked but outside required runtime collection until Task 2.3 records RED                  |
| 2.3       | `yarn assurance:red --case ST-09 --signature lifecycle-current-failure`                                                                                      |
| 2.4–2.7   | `yarn assurance:test --select lifecycle`                                                                                                                     |
| 2.8       | `yarn assurance:test --select lifecycle-all`                                                                                                                 |
| 3.1–3.2   | `yarn test:structure`, assurance TypeScript, and harness ESLint; immutable specs stay outside runtime collection until Task 3.3 records RED                  |
| 3.3       | `yarn assurance:red --case ST-13 --signature fixture-current-failure`                                                                                        |
| 3.4–3.5   | `yarn assurance:test --select fixture-ontology`                                                                                                              |
| 3.6       | `yarn assurance:test --select project-collection`                                                                                                            |
| 3.7       | `yarn assurance:harness --project security --profile production-security`                                                                                    |
| 3.8       | `yarn assurance:test --select fixtures-all`                                                                                                                  |
| 4.1       | `yarn test:structure`, assurance TypeScript, and harness ESLint; immutable specs stay outside runtime collection until Task 4.2 records RED                 |
| 4.2       | `yarn assurance:red --case ST-19 --signature coverage-current-failure`                                                                                       |
| 4.3–4.6   | `yarn assurance:test --select coverage-pipeline`                                                                                                             |
| 4.7       | `yarn assurance:test --select coverage-all`                                                                                                                  |
| 4.8       | `yarn assurance:coverage --project protocol --profile operational --seed coverage-baseline`                                                                  |
| 5.1       | `yarn assurance:validate`                                                                                                                                    |
| 5.2       | `yarn assurance:red --case ST-64 --signature fault-runner-missing`                                                                                           |
| 5.3–5.4   | `yarn assurance:test --select fault-runner`                                                                                                                  |
| 5.5       | `yarn assurance:validate`                                                                                                                                    |
| 5.6       | `yarn assurance:red --case ST-69 --signature packed-consumer-missing`                                                                                        |
| 5.7–5.9   | `yarn assurance:test --select packed-consumer`                                                                                                               |
| 5.10      | `yarn assurance:test --select fault-packed-foundations`                                                                                                      |
| 5.11      | `yarn assurance:fault --fault foundation-smoke --claim CLAIM-R6-01 --sentinel ST-64` and `yarn assurance:compat --select compatibility`                      |
| 6.1       | `yarn assurance:validate`                                                                                                                                    |
| 6.2–6.3   | `yarn assurance:test --select tenant-admin-specs`                                                                                                            |
| 6.4       | `yarn assurance:baseline --case ST-28`                                                                                                                       |
| 6.5       | `yarn assurance:harness --project security --profile operational`                                                                                            |
| 6.6       | `yarn assurance:test --select tenant-admin-packed`                                                                                                           |
| 6.7       | `yarn assurance:compat --select tenant-admin`                                                                                                                 |
| 6.8       | `yarn assurance:test --select tenant-admin-all`                                                                                                              |
| 6.9       | `yarn assurance:test --select tenant-admin-control-check-specs`                                                                                              |
| 6.10      | `yarn assurance:test --select tenant-admin-control-checks`                                                                                                   |
| 6.11      | Every `yarn assurance:control-check --check <registered-check>` command in the versioned tenant/admin campaign manifest                                      |
| 6.12      | `yarn assurance:test --select tenant-admin-all`                                                                                                              |
| 7.1       | `yarn assurance:validate`                                                                                                                                    |
| 7.2–7.3   | `yarn assurance:test --select protocol-specs`                                                                                                                |
| 7.4a      | `yarn assurance:test --select protocol-specs` plus protocol baseline specification/implementation tests                                                     |
| 7.4b      | `yarn assurance:baseline --case ST-33`                                                                                                                       |
| 7.5a      | `yarn assurance:test --select protocol-jose`                                                                                                                  |
| 7.5b1      | Focused server protocol-rejection observation specifications and implementation tests                                                                       |
| 7.5b2      | `yarn assurance:harness --project protocol --profile operational`                                                                                            |
| 7.6       | `yarn assurance:test --select protocol-specs`                                                                                                                |
| 7.7–7.8   | `yarn assurance:test --select protocol-specs` and `yarn assurance:test --select assurance-governance`                                                       |
| 7.5c      | `yarn assurance:test --select protocol-packed`                                                                                                                |
| 7.5d      | `yarn assurance:compat --select protocol`                                                                                                                     |
| 7.9       | `yarn assurance:test --select protocol-specs`; `yarn assurance:test --select protocol-jose`; `yarn assurance:test --select protocol-packed`; `yarn assurance:harness --project protocol --profile operational`; `yarn assurance:compat --select protocol`; `yarn assurance:coverage --project protocol --profile operational --seed coverage-baseline`; `yarn test:pentest`; `yarn verify` |
| 8.1       | `yarn assurance:test --select assurance-governance` and `yarn test:structure`                                                                                 |
| 8.2–8.5   | `yarn assurance:test --select human-auth-specs`                                                                                                              |
| 8.6a      | `yarn assurance:test --select human-auth-baseline`                                                                                                           |
| 8.6b      | `yarn assurance:baseline --case ST-42`                                                                                                                       |
| 8.7a      | `yarn assurance:test --select human-auth-cross-site-specs` and `yarn assurance:harness --project security --profile production-security`                    |
| 8.7b–8.7d | `yarn assurance:harness --project security --profile production-security`                                                                                    |
| 8.7e      | `yarn assurance:test --select human-auth-live`                                                                                                               |
| 8.8       | `yarn assurance:test --select human-auth-specs` and `yarn assurance:test --select assurance-governance`                                                      |
| 8.9       | `yarn assurance:test --select human-auth-all`                                                                                                                |
| 9.1       | `yarn assurance:validate` (records approved workflow authority or blocked ST-62 claims)                                                                      |
| 9.2–9.4   | `yarn assurance:validate`                                                                                                                                    |
| 9.5       | `yarn assurance:baseline --case ST-52`                                                                                                                       |
| 9.6–9.8   | `yarn assurance:harness --project security --profile production-security`                                                                                    |
| 9.9       | `yarn assurance:test --select p1-specs` and `yarn assurance:test --select assurance-governance`                                                              |
| 9.10      | `yarn assurance:test --select p1-all`                                                                                                                        |
| 10.1      | `yarn assurance:fault --fault full-catalog --claim catalog --sentinel all`                                                                                   |
| 10.2      | `yarn assurance:test --select mutation-pilot`                                                                                                                |
| 10.3–10.4 | `yarn assurance:test --select command-outcome-matrix`                                                                                                        |
| 10.5–10.6 | `yarn assurance:stability --command harness --seed-set representative-v1`                                                                                    |
| 10.7      | `yarn assurance:test --select ratchet-staleness`                                                                                                             |
| 10.8      | `yarn assurance:test --select continuous-assurance-all` and `yarn assurance:all`                                                                             |
| 11.1–11.2 | `yarn assurance:validate` and `yarn assurance:report --run <task-run-uuid>`                                                                                  |
| 11.3–11.4 | `yarn assurance:test --select ST-79`                                                                                                                         |
| 11.5      | `yarn assurance:all`                                                                                                                                         |
| 11.6      | `yarn assurance:report --run <final-run-uuid>`                                                                                                               |

## Phase 1: Claim, Command, and Traceability Foundation

> **Scope**: root package/config/structure contracts and `test-harness/assurance/`
> **References**: [Assurance Model](03-01-assurance-model.md), ST-01–ST-08, RD-01/RD-07
> **Phase baseline tree**: `1f13810104601b76056e795049e76e68e9415488`
> **Expected modification set**: `package.json`, `yarn.lock`, root lint/typecheck configuration,
> `repo-tests/monorepo/`, `test-harness/assurance/`, this execution plan, and the test-assurance
> feature roadmap and ambiguity register
> **Scope mode**: strict — claim/command/traceability foundation only; no product or CI changes

- [x] 1.1 [spec-author] Add repository-structure and harness-internal specification cases for root ✅ (completed: 2026-08-10 01:00)
      dependency ownership, `tsx --test` collection, Playwright non-overlap, typecheck/lint scope,
      command contracts, claim/slice schemas, traceability, state transitions, and redaction.
      Verify with `yarn test:structure` and `yarn verify`; new internal specs remain uncollected.
- [x] 1.2 Run the isolated specs through the provisional Node/tsx command and record only the exact ✅ (completed: 2026-08-10 13:13)
      expected missing-foundation signatures using
      `yarn tsx --test test-harness/assurance/tests/assurance.spec.test.ts`; prove `yarn verify`
      remains green.
      - RED evidence: exit 1; one failing case, `assurance foundation is available for contract
        verification`; registered signature `assurance-foundation-missing` matched exact marker
        `ASSURANCE_FOUNDATION_MISSING`; zero passing cases; no setup/unrelated failure.
      - Verification blocker: two full `yarn verify` runs failed only in the existing timing-attack
        pentest on different comparisons; isolated attempts then failed another comparison and
        passed 5/5 unchanged. Five remaining stale Vitest workers exited cleanly after exact-PID
        SIGTERM with user confirmation that no legitimate JSVision tests were running.
- [x] 1.3 Add direct root development dependencies used by harness tooling, including Zod; add the ✅ (completed: 2026-08-10 13:32)
      harness TypeScript/ESLint/static boundary without a harness package manifest or root Vitest.
      Verify dependency/structure contracts with `yarn test:structure` and `yarn verify`; the
      missing implementation signature remains the only internal-spec failure.
- [x] 1.4 Implement and document exact root aliases: `assurance:test`, `assurance:red`, ✅ (completed: 2026-08-10 13:59)
      `assurance:baseline`, `assurance:validate`, `assurance:harness`, `assurance:coverage`, `assurance:fault`,
      `assurance:compat`, `assurance:report`, `assurance:stability`, and `assurance:all`, including
      selectors, prerequisites, timeouts, exit taxonomy, artifacts, and signal/recovery behavior.
      Verify the frozen command schema with `yarn test:structure` and `yarn verify` before invoking
      an alias that depends on later implementation.
- [x] 1.5 Implement typed claim/result/gap/fault/slice-profile schemas and the machine-checked ✅ (completed: 2026-08-10 14:15)
      requirement→case→task→claim graph; reject incomplete actor/action/resource/result, trust,
      log, recovery, source, or provenance fields.
- [x] 1.6 Implement canonical path/reference validation, RED signature registration, deterministic ✅ (completed: 2026-08-10 14:41)
      JSON/Markdown rendering, and pre-write redaction with adversarial canaries.
- [x] 1.7 Run ST-01–ST-08 green; add `*.impl.test.ts` cases for diagnostics, transitions, ✅ (completed: 2026-08-10 15:04)
      collection boundaries, path safety, command taxonomy, and renderer determinism.
- [x] 1.8 Run `yarn assurance:validate`, `yarn assurance:test`, repository structure checks, and ✅ (completed: 2026-08-10 15:18)
      `yarn verify`; inspect sanitized examples and Git status for generated residue.

**Phase gate:** every future command is executable from root, every Must edge is mechanically
representable, zero imported inventory claims are assured, and secret canaries cannot persist.

**Quality gate:** Passed. Tasks 1.1–1.8 and their required corrections are committed and pushed.
The first review found RV-001–RV-006 and SA-001–SA-004. The single permitted re-review confirmed
seven fixes, kept SA-001/RV-004/SA-004 open, and added RV-007; auto-design then applied the required
technical corrections in `19b1c06a`. Focused adversarial checks and unchanged `yarn verify` pass,
and clean-tree run `e5586c13-3f0c-4878-bc95-29135039a4a1` validates the final provenance. See
[Phase 1 Quality Review](09-phase-1-quality-review.md).

## Phase 2: Fenced Lifecycle and Poisoned-Stack Reset

> **Scope**: harness lifecycle/fixture controller, scripts, Compose ownership, endpoint manifest
> **References**: [Harness and Fixtures](03-02-harness-and-fixtures.md), ST-09–ST-12/ST-18A/ST-18B
> **Phase baseline tree**: `57b278e9dc5b1ae50df6c0a9cdf87199a0c657a5`
> **Expected modification set**: `test-harness/assurance/`, `test-harness/fixtures/`,
> `test-harness/scripts/`, `test-harness/docker-compose.yml`, harness runtime configuration,
> repository structure contracts, this execution plan, and the test-assurance roadmaps/ambiguity
> register when a lifecycle decision or status transition requires them
> **Scope mode**: strict — harness lifecycle/reset only; no product, CI, fixture-ontology, or
> coverage implementation

- [x] 2.1 [spec-author] Write lifecycle specs for failure taxonomy, atomic port-block leasing, ✅ (completed: 2026-08-11 01:55)
      endpoint-manifest propagation, ownership fencing, stale-lease recovery, and cleanup.
- [x] 2.2 [spec-author] Write reset-state specs for quiesce/stop, DB recreation, exact migration and ✅ (completed: 2026-08-11 02:24)
      deterministic seed, Redis/mail reset, restart/public verification, and every interruption edge.
- [x] 2.3 Record exact RED signatures for current non-fatal reset, fixed endpoints, cross-cleanup, ✅ (completed: 2026-08-11 02:51)
      and partial reset behavior while existing required lanes remain green.
      - RED evidence: isolated child exit 1; one failing case, `should expose the complete current
        lifecycle surface gap set before implementation`; registered signature
        `lifecycle-current-failure` matched the exact ordered marker for non-fatal reset, fixed
        endpoints, unfenced cleanup, and absent poison state; zero passing cases and no setup,
        collection, timeout, cleanup, or unrelated failure.
- [x] 2.4 Implement validated run UUID/PID/worktree/Compose identity, an atomic complete port-block ✅ (completed: 2026-08-11 03:27)
      lease with bounded collision retry, and one endpoint manifest consumed by all components.
      - Verification note: the first post-structure full run exposed an unrelated pre-existing
        probabilistic unit-test defect where replacing an auth tag's final byte with `ff` made no
        change because the random tag already ended in `ff`. The unchanged isolated file then
        passed 16/16 and the unchanged final `yarn verify` passed 3,348/3,348; no out-of-scope test
        or product file was modified.
- [x] 2.5 Fence every Compose/start/stop/cleanup action with the persisted owner and recorded ✅ (completed: 2026-08-11 03:59)
      container/process/volume/path identity; reclaim stale leases only after owner and Compose absence.
- [x] 2.6 Implement the reset state machine: block traffic, stop Porta, recreate DB, migrate/ ✅ (completed: 2026-08-11 04:11)
      bootstrap/seed, reset Redis/MailHog, restart clients/Porta, and verify fixture/migration digests.
- [x] 2.7 Make post-mutation failure/signal/timeout poison the run and force full owned-stack ✅ (completed: 2026-08-11 04:30)
      recreation; add implementation tests for every durable boundary and recovery report.
- [x] 2.8 Run lifecycle specs green, two concurrent-worktree and signal smokes, script lint/syntax, ✅ (completed: 2026-08-11 06:31)
      `docker compose -f test-harness/docker-compose.yml config`, and `yarn verify`.
      - Verification note: 240 lifecycle cases, 68 structure cases, the 6 retained SPA/BFF journeys,
        two live concurrent worktrees, independent SIGINT/SIGTERM cleanup, TypeScript, ESLint,
        shell syntax/lint, Compose configuration, and `yarn verify` all passed. The retained runtime
        keeps database fixture reset blocked behind Phase 3's deterministic multi-actor manifest;
        Redis and MailHog resets are fatal now, and the complete poisoned reset state machine is
        independently specification-tested.
      - Quality-gate correction: the first independent phase review found runtime resource-fencing,
        crash-recovery, operation-serialization, timeout, quarantine, and reset-truthfulness defects.
        The accepted corrections and the single permitted re-review are complete. The focused suite
        passes 259/259; live evidence proves malformed-control containment, one-winner same-worktree
        contention, SIGTERM exit 143 with no residue, and all six retained browser journeys. The
        unchanged full `yarn verify` gate passed 68 structure tests, 224 server files / 3,348 tests,
        31 SDK files / 404 tests, and 29 CLI files / 355 tests.

**Phase gate:** no prerequisite/reset/cleanup failure can pass, and no run can bind or clean another
worktree's endpoints or resources.

## Phase 3: Real Actor Fixtures, Projects, and Runtime Profiles

> **Scope**: seed/manifest, Playwright config/fixtures, operational and production-security profiles
> **References**: [Harness and Fixtures](03-02-harness-and-fixtures.md), ST-13–ST-18, RD-02/RD-05
> **Phase baseline tree**: `463d67a733bd0e7bc30aebbd24c04bb52b713125`
> **Expected modification set**: `test-harness/assurance/`, `test-harness/fixtures/`,
> `test-harness/scripts/`, `test-harness/tests/`, `test-harness/playwright.config.ts`,
> `test-harness/docker-compose.yml`, harness-owned generated-file ignore/config contracts, root
> assurance command wiring, `packages/server/src/routes/` and focused server tests for the
> separately authorized organization-scoped user-route defect, the corresponding repository
> inventory contract, and this plan's execution/review evidence
> **Scope mode**: strict — deterministic actor fixtures, project collection, runtime profiles, and
> only the separately authorized organization-scoped user-route remediation; no other product
> behavior, CI workflow, publishing, deployment, or later risk-slice work

- [x] 3.1 [spec-author] Write fixture ontology/cardinality specs: alpha/bravo tenant-owned users,
      clients, sessions/tokens/data; global applications/roles; super-admin-org administrative actors.
      ✅ (corrected: 2026-08-11 12:00 — shared allowlisted scopes and structured invalid metadata)
- [x] 3.2 [spec-author] Write project collection, public postcondition, secret separation, and no-
      production-control specs, plus exact `operational` and `production-security` profile specs.
      ✅ (completed: 2026-08-11 11:11)
- [x] 3.3 Record exact RED signatures for current shared/single-tenant state, collection gaps, secret
      output, and absent production-security profile while required lanes remain green.
      ✅ (completed: 2026-08-11 11:22)
- [x] 3.4 Split deterministic seeding into typed arrangement modules and create disjoint ordinary
      principals/clients/data plus full/limited/unprivileged super-admin control-plane actors.
      ✅ (completed: 2026-08-11 12:39)
- [x] 3.5 Generate a redacted public fixture manifest and protected runtime credentials; verify every
      required fixture through public boundaries after startup.
      ✅ (completed: 2026-08-11 13:03)
      - Verification note: the exact fixture selector passed 8/8 ontology/runtime cases against a
        freshly owned stack, the retained SPA/BFF suite passed 6/6, and `yarn verify` passed 68
        structure cases, 224 server files / 3,348 tests, 31 SDK files / 404 tests, and 29 CLI files /
        355 tests. Raw passwords, client secrets, session cookies, tokens, TOTP secrets, and recovery
        codes remain only in the owner-only protected file; the redacted manifest contains their
        opaque references and independently checked fixture provenance.
- [x] 3.6 Add directory-scoped protocol/security/compatibility Playwright projects without changing
      the six retained SPA/BFF file names or double collection. Keep `yarn harness:test` explicitly
      filtered to SPA/BFF; new projects are reachable only through `yarn assurance:harness`.
      ✅ (completed: 2026-08-11 13:16)
      - Verification note: the collection oracle passed 2/2 with exactly five one-worker projects
        and nine singly owned files. Protocol, security, and compatibility each passed through the
        operational `assurance:harness` root command; retained `harness:test` still collected only
        its original six SPA/BFF journeys, all green. `yarn verify` passed the complete 3,348-test
        server matrix and all structure/SDK/CLI lanes.
- [x] 3.7 Add operational and production-security Compose profiles; bind claim metadata to one and
      require production mode/TLS/cookies/errors/headers for environment-sensitive claims.
      ✅ (completed: 2026-08-11 13:30)
      - Verification note: the merged Compose profile validated, the live security project passed
        2/2 with the exact production container environment and no safety bypass, and public TLS,
        HSTS/CSP/header, minimal-error, and secure/HttpOnly/SameSite cookie checks passed. The
        operational retained journeys remained 6/6 and `yarn verify` passed every existing lane.
      - Named security observation: a candidate production CORS probe found that an invalid token
        request without a client identifier reflected `https://attacker.invalid`. Phase 3 does not
        authorize a product fix or an invented CORS oracle; the later injection/exposure slice must
        resolve the contract and retain an exact sentinel if the behavior is prohibited.
- [x] 3.8 Run ST-13–ST-18 green, both profiles, retained journeys twice in shuffled order, residue ✅ (completed: 2026-08-11 17:25)
      checks, harness implementation tests, and `yarn verify`.
      - Auto-design correction: the measured live fixture rollup exceeds the generic 120-second
        internal-test bound, so the frozen command contract assigns `fixture-ontology` a 900-second
        bound and each `fixtures-all` child a 900-second bound. All other internal selectors retain
        the 120-second default.
      - Verification note: `fixtures-all` passed in 182 seconds with both deterministic orderings,
        all five projects, both runtime profiles, retained journeys repeated, exact live reset and
        public postconditions, and owned cleanup. The 259-case lifecycle suite, 53-case governance
        suite, assurance TypeScript/ESLint/format checks, both Compose configurations, and `yarn
        verify` all passed; the latter covered 68 structure tests, 224 server files / 3,348 tests,
        31 SDK files / 404 tests, and the complete CLI lane.
      - Quality-review reopening: the independent review replaced a vacuous opaque-token fixture
        check with a real public administrative boundary probe. The corrected immutable oracle now
        fails because `GET /api/admin/organizations/:orgId/users/:userId` returns a Bravo user when
        the path names Alpha. The route reads by global user ID and does not enforce `:orgId`.
        The user separately authorized the exact product correction. A permission-ordered
        organization-membership guard now covers every organization-prefixed user and role route;
        the public sentinel verifies read/update/status/role/2FA/export/history denials and target
        non-mutation. `fixtures-all`, focused gates, and unchanged `yarn verify` are green. The
        single bounded quality re-review found additional fixture, reset, startup, cancellation,
        and failure-taxonomy gaps. Those corrections are implemented and verified; no third review
        was run, as required by the quality policy.
      - Final verification note: `fixtures-all` passed 14 operational roll-up cases, 3 profile/
        secret cases, and the production public-profile case in 372 seconds. Lifecycle passed
        265/265, governance passed 53/53, repeated reset/public and reset/SPA cycles passed 3/3,
        and the focused organization guard/route tests passed. The unchanged `yarn verify` passed
        all four workspace tasks: 68 structure tests, 226 server files / 3,354 tests, 31 SDK files /
        404 tests, and 29 CLI files / 355 tests. TypeScript, ESLint, Prettier, both Compose profiles,
        diff hygiene, and owned-stack cleanup also passed.

**Phase gate:** Satisfied. Fixtures match Porta's real
authority/data model, five projects collect exactly once, environment-dependent claims cannot use
development evidence, and organization-prefixed user operations enforce tenant ownership. See
[Phase 3 Quality Review](11-phase-3-quality-review.md).

## Phase 4: Attributed Server-Process Coverage

> **Scope**: harness container capture, converter, source maps, direct conversion dependencies
> **References**: [Coverage and Faults](03-03-coverage-and-faults.md), ST-19–ST-27, RD-03
> **Phase baseline tree**: `f3bd7aa8d31ea4a9ae5b3bc38bfba2372b90270d`
> **Expected modification set**: `package.json`, `yarn.lock`, `.gitignore`,
> `test-harness/docker-compose.yml`, `test-harness/Dockerfile`, `test-harness/assurance/`,
> `test-harness/fixtures/`, `test-harness/scripts/`, and Phase 4 CodeOps/techdocs evidence
> **Scope mode**: strict — attributed server-process coverage only; no product, CI, ratchet, or
> release-policy changes

- [x] 4.1 [spec-author] Write raw-envelope, classification, provenance, flush, mapping,
      reproducibility, exclusion, and observation-policy specs ST-19–ST-27. ✅ (completed:
      2026-08-11 21:24)
- [x] 4.2 Record exact RED signatures for absent capture/conversion while keeping the known-module
      mapping fixture and required lanes green. ✅ (completed: 2026-08-11 21:44)
- [x] 4.3 Add exact direct conversion dependencies and frozen-lock changes after validating Node
      22/TypeScript ESM compatibility; abort the phase if the mapping spike cannot be made
      trustworthy. ✅ (completed: 2026-08-11 22:02)
- [x] 4.4 Add Porta-only `NODE_V8_COVERAGE`, ignored raw/report paths, mounted ownership, and clean
      shutdown collection bound to revision/image/lock/fixture identity. ✅ (completed:
      2026-08-11 22:28)
- [x] 4.5 Classify every raw script as eligible first-party, declared Node/internal, declared
      dependency, or unexpected local; record exclusions/unmapped and reject unexpected local
      paths. ✅ (completed: 2026-08-11 22:56)
- [x] 4.6 Merge process records and source-map only eligible compiled server output; manually audit
      known executed/unexecuted lines and stop if material attribution is wrong. ✅ (completed:
      2026-08-11 23:29)
- [x] 4.7 Run ST-19–ST-27 green and add implementation cases for duplicate processes, path
      normalization, malformed maps, dependency scripts, partial output, missing maps, and the
      exact stopped-container raw-output handoff. Reopened after the clean capture exposed
      container-UID-only raw files and again after named-volume discovery exposed a stale
      authority comparison, and once more after the named-volume mountpoint proved non-writable by
      Porta and after live source maps exposed the converter's open-ended column sentinel. Earlier
      completions were 2026-08-11 23:51, 2026-08-12 00:29, 2026-08-12 00:44, and 2026-08-12
      00:58. ✅ (completed: 2026-08-12 01:10)
- [x] 4.8 Run two clean fixed-seed captures with identical exact counts/path sets, emit an
      observation-only summary, and run `yarn verify`. The quality review invalidated the first
      captures because container-wide instrumentation included two auxiliary CLI processes.
      Corrected captures `adefb62a-5151-4209-a838-e3457462f60a` and
      `96f6fd1d-978e-42dd-bc0f-c4f4447be4da` each contain only PID 7 and produced the same 137-path
      observation digest
      `sha256:9c26ad1b89ba2d6cc82a492ae3c3e4643849f924f629aaa0c2c68319f387fa8f` with blocking
      disabled. ✅ (completed: 2026-08-12 02:22)

**Phase gate:** server-process coverage is reproducible, provenance-bound, fully classified, and
separate from Vitest; no ratchet or CI policy changes.

**Quality gate:** Passed. The mandatory phase-end review, the single bounded re-review, both
residual corrections, and the replacement server-only evidence are recorded in the
[Phase 4 Quality Review](12-phase-4-quality-review.md).

## Phase 5: Fault Runner and Packed-Client Foundations

> **Scope**: fault metadata/runner and isolated SDK/CLI consumer lifecycle
> **References**: ST-64–ST-69/ST-72–ST-73, RD-04/RD-06
> **Phase baseline tree**: `b730f8db7568b22905dd4eeb1d0292c5cac95726`
> **Expected modification set**: `package.json`, `.gitignore`, `test-harness/assurance/`,
> `test-harness/consumers/`, harness-owned package/fault fixtures and scripts, and Phase 5
> CodeOps/techdocs evidence
> **Scope mode**: strict — fault-runner and packed-current-client foundations only; no product,
> CI, publishing, deployment, compatibility-policy, or later risk-slice implementation

- [x] 5.1 [spec-author] Write fault validation/classification/signature/timeout/cleanup specs with
      explicit claim–sentinel–expected-signature tuples. ✅ (completed: 2026-08-12 13:49)
- [x] 5.2 Record exact RED for the absent fault catalog/runner and commit the signature evidence;
      required existing lanes remain green. ✅ (completed: 2026-08-12 13:59)
- [x] 5.3 Implement target-hash checks, disposable worktree/build execution, sanitized evidence,
      signals, and unconditional cleanup. ✅ (completed: 2026-08-12 14:15)
- [x] 5.4 Prove one fault shared by multiple claims kills each tuple independently; a build/setup/
      timeout/unrelated failure remains invalid and a survivor blocks only mapped claims. ✅
      (completed: 2026-08-12 14:24)
- [x] 5.5 [spec-author] Write pack/install/provenance/credential-isolation specs for local SDK and CLI
      archives before consumer tooling exists. ✅ (completed: 2026-08-12 14:36)
- [x] 5.6 Record exact RED for absent pack/install/consumer tooling and commit the signature evidence;
      required existing lanes remain green. ✅ (completed: 2026-08-12 14:47)
- [x] 5.7 Implement deterministic build/pack identities and an ignored clean consumer whose manifest
      declares both archives as explicit `file:` dependencies. ✅ (completed: 2026-08-12 15:03)
- [x] 5.8 Assert the CLI-resolved SDK path/content digest matches the local SDK archive and reject
      registry/workspace/symlink/source resolution before any live journey. ✅ (completed:
      2026-08-12 15:16)
- [x] 5.9 Spawn every CLI subprocess with a restrictive temporary `HOME`; fingerprint the caller's
      real credential path and clean on success/failure/timeout/SIGINT/SIGTERM. ✅ (completed:
      2026-08-12 15:28)
- [x] 5.10 Run ST-64–ST-69/ST-72–ST-73 green and add implementation cases for patch validation,
      signals, archive identity, dependency resolution, permissions, and cleanup. ✅ (completed:
      2026-08-12 15:47)
      - Verification note: `fault-packed-foundations` passed 27/27 exact specification and
        implementation cases. The packed command now binds an owned Porta image and fixture to
        deterministic local SDK/CLI archives, verifies the CLI's installed SDK content, exercises
        success/failure/timeout/SIGINT/SIGTERM under owner-only temporary homes, and emits only
        sanitized evidence after cleanup. TypeScript, ESLint, Prettier, diff hygiene, and `yarn
        verify` passed; the latter covered 68 structure tests, 226 server files / 3,354 tests, 31
        SDK files / 404 tests, and 29 CLI files / 355 tests.
- [x] 5.11 Execute clean fault and packed-client foundation smokes, verify primary tree/real
      credentials unchanged, inspect redaction/residue, and run `yarn verify`. ✅ (completed:
      2026-08-12 15:57)
      - Verification note: the exact `foundation-smoke/CLAIM-R6-01/ST-64` tuple was killed in 0.95
        seconds, and the live `compatibility` selector completed against an owned operational stack
        in 36.85 seconds. Sanitized result scans found no credential/path fields, the consumer and
      harness left no owned residue, the primary source identity and real credential fingerprint
      were unchanged, and `yarn verify` passed 68 structure cases plus the full 226-file/3,354-
      test server, 31-file/404-test SDK, and 29-file/355-test CLI matrices.
      - Quality-review reopening: the phase-end correctness/security audits found false-kill,
        patch-scope, unrelated-worktree cleanup, stale packed-output provenance, observation-derived
      SDK surface, and compatibility cleanup-taxonomy gaps. The accepted auto-design corrections
      must pass the focused selector, both live smokes, one bounded re-review, and `yarn verify`
      before this task closes again.
      - Final quality note: all accepted corrections are implemented. The combined selector passed
        31/31, the corrected live fault and compatibility artifacts are provenance-bound to
        `26d1a8aa`, and the clean snapshot passed `yarn verify`. The single bounded re-review found
        one residual recovery-completeness issue; the final correction centralizes validated
        run-root recovery behind `yarn assurance:compat --recover <run-id>`, removes a registered
        build worktree before the run root, verifies absence, and retains a sanitized residue class
        whenever managed-child cleanup is unproven. Per policy, no third review cycle was run.

**Phase gate:** Satisfied. Every slice can execute real sensitivity tuples and packed public clients
without waiting for a later phase or touching developer credentials. See
[Phase 5 Quality Review](13-phase-5-quality-review.md).

## Phase 6: Tenant Isolation and Administrative Authorization

> **Scope**: tenant/admin slice profiles, claims, sentinels, applicable packed-client journeys
> **References**: ST-28–ST-32/ST-63, RD-04/RD-05
> **Phase baseline tree**: `6449a3afa0233800d9ff9b28f141b378fee93b72`
> **Expected modification set**: `test-harness/assurance/`, harness-owned specs/fixtures/scripts,
> Phase 6 CodeOps evidence, and opted-in technical documentation
> **Scope mode**: strict — tenant/admin assurance only; no later OIDC-lifecycle slice, product, CI,
> publishing/deployment, or compatibility-policy changes

- [x] 6.1 [spec-author] Catalog tenant/OIDC and control-plane admin surfaces into separate typed
      actor/action/resource/result and threat/log/recovery profiles. The immutable catalogs keep
      ordinary-tenant OIDC authority separate from super-admin-organization control-plane
      authority, bind exact fixture roles and permissions, require same-target authorized controls,
      and reject incomplete matrices. Clean-snapshot `yarn assurance:validate`, seven focused
      specification cases, static checks, 68 structure tests, and `yarn verify` all passed. ✅
      (completed: 2026-08-13 18:03)
- [x] 6.2 [spec-author] Write ST-28–ST-32: authorized handler controls, then vary target ID/slug/org,
      permissions, issuer/cache context, and super-admin exceptions with independent non-mutation.
      The frozen specs use a swappable adapter contract, exact raw substitutions, independent
      target fingerprints, complete side-effect observations, concurrent tenant contexts, and
      bootstrap super-admin protections; the current transparent rig is explicitly non-evidentiary.
      The 14-case `tenant-admin-specs` selector, static checks, and `yarn verify` passed. ✅
      (completed: 2026-08-14 11:03)
- [x] 6.3 Add stale-state cases that warm caches then remove roles, deactivate/suspend actors, and
      revoke sessions through supported APIs; retry with existing/fresh clients and after a fresh
      Porta process. Record organization reassignment/removal as not-applicable or a named gap. The
      immutable ST-31 scenarios bind the exact public method/route and pre-transition authority,
      require cache warming plus durable revocation, and deny the same authority in existing,
      fresh-client, and restarted-Porta contexts without target mutation. Membership removal and
      reassignment remain named non-applicable gaps. The 17-case selector, static checks, and
      `yarn verify` passed. ✅ (completed: 2026-08-14 11:29)
- [x] 6.4 Record natural RED or legacy green claim by claim without altering the oracle; select only
      existing exact E2E/pentest sentinels. The clean-revision baseline command kept all 17
      immutable tenant/admin specifications green and recorded ST-28 through ST-32 as
      `natural-red: missing-live-sentinel`. Every audited candidate carries an exact rejection
      reason, no artifact reports a product failure, and all five owner-only results passed
      independent schema/provenance checks. ✅ (completed: 2026-08-14 12:15)
- [x] 6.5 Reach green at the live raw tenant/OIDC and control-plane boundaries. Enforce strict
      issuer/client tenant binding, mark bootstrap-user archive non-applicable, repair protected
      bootstrap-role removal, fingerprint role assignments independently, and preserve named gaps
      for unsupported immediate revocation. Run the focused live suite and `yarn verify`, then
      commit this independently complete raw/product checkpoint before packed-client work. The
      owned-stack live suite passed all 17 immutable cases; the affected E2E/pentest contract files
      passed 44/44; and `yarn verify` passed 68 structure checks, 227 server files / 3,359 tests,
      31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-14 17:01)
- [x] 6.6 Add immutable packed SDK/CLI tenant/admin adjunct specifications and implement the
      capability with exact local-archive resolution, isolated credentials, independent raw or
      fixture-state effect verification, redaction, cleanup, and fail-closed provenance tests.
      Verify capability behavior without claiming clean live evidence, then commit the checkpoint.
      The eight-case SDK/CLI matrix is specification-bound behind an independent raw observer,
      update reset fencing, exact packed-SDK resolution, CLI home/credential isolation, output
      redaction, and residue/provenance admission. The focused selector passed 10/10, assurance
      governance passed 53/53, structure passed 68/68, dirty provenance failed closed with exit 30,
      and `yarn verify` passed 227 server files / 3,359 tests plus all SDK and CLI verification.
      The first clean 6.7 run exposed and safely rejected a doubled SDK administrative path. The
      SDK origin contract was corrected, the focused regression selector passed 11/11, and the
      full `yarn verify` gate passed again. The next clean attempt proved the probe passed the token
      outside the SDK's required options object; that contract now has its own regression case.
      The focused selector passed 12/12 and `yarn verify` passed again. Reopened after a complete
      live diagnostic proved reset-generation tokens were cached across fixture recreation.
      Tokens are now resolved from the current owner-scoped credential manifest for every
      operation. The focused selector passed 13/13 and `yarn verify` passed again. Reopened after
      full live execution reached evidence validation and exposed an archive-digest format mismatch
      with the established packed-consumer contract. Archive evidence now preserves that exact
      canonical format; the focused selector passed 13/13 and `yarn verify` passed again. ✅
      (completed: 2026-08-14 18:36)
- [x] 6.7 From the clean pushed capability revision, run the packed SDK/CLI tenant/admin adjuncts
      against one owned stack, validate server/archive/fixture identity and residue, then admit the
      packed evidence. The tenant/admin slice cannot close before this checkpoint is green. The
      clean revision admitted all eight journeys with exact archive/server/fixture identities,
      independent target observations, redaction, credential isolation, and zero residue. Full
      artifact checks confirmed revision `309157ad8e389379f945a00fdaf9e8345f6d5fbb`, mode `0600`,
      no protected-value/path leakage, no runtime files, and no assurance-owned Docker resources.
      `yarn verify` passed 227 server files / 3,359 tests plus all SDK and CLI verification. ✅
      (completed: 2026-08-14 18:48)
- [x] 6.8 Add matrix-generation, handler-reachability, cache-warm, and target-state implementation
      tests after the black-box specs are green. The 22-case `tenant-admin-all` selector keeps the
      immutable oracle green while checking exact controlled matrices, closed status classes,
      authenticated handler/permission/resource boundaries, independent target digests and side
      effects, and warm-before-mutation plus existing/fresh/restarted retry wiring. `yarn verify`
      passed 227 server files / 3,359 tests plus all SDK and CLI verification. ✅
      (completed: 2026-08-14 19:01)
- [x] 6.9 [spec-author] Define invariant-specific tenant-read, tenant-write, issuer/cache,
      stale-authority, admin-membership, and permission/RBAC negative-control tuples and exact live
      sub-sentinel signatures. Add the organization-membership negative-control actor and public
      denial oracle without changing the existing non-applicable membership-transition gaps. The
      seven negative controls have closed requirement-owned IDs, invariant-specific sub-sentinels,
      and exact signatures; the ordinary-tenant membership control uses a valid opaque token and
      `porta-auditor` role while membership transitions remain explicitly non-applicable. The
      10-case focused selector, assurance typecheck, lint, formatting, 68 structure tests, and
      `yarn verify` all passed. ✅ (completed: 2026-08-14 21:03)
- [x] 6.10 Implement defensive control-check validation for the seven tenant/admin
      invariants. A code-owned registry selects one exact repository file, one reviewed isolated
      source transformation, and one designated live check per run. The staged local executor must
      validate, build, start a lifecycle-owned disposable stack, run only that check, and prove
      cleanup. Operator-facing outcomes are `detected`, `not-detected`, `check-invalid`,
      `environment-failed`, and `timed-out`; historical fault-runner names remain internal
      compatibility details. This capability checkpoint must use test doubles for execution tests
      and must not claim live control-check evidence from the dirty tree. The completed
      capability uses a closed seven-entry registry, exact source identities and literal
      transformations, one designated live check per entry, staged lifecycle ownership, exact
      signature parsing, owner-validated recovery, and cleanup precedence. The ordinary alpha
      membership control carries a valid opaque token plus `porta-auditor` role without changing
      its organization. No isolated source variant was executed or admitted as evidence in this
      checkpoint. Seventeen focused cases, 53 governance cases, six fixture-ontology cases, 68
      structure tests, assurance typecheck/lint/format checks, and `yarn verify` all passed.
      Reopened after the first clean 6.11 run correctly failed closed because the frozen dependency
      symlink was created before exact changed-path verification; the capability correction and
      real-worktree regression now verify the isolated transformation before linking dependencies.
      The focused selector passed 18/18 and `yarn verify` passed 227 server files / 3,359 tests plus
      all SDK and CLI verification. Reopened again when the clean campaign reached the build stage:
      the first variant preserved its missing-scope semantics but violated strict unused-parameter
      compilation. The build-safe replacements explicitly consume only values made unused by the
      isolated transformation, and the focused selector now prepares and builds all seven real
      variants. It passed 18/18; `yarn verify` again passed 227 server files / 3,359 tests plus all
      SDK and CLI verification. Reopened when the first build-valid live check exposed a one-sided
      browser observer that could see login rejection but not a real consent or registered-callback
      continuation. The closed observer now accepts only visible login rejection, real consent, or
      a registered callback carrying a code; ambiguous states remain invalid. Tenant/admin passed
      19/19, control sensitivity passed 18/18, assurance typecheck passed, and `yarn verify` again
      passed 227 server files / 3,359 tests plus all SDK and CLI verification. Issuer execution then
      exposed that the live observation type
      rejected a missing tenant segment before the exact-match oracle could inspect it. The closed
      `none` observation-domain correction keeps missing or unknown tenant values observable while
      leaving exact alpha/bravo matching unchanged. Tenant/admin passed 20/20, control sensitivity
      passed 18/18, assurance typecheck passed, and `yarn verify` again passed the full repository
      matrix. The organization-cache variant then survived because the concurrent observer inferred
      cache identity from issuer data. A dedicated public cache-write and foreign-token observation
      now refreshes alpha through the admin API and presents alpha authority to bravo UserInfo; no
      Redis internals or production hooks are used. Tenant/admin passed 21/21, control sensitivity
      passed 18/18, assurance typecheck passed, and `yarn verify` again passed the full repository
      matrix. Reopened by user decision to move the current campaign onto a neutral, dedicated
      `assurance:control-check` command and by clean evidence showing that the UserInfo cache probe
      has an independent token/client rejection boundary. The replacement observer uses a valid
      bravo authorization continuation after an alpha cache write. The public command now accepts
      only seven neutral check IDs, emits `*_CONTROL_ABSENCE` signatures and the `check-invalid`
      outcome, writes below `control-check/<check>/`, and owns exact UUID recovery. The general
      curated-fault command no longer dispatches tenant/admin checks. Focused verification passed
      18 control-check, 25 tenant/admin, 10 command-contract, and 68 structure cases; `yarn verify`
      passed 227 server files / 3,359 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      Reopened when the first neutral cache check remained `not-detected`: the cache-module variant
      changed writer and reader together without producing a discriminating public result. The
      corrected one-file negative control changes the tenant resolver's cache lookup to alpha while
      the public observer authorizes bravo's valid client. The 18 focused checks, typecheck, lint,
      formatting, and `yarn verify` passed the same 68 structure, 227 server / 3,359 test, 31 SDK /
      404 test, and 29 CLI / 355 test matrix. Reopened when the stale-authority check survived:
      administrative requests re-read roles from PostgreSQL and do not consume the changed token-
      claims cache. Its corrected negative control retains the removed actor's prior auditor role at
      the real per-request admin authorization boundary. The 18 focused checks and full 68
      structure, 227 server / 3,359 test, 31 SDK / 404 test, and 29 CLI / 355 test verification
      matrix passed. ✅ (completed: 2026-08-15 16:58)
- [x] 6.11 From the clean pushed capability revision, execute every tenant/admin control check and
      require each designated signature to be detected independently with no primary-tree or owned
      runtime residue. Historical results that used the superseded command or signature vocabulary
      do not close this task; all seven neutral checks run again from this revision. Revision
      `e2fe556e` independently detected tenant read (`825f52c6`), tenant write (`fa37b27e`), issuer
      separation (`377932fa`), organization-cache scope (`d09d4713`), stale-authority recheck
      (`4704d0d3`), admin-organization membership (`04a91980`), and permission/RBAC (`253711d5`).
      Every result artifact is mode `0600`, retains only its registered `CONTROL_ABSENCE` signature,
      reports cleanup complete, and leaves no control-check runtime or primary-tree change.
      `yarn verify` then passed 68 structure tests, 227 server files / 3,359 tests, 31 SDK files /
      404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-15 17:14)
- [x] 6.12 Run the tenant/admin project, applicable packed clients, attributed coverage, evidence/
      log/recovery checks, all pentests, and `yarn verify`. Clean correction revision `12eb4c4d`
      passed foundation validation, the 28-case tenant/admin selector, 17 live operational cases,
      eight packed SDK/CLI journeys, attributed security coverage, 55 governance cases, 35 pentest
      files / 224 tests, and sanitized report generation. All seven control checks independently
      detected their designated absence signature with complete revision/tree/tool/lock/target/
      variant/lifecycle/fixture/image/container provenance and cleanup. Retained JSON and Markdown
      are mode `0600`, redaction checks found no protected values, and owned Docker, runtime,
      worktree, credential, and consumer residue is empty. The single bounded re-review found four
      residual signal, denial-schema, session-correlation, and Docker-query defects; regression
      tests and the complete clean-revision evidence campaign corrected them. `yarn verify` passed
      68 structure tests, 227 server files / 3,359 tests, 31 SDK files / 404 tests, and 29 CLI files /
      355 tests. ✅ (completed: 2026-08-18 15:39)

**Phase gate:** no vacuous early denial can count as tenant/admin assurance and every closed claim
has current green plus its own independently detected local control check.

## Phase 7: OIDC, ID-Token, and Token Lifecycle

> **Scope**: protocol claims, independent JOSE/HTTP client, and single-use consistency assurance
> **References**: ST-33–ST-41/ST-50–ST-51/ST-63, RD-04/RD-05
> **Phase baseline tree**: `bf2c74d955cbcce7dac09eb0ceda407b7c078a12`
> **Expected modification set**: `test-harness/assurance/`, harness-owned protocol specs/fixtures/
> scripts, protocol-specific packed-client and control-check assets, the repository's exact test-
> inventory contract, and this feature's plan/roadmap/review evidence. Product files remain
> excluded unless a separately authorized confirmed defect correction is recorded.
> **Scope mode**: strict — OIDC, ID-token, opaque-token, rotation, replay, and distributed-boundary
> assurance only; no production test hooks, CI changes, certification claims, or later auth/P1 work

- [x] 7.1 [spec-author] Define versioned slice profiles/claims for redirect/PKCE, code binding,
      state/nonce/consent/client authentication, ID tokens, opaque-token separation, rotation/replay.
      Added six versioned protocol risk profiles and ten immutable claim requirements spanning
      SPA, BFF, and raw HTTP/independent JOSE boundaries. The catalog includes complete threat,
      exact-outcome, privacy-safe log, recovery, and version-qualified standards data while
      explicitly forbidding Porta token helpers and JWT treatment of opaque access tokens. Focused
      specifications passed 5/5, structure passed 68/68, assurance typecheck/lint/formatting passed,
      `yarn assurance:validate` passed from the clean checkpoint, and `yarn verify` passed 227 server
      files / 3,359 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      ✅ (completed: 2026-08-18 17:42)
- [x] 7.2 [spec-author] Write exact ST-33–ST-41 raw HTTP and independent ID-token/JWKS cases,
      including unknown `kid`, attacker JOSE key-location headers, and concurrent issuer separation.
      Added a stable observation contract, closed case catalog, transparent non-evidentiary
      requirements rig, fail-closed adapter seam, and ten immutable specifications. Every negative
      probe links an exact positive control and checks exact facts, prohibited effects, privacy-safe
      log fields, and recovery; observation types remain broad enough to report live defects.
      Focused specifications passed 10/10, the registered `protocol-specs` selector passed 20/20,
      assurance typecheck/lint/formatting passed, and
      `yarn verify` passed 227 server files / 3,359 tests, 31 SDK files / 404 tests, and 29 CLI files /
      355 tests. ✅ (completed: 2026-08-18 18:07)
- [x] 7.3 [spec-author] Write the initial ST-49–ST-51 single-use scenario specification. The
      original interruption-oriented version was completed and verified, then explicitly
      superseded by the user-authorized defensive specification reset in Task 7.6. Its retained
      reusable work is the artifact-neutral observation seam, independent durable-state decision,
      owned-process identity, privacy-safe logging, recovery, and zero-secret evidence contract.
      Focused specifications passed 5/5, the registered `protocol-specs` selector passed 20/20,
      assurance typecheck/lint/formatting passed, and `yarn verify` passed 227 server
      files / 3,359 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      ✅ (completed: 2026-08-18 18:29)
- [x] 7.4a Implement the closed protocol baseline registry and audit OIDC E2E/pentest candidates
      claim by claim, rejecting broad statuses, conditional exits, fake artifacts, and
      implementation-derived expectations as exact sentinels. Added nine registered cases, exact
      claim mappings, canonical candidate/title validation, explicit ineligibility reasons,
      owner-only atomic artifacts, and a `protocol-specs` selector. All cases classify as natural
      RED without a product verdict; current tests remain corroboration only. The focused baseline
      suite passed 5/5, protocol specifications passed 20/20, assurance typecheck/lint/formatting
      passed, and `yarn verify` passed 227 server files / 3,359 tests, 31 SDK files / 404 tests, and
      29 CLI files / 355 tests. ✅ (completed: 2026-08-18 18:55)
- [x] 7.4b From the clean pushed capability revision, run the exact baseline command, validate its
      owner-only natural-RED evidence, and record the protocol claim classifications. Clean
      revision `e8870770` recorded run `dc7ddf31-73e6-4e49-bff9-1e05add43f78`: all 20 protocol
      specifications passed before the `ST-33` artifact was admitted, classification is exact
      natural RED for `CLAIM-R5-04`, both audited candidates remain ineligible, no sentinel or
      product failure was inferred, provenance binds the full commit/tree/tool identities, and the
      artifact is mode `0600`. ✅ (completed: 2026-08-18 19:06)
- [x] 7.5a Implement the independent ES256/P-256 trusted-JWKS ID-token verifier and explicit
      opaque-access-token no-parse boundary, with malformed, untrusted-key-location, signature,
      issuer, audience, subject, nonce, expiry, and not-before implementation cases. The verifier
      uses Node cryptography directly, selects exactly one trusted P-256 JWK by `kid`, rejects
      remote or embedded key-location headers before key selection, checks the complete ID-token
      claim/lifetime contract, and exposes a separate opaque-token rejection path that performs no
      JWT decode. The registered five-case `protocol-jose` selector and assurance typecheck/lint/
      formatting gates passed. ✅ (completed: 2026-08-18 19:22)
- [x] 7.5b1 Add privacy-safe protocol rejection observation at typed provider and pre-provider
      boundaries. Preserve public responses, use only server-generated correlation identifiers,
      emit the closed required event fields without secrets or personal data, and remove query
      strings from ordinary request/error logs. Added request-correlated typed provider listeners,
      explicit foreign-client binding observation, bounded domain-separated client-ID digests,
      duplicate suppression, non-interfering logging, and path-only ordinary request/error logs.
      The focused specification/implementation and related middleware suite passed 22/22, server
      typecheck/lint/formatting passed, and `yarn verify` passed 230 server files / 3,367
      tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-18 21:02)
- [x] 7.5b2 Add the missing live black-box adapter behind the immutable ST-33–ST-41 specifications,
      using raw HTTP and the independent JOSE verifier. Run it inside the lifecycle-owned protocol
      stack and preserve exact log, recovery, and prohibited-side-effect observations.
      Added owner-fenced raw HTTP/browser execution, independent JOSE and JWKS observations,
      correlated privacy-safe log checks, exact public context substitutions, and deterministic
      concurrent requests. Live evidence found and drove separately authorized atomic refresh-
      token consumption and opaque UserInfo tenant-binding fixes without production test hooks.
      Final owned run `70bac9b2-a829-4844-bc88-652bb7196b18` passed 15/15 with deterministic
      decoded-byte signature mutation and zero retained stack residue. Focused server tests passed
      40/40, protocol specs
      passed 20/20, and `yarn verify` passed 68 structure tests, 233 server files / 3,382 tests,
      31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-18 21:52)
- [x] 7.5c Add immutable packed-protocol adjunct specifications and implement the capability for
      browser-assisted CLI authorization-code/PKCE login and SDK refresh-token use. Reuse the
      established local-archive, isolated-HOME, independent raw/JOSE observation, cleanup,
      redaction, and fail-closed provenance boundaries; do not claim clean live evidence yet.
      Added exact packed CLI and SDK evidence contracts, browser-assisted manual callback
      orchestration, owner-only credential handoff, public Node SDK refresh execution, independent
      JWKS/raw HTTP observations, consumed-token retry, signal/process-group cleanup, and the closed
      `protocol-packed`/`protocol` selectors. The exact RED marker was
      `PACKED_PROTOCOL_CAPABILITY_UNAVAILABLE`; final packed protocol passed 13/13, JOSE passed 6/6,
      governance passed 55/55, structure passed 68/68, and `yarn verify` passed 233 server files /
      3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. No clean live packed
      evidence was claimed. Reopened after the first clean 7.5d run failed safely at the coarse
      credential stage: the capability now emits only a closed non-secret CLI/SDK substage so a
      later clean run can distinguish request, browser, process, credential, observation, refresh,
      and consumed-token retry failures. The refined implementation suite passed 14/14 and the
      unchanged full verification passed all 3,382 server tests after one isolated timing-test
      rerun confirmed the first run's pre-existing threshold noise. Reopened after the next clean
      run classified `protocol-cli-request`: the published CLI's documented `--no-browser` option
      is parsed by Yargs as an unknown negated `browser` option. The harness now selects the CLI's
      already supported `PORTA_CONTAINER=1` manual-mode boundary and leaves the product defect
      unchanged. The packed protocol selector passed 15/15, governance passed 55/55, and the final
      `yarn verify` passed 68 structure tests, 233 server files / 3,382 tests, 31 SDK files / 404
      tests, and 29 CLI files / 355 tests. No clean live packed evidence was claimed. ✅ (completed:
      2026-08-18 23:03) Reopened after the clean run reached `protocol-cli-browser`: Playwright
      observed the correct provider redirect but could not fulfill the fixed manual loopback URL.
      The harness now owns a bounded `127.0.0.1:11111` callback listener with exact request,
      single-response, timeout, and cleanup rules; the packed CLI and Porta remain unchanged. The
      packed protocol selector passed 17/17, governance passed 55/55, and `yarn verify` passed 68
      structure tests, 233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files /
      355 tests. No clean live packed evidence was claimed. ✅ (completed: 2026-08-18 23:23)
      Reopened when the clean run reached `protocol-cli-credentials`: the packed CLI exited zero
      with every required token, but its published optional-email fallback was an empty string and
      the harness parser incorrectly required a non-empty value. The parser now matches the CLI
      credential type while retaining exact subject and token requirements. The packed protocol
      selector passed 18/18, governance passed 55/55, and `yarn verify` passed 68 structure tests,
      233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. No clean
      live packed evidence was claimed. ✅ (completed: 2026-08-18 23:37)
- [x] 7.5d From the clean pushed capability revision, run the packed protocol adjunct against one
      owned stack, validate server/archive/fixture identity and zero residue, and admit the packed
      evidence. The protocol slice cannot close before this checkpoint is green. Clean revision
      `dc951151` produced admitted result `efdbd89b-a0a2-42ab-8406-f22278a52b20`: packed SDK and
      CLI archives were installed from local deterministic archives, every public SDK entry
      resolved to package `dist`, the CLI completed authorization-code/PKCE with exact state and an
      independently verified ID token, the raw observer accepted its opaque access token, the SDK
      refreshed through `@portaidentity/sdk/node`, and retrying the consumed refresh token returned
      exact `400 invalid_grant`. The mode-`0600` artifact is revision/image/fixture/archive-bound,
      redacted, primary-tree unchanged, and reports no owned consumer or lifecycle residue.
      `yarn verify` then passed 68 structure tests, 233 server files / 3,382 tests, 31 SDK files /
      404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-18 23:47)
- [x] 7.6 Replace the interruption-oriented ST-49–ST-51 specification with defensive single-use
      consistency cases. Keep public concurrency, real-store conditional consumption, committed-
      response-loss retry, and graceful restart; record exact pre/post-commit interruption and the
      uncommitted-timeout branch as deferred resilience gaps. No source variant, forced termination,
      request-holding proxy, or production hook is permitted. The six-case defensive catalog,
      renamed consistency taxonomy, exact traceability, governance, typecheck, lint, formatting,
      and structure gates passed; `yarn verify` passed 68 structure tests, 233 server files / 3,382
      tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-19 15:27)
- [x] 7.7 Close the ordinary-lane consistency assessment without a live race, response-loss, or
      restart campaign. Keep the requirements-only ST-49–ST-51 catalog explicitly non-evidentiary,
      preserve the existing public sequential replay coverage, and record the confirmed non-atomic
      Redis authorization-code boundary as a blocked product claim for separate remediation. No
      live consistency adapter is added. The experimental live files were removed, no owned runtime
      residue remained, protocol specifications passed 20/20, governance passed 55/55, structure
      passed 68/68, and `yarn verify` passed 233 server files / 3,382 tests, 31 SDK files / 404
      tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-19 19:52)
- [x] 7.8 Record redirect/PKCE, code-binding, ID-token, issuer, token-type, rotation, and replay
      sensitivity as a deferred protocol campaign. Keep every black-box expectation and existing
      pentest intact, but do not create or execute disposable protocol source variations in this
      program and do not call the protocol slice sensitivity-proven. Protocol specifications passed
      20/20, governance passed 55/55, structure passed 68/68, and `yarn verify` passed 233 server
      files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed:
      2026-08-19 20:04)
- [x] 7.9 Run protocol/packed journeys, attributed coverage, all pentests, and `yarn verify`; assess
      audit/log/recovery observations and record unsupported edges as incomplete. The ordinary live
      protocol journey passed
      15/15 with owned cleanup; protocol specifications passed 20/20, independent JOSE passed 6/6,
      and packed protocol tests passed 18/18. Packed SDK/CLI run
      `bc0be995-30bf-4447-bdd5-aa8061cba8af` admitted clean current-revision evidence with exact
      archive resolution, unchanged caller credentials/source tree, and zero residue. Attributed
      coverage run `c0f9e1ee-3849-4eaa-9ff1-a7fe6ac1e485` completed with exact image, fixture,
      lock, source-tree, compiled-output, and process identities. Both retained evidence files are
      mode `0600`, passed the bounded redaction scan, and the unchanged pentest suite passed 35
      files / 224 tests. The advanced consistency and source-variation campaigns remain deferred
      and are not part of this roll-up. The final `yarn verify` passed 68 structure tests,
      233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      The live adapter result is corroboration only for consent/session context, JWKS-key
      separation, per-probe prohibited-side-effect/recovery, and correlated-log subclaims because
      the Phase 7 quality review found those observations were not independently established.
      Those exact subclaims remain incomplete under DEF-6 and receive no assurance credit.
      ✅ (completed: 2026-08-19 20:22)

**Phase gate:** ordinary redirect/PKCE, code binding, independent ID-token verification,
token-type, refresh rotation/replay, and packed-client claims have external evidence. Consent/session
context, JWKS-key separation, per-probe side-effect/recovery, and correlated-log subclaims remain
incomplete under DEF-6. Concurrent consistency and protocol sensitivity remain named gaps, and the
authorization-code atomicity claim remains blocked. Phase 7 may complete only as a truthful partial
protocol assessment; it is not complete protocol, concurrent-consistency, or fault-sensitivity
assurance.

## Phase 8: Human Authentication and Recovery

> **Scope**: browser/HTTP/MailHog auth, recovery, session, 2FA, and timing claims
> **References**: ST-42–ST-51/ST-63, RD-05
> **Phase baseline tree**: `b47843aaf4c8b1273ded8a74c06796844e95d8cd`
> **Expected modification set**: `test-harness/assurance/`, harness-owned human-auth/recovery
> specs/fixtures/scripts, the exact repository test-inventory contract, and this feature's plan,
> requirements, roadmap, and review evidence. Product files remain excluded unless a separately
> authorized confirmed defect correction is recorded.
> **Scope mode**: strict — ordinary authentication/recovery behavior only; no source variants,
> forced races/crashes, production test hooks, timing thresholds derived from observed Porta data,
> CI changes, or unrelated product work

- [x] 8.1 [security-authority gate] Before timing measurements, approve the enumeration hypothesis,
      material effect-size bound, sample-size/power rule, clock/environment controls, and noise/
      invalid-run rule. If no defensible independent bound is approved, block only the timing claim.
      The user chose not to create the unsupported timing campaign. No threshold, sample rule, or
      measurement is inferred from current Porta behavior; only the timing-distribution edge is
      blocked as DEF-7 while status/body/header enumeration checks continue. Governance passed
      55/55, structure passed 68/68, and `yarn verify` passed 233 server files / 3,382 tests,
      31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      ✅ (completed: 2026-08-19 22:48)
- [x] 8.2 [spec-author] Define profiles/claims for enumeration, login-method enforcement, lockout/
      limits, sessions/cookies/CSRF, magic/reset/invitation/email-OTP/TOTP/recovery artifacts.
      Added a stable model plus eleven versioned requirements-only slice profiles and eight claim
      bindings. The catalog includes complete actor/asset/action/resource/entry/trust/abuse/
      rejection/side-effect/privacy-log/recovery fields, keeps timing measurement forbidden under
      the semantic blocked-policy key, and covers every ordinary R5.6/R5.7 artifact invariant.
      The catalog is split below the repository file-size ceiling and is registered through the
      existing `human-auth-specs` selector. Focused specifications passed 6/6, structure passed
      68/68, assurance typecheck/lint/formatting passed, and `yarn verify` passed 233 server files /
      3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      ✅ (completed: 2026-08-19 23:14)
- [x] 8.3 [spec-author] Write ST-42–ST-49 for recipient/tenant binding, unpredictability, expiry,
      sequential single use, exposure, session renewal/revocation, and exact non-mutation. Added a
      stable broad observation contract, split requirements catalogs, transparent non-evidentiary
      rig, fail-closed live adapter seam, and nine immutable boundary specifications. Functional
      ST-42–ST-48 cases require exact positive controls, public outcomes, protected-state and
      non-effect observations, privacy-safe logs, and recovery; ST-49 remains an explicitly
      requirements-only deferred entry with no evidence path. Focused specifications passed 15/15,
      structure passed 68/68, assurance typecheck/lint/formatting passed, and `yarn verify` passed
      233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests.
      ✅ (completed: 2026-08-19 23:35)
- [!] 8.4 Blocked: DEF-7 has no independently approved enumeration hypothesis, effect-size bound,
      sample-size/power rule, or environment/noise contract. Do not collect timing samples or infer
      a threshold from Porta behavior. Functional status/body/header enumeration and equivalent
      limit-key checks remain in Tasks 8.2–8.3 and 8.6–8.9.
- [x] 8.5 Inventory which supported recovery artifacts currently reject sequential reuse through
      a real public boundary, without treating invalid-token probes or conditional assertions as
      consumed-artifact evidence. Keep concurrent-consume, response-loss, and restart-consistency
      cases in the deferred catalog; record every missing public observation and unresolved TOTP
      replay contract as a named gap for Task 8.7 or separate product authority. Existing UI
      journeys corroborate password-reset and invitation consumption, but their directly inserted
      values do not prove issuance, delivery, or binding. Magic-link's second-use oracle is
      ambiguous; email OTP has no same-code retry; recovery code has no public sequential journey;
      and the retained fake-token penetration cases receive no replay credit. DEF-8 records those
      evidence gaps. DEF-9 records that current stateless TOTP verification cannot enforce the
      catalog's same-window reuse expectation without a separately authorized contract/product
      decision. Focused human-auth specifications passed 15/15, governance passed 55/55, and the
      independent challenge confirmed the non-admission boundary. `yarn verify` passed 68
      structure tests, 233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files /
      355 tests. ✅ (completed: 2026-08-19 23:52)
- [x] 8.6a Implement the human-auth baseline capability and audit/select exact E2E/pentest/UI
      candidates. Require fatal email prerequisites plus independent cookie/state observations;
      invalid, pre-consumed, conditional, status-only, and mock/service-only cases cannot receive
      exact sentinel credit. Added the closed ST-42–ST-48 model, rich prerequisite/observation/scope
      candidate audit, provenance-bound owner-only evidence writer, dispatcher registration, four
      immutable specifications, and four implementation checks. The required RED was the sole
      `HUMAN_AUTH_BASELINE_CAPABILITY_MISSING` failure. The completed selector passed 8/8,
      governance passed 55/55, structure passed 68/68, assurance typecheck/lint/formatting passed,
      and `yarn verify` passed 233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI
      files / 355 tests. No product behavior or live baseline evidence changed in this checkpoint.
      ✅ (completed: 2026-08-20 00:13)
- [x] 8.6b From the clean pushed capability revision, record ST-42 natural RED or legacy green with
      exact provenance. The baseline artifact must preserve partial password-reset/invitation
      consumption scope without closing issuance, delivery, binding, or the broader slice. Clean
      revision `cbfa5856` produced mode-`0600` result
      `0f2431b6-4286-4bae-86fb-6a3205a50f22`: all 19 prerequisite specifications passed, ST-42 is
      `natural-red` because both audited candidates lack the complete status/body/header and fatal-
      prerequisite observation contract, and no product failure or selected sentinel was recorded.
      `yarn verify` passed 68 structure tests, 233 server files / 3,382 tests, 31 SDK files / 404
      tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-20 00:23)
- [x] 8.7a [spec-author] Freeze and implement the manifest-owned loopback-IP HTTPS attacker site,
      distinct-site preflight, production cookie metadata, and state-changing CSRF nonmutation
      oracle. Reuse the existing SPA listener and certificate; add no new service or port. The
      endpoint manifest now owns `https://127.0.0.1:<SPA port>`, projects it through the lifecycle
      environment, and validates the generated certificate's loopback IP SAN. The Node topology
      selector passed 4/4 without manufacturing browser evidence. Production-security harness run
      `b84c98c2-c952-47f0-857e-dd44dfacd4f7` passed the retained security project and 17/17 live
      tenant/admin checks; the browser case authenticated, verified the exact host-only `_session`
      attributes, proved the cross-site password-reset request changed neither MailHog nor the
      protected session, and then proved reachability with one same-origin delivery. Lifecycle
      tests passed 266/266, structure passed 68/68, and `yarn verify` passed 233 server files / 3,382
      tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-20 00:54)
- [x] 8.7b Add functional status/body/header enumeration, login-method, failure/lockout/limit, and
      session renewal/expiry/logout/revocation black-box cases. Every email prerequisite is fatal
      and every session result has an independent public state observation. Added immutable
      ST-42–ST-44 requirements and live observation contracts, an owner-fenced production-security
      adapter, fatal MailHog controls, raw stale-form login-method probes, equivalent-key lockout/
      throttle cases, and public `prompt=none` plus admin-inventory session observations. The
      authoritative production-security run `31384e38-15a2-465c-82df-b2ee283c8f6b` passed the new 7/7
      functional block before the retained tenant/admin block passed 17/17. Static checks and
      structure passed 68/68; `yarn verify` passed 233 server files / 3,382 tests, 31 SDK files /
      404 tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-20 01:57)
- [!] 8.7c Blocked: DEF-10 — the production-security public-boundary run accepted an Alpha-issued
      magic-link value through Bravo's route with a 302 response instead of the required rejection.
      Preserve the immutable tenant-binding oracle and route the product correction separately.
      Add transient MailHog acquisition and exact sequential-use journeys for magic link,
      password reset, and invitation. Verify intended recipient/tenant, configured lifetime,
      second-use rejection, protected-state nonmutation, and exposure redaction without retaining
      delivered values.
- [x] 8.7d Add email-OTP and recovery-code public sequential-use journeys plus TOTP enforcement.
      Preserve DEF-9 for same-window TOTP replay until separate product/security authority resolves
      that contract; do not manufacture a passing expectation from the stateless verifier.
      Added an owner-fenced production-security adapter for public email-OTP, TOTP, and recovery-
      code journeys. Email OTP and recovery codes prove first use, exact same-value rejection, and
      a fresh-value recovery control; TOTP proves wrong-account, expired-window, and current-window
      behavior without claiming same-window replay. The live run passed 4/4 second-factor specs and
      the unchanged tenant/admin block, cleanup completed, focused static checks passed, and
      `yarn verify` passed 68 structure tests, 233 server files / 3,382 tests, 31 SDK files / 404
      tests, and 29 CLI files / 355 tests. ✅ (completed: 2026-08-20 02:55)
- [ ] 8.7e Add mail polling, public state observers, configured clock-window checks, and secret-free
      diagnostic implementation tests for the admitted ordinary cases. Do not add timing-
      distribution measurement or advanced concurrent/restart mechanics.
- [ ] 8.8 Record human-auth source-variation sensitivity as deferred. Preserve every black-box
      expectation and pentest, and keep the slice explicitly not-sensitivity-proven.
- [ ] 8.9 Run operational and production-security browser/security projects, coverage, audit/log/
      recovery evidence, all pentests, and `yarn verify`.

**Phase gate:** every human-auth/recovery artifact is tenant/recipient/time/single-use bound for the
ordinary sequential contract, production controls are proven only in production-security mode, and
all deferred concurrency/restart gaps remain visible. Functional enumeration behavior is required;
the statistical timing-distribution edge remains blocked under DEF-7 and cannot receive assurance
credit.

## Phase 9: P1 Validation, Exposure, and Administrative Data

> **Scope**: raw attack probes, production profile, admin data, bulk/import/export oracle gate
> **References**: ST-52–ST-63, RD-04/RD-05

- [ ] 9.1 [product-authority gate] Resolve and record approved bulk/import/export contracts for
      duplicate/collision, provenance/version, rollback, partial outcomes, and export sensitivity.
      Until decided, ST-62 and only its claims remain blocked; never infer the oracle from code.
- [ ] 9.2 [spec-author] Write ST-52–ST-56 raw cases for SQL, CRLF/header, XSS/template, prototype,
      command/path, redirect, slug/tenant, host/proxy, method, malformed JSON, oversize, and exposure.
- [ ] 9.3 [spec-author] Write ST-57–ST-61 for pagination isolation, audit read/cleanup/integrity/
      redaction, key lifecycle, session administration/cascade, and configuration authorization.
- [ ] 9.4 [spec-author] Once 9.1 has authority, write ST-62 exact bulk/import/export matrices; otherwise
      preserve their blocked claims and continue independent P1 work.
- [ ] 9.5 Record natural RED or legacy green; audit/select existing pentest/integration sentinels
      and classify broad smoke/conditional-prerequisite cases as corroboration only.
- [ ] 9.6 Add missing raw/browser/packed-client probes, authorized handler controls, independent
      non-mutation/cardinality checks, and exact audit/log/recovery observations.
- [ ] 9.7 Run HTTPS/cookie/header/CORS/CSP/error/exposure cases only in production-security mode;
      test trusted/untrusted proxy profiles without production config changes.
- [ ] 9.8 Add payload generation, raw transport, header normalization, pagination/cardinality,
      lifecycle, and redacted-error implementation tests after specs are green.
- [ ] 9.9 Record P1 source-variation sensitivity as deferred. Preserve every black-box expectation
      and pentest, and keep the slice explicitly not-sensitivity-proven.
- [ ] 9.10 Run P1 projects/profiles, applicable packed clients, coverage, all pentests, evidence/
      redaction/recovery checks, and `yarn verify`.

**Phase gate:** every named P1 surface is assured, blocked by a named product-authority/defect gap,
or incomplete with explicit evidence; nothing is silently treated as safe.

## Phase 10: Mutation Pilot and Reliability Qualification

> **Scope**: bounded mutation, command matrix, 100-run evidence, observation baselines
> **References**: ST-64–ST-78, RD-03/RD-06/RD-07

- [ ] 10.1 Run the full curated catalog against a clean baseline; verify every claim tuple,
      survivor/invalid classification, primary-tree immutability, cleanup, and redaction.
- [ ] 10.2 Evaluate one bounded TypeScript ESM mutation pilot on approved small modules; retain a
      no-go result without weakening curated faults if compatibility/runtime criteria fail.
- [ ] 10.3 [spec-author] Add a table-driven command×outcome matrix for product, test, setup,
      coverage, fault, cleanup, timeout, SIGINT, and SIGTERM across every documented alias.
- [ ] 10.4 Force every matrix cell and prove exact exit class, bounded recovery output, and
      ownership-safe cleanup; ambiguous or leaked outcomes block command qualification.
- [ ] 10.5 Define one fixed representative seed set per promotion candidate and run 100 consecutive
      completed executions with zero infrastructure/test flakes; invalid/incomplete resets count to zero.
- [ ] 10.6 Record every retry as a flake plus p50/p95, timeout headroom, invalid-run rate, failure
      owner, and recovery; remediate harness-only flakes and restart the sequence.
- [ ] 10.7 Implement and verify local/on-demand exact no-regression ratchets and eligible per-slice
      floors ST-27A, then commit observation baselines and staleness triggers. Do not wire any
      ratchet into CI, release, or merge policy.
- [ ] 10.8 Run ST-64–ST-78, `yarn assurance:all`, generated-artifact/redaction/recovery checks, and
      `yarn verify`.

**Phase gate:** eligible commands have exact failure/signal semantics and zero-flake 100-run
evidence; this evidence grants no promotion authority.

## Phase 11: Roll-up, Documentation, and Promotion Proposal

> **Scope**: traceability roll-up, inventory/ADR, sanitized summaries, non-enforcing CI proposal
> **References**: ST-77–ST-79, RD-01–RD-07

- [ ] 11.1 Validate the complete requirement→case→task→claim graph and report Must/Should/out-of-
      scope counts, assured/incomplete/blocked/stale claims, defects, gaps, and applicable fault tuples.
- [ ] 11.2 Update the current test inventory and ADR-014 with delivered commands, profiles,
      attribution limits, evidence categories, and truthful blocked/named gaps.
- [ ] 11.3 Produce a concrete non-enforcing proposal for extending the existing harness CI job and
      any future ratchet/fault scheduling; identify the read-only workflow and require separate
      explicit user/policy authorization before adoption.
- [ ] 11.4 Run ST-79 and structure contracts proving `yarn verify` unchanged and no workflow,
      publishing, deployment, release, or merge-policy file changed.
- [ ] 11.5 Run final `yarn assurance:all`, `yarn verify`, `yarn test:ui`, and `yarn harness:test`;
      inspect coverage, fault, compatibility, redaction, retention, signals, and cleanup artifacts.
- [ ] 11.6 Record the final claim/slice status honestly; never claim certification or absence of
      exploits, and leave every product defect or unresolved contract in its separate blocked route.

**Final gate:** every Must is mechanically traced and verified or explicitly blocked by named
external authority/defect evidence, every closed critical claim has current green and its own
killed-fault tuple, ordinary development/publishing remains usable, and this plan made no product,
workflow-policy, publishing, deployment, scanner, or certification change.
