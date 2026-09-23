## Preflight Report: Selective Environment Portability Plan — Iteration 2

> **Status**: PASSED — CLEAN
> **Previous Iteration**: 13 findings — all resolved and verified
> **This Iteration**: 0 new findings
> **Carried Forward**: None
> **Artifact**: plan at `codeops/features/production-readiness/plans/selective-environment-portability/`
> **Artifact SHA-256 at scan start**: `66b25633d969a07334d2c8b6195b5870da517b786d6cafcd9be366c670c4e707`
> **Executable plan SHA-256 after fixes**: `dc1d5accca202eed94034785702bb6bc8a9e32390fbc26624c820ac952979d68`
> **Corrected RD-02 SHA-256 after fixes**: `5058fdb9e0e85c0b9f2beddc20f8f636f7a247542d9a3c770ea7736052db72dc`
> **Git revision**: `df19ceb519e6651769b17931ddd4c72f9ce04759`
> **Codebase Grounded**: 39+ source, test, configuration, and documentation files examined; 70+ references verified
> **Last Updated**: 2026-09-13

> **Same-session review warning:** The reviewing agent helped create this plan in the current session.
> Independent clustered audits covered all 13 dimensions, and one separate challenger reviewed the
> complete MAJOR finding batch before recommendations were recorded.

### Codebase Context Summary

**Tech Stack:** Node.js 24 LTS, TypeScript ESM, Koa, Zod, PostgreSQL, Redis, Yarn Classic/Turbo,
and the JSVision terminal UI.

**Architecture:** Koa routes call focused server modules over request-owned PostgreSQL transactions
and post-commit Redis effects. The SDK wraps one shared transport. Conventional CLI commands and the
embedded Admin UI consume the SDK through existing command and controller patterns.

**Key Files Examined:** `packages/server/src/server.ts`, `packages/server/src/routes/imports.ts`,
`packages/server/src/routes/exports.ts`, `packages/server/src/lib/database.ts`,
`packages/server/src/lib/authority-revocation.ts`, `packages/server/src/lib/deletion-cleanup.ts`,
the organization/application/user/client/RBAC route validators, SDK transport/domain/client/agent
surfaces, CLI command/error handling, Admin UI session/application/dialog helpers, direct unit and
integration tests, assurance consumers, package READMEs, and repository structure tests.

### Iteration 1 Summary by Dimension

|   # | Dimension                     | Findings | Highest Severity |
| --: | ----------------------------- | -------: | ---------------- |
|   1 | Ambiguities                   |        3 | 🟠 MAJOR         |
|   2 | Implicit Assumptions          |        1 | 🟠 MAJOR         |
|   3 | Logical Contradictions        |        2 | 🟠 MAJOR         |
|   4 | Completeness                  |        1 | 🟠 MAJOR         |
|   5 | Testability                   |        1 | 🟡 MINOR         |
|   6 | Feasibility                   |        0 | —                |
|   7 | Maintainability               |        0 | —                |
|   8 | Security Blind Spots          |        1 | 🟠 MAJOR         |
|   9 | Edge Cases                    |        0 | —                |
|  10 | Non-functional Requirements   |        0 | —                |
|  11 | Observability and Operability |        0 | —                |
|  12 | Consistency                   |        2 | 🟡 MINOR         |
|  13 | Codebase Alignment            |        2 | 🟠 MAJOR         |

### Summary by Severity

| Severity    | Count | Status                    |
| ----------- | ----: | ------------------------- |
| CRITICAL    |     0 | None                      |
| MAJOR       |     7 | All resolved and verified |
| MINOR       |     6 | All resolved and verified |
| OBSERVATION |     0 | None                      |

---

### Iteration 2 Bounded Re-scan

