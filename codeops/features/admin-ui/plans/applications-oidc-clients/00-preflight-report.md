# Preflight Report: Focused RD-04 Applications and OIDC Clients Plan

> **Status**: PASSED — all 10 findings resolved and verified; no new findings
> **Iteration**: 3 (bounded residual verification)
> **Previous Iteration**: 2 residual findings — PF-004 and PF-006
> **This Iteration**: 0 new findings
> **Carried Forward**: none
> **Artifact**: plan at codeops/features/admin-ui/plans/applications-oidc-clients/
> **Artifact Hash**: 3e3aa643acdac602bbe8674899691fce6a4c334a0b6b3161ba469a660237db78
> **Codebase Grounded**: 32 source, test, migration, configuration, and dependency files examined; 54 references verified
> **Last Updated**: 2026-08-30

> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk is
> elevated. Consider running preflight in a new session for maximum review independence.

## Codebase Context Summary

**Tech Stack:** Node.js 24 LTS, TypeScript ESM, Koa, oidc-provider, PostgreSQL, Redis, Yarn
Classic/Turbo, and JSVision 1.6.0.

**Architecture:** Global application administration and organization-scoped OIDC client
administration flow through server routes/services/repositories and public SDK/CLI packages. The
terminal UI composes session-bound feature controllers, Layout DSL views, DataGrids, and dialogs.

**Key Files Examined:** packages/server/src/routes/clients.ts,
packages/server/src/clients/secret-service.ts, packages/server/src/clients/secret-repository.ts,
packages/server/src/middleware/client-secret-hash.ts, packages/server/src/server.ts,
packages/server/src/middleware/token-rate-limiter.ts, packages/server/src/oidc/configuration.ts,
packages/server/src/lib/admin-permissions.ts, packages/server/migrations/013_client_secret_sha256.sql,
packages/cli/src/admin/application.ts, packages/cli/src/admin/session-service.ts,
packages/cli/src/admin/state.ts, SDK domains, Admin specifications, assurance registry, and installed
JSVision TabView, Scroller, DataGrid, and clipboard behavior.

Protocol claims were checked against [RFC 9700 section 2.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1)
and [RFC 6749 section 2.3.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-2.3.1).

## Summary by Dimension

|   # | Dimension                        | Findings | Highest Severity |
| --: | -------------------------------- | -------: | ---------------- |
|   1 | Ambiguities                      |        0 | —                |
|   2 | Implicit Assumptions             |        0 | —                |
|   3 | Missing Requirements             |        0 | —                |
|   4 | Traceability                     |        1 | 🟡 MINOR         |
|   5 | User Flows and Error Handling    |        1 | 🟡 MINOR         |
|   6 | Security and Privacy             |        3 | 🟠 MAJOR         |
|   7 | Testability                      |        2 | 🟠 MAJOR         |
|   8 | Dependencies and Integration     |        1 | 🟠 MAJOR         |
|   9 | Architecture and Maintainability |        1 | 🟠 MAJOR         |
|  10 | Scope Creep                      |        0 | —                |
|  11 | Data and Migration               |        0 | —                |
|  12 | Operational Readiness            |        0 | —                |
|  13 | Codebase Alignment               |        1 | 🟠 MAJOR         |

## Summary by Severity

| Severity       | Count | Status                    |
| -------------- | ----: | ------------------------- |
| 🔴 CRITICAL    |     0 | None                      |
| 🟠 MAJOR       |     7 | All resolved and verified |
| 🟡 MINOR       |     3 | All resolved and verified |
| 🔵 OBSERVATION |     0 | None                      |

---

### PF-001: Client dialog layout is incomplete at 48x12 🟠 MAJOR

**Dimension:** 9 — Architecture and Maintainability
**Location:** 00-ambiguity-register.md AR-3; 03-05-oidc-clients-workspace.md Client Configuration Dialog; 07-testing-strategy.md ST-52
**Codebase Evidence:** JSVision TabView does not scroll (node_modules/@jsvision/ui/dist/tabs/tab-view.d.ts:8-21); Scroller supplies the bounded viewport (node_modules/@jsvision/ui/dist/scroll/scroller.d.ts:1-12).
**The Problem:** AR-3 says DataGrid is used “only” for collection editors, literally excluding the
required application/client grids. The four-tab dialog also lacks scrolling and explicit
Add/Edit/Remove collection interaction, so controls can be clipped at 48x12.

**Options:**

