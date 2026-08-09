# Preflight Report: Porta Test Assurance Program

> **Status**: ✅ PREFLIGHT PASSED — all 27 findings resolved
> **Iteration**: 3 — bounded final verification after accepted fixes
> **Artifact**: Full implementation plan at `codeops/features/test-assurance/plans/test-assurance-program/`
> **Artifact Git Tree**: `d9080c086588881570a88deae4c7aa428b06dc0b`
> **Final Artifact Content Hash**: `ecf98d48a1d049bf342e91b92ed6d7094fffd0bad2d6ac7aef8af9f31fdd0e6e`
> **Codebase Grounded**: 44 source/config/test files examined; 61 material references checked
> **Scope Mode**: Strict
> **Last Updated**: 2026-08-09

> **SAME-SESSION REVIEW**: This plan was created in the current logical session. Five independent
> clustered auditors, three domain-lens audits, and one independent recommendation challenger were
> used to reduce same-agent bias. A human identity/security domain review is still recommended.

## Audit Scope

- **Audit target**: the 11 plan documents in this directory.
- **Context only**: the seven owning RDs and requirements ambiguity register, feature roadmap,
  current test inventory, ADR-014, AGENTS.md, manifests, CI workflow, and cited source/tests.
- **Modification set**: all plan documents plus RD-02 through RD-07, explicitly authorized where
  accepted remedies required owning-requirement correction. Product code and CI workflow excluded.
- **Product-scope baseline**: independent assurance in the retained harness; no product fixes, new
  harness, scanner, publishing/deployment repair, certification, or automatic gate promotion.

## Codebase Context Summary

**Tech stack:** Node.js 22, TypeScript ESM, Koa, `oidc-provider`, PostgreSQL, Redis, Yarn Classic,
Turbo, Vitest, Playwright, Docker Compose.

**Architecture:** Porta is a multi-tenant OIDC provider with a separate super-admin control plane.
The retained black-box harness builds the compiled server into Docker, fronts it with nginx, and
runs serial SPA/BFF Playwright journeys. The harness has no package manifest or internal unit-test
runner. Applications and roles are global; users and clients carry tenant ownership; protected
administrative routes authenticate through the bootstrapped super-admin organization.

**Key files examined:** `package.json`, `test-harness/playwright.config.ts`, harness lifecycle and
seed scripts, Compose/Docker assets, server startup/config/OIDC/admin middleware/migrations/routes,
SDK and CLI manifests/entry points/auth storage, repository contract tests, and
`.github/workflows/build-and-test.yml`.

**Reference verification:** structural plan parsing and local links pass. The semantic
requirements-to-case claim does not pass.

**Selected domain lenses:** web application; distributed and concurrent; data and migration.

## Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        3 | 🟠 Major         |
|   2 | Implicit Assumptions   |        2 | 🟠 Major         |
|   3 | Logical Contradictions |        1 | 🟠 Major         |
|   4 | Completeness Gaps      |        5 | 🟠 Major         |
|   5 | Dependency Issues      |        2 | 🟠 Major         |
|   6 | Feasibility Concerns   |        2 | 🟠 Major         |
|   7 | Testability            |        3 | 🟠 Major         |
|   8 | Security Blind Spots   |        2 | 🟠 Major         |
|   9 | Edge Cases             |        1 | 🟠 Major         |
|  10 | Scope Creep Indicators |        1 | 🟠 Major         |
|  11 | Ordering & Sequencing  |        2 | 🟠 Major         |
|  12 | Consistency            |        1 | 🟡 Minor         |
|  13 | Codebase Alignment     |        3 | 🔴 Critical      |

## Summary by Severity

| Severity       | Count | Status                |
| -------------- | ----: | --------------------- |
| 🔴 Critical    |     1 | Resolved and verified |
| 🟠 Major       |    25 | Resolved and verified |
| 🟡 Minor       |     1 | Resolved and verified |
| 🔵 Observation |     0 | —                     |

## Findings

### PF-001: Harness-internal test execution boundary is undefined 🟠 MAJOR

**Dimension:** Dependency Issues
**Location:** `00-ambiguity-register.md:25`; `03-01-assurance-model.md:8-21`;
`03-02-harness-and-fixtures.md:8-17`; `99-execution-plan.md:43-49`
**Codebase Evidence:** `package.json:44-46,53-73`; `test-harness/playwright.config.ts:20-31`;
`repo-tests/monorepo/server-package.spec.test.mjs:344-381`;
`repo-tests/monorepo/workspace-layout.spec.test.mjs:158-167`; `packages/server/package.json:68`