| Finding | Verification result                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PF-001  | ST-1 now owns required UTC RFC 3339 `exported_at`; ST-16 excludes only database/record timestamps.                                  |
| PF-002  | RD/API plan now defines every exact body and request-ID/log rule; SDK methods return the validated exact 409 rejected-plan result.  |
| PF-003  | RD, engine, and ST-27 define aggregate relationship counts/actions and reject empty permission lists.                               |
| PF-004  | RD, Admin UI design, and ST-52 define authorized initial tab and inert unauthorized-tab state.                                      |
| PF-005  | Phase 3/4 tasks enumerate direct server, SDK, CLI, assurance, package-doc, tsconfig, and conditional dependency retirement.         |
| PF-006  | Server contract has a per-record validation-source table and Phase 1 owns only bounded shared-field extraction.                     |
| PF-007  | RD, route design, tasks, and ST-5/ST-6 cover every router-accepted import path variant.                                             |
| PF-008  | Schema, route, engine, workspace, and application specification ownership is consistent in every plan document.                     |
| PF-009  | Admin UI design, task, and ST-63 promise local ownership cancellation and ignored late results, not server-side apply cancellation. |
| PF-010  | The existing selectable input is unchanged reuse; secret presentation points to `client-dialogs.ts` and is sequential.              |
| PF-011  | Unmeasured percentages and unowned E2E claims were replaced with the focused evidence already scheduled.                            |
| PF-012  | CLI synopsis and prose both make application flags conditional on application-related categories.                                   |
| PF-013  | AR-7 has one merged resolution note.                                                                                                |

All 13 dimensions were re-examined against the corrected artifact and direct dependency surface.
No regression or independent new root cause was found. Formatting, local Markdown links, 60 unique
task identifiers, ST-1–ST-63 continuity, `git diff --check`, and all 104 repository structure tests
passed.

---

### PF-001: Root export timestamp contradicts the no-timestamp oracle 🟠 MAJOR

**Dimension:** Logical Contradictions
**Location:** `07-testing-strategy.md`, ST-1 and ST-16; RD-02 Manifest Schema Contract
**Codebase Evidence:** This is an artifact contradiction; no implementation evidence is needed.
**The Problem:** ST-1 requires the complete manifest, including root `exported_at`, while ST-16
literally forbids every timestamp. Both immutable expectations cannot pass.

**Options:**

| Option | Description                                                                                         | Pros                                                      | Cons                                                             |
| ------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| A      | Change ST-16 to forbid database/record timestamps and separately assert UTC RFC 3339 `exported_at`. | Preserves the approved schema and makes both tests exact. | Small test-text edit.                                            |
| B      | Remove `exported_at` from the manifest.                                                             | Removes the contradiction.                                | Reopens the approved RD schema and loses useful export metadata. |

**Recommendation:** Option A — it corrects only the test wording and preserves the approved contract.