| Option | Description                                                                                                                          | Pros                                                  | Cons                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------- |
| A      | Limit “only” to multi-value dialog editors; retain main grids; specify one feature-local vertical Scroller and explicit row actions. | Uses existing components and satisfies approved size. | Adds precise layout/focus rules. |

**Recommendation:** Option A — the only strict-scope solution; relaxing 48x12 or removing approved
grids would change RD-04.

**Confidence:** High. **Hardening:** Independently challenged; retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-002: Completion gates are not reproducible and catch OIDC regressions late 🟠 MAJOR

**Dimension:** 8 — Dependencies and Integration
**Location:** 07-testing-strategy.md:133-159; 99-execution-plan.md:71-78,221-228
**Codebase Evidence:** Exact test:ui, harness:test, assurance:harness, and assurance:compat commands
are registered; packages/server/tests/ui/flows/confidential-client.spec.ts covers the affected flow.
**The Problem:** “Focused” and “registered” selectors are placeholders. Phase 1 changes PKCE and
credential handling but defers black-box checks until the end. Clean-revision compatibility also
cannot qualify a no-commit execution.

**Options:**

| Option | Description                                                                                                                                              | Pros                                                  | Cons                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| A      | Add an exact command/phase table; run affected UI/OIDC black-box gates after Phase 1 and at completion; require ask/auto-commit for final qualification. | Reproducible; catches foundational regressions early. | Runs a few expensive gates twice. |
| B      | Add exact commands only at final completion and rely on Phase 1 provider specs.                                                                          | Faster Phase 1.                                       | Defers integration failures.      |

**Recommendation:** Option A — cheaper than discovering credential regressions after five dependent
phases. The user already authorized auto-commit.

**Confidence:** High. **Hardening:** Independently challenged; Option A retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-003: Admin production wiring and implementation ordering are missing 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment
**Location:** 03-03-admin-state-services.md:15-24,58-62; 99-execution-plan.md:112-139,202-224
**Codebase Evidence:** packages/cli/src/admin/state.ts:5-22 and session-service.ts:251-265 expose only
organization/user capabilities; application.ts:36-50 exposes only those operations and is 819 lines.
Existing controllers import concrete workspace/dialog contracts.
**The Problem:** Tasks omit application/client capability parsing, production SDK injection, and
session operations. Controllers precede their required view contracts, and Phase 6 would grow an
entrypoint already beyond the project split threshold.

**Options:**

| Option | Description                                                                                                                                    | Pros                                           | Cons                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| A      | Add production wiring specs/tasks; create only minimal feature-local view contracts before controllers; extract a small feature-wiring module. | Matches existing patterns without a framework. | Refines phase order.                                      |
| B      | Make controllers injection-only; add the same wiring and extraction.                                                                           | Preserves phase numbering.                     | Introduces a new controller pattern to preserve ordering. |

**Recommendation:** Option A — least new machinery. No full views move early and no generic
framework is introduced.

**Confidence:** High. **Hardening:** Independently challenged; Option A retained narrowly.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-004: Server authorization and secret lifecycle checks are incomplete 🟠 MAJOR

**Dimension:** 6 — Security and Privacy
**Location:** 03-01-server-safety-and-data.md:20-32,96-102; 99-execution-plan.md:55-74
**Codebase Evidence:** packages/server/src/routes/clients.ts:215-228 requires only client:create,
although require-permission.ts:31-52 supports AND checks. Secret generate/list at clients.ts:338-359
does not verify a confidential, non-revoked parent; secret-service.ts:58-79 inserts directly.
**The Problem:** RD-04 requires client:create plus app:read for creation. Direct API calls can also
operate on secrets for public/revoked clients despite advisory UI checks.

**Options:**

| Option | Description                                                                                                                                                                       | Pros                                                  | Cons                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| A      | Add immutable route/service cases; require both permissions; parent-qualify secret generate/list and enforce confidential/non-revoked state conditionally at the server boundary. | Closes API bypasses and races with existing patterns. | Focused route/service/repository work. |
| B      | Fix permission and use service reads immediately before secret operations.                                                                                                        | Smaller edit.                                         | Leaves a check/mutation race.          |

**Recommendation:** Option A — these are existing security invariants, not added multi-user
coordination; an existing transaction or conditional query is enough.

**Confidence:** High. **Hardening:** Independently challenged; Option A retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-005: Immutable specifications do not cover all approved behavior 🟠 MAJOR