The plan creates `*.spec.test.ts` and `*.impl.test.ts` harness-component tests but names no runner,
typecheck, lint boundary, or direct dependency owner. Playwright patterns use `*.spec.ts`, the
harness intentionally has no package manifest, Zod is declared only by the server workspace, and a
repository contract currently asserts exactly six harness `*.spec.ts` files. New tests can be
uncollected or make `yarn verify` fail.

| Option | Description                                                                                                                                                                   | Pros                                                     | Cons                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| A      | Root-owned `tsx --test`/`node:test` commands, direct root dependencies, harness tsconfig/ESLint, explicit runner ownership; Playwright uses directory-scoped `*.spec.test.ts` | Satisfies existing naming and single-harness constraints | Requires precise no-double-collection contracts          |
| B      | Add a root Vitest boundary for harness internals                                                                                                                              | Familiar test API                                        | Adds a second harness-side runner and more configuration |

**Recommendation:** A. It uses existing root tooling without creating a harness workspace.
**Confidence:** High. **Hardening:** challenger converged on the remedy and argued for higher
severity; severity remains Major because the defect blocks implementation but has not changed product behavior.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-002: RED-phase tasks contradict the task completion contract 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:108-117`; `99-execution-plan.md:11-18,43-49,61-67,78-85,97-104,188-195`

Tasks are complete only when verification passes, but five tasks require a targeted command to fail.
The plan does not define how an expected failure is distinguished from infrastructure or syntax
failure while keeping mandatory lanes green.

| Option | Description                                                                                                             | Pros                                      | Cons                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| A      | Treat RED as successful evidence only for an exact registered failure signature; keep pre-existing required lanes green | Preserves auditable red/green checkpoints | Requires strict failure-signature tooling |
| B      | Make each spec/red/green sequence one atomic task                                                                       | Simpler checkpoint semantics              | Loses separately committed RED evidence   |

**Recommendation:** A. Unexpected non-zero results must never count as RED success.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-003: PostgreSQL reset has no safe algorithm or recovery state machine 🟠 MAJOR

**Dimension:** Feasibility Concerns
**Location:** `03-02-harness-and-fixtures.md:24-33,52-59`; `99-execution-plan.md:61-67,78-85`
**Codebase Evidence:** `test-harness/docker-compose.yml:42`; `docker/entrypoint.sh:69-76`;
`packages/server/src/index.ts:36-46`; `test-harness/scripts/seed.ts:101-213`

The plan promises a known database baseline and repeatable interrupted reset but selects no restore
mechanism. It also allows cross-store reset while Porta may remain live, so a DB mutation followed by
Redis/MailHog failure can produce a mixed, cache-repopulated baseline.

| Option | Description                                                                                                                                                        | Pros                                        | Cons                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| A      | Stop Porta; recreate DB; migrate/bootstrap/deterministically seed; flush Redis/mail; restart and verify; any partial unknown state poisons and recreates the stack | Simple provenance and strongest correctness | Slower per reset                           |
| B      | Stop Porta and restore a revision/migration-bound snapshot, then reset other stores and verify                                                                     | Faster                                      | Snapshot/version lifecycle is more complex |

**Recommendation:** A initially; optimize to B only after measured runtime justifies it.
**Confidence:** High. **Hardening:** challenger converged on A and rejected truncate/reseed as too fragile.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-004: Concurrent-worktree endpoint ownership is under-designed 🟠 MAJOR

**Dimension:** Feasibility Concerns
**Location:** `03-02-harness-and-fixtures.md:24-33,52-59`; `99-execution-plan.md:61-67`
**Codebase Evidence:** `test-harness/docker-compose.yml:5-18,57-93`;
`test-harness/scripts/start.sh:54-115`; `test-harness/scripts/stop.sh:28-30`;
`test-harness/playwright.config.ts:11-30`; `test-harness/spa-server.ts:16-20`;
`test-harness/bff/server.ts:33-38`

“Unique ports” does not define allocation, reservation, retry, stale-owner recovery, or cleanup
fencing. Ports and URLs are hardcoded across Compose, nginx, seed, clients, Playwright, helpers, and
scripts; a Compose project name alone cannot prevent cross-run binding or cleanup.

| Option | Description                                                                                                                          | Pros                                     | Cons                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| A      | Atomically lease a complete port block, persist owner identity, generate one endpoint manifest for every consumer, and fence cleanup | Deterministic and works across worktrees | Needs locking and stale-lease recovery                            |
| B      | Use Docker-assigned ports and regenerate all dependent endpoints/configuration                                                       | Avoids central allocator                 | Larger lifecycle change; issuer/redirects still need coordination |

**Recommendation:** A with bounded collision retry and owner/process/Compose checks.
**Confidence:** High. **Hardening:** challenger converged and raised severity; lead retained Major.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-005: V8 record validation rejects valid Node process coverage 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `03-03-coverage-and-faults.md:8-18`; `07-testing-strategy.md:51-59`;
`99-execution-plan.md:97-104`
**Codebase Evidence:** `test-harness/Dockerfile:37-44`; `packages/server/src/index.ts:14-23`;
`packages/server/package.json:43-68`

`NODE_V8_COVERAGE` records Node internals and loaded dependencies as well as `/app/dist`. Requiring
all scripts to be server-package paths makes a healthy capture invalid or encourages unaudited
discarding.

| Option | Description                                                                                                                                    | Pros                                       | Cons                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| A      | Validate process/build provenance, classify scripts, attribute allowlisted first-party build outputs, and record every exclusion/unmapped path | Auditable and compatible with raw evidence | Requires complete expected-build manifest                  |
| B      | Use a filtered capture API after proving it retains startup execution                                                                          | Smaller records                            | May miss the startup evidence this phase exists to capture |

**Recommendation:** A. Reject unexpected local application paths, not expected runtime scripts.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-006: Production-security claims target a development-mode server 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-04-risk-slices.md:31-45`; `07-testing-strategy.md:75-81`;
`99-execution-plan.md:147-181`
**Codebase Evidence:** `test-harness/docker-compose.yml:20-30`;
`packages/server/src/config/schema.ts:144-159`; `packages/server/src/oidc/configuration.ts:583-592`