**Confidence:** High. **Hardening:** Independent challenger agreed; no broader schema change is needed.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-002: Public error and correlation contract is not exact 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-01-server-contract.md`, Correlation and Error Mapping; `03-03-sdk-cli.md`, Error Handling; `07-testing-strategy.md`, ST-8 and ST-31
**Codebase Evidence:** `packages/server/src/routes/imports.ts:57-75`,
`packages/server/src/routes/exports.ts:91-104`,
`packages/server/src/middleware/request-logger.ts:49-59`, and
`packages/cli/src/error-handler.ts:178-186`
**The Problem:** The plan promises stable 400/409/503 responses but leaves the export-validation
code, 409 result envelope, 503 code, and correlation-ID presence undefined. The CLI text also calls
the existing formatter safe even though verbose mode prints the parsed response body. Safety must
come from an exact, content-free server envelope and correlated safe log entry.

**Options:**

| Option | Description                                                                                                                                                                           | Pros                                                          | Cons                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A      | Add one exact status/code/body table, define how 409 carries the safe result, reuse `X-Request-Id`, require one matching content-free 503 log, and test normal and verbose consumers. | Deterministic, observable, and reuses the current request ID. | Requires a small RD and plan clarification.                            |
| B      | Keep the current generic wording and let route implementations choose bodies.                                                                                                         | No document edits.                                            | Preserves incompatible route behavior and makes immutable tests guess. |

**Recommendation:** Option A — it closes the public and operational contract without a new correlation system.

**Confidence:** High. **Hardening:** Independent challenger rejected a second correlation mechanism as unnecessary.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-003: Aggregate role-permission result semantics are undefined 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** RD-02 Result Contract and `role_permission_mappings`; `03-02-portability-engine.md`, Mutation-Free Plan; `07-testing-strategy.md`, ST-27–ST-30
**Codebase Evidence:** The ambiguity is in the approved wire contract rather than current implementation.
**The Problem:** One manifest mapping contains several permission edges but one result item has one
action. When some edges already exist and others are added, neither `created` nor `skipped` alone is
truthful. Empty permission lists are also undefined.

**Options:**

| Option | Description                                                                                                                                                          | Pros                                              | Cons                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| A      | Keep aggregate manifest records; count manifest records and define mapping action as skipped/all existing, created/none existing, updated/mixed; reject empty lists. | Smallest change; preserves the approved manifest. | `updated` means additive completion for this relationship record. |
| B      | Emit and report one manifest record per permission edge.                                                                                                             | Every edge has an obvious action.                 | Changes the approved schema and creates much larger manifests.    |

**Recommendation:** Option A — it resolves partial pre-existence without redesigning the format.

**Confidence:** High. **Hardening:** Independent challenger confirmed the mixed-edge case and the empty-list rule.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-004: Export-only and import-only Admin UI behavior is undefined 🟠 MAJOR

**Dimension:** Completeness
**Location:** `03-04-admin-ui.md`, Menu and Workspace, Export Tab, and Import Tab; `07-testing-strategy.md`, ST-52–ST-56
**Codebase Evidence:** `packages/cli/src/admin/session-service.ts:296-340` derives fixed capabilities,
and the existing Admin menu uses capability-driven enablement.
**The Problem:** The menu opens when either operation is allowed, but the plan always shows both
tabs and does not define the initial tab or the behavior of an unauthorized tab. Implementers could
accidentally allow local file access or SDK dispatch for an operation the user cannot perform.

**Options:**

| Option | Description                                                                                                                                                        | Pros                                           | Cons                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| A      | Keep both tabs, select the first authorized tab (Export when both), and show a fixed permission-required state with no file or SDK action on the unauthorized tab. | Preserves AR-3 and makes partial access clear. | Adds two small capability cases.                                 |
| B      | Hide unauthorized tabs.                                                                                                                                            | Prevents access and reduces controls.          | The workspace changes shape by user and weakens discoverability. |

**Recommendation:** Option A — it is explicit, stable, and requires no extra workspace or authorization layer.

**Confidence:** High. **Hardening:** Independent challenger confirmed that separate workspaces would be unnecessary.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-005: Legacy retirement impact inventory is incomplete 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `03-03-sdk-cli.md`, Proposed Changes and Documentation Cleanup; `99-execution-plan.md`, Phase 3 and Phase 4
**Codebase Evidence:** Direct consumers remain in `packages/sdk/src/agent.ts:559-565`,
`packages/sdk/tests/client/client.test.ts:39-42`, `packages/sdk/tests/domains/imports.test.ts:16-36`,
`packages/server/tests/unit/admin/administrative-data-production-driver.ts:37-40`,
`packages/server/tests/unit/contracts/sdk-imports-contract.test.ts:12-23`,
`packages/server/tests/unit/clients/protocol-compatibility.spec.test.ts:45-46`,
`test-harness/consumers/admin-data-sdk-probe.mjs:15-23`, `packages/cli/README.md:206-213`,
`packages/sdk/README.md:139-142`, `packages/sdk/tests/type-contracts/tsconfig.json:12-19`, and
`packages/cli/package.json:35`.
**The Problem:** Removing the old importer, SDK method, and CLI command will break current compile,
test, and assurance consumers or leave stale public documentation. The new SDK type-contract test
will not be compiled by its explicit tsconfig. The CLI `yaml` dependency may become unused.

**Options:**

| Option | Description                                                                                                                                                                                                                                                        | Pros                                                                       | Cons                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A      | Extend the existing retirement tasks to cover all direct `rg`-found consumers, migrate still-valid security assertions and the `admin-data` assurance probe, register the type-contract test, update package READMEs, and remove `yaml` only if no import remains. | Makes the stated verification gates achievable without compatibility code. | Longer explicit file inventory.                                          |
| B      | Keep a legacy compatibility shim and its tests/dependency.                                                                                                                                                                                                         | Reduces immediate consumer edits.                                          | Contradicts the approved direct-v1 replacement and leaves two contracts. |

**Recommendation:** Option A — it completes already-approved retirement work and adds no product scope or abstraction.

**Confidence:** High. **Hardening:** Independent challenger verified representative compile, assurance, documentation, and dependency consumers.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-006: “Ordinary validators” are not a reusable boundary today 🟠 MAJOR

**Dimension:** Implicit Assumptions
**Location:** `03-01-server-contract.md`, Public Types and Schemas; `03-02-portability-engine.md`, Integration Points; `99-execution-plan.md`, tasks 1.2.1 and 3.2.1
**Codebase Evidence:** Full input schemas are private route constants in
`packages/server/src/routes/organizations.ts:46-82`, `applications.ts:44-88`,
`users.ts:54-116`, and `clients.ts:110-162`; reusable primitives exist in
`packages/server/src/rbac/slugs.ts`, `packages/server/src/clients/validators.ts`, and
`packages/server/src/custom-claims/validators.ts`.
**The Problem:** The plan says portability delegates to ordinary validators, but there is no
uniform exported validator boundary. Direct SQL writers cannot simply call ordinary mutation
services because those services have side effects and per-record audit behavior.

**Options:**

| Option | Description                                                                                                                                                                      | Pros                                        | Cons                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| A      | Add a per-record validation-source table; reuse exported primitives and extract only shared field schemas that both routes and portability need, with focused equivalence tests. | One source of truth without a framework.    | Touches a few existing route modules.          |
| B      | Duplicate every constraint in the portability schema and add cross-contract tests.                                                                                               | Fewer production modules touched initially. | Violates DRY and creates permanent drift risk. |

**Recommendation:** Option A — bounded extraction is the smallest durable solution; no validator registry or generalized framework is justified.

**Confidence:** High. **Hardening:** Independent challenger confirmed the missing boundary and rejected a generalized abstraction.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-007: Import parser exclusion does not cover accepted route aliases 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-01-server-contract.md`, Routes and Body Parsing; `07-testing-strategy.md`, ST-5 and ST-6; `99-execution-plan.md`, tasks 1.2.3–1.2.5
**Codebase Evidence:** The global parser runs before routes at `packages/server/src/server.ts:150-170`;
the current import route is prefix plus `/` at `packages/server/src/routes/imports.ts:40-48`;
`@koa/router` currently accepts a trailing slash and case variants.
**The Problem:** Excluding only the literal canonical path can leave an accepted alias on the
unauthenticated 100 KiB parser. Authentication/body-limit behavior would then depend on path spelling.