**Dimension:** 7 — Testability
**Location:** 07-testing-strategy.md ST-12, ST-23, ST-35, ST-50 and ownership table; specification steps in 99-execution-plan.md
**Codebase Evidence:** Current SDK mappings and Admin mutation patterns require observable contract
coverage in the named SDK, CLI, and Admin specification suites.
**The Problem:** ST-12 combines a Phase 1 provider result with Phase 5 UI guidance. Core SDK/UI
mutation success/reload/failure paths, real-provider application lifecycle effects, exact approved
validation edges, and the finite affected CLI/control inventory are incomplete.

**Options:**

| Option | Description                                                                                                                                                        | Pros                                                    | Cons                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| A      | Split ST-12 by phase; add finite tables containing only approved boundary points, core mutations, runtime lifecycle effects, and exact existing commands/controls. | Objective specification-first gate; no invented matrix. | Adds several small cases.                           |
| B      | Keep broad statements and enumerate behavior only in implementation tests.                                                                                         | Shorter plan.                                           | Leaves the phase contradiction and mutable oracles. |

**Recommendation:** Option A — a bounded list of approved behavior, not generalized or combinatorial
testing.

**Confidence:** High. **Hardening:** Independently challenged; Option A retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-006: Secret verification work is unbounded 🟠 MAJOR

**Dimension:** 6 — Security and Privacy
**Location:** 00-ambiguity-register.md:36-42; 03-01-server-safety-and-data.md:56-74; 99-execution-plan.md:68-74
**Codebase Evidence:** secret-repository.ts:105-119 returns every active Argon2 hash and
secret-service.ts:125-168 verifies them sequentially. Secret generation is unbounded at
routes/clients.ts:338-348. The early limiter normally lacks parsed client ID
(server.ts:417-421; token-rate-limiter.ts:80-95). Migration 013 already adds indexed SHA-256.
**The Problem:** One invalid token request can trigger N Argon2 operations, where N is an unenforced
administrator-controlled count, creating a CPU/worker-pool exhaustion path.

**Options:**

| Option | Description                                                                                                                                                  | Pros                                                               | Cons                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- |
| A      | Match modern secrets by indexed SHA-256; retain bounded legacy fallback; keep the early limiter; add a parsed-client computational guard after body parsing. | Bounds work while preserving modern overlap and legacy transition. | One focused guard and legacy bound.                     |
| B      | Cap all active secrets and retain the Argon2 loop.                                                                                                           | Simpler verifier.                                                  | New product limit; may break rotations.                 |
| C      | Use indexed SHA plus bounded legacy fallback, retaining only the IP limiter.                                                                                 | Smaller middleware edit.                                           | Does not bound distributed work against a known client. |

**Recommendation:** Option A — reuses existing data and bounds only expensive authentication work;
it adds no UI pagination, generalized subsystem, or locking.

**Confidence:** High. **Hardening:** Independently challenged against expected-small-count usage;
Option A retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-007: The plan adds an unsafe, unapproved plaintext Copy journey 🟠 MAJOR

**Dimension:** 6 — Security and Privacy
**Location:** 00-index.md:40-45; 03-03-admin-state-services.md:46-56; 99-execution-plan.md:250-256
**Codebase Evidence:** application.ts:175-184 disables the system clipboard, but JSVision retains
copied Input text in its local clipboard (event-loop.js:128-132,559-574).
**The Problem:** RD-04 authorizes one-time display, not a Copy action. Copying from an Input can
leave the secret pasteable inside the app after dismissal, contradicting synchronous disposal.

**Options:**

| Option | Description                                                                              | Pros                                             | Cons                                                                |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| A      | Remove the Copy promise and render plaintext in a bounded, non-editable view.            | Approved scope; no JSVision clipboard retention. | Copy uses terminal selection rather than an app action.             |
| B      | Add direct host copy that bypasses JSVision and document external clipboard persistence. | Convenient.                                      | New security-sensitive behavior requiring separate scope authority. |

**Recommendation:** Option A — the only in-scope resolution.

**Confidence:** High. **Hardening:** Independently challenged; Option A retained.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-008: ST-14 lacks a lean deterministic race test 🟡 MINOR

**Dimension:** 7 — Testability
**Location:** 07-testing-strategy.md:41,111-120; 99-execution-plan.md:59-74
**Codebase Evidence:** client-secret-hash.ts:43-79 transforms and immediately calls downstream
middleware; no production barrier exists.
**The Problem:** A real-provider test cannot reliably revoke at the exact validation/provider handoff
without timing-dependent orchestration.

**Options:**