The current harness sets `NODE_ENV=development` and debug logging, while planned claims cover
production cookies, HTTPS, errors, headers, and exposure. Development evidence cannot substantiate
environment-dependent production claims.

| Option | Description                                                                                                             | Pros                             | Cons                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| A      | Define operational/development and production-security profiles in the retained Compose harness; bind each claim to one | Honest profile-specific evidence | More runtime and profile maintenance              |
| B      | Run every harness project in production-like mode                                                                       | Simpler evidence model           | May break useful development diagnostics/journeys |

**Recommendation:** A, with production-only claims required to run in the production-security profile.
**Confidence:** High. **Hardening:** challenger preferred A and raised severity; lead retained Major.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-007: Tenant/admin assurance model conflicts with Porta's actual authority model 🔴 CRITICAL

**Dimension:** Codebase Alignment
**Location:** `03-02-harness-and-fixtures.md:35-44`; `03-04-risk-slices.md:15-21`;
`07-testing-strategy.md:40-45,65-67`; `99-execution-plan.md:111-127`
**Codebase Evidence:** `packages/server/migrations/003_applications.sql:3-20`;
`packages/server/migrations/004_clients.sql:3-8`; `packages/server/migrations/006_roles_permissions.sql:3-42`;
`packages/server/src/middleware/admin-auth.ts:179-245`;
`packages/server/src/middleware/require-permission.ts:30-54`

The plan treats applications/roles as tenant-owned and assumes ordinary tenant administrators can
perform same-tenant admin actions. Applications and roles are global, while protected admin routes
authenticate active users in the single super-admin organization. A tenant-A token can fail before
the target handler for both tenant A and B, yielding a vacuous early-403 “isolation” pass.

| Option | Description                                                                                                                                                                                 | Pros                                                | Cons                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| A      | Recast two matrices: ordinary-tenant OIDC/session/token isolation, and super-admin control-plane actors with granular permissions targeting alpha/bravo resources; amend owning RD ontology | Tests real trust boundaries without product changes | Requires requirements and plan correction |
| B      | Block these claims pending a separate tenant-local admin product design                                                                                                                     | Avoids misrepresenting current behavior             | Leaves the central P0 slice unimplemented |

**Recommendation:** A. Every negative probe also needs an authorized control proving the request can
reach the target operation before tenant/permission variation.
**Confidence:** High. **Hardening:** challenger converged. Strongest counterargument: if tenant-local
administration was intended future behavior, changing the RD changes intent—but that product feature
is explicitly outside this program.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-008: JWT rejection cases target no actual Porta JWT-consuming surface 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `03-04-risk-slices.md:23-29`; `07-testing-strategy.md:68-71`;
`99-execution-plan.md:129-145`
**Codebase Evidence:** `packages/server/src/oidc/configuration.ts:499-503`;
`packages/server/src/middleware/admin-auth.ts:139-175`