**Options:**

| Option | Description                                                                                                                                       | Pros                                            | Cons                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| A      | Make the exclusion predicate match the router's actual POST path set and parameterize ST-5/ST-6 for canonical, trailing-slash, and case variants. | One predicate and focused tests; no middleware. | Must track the existing router matching rule.            |
| B      | Make the route strict and case-sensitive and reject aliases.                                                                                      | Shrinks the accepted route set.                 | Changes routing behavior and touches more configuration. |

**Recommendation:** Option A — it preserves current routing while enforcing one protected parser boundary.

**Confidence:** High. **Hardening:** Independent challenger reproduced the router aliases and rejected generic path-normalization middleware.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-008: Specification test ownership conflicts across documents 🟡 MINOR

**Dimension:** Consistency
**Location:** `03-01-server-contract.md`, Testing Requirements; `07-testing-strategy.md`, Specification Tests; `99-execution-plan.md`, tasks 1.1.1–1.1.2, 3.1.1, and 5.1.1–5.1.2
**Codebase Evidence:** Existing tests separate route, domain, workspace, and application lifecycle concerns.
**The Problem:** ST-25–ST-29 and ST-63 have different owners in different plan documents, making red/green selectors ambiguous.

**Options:**

| Option | Description                                                                                                                                  | Pros                                            | Cons                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| A      | Use one mapping everywhere: schema ST-1–4; routes ST-5–10 and ST-22–24; engine ST-11–21 and ST-25–37; workspace ST-52–62; application ST-63. | Matches current separation and execution tasks. | Editorial updates in two documents. |

**Recommendation:** Option A — it is the only viable correction consistent with the planned files; combining suites was rejected as unnecessary.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-009: Admin cancellation promises more than the current contract can guarantee 🟡 MINOR

**Dimension:** Ambiguities
**Location:** `03-04-admin-ui.md`, State and Cancellation; `07-testing-strategy.md`, ST-63; `03-03-sdk-cli.md`, SDK Types and Methods
**Codebase Evidence:** `packages/sdk/src/transport/types.ts:44-45` supports `AbortSignal`, but current
domain methods do not expose it and existing Admin adapters mainly ignore late results, for example
`packages/cli/src/admin/client-service.ts:602-613`.
**The Problem:** “Request is aborted” is absent from the planned SDK signatures and could imply that
a mutating apply was cancelled server-side even though aborting the client connection cannot guarantee that.

**Options:**