| Option | Description                                                                                                                                             | Pros                                 | Cons                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| A      | Add a dependency-injected test barrier.                                                                                                                 | Precise provider interleaving.       | Production seam solely for a permitted race. |
| B      | Test exact interleaving in focused middleware integration using deferred dependencies; make the real-provider suite prove subsequent-request rejection. | Deterministic; no product test hook. | Precise race is below full-provider level.   |

**Recommendation:** Option B — AR-8 permits the in-flight request to finish, so a production hook is
disproportionate.

**Confidence:** High. **Hardening:** Independently challenged; downgraded from Major to Minor and
recommendation changed to Option B.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-009: Error tables cite the wrong requirement authority 🟡 MINOR

**Dimension:** 4 — Traceability
**Location:** 03-01-server-safety-and-data.md:85-94; 03-03-admin-state-services.md:64-73; workspace error tables
**Codebase Evidence:** RD-04 acceptance/security clauses own validation, retention, authorization,
and nested-resource behavior; AR-1/AR-2 own scope and architecture only.
**The Problem:** Several rows cite AR-1/AR-2 as if they define product behavior, sending future
reviewers to the wrong authority.

**Options:**

| Option | Description                                                                                          | Pros                   | Cons             |
| ------ | ---------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| A      | Replace incorrect AR references with owning RD-04 clauses; retain ARs only for plan-local decisions. | Accurate traceability. | Mechanical edit. |

**Recommendation:** Option A — the only accurate correction.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

### PF-010: The tabbed client dialog has no entry-tab rule 🟡 MINOR

**Dimension:** 5 — User Flows and Error Handling
**Location:** 03-05-oidc-clients-workspace.md:27-45; 07-testing-strategy.md ST-41–ST-44
**Codebase Evidence:** JSVision TabView uses a caller-owned active index and preserves mounted state
(tab-view.d.ts:8-21,42-45), so the initial tab must be chosen.
**The Problem:** The plan does not state which tab opens from Create or each detail action.

**Options:**

| Option | Description                                                                                                               | Pros                                        | Cons                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| A      | Create opens Basic; Basic, Redirects, Protocol, and Login detail actions open the matching tab; Secrets remains separate. | Familiar and deterministic; no new surface. | Small controller mapping.       |
| B      | Every entry opens Basic.                                                                                                  | Simplest state rule.                        | Detail actions become indirect. |

**Recommendation:** Option A — takes the operator directly to the named section.

**User Decision:** Resolved — User accepted the recommendation on 2026-08-30.

## Re-scan Verification

| Finding | Result | Verification                                                                                                                                                                  |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001  | PASS   | Natural-table grids retained; client tabs use the feature-local Scroller and explicit row actions at 48x12.                                                                   |
| PF-002  | PASS   | Exact phase/final commands, early OIDC gates, and clean-commit compatibility ownership are stated.                                                                            |
| PF-003  | PASS   | Capability/session/SDK wiring and minimal controller contracts precede controllers; shell wiring is extracted feature-locally.                                                |
| PF-004  | PASS   | Client create requires both permissions; secret list/generate/revoke require a confidential, non-revoked parent.                                                              |
| PF-005  | PASS   | Phase ownership, exact boundaries, core mutations, runtime lifecycle, CLI commands, and controls have finite immutable oracles.                                               |
| PF-006  | PASS   | Modern matching is indexed; supported active secrets are capped at 10; legacy work has exact request/process/Redis bounds; throttling is 429 rather than invalid credentials. |
| PF-007  | PASS   | No application Copy journey remains; plaintext uses only a non-editable transient warning view.                                                                               |
| PF-008  | PASS   | Exact handoff behavior is owned by middleware integration; real-provider coverage proves later-request rejection.                                                             |
| PF-009  | PASS   | Error tables cite owning RD clauses; ARs remain only for plan-local decisions.                                                                                                |
| PF-010  | PASS   | Create and focused detail actions deterministically select the correct tab.                                                                                                   |

## Adversarial Review Notes

- The creation-time assumption most likely to have been self-confirmed was that bounded credential
  length also bounded verification work; it does not bound the number of hashes processed.
- No RD-05, RD-08, RD-09, generalized UI framework, search/pagination UI, runtime matrix, polling,
  persistent cache, or multi-operator UI locking was added by this scan. The only database row lock
  is the short transaction enforcing the accepted active-secret security bound.
- Because this plan changes OIDC client authentication, consider a human identity/security expert
  review in addition to this automated preflight.