Porta issues opaque access/client-credentials tokens and admin auth looks them up through
`oidc-provider`; ST-32 assumes a protected Porta surface consumes attacker-signed JWT access tokens.
OAuth permits opaque access tokens, while OIDC defines validation for issued ID tokens
([RFC 6749 §1.4](https://www.rfc-editor.org/rfc/rfc6749.html#section-1.4),
[OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0-18.html#IDTokenValidation)).

| Option | Description                                                                                                                                                  | Pros                            | Cons                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------- |
| A      | Independently verify issued ID tokens for ES256/JWKS/issuer/audience/sub/nonce/expiry; separately test opaque/wrong-token-type rejection at actual consumers | Matches Porta and the standards | Does not claim JWT resource-server behavior Porta lacks |
| B      | Change Porta to use JWT access tokens                                                                                                                        | Creates a target for ST-32      | Out-of-scope product/protocol change                    |

**Recommendation:** A; B is not viable in this assurance-only program.
**Confidence:** High. **Hardening:** challenger converged and argued for Critical; lead retained Major
because the flaw is bounded to one planned protocol claim family.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-009: Claim schema cannot enforce per-slice completeness 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `03-01-assurance-model.md:27-46`; `99-execution-plan.md:43-49,116-122`
**Context Evidence:** `requirements/RD-05-security-risk-slice-assurance.md:26-28,123-124`

The schema omits typed actor, action, resource/asset, entry point, trust boundary, rejection result,
prohibited side effect, required privacy-safe log, and recovery behavior. A claim can validate and
become assured while the RD-required authorization/threat matrix remains incomplete.

| Option | Description                                                                                 | Pros                                            | Cons                                |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| A      | Add a typed per-slice matrix linked from claims and validate referential/completeness rules | Avoids duplication and enables mechanical gates | Adds schema relationships           |
| B      | Put every required field directly in each claim                                             | Self-contained records                          | Duplication and drift across claims |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-010: P0 requirement traceability is incorrect and incomplete 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `01-requirements.md:21-24`; `07-testing-strategy.md:63-81,119-124`;
`99-execution-plan.md:129-163`
**Context Evidence:** `requirements/RD-05-security-risk-slice-assurance.md:29-60,135-155`;
`packages/server/src/routes/invitation.ts:96-119`

Several ST source labels point to the wrong RD-05 clauses. Mandatory P0 cases are unnamed, including
issuer/cache separation, stale role/session, super-admin exceptions, code/client/redirect binding,
state/nonce/consent/client auth, `sub`/`nbf`/unknown `kid`/attacker JOSE headers, invitation and
recipient/tenant/expiry controls, login-method enforcement, and several raw injection variants.
The assertion that every Must maps to a case/task is therefore false.

| Option | Description                                                                                             | Pros                      | Cons                                      |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------- |
| A      | Correct source cells, add exact ST/subcase IDs, and generate a validated `R → ST → task → claim` matrix | Prevents silent omissions | Materially expands the case set           |
| B      | Formally narrow RD-05 and keep removed controls as blocked gaps                                         | Smaller program           | Reduces already-authorized security scope |

**Recommendation:** A. Do not narrow Must security controls merely to fit the existing plan.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-011: Bulk/import/export has no approved independent oracle 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-04-risk-slices.md:39-45`; `07-testing-strategy.md:81`;
`99-execution-plan.md:165-181`
**Codebase Evidence:** `packages/server/src/lib/bulk-operations.ts:1-6,75-171`;
`docs/api/bulk-operations.md:112-116`; `docs/api/imports.md:143-158`

ST-44 says atomic/partial behavior “matches contract” but cites unrelated requirements and names no
authority. Current bulk documentation and implementation expose partial-success semantics while
source commentary describes all-or-nothing behavior; import also mixes accumulated errors and commit.
Tests authored from current output would recreate the exact self-validation problem this program is
meant to prevent.

| Option | Description                                                                                                                                                        | Pros                          | Cons                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------ |
| A      | Add an oracle-authority resolution gate before Phase 8; specify duplicates, partial failure, rollback, provenance, and export sensitivity; block unresolved claims | Preserves oracle independence | Can delay P1 completion              |
| B      | Remove these workflows from P1                                                                                                                                     | Avoids ambiguity              | Contradicts owning Must requirements |

**Recommendation:** A; product authority decides behavior, not the current implementation.
**Confidence:** High. **Hardening:** challenger split this root cause from general P1 omission; lead adopted the split.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-012: Mandatory P1 administrative surfaces are absent 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `03-04-risk-slices.md:39-45`; `07-testing-strategy.md:78-81`;
`99-execution-plan.md:165-181`
**Codebase Evidence:** `packages/server/src/routes/keys.ts:38-118`;
`packages/server/src/routes/sessions.ts:52-127`; `packages/server/src/routes/config.ts:47-122`;
`packages/server/src/routes/audit.ts:42-170`

RD-05 requires pagination isolation, audit integrity, signing-key lifecycle, session administration,
and configuration authorization. Phase 8 names only a reduced validation/exposure matrix plus
bulk/import/export, yet the final gate claims complete Must traceability.

| Option | Description                                                              | Pros                        | Cons                                     |
| ------ | ------------------------------------------------------------------------ | --------------------------- | ---------------------------------------- |
| A      | Add exact P1 claim/spec/task groups, optionally as release-safe Phase 8b | Implements authorized scope | More tasks/runtime                       |
| B      | Leave each absent surface as an explicitly blocked claim                 | Honest partial completion   | Program cannot report all Musts complete |

**Recommendation:** A; use B only where PF-011 lacks product authority.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-013: Required distributed failure and timing interleavings are absent 🟠 MAJOR

**Dimension:** Edge Cases
**Location:** `07-testing-strategy.md:70-77`; `99-execution-plan.md:134-158`
**Context/Code Evidence:** `requirements/RD-05-security-risk-slice-assurance.md:96-100,147-151`;
`packages/server/src/auth/magic-link-session.ts:127-136`;
`packages/server/src/auth/token-repository.ts:157-188`;
`packages/server/src/two-factor/service.ts:428-440,505-520`

The plan tests duplicate use but omits read-during-consumption, failure immediately before/after
durable commit, timeout with unknown outcome and retry, fresh-process replay, and enumeration timing
distributions. These are explicit Must evidence and current paths contain timing-sensitive multi-step operations.

| Option | Description                                                                                                                                  | Pros                                                   | Cons                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| A      | Add deterministic barriers and disposable fault patches with bounded waits, restart/retry, correlation, and independent durable-state checks | Tests the mandated exploit class without product hooks | High implementation/runtime cost          |
| B      | Narrow the RD and block/defer affected claims                                                                                                | Honest                                                 | Removes explicit security assurance goals |

**Recommendation:** A; no synchronization control may ship in production source.
**Confidence:** High. **Hardening:** challenger converged and argued for Critical; lead retained Major pending implementation evidence.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-014: Stale authorization state has no exact revocation scenario 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `07-testing-strategy.md:65-67`; `99-execution-plan.md:116-122`
**Codebase Evidence:** `packages/server/src/rbac/cache.ts:119-145,161-219`;
`packages/server/src/organizations/cache.ts:97-132`

RD-05 explicitly includes stale role/session/cache state. ST-30 does not warm caches, revoke role or
membership, immediately reuse the existing session/token, and retry on the same and a fresh process.
Cache invalidation failures are swallowed, making the omission security-relevant.

| Option | Description                                                                                                                         | Pros                                | Cons                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| A      | Add warm → revoke → immediate reuse tests for role, membership, session, same process, and fresh process with no-side-effect checks | Directly tests privilege revocation | Needs deterministic cache/state observation           |
| B      | Record a blocked named gap                                                                                                          | Honest                              | Leaves a known privilege-revocation surface unaudited |

**Recommendation:** A; use B only if the current contract cannot define immediate revocation.
**Confidence:** High. **Hardening:** challenger converged and raised severity; lead retained Major.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-015: Fault-runner foundation is ordered after dependent slices 🟠 MAJOR

**Dimension:** Ordering & Sequencing
**Location:** `99-execution-plan.md:111-195`

Phases 5-8 invoke curated-fault prechecks and naturally green legacy specs require sensitivity proof,
but fault specifications, metadata, and runner are not built until Phase 9. The earlier tasks are not
executable as written.

| Option | Description                                                                                                                              | Pros                                  | Cons                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| A      | Move runner/spec foundation before Phase 5; execute each slice's curated faults beside that slice; keep mutation pilot and roll-up later | Gives timely red/sensitivity evidence | Front-loads infrastructure             |
| B      | Define early prechecks as metadata-only and keep claims incomplete until Phase 9                                                         | Smaller reorder                       | Delays rework and sensitivity feedback |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged and argued for Critical; lead retained Major.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-016: Packed-client evidence arrives after slices that require it 🟠 MAJOR

**Dimension:** Ordering & Sequencing
**Location:** `99-execution-plan.md:111-127,165-217`
**Context Evidence:** `requirements/RD-05-security-risk-slice-assurance.md:79-87`

Tenant/admin and P1 matrices require packed clients where supported, but Phase 9 can close eligible
claims before Phase 10 builds those boundaries.

| Option | Description                                                                                                                                      | Pros                     | Cons                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------- |
| A      | Move pack/install/provenance foundation after coverage; execute applicable packed cases within risk slices; retain aggregate compatibility later | Correct dependency order | Repeated pack/install cost          |
| B      | Keep order but prohibit affected claim closure until Phase 10                                                                                    | Minimal rewrite          | Delayed feedback and reopening risk |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-017: Packed CLI can overwrite real user credentials 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-05-compatibility-and-ci.md:6-23,39-48`; `99-execution-plan.md:202-217`
**Codebase Evidence:** `packages/cli/src/credential-store.ts:21-29,83-153`;
`packages/cli/src/commands/login.ts:77-95`

An isolated package-install directory does not isolate `~/.porta/credentials.json`; packed login and
logout can overwrite or delete a developer's credentials.

| Option | Description                                                                                                                                                | Pros                               | Cons                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| A      | Give every CLI subprocess an isolated temporary home, restrictive permissions, unconditional cleanup, and pre/post fingerprint of the real credential path | Harness-only and directly testable | Environment handling is platform-sensitive |
| B      | Run the consumer in a disposable container with isolated home                                                                                              | Strong isolation                   | More infrastructure/runtime                |

**Recommendation:** A, retaining the real-path fingerprint as defense against environment mistakes.
**Confidence:** High. **Hardening:** challenger converged and argued for Critical; lead retained Major.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-018: Packed CLI may resolve the registry SDK instead of the packed SDK 🟠 MAJOR

**Dimension:** Dependency Issues
**Location:** `03-05-compatibility-and-ci.md:6-23`; `07-testing-strategy.md:92-95`;
`99-execution-plan.md:207-212`
**Codebase Evidence:** `packages/cli/package.json:21-28`

The CLI depends on version `1.6.2`. Installing both tarballs does not itself prove the CLI resolved
the local SDK rather than registry bytes with the same version.

| Option | Description                                                                                                                                       | Pros                         | Cons                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| A      | Generate a consumer manifest with both archives as explicit local dependencies; install cleanly and assert the CLI-resolved SDK path/content hash | Minimal and provenance-bound | Must account for package-manager deduplication |
| B      | Use an isolated local registry containing only the packed artifacts                                                                               | Strong registry simulation   | Adds unnecessary service/tooling               |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-019: The 100-run promotion gate has no defined population or denominator 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-02-harness-and-fixtures.md:58-59`; `03-05-compatibility-and-ci.md:27-43`;
`07-testing-strategy.md:96`; `99-execution-plan.md:224-226`

“Representative execution” alternately implies a whole harness, project, or fault. Aggregation can
hide a flaky constituent. At exactly 100 runs, `<1%` means zero flakes; incomplete-run handling is undefined.

| Option | Description                                                                                                                                            | Pros                                              | Cons                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------- |
| A      | Require 100 consecutive completed runs per candidate promoted check with zero test/infrastructure flakes; invalid/incomplete runs restart the sequence | Directly matches the owning per-check requirement | Expensive for fault campaigns |
| B      | Define one immutable aggregate command and separately require zero flakes for every constituent                                                        | Fewer top-level campaigns                         | More complex attribution      |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-020: Final assurance gates are nouns, not executable commands 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:108-117`; `99-execution-plan.md:43-49,224-229`
**Codebase Evidence:** `package.json:44-46`

The plan refers to “coverage reproducibility,” “curated fault catalog,” “packed compatibility,” and
“cleanup gates” without exact root commands, selectors, exit classes, or artifact locations. RD-07
requires every assurance command to be repeatable from the root and non-interactive.

| Option | Description                                                                                                     | Pros                                | Cons                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| A      | Declare the command contract in the plan now and implement/validate aliases in the first owning foundation task | Makes every later gate reproducible | Names may need plan amendments during implementation |
| B      | Add one early command-definition task and block all dependent phases until it validates                         | Allows implementation discovery     | Initial plan remains less explicit                   |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-021: Failure taxonomy and signal cleanup lack executable specifications 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:34-45,85-99`; `99-execution-plan.md:224-227`
**Context Evidence:** `requirements/RD-07-continuous-assurance-and-non-functional-requirements.md:35-44,148-151`

ST-54-ST-57 do not force distinct product/assertion/setup/coverage/fault/cleanup outcomes or inject
SIGINT/SIGTERM across every assurance command. Generic final “cleanup gates” cannot prove the Must.

| Option | Description                                                                                                          | Pros                       | Cons                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| A      | Add a parameterized command × outcome/signal matrix with exact exits, ownership cleanup, and bounded recovery output | Mechanically proves the RD | Large repetitive matrix                                                      |
| B      | Narrow the RD to resource-owning commands                                                                            | Smaller                    | Unnecessary weakening; no-resource commands can prove no ownership trivially |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-022: Phase 11 exceeds CI and promotion authority 🟠 MAJOR

**Dimension:** Scope Creep Indicators
**Location:** `03-05-compatibility-and-ci.md:25-37`; `99-execution-plan.md:219-227`
**Context/Code Evidence:** `requirements/RD-07-continuous-assurance-and-non-functional-requirements.md:24-34,144-145`;
`AGENTS.md` section “Repository structure”; `.github/workflows/build-and-test.yml:133-149`

Task 11.3 can add CI/fault wiring and blocking ratchets after reliability evidence, but the branch
workflow is read-only and new blocking promotion requires separate user approval. Evidence is not authority.

| Option | Description                                                                                                                                  | Pros                                         | Cons                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| A      | Phase 11 produces observation baselines, promotion evidence, and a concrete workflow proposal only; a separate authorized task owns adoption | Fully respects repository and user authority | Leaves RD-07 CI extension pending/deferred       |
| B      | Add only a non-blocking manual workflow outside the read-only gate                                                                           | Some CI exercise without blocking            | Still requires explicit workflow-write authority |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged and argued for Critical; lead retained Major
because no workflow edit has occurred.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-023: Fault-to-claim sensitivity cardinality is undefined 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-01-assurance-model.md:44-46`; `03-04-risk-slices.md:6-11`;
`99-execution-plan.md:188-200`

The validator requires killed-fault evidence per assured claim, while fault classes and slice gates
do not say whether one fault can support many claims or every claim needs a distinct fault.

| Option | Description                                                                                            | Pros                                                   | Cons                                      |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| A      | Permit reuse only through explicit claim-sentinel-expected-signature tuples, each independently killed | Claim-level sensitivity without artificial duplication | Shared faults couple freshness/rerun cost |
| B      | Require a unique fault per critical claim                                                              | Simple cardinality                                     | Large artificial catalog                  |
| C      | Make sensitivity slice-level only                                                                      | Smallest catalog                                       | Too coarse for claim assurance            |

**Recommendation:** A.
**Confidence:** High. **Hardening:** challenger converged.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-024: Coverage/fault verification cites the wrong ST range 🟡 MINOR

**Dimension:** Consistency
**Location:** `03-03-coverage-and-faults.md:63-67`

The document says ST-19-ST-29 precede coverage and fault work. Coverage is ST-19-ST-27;
ST-28-ST-29 are tenant/RBAC; fault-runner cases are ST-45-ST-49.

| Option | Description                                                                   | Pros            | Cons          |
| ------ | ----------------------------------------------------------------------------- | --------------- | ------------- |
| A      | Split verification into coverage ST-19-ST-27 and fault ST-45-ST-49 statements | Exact ownership | None material |

**Recommendation:** A; it is the only viable correction.
**User Decision:** Resolved — User accepted recommendation: Option A.

## Iteration 2–3 Fix Verification

| Finding | Verified correction                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| PF-001  | Playwright owns external journeys; root Node/tsx owns internal specs; no harness package/workspace/extra framework |
| PF-002  | Exact RED signatures and separate RED checkpoints; legacy-green baseline is recorded without false sensitivity     |
| PF-003  | Quiesced recreate/migrate/seed reset; post-mutation uncertainty poisons and recreates the owned stack              |
| PF-004  | Atomic endpoint-block lease, one manifest, fenced cleanup, and proven stale-owner recovery                         |
| PF-005  | Raw V8 records are provenance-bound and classified rather than requiring every script under `/app/dist`            |
| PF-006  | Exact `operational` and `production-security` profile IDs; environment-dependent claims bind to the latter         |
| PF-007  | Ordinary-tenant and super-admin-control-plane matrices match Porta's real data and authority model                 |
| PF-008  | Independent ID-token validation is separated from opaque-token consumption and its curated faults                  |
| PF-009  | Typed per-slice actor/action/resource/result, trust, log, side-effect, and recovery profiles are mandatory         |
| PF-010  | Exact 79-row Must→case→task→claim seed validates unique rows, defined cases, and source alignment                  |
| PF-011  | Bulk/import/export has a product-authority gate; implementation cannot invent its oracle                           |
| PF-012  | Pagination, audit, keys, sessions, configuration, and workflow claims/tasks are explicit                           |
| PF-013  | Read/consume, commit-boundary, timeout/retry, fresh-process, and timing interleavings are executable               |
| PF-014  | Stale tests use supported role removal, status deactivation/suspension, and session revocation operations          |
| PF-015  | Fault runner foundation precedes every risk slice; slice faults execute beside their sentinels                     |
| PF-016  | Packed-client foundation precedes slices and supported packed journeys execute inside owning slices                |
| PF-017  | Every CLI subprocess uses isolated `HOME`, cleanup, and real-credential fingerprint checks                         |
| PF-018  | The clean consumer pins both local archives and verifies the CLI-resolved SDK digest/path                          |
| PF-019  | Promotion evidence is 100 consecutive completed zero-flake runs with visible retries and bounded campaign caps     |
| PF-020  | Root aliases have exact selectors, prerequisites, timeouts, artifacts, exit precedence, signals, and task bindings |
| PF-021  | Command×outcome×SIGINT/SIGTERM cases cover every assurance alias and recovery path                                 |
| PF-022  | `harness:test` stays SPA/BFF-only; new projects remain on-demand; CI adoption is proposal-only                     |
| PF-023  | Fault reuse requires independently killed claim–sentinel–signature tuples                                          |
| PF-024  | Coverage and fault specification ranges are corrected and separated                                                |

### PF-025: SameSite/CSRF evidence lacked a genuinely cross-site origin 🟠 MAJOR

**Iteration 2 evidence:** both original harness hosts share the same registrable domain, so they are
different origins but the same browser site. **Resolution:** the endpoint and certificate manifest
owns an HTTPS loopback-IP attacker origin with an IP SAN; ST-45 distinguishes same-origin,
cross-origin/same-site, and cross-site behavior without public attacker DNS or product changes.

**Authority:** AI — delegated by `--auto-design`. **Eligibility:** technical test topology inside
the retained harness. **Evidence:** project CI-loopback guidance and current Playwright/Compose
hosts. **Rejected:** another public registrable domain, because it adds external DNS ownership.
**Strongest counterargument:** IP-origin certificate setup adds harness complexity.
**Confidence:** High. **Hardening:** risk auditor verified the correction. **Policy version:** 1.
**Root invocation ID:** `AD-TA-PREFLIGHT-20260809`. **Reopen trigger:** browser site computation or
harness certificate topology changes.

### PF-026: Recovery non-exposure wording contradicted intended delivery 🟠 MAJOR

**Iteration 2 evidence:** a token/code must reach the intended synthetic mailbox, making “never
exposed” literally impossible. **Resolution:** MailHog for the intended synthetic recipient is the
only allowlisted delivery/verification channel; wrong mailbox, response, redirect, log, audit,
trace, report, referrer, and history exposure is prohibited, and retained evidence is redacted.

**Authority:** AI — delegated by `--auto-design`. **Eligibility:** security-test oracle precision
without changing product delivery behavior. **Rejected:** forbidding mailbox inspection, because it
would make the black-box journey untestable. **Strongest counterargument:** the allowlist must remain
complete as delivery channels evolve. **Confidence:** High. **Hardening:** risk auditor verified the
correction. **Policy version:** 1. **Root invocation ID:** `AD-TA-PREFLIGHT-20260809`.
**Reopen trigger:** a new recovery delivery or browser propagation channel is added.

### PF-027: Enumeration timing lacked independent acceptance authority 🟠 MAJOR

**Iteration 2 evidence:** a threshold chosen after measuring current Porta behavior would recreate
implementation-derived testing. **Resolution:** Phase 8 stops for product/security authority to
approve the hypothesis, material effect bound, sample-size/power, clock/environment controls, and
noise invalidation before measurement; absent authority blocks only the timing claim.

**Authority:** User-reserved product/security decision; the plan records the gate rather than
guessing. **Auto-design contribution:** selected the pre-measurement statistical mechanism inside
the approved policy boundary. **Rejected:** deriving tolerance from observed distributions, because
that can bless a timing leak. **Strongest counterargument:** the gate can delay one claim.
**Confidence:** High. **Hardening:** risk auditor verified the correction. **Policy version:** 1.
**Root invocation ID:** `AD-TA-PREFLIGHT-20260809`. **Reopen trigger:** an approved timing contract
or execution environment changes.

## Verdict

✅ **PREFLIGHT PASSED — all 27 findings resolved and verified.**

The plan is ready for `exec-plan`. It remains an assurance program, not a product-fix or exploit-
absence guarantee. Bulk/import/export semantics and enumeration timing deliberately stop at their
separate authority gates; affected claims remain blocked if those decisions are unavailable.

## Validation Evidence

- CodeOps plan parser: Ready, 92 tasks, seven mapped RDs, zero structural problems.
- Exact traceability check: 79 Must requirements, 79 unique rows, zero missing/duplicate/undefined/
  source-mismatched edges.
- Local Markdown links and Prettier: valid.
- Final `yarn verify`: passed (60 structure tests; 224 server files / 3,348 tests; 31 SDK files /
  404 tests; 29 CLI files / 355 tests; all lint, typecheck, and build tasks green). The first final
  attempt exposed one non-deterministic magic-link enumeration timing failure (`0.562` observed
  median ratio against the existing `0.5` threshold); the isolated five-case file and one complete
  visible retry passed. No assertion was changed or weakened.
- Iteration 2: five exact dimension clusters plus selected web, concurrent, and data lenses.
- Iteration 3: bounded correction/dependency verification; all residual Critical/Major findings fixed.