| Option | Description                                                                                                                                                         | Pros                                  | Cons                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| A      | Match the existing Admin pattern: cancel controller ownership, ignore late results, perform no retry, and never claim an in-flight apply was cancelled server-side. | Smallest and truthful for mutations.  | The server request may finish after the view closes.                              |
| B      | Add optional signals to all three SDK methods and abort their HTTP requests.                                                                                        | Saves client work for export/preview. | Still cannot guarantee apply cancellation and expands the public method contract. |

**Recommendation:** Option A — it is the simpler and more accurate single-operator behavior.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-010: Admin UI tasks point at the wrong or already-existing helpers 🟡 MINOR

**Dimension:** Codebase Alignment
**Location:** `99-execution-plan.md`, tasks 5.2.2–5.2.3; `03-04-admin-ui.md`, Integration Points
**Codebase Evidence:** `packages/cli/src/admin/selectable-read-only-input.ts:12-26` already exists;
the one-time secret presenter is in `packages/cli/src/admin/client-dialogs.ts:272-309`, while
`packages/cli/src/admin/client-credential-dialogs.ts:213-268` owns the Add-secret form.
**The Problem:** The task inventory makes an existing helper look new and names the wrong dialog file
for one-time-secret presentation. The current presenter also accepts one secret and a client name,
while portability may return several credentials identified by Client ID.

**Options:**

| Option | Description                                                                                                                                                                                          | Pros                                 | Cons                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| A      | Mark the selectable input as unchanged reuse and point secret presentation at `client-dialogs.ts`, adapting it or adding one portability-local sequential presenter for the exact credential result. | Correct ownership and minimal reuse. | Requires a small multiple-secret presentation decision during implementation. |

**Recommendation:** Option A — it is the only viable correction; changing the Add-secret form would mix responsibilities.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-011: Test strategy promises evidence that no task produces 🟡 MINOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md`, Coverage Goals and End-to-End Tests; `99-execution-plan.md`, all verification gates
**Codebase Evidence:** Workspace coverage commands exist, but the plan schedules none. The current
`admin-data` assurance path is an SDK probe, not a conventional CLI or terminal UI E2E harness.
**The Problem:** Numeric 90/80/60 coverage targets are unmeasured, and two scenarios labeled E2E have
no execution owner. Adding broad coverage and new harness machinery is not justified by this feature.

**Options:**

| Option | Description                                                                                                                                                                     | Pros                                            | Cons                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| A      | Remove the percentages and relabel the two rows as covered by the planned live server round trip, SDK compatibility check, mocked CLI workflow, and headless Admin UI workflow. | Makes evidence honest without adding machinery. | Gives up arbitrary numeric targets.                 |
| B      | Add coverage enforcement and two new cross-process E2E harnesses.                                                                                                               | Measures the literal promises.                  | Significant work with no demonstrated risk benefit. |

**Recommendation:** Option A — behavioral ST coverage is the proportionate gate.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-012: Export CLI synopsis makes a conditional selector unconditional 🟡 MINOR

**Dimension:** Logical Contradictions
**Location:** `03-03-sdk-cli.md`, Export Command
**Codebase Evidence:** yargs will encode the chosen conditional validation, so the synopsis must match it.
**The Problem:** The displayed command requires an application selector for every export, while the
following prose requires it only for application-related categories.

**Options:**

| Option | Description                                                                                     | Pros                                   | Cons                    |
| ------ | ----------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| A      | Mark the application selector group as conditional in the synopsis and keep the existing prose. | Preserves the approved category rules. | One documentation edit. |

**Recommendation:** Option A — it is the only viable fix that matches the approved request contract.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-013: AR-7 resolution note is duplicated 🟡 MINOR

**Dimension:** Consistency
**Location:** `00-ambiguity-register.md`, resolution notes after the decision table
**Codebase Evidence:** Not applicable; this is a document-label defect.
**The Problem:** Two separate notes use the AR-7 label, weakening the register's traceability.

**Options:**

| Option | Description                                                | Pros                                                   | Cons                |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------- |
| A      | Merge the second note into the first AR-7 resolution note. | Restores one decision record without changing meaning. | One editorial edit. |

**Recommendation:** Option A — it is the only correction that preserves the recorded decision.

**User Decision:** Resolved — User accepted recommendation: Option A.

---

### Overall Assessment

The approved architecture is feasible and proportionate. The scan found no reason to add workers,
compatibility layers, streaming, concurrency control, generalized validation frameworks, broad
logout, or new infrastructure. Every approved correction is applied and verified; the plan is ready
for execution.
