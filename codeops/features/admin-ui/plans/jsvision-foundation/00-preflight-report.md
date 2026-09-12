## Preflight Report: JSVision Admin Foundation

> **Status**: ✅ PREFLIGHT PASSED — all 22 accepted findings are closed; iteration-2 re-scan is clean
> **Iteration**: 2 (accepted-fix verification re-scan)
> **Artifact**: Full implementation plan at `codeops/features/admin-ui/plans/jsvision-foundation/`
> **Artifact Revision**: Aggregate SHA-256 `7e6d3317bd405a6a0dd394065ab0520bab9da4637244f4bd9c69b9a44528176d` for the corrected RD and plan documents, excluding this report and continuity notes
> **Codebase Grounded**: 10 plan documents and more than 35 source, test, manifest, configuration, Docker, harness, and policy files examined; all named repository paths and relative document links verified
> **Last Updated**: 2026-08-27

### Audit Boundaries

- **Audit target:** the complete JSVision foundation plan document set.
- **Authorized scope:** reclassified `admin-ui/RD-01` as frozen by AR-1 through AR-46; strict scope mode.
- **Context only:** the current Porta monorepo, its CodeOps policy, and applicable OIDC behavior.
- **Modification set:** the authoritative RD, plan documents, execution ordering, report, and feature roadmap; no production code.

### Codebase Context Summary

**Tech Stack:** Node.js 22+, TypeScript ESM, Yarn Classic/Turbo, Koa, `oidc-provider`, PostgreSQL, Redis, Docker Compose, Vitest, and Playwright.

**Architecture:** a public identity server with organization-scoped OIDC issuers, a public SDK, and an administrative CLI. The plan adds a JSVision terminal shell, shared CLI authentication, refresh persistence, and an isolated local Compose playground.

**Key Files Examined:** CLI browser flow, metadata, PKCE, credential store, client factory, login/GUI command registration, SDK CLI auth and transport, server metadata/OIDC/bootstrap initialization, migration seed data, root/package verification scripts, Docker/harness/assurance configuration, roadmap/layout policy, and affected tests.

**Selected domain lenses:** web application; distributed/concurrent system; data lifecycle/migration.

### Iteration 1 Summary by Dimension

|   # | Dimension              | Findings | Highest Severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        4 | 🟠 Major         |
|   2 | Implicit Assumptions   |        1 | 🟡 Minor         |
|   3 | Logical Contradictions |        1 | 🟠 Major         |
|   4 | Completeness Gaps      |        2 | 🟠 Major         |
|   5 | Dependency Issues      |        1 | 🟠 Major         |
|   6 | Feasibility Concerns   |        1 | 🟡 Minor         |
|   7 | Testability            |        3 | 🟠 Major         |
|   8 | Security Blind Spots   |        2 | 🟠 Major         |
|   9 | Edge Cases             |        2 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        1 | 🟠 Major         |
|  12 | Consistency            |        2 | 🟡 Minor         |
|  13 | Codebase Alignment     |        2 | 🟠 Major         |

### Iteration 1 Summary by Severity

| Severity       | Count | Status       |
| -------------- | ----: | ------------ |
| 🔴 CRITICAL    |     0 | None         |
| 🟠 MAJOR       |    16 | All resolved |
| 🟡 MINOR       |     6 | All resolved |
| 🔵 OBSERVATION |     0 | None         |

---

### PF-001: OIDC Identity Has No Subject-Continuity Invariant 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-02-authentication-and-credentials.md`, ID-Token Verification and Selected-Server Binding; `07-testing-strategy.md`, ST-02, ST-10, and ST-18
**Codebase Evidence:** `packages/cli/src/auth/browser-flow.ts:250-269` currently maps a missing subject to an empty string.
**The Problem:** A signature-valid ID token can establish one identity while schema-valid UserInfo or a refreshed ID token supplies another. OIDC requires the UserInfo `sub` to exactly match the ID-token `sub`; mismatch must be rejected. See [OIDC Core UserInfo validation](https://openid.net/specs/openid-connect-core-1_0-final.html#UserInfoResponse).

**Options:**

| Option | Description                                                                                                                 | Pros                                      | Cons                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| A      | Require UserInfo and every accepted refreshed ID token to match the original validated `sub`; add immutable mismatch tests. | Exact identity binding; standards-aligned | Adds explicit state to the coordinator |

**Recommendation:** Option A — it is the only secure resolution; merely validating each payload independently does not bind the identities.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-002: Playground Organization Conflicts With Fixed Bootstrap Data 🟠 MAJOR

**Dimension:** Dependency Issues
**Location:** `03-03-admin-playground.md:40-49`
**Codebase Evidence:** `packages/server/src/cli/commands/init.ts:275-282,412-419`; `packages/server/migrations/011_seed.sql:7-10` select and seed `porta-admin`, not `porta-admin-playground`.
**The Problem:** The planned issuer cannot be produced by the unchanged bootstrap command, so the live playground contract is not executable.

**Options:**

| Option | Description                                                                               | Pros                                     | Cons                                                                 |
| ------ | ----------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| A      | Use the existing `porta-admin` organization and display name.                             | Smallest; preserves bootstrap invariants | Less playground-specific issuer path                                 |
| B      | Expand server bootstrap and migration behavior to create/select the planned organization. | Keeps planned naming                     | Broad, security-sensitive server change outside the modification set |

**Recommendation:** Option A — preserve the established super-admin bootstrap invariant.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-003: Hard GUI Replacement Omits Existing Server Guidance 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `01-requirements.md`, AF-01/AC-02; `99-execution-plan.md`, Phase 2 modification set
**Codebase Evidence:** `packages/server/src/cli/commands/init.ts:191-204` still prints `porta gui`; its tests cover this output, and `AGENTS.md:58` says the command is intentionally retained.
**The Problem:** Execution can satisfy the listed CLI removals while the product and project guidance still direct users to the removed command.

**Options:**

| Option | Description                                                                                            | Pros                                     | Cons                                          |
| ------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| A      | Add server init output/specification updates and refresh project guidance through its owning workflow. | Completes the confirmed hard replacement | Expands the direct modification list slightly |

**Recommendation:** Option A — it is the only option consistent with AR-3 without weakening the requirement.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-004: Fixed Compose Identity Contradicts Disposable Test Isolation 🟠 MAJOR

**Dimension:** Logical Contradictions
**Location:** `03-03-admin-playground.md:24,49-51,103-109`; `99-execution-plan.md:171`
**Codebase Evidence:** Existing retained harness isolation uses its own Docker ownership and cleanup boundary under `test-harness/`.
**The Problem:** Tests promise a distinct disposable project, but the lifecycle contract fixes one non-overridable project identity. Running both against one daemon can collide with a developer's retained playground.

**Options:**

| Option | Description                                                                                                   | Pros                                                 | Cons                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| A      | Run the exact fixed project in an isolated Docker daemon/context.                                             | Preserves the production-like contract and allowlist | Heavier CI/runtime setup                                |
| B      | Add a private test-only namespace with independently derived exact allowlists, unavailable to the public CLI. | Lighter CI isolation                                 | Adds lifecycle policy and destructive-target complexity |

**Recommendation:** Option A — it keeps destructive ownership identical to the behavior under test.
**Confidence:** Medium. **Hardening:** Challenger upheld the defect but found both options viable; user choice is consequential.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-005: “Governed Outcomes” Can Admit Ordinary Gate Failures 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `07-testing-strategy.md:130-137`; `99-execution-plan.md:232-240`
**Codebase Evidence:** `package.json` exposes ordinary zero-success gates separately from specialized `assurance:*` commands, whose registry defines governed outcome taxonomies.
**The Problem:** The completion wording groups ordinary verification, UI, harness, and build gates with specialized assurance outcomes, allowing an ordinary failure to be treated as reviewed evidence.

**Options:**

| Option | Description                                                                                                                                | Pros                   | Cons                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------- |
| A      | Require ordinary gates to exit successfully; permit governed outcomes only for named specialized assurance commands under registry policy. | Unambiguous completion | None beyond wording edits |

**Recommendation:** Option A — it reflects the repository's actual exit taxonomy.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-006: Authentication Cancellation Has No Executable Contract 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `01-requirements.md:48-51`; `03-01-command-and-tui-shell.md`, cancellation; `03-02-authentication-and-credentials.md:30-52`; ST-30
**Codebase Evidence:** `packages/sdk/src/transport/types.ts:44-45` and `packages/sdk/src/transport/node-transport.ts:112-118` already support `AbortSignal`.
**The Problem:** The plan promises cancellation but neither planned interface carries a signal nor defines cancellation-versus-success/persistence races. Ignoring late UI updates does not cancel network work or the callback server.

**Options:**

| Option | Description                                                                                                         | Pros                                        | Cons                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| A      | Put an `AbortSignal` on `LoginRequest` or a coordinator options object; define propagation and terminal race rules. | Reuses existing transport support; testable | Extends the public coordinator contract |

**Recommendation:** Option A — it is the smallest complete cancellation contract.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-007: Refresh Transaction State Machine Is Incomplete 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-02-authentication-and-credentials.md:85-120`; `07-testing-strategy.md`, ST-11 and ST-13–ST-18
**Codebase Evidence:** `packages/sdk/src/auth/cli-auth.ts` performs the current direct refresh and in-memory update; the server enables refresh-token rotation.
**The Problem:** “When protocol semantics permit,” retained same-write retry state, and timeout/socket loss after dispatch are undefined. A retry after an indeterminate response may replay a consumed rotated token. OIDC permits omission of a new refresh token and says to retain the old one; see [OIDC Core refresh response](https://openid.net/specs/openid-connect-core-1_0-final.html#RefreshTokenResponse).

**Options:**

| Option | Description                                                                                                                                                                                                                        | Pros                                  | Cons                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| A      | Freeze a phase state machine: preserve an omitted refresh token; retry grants only after proven pre-dispatch failure; treat post-dispatch loss as indeterminate/reauth; retry persistence only from the same retained transaction. | Secure under rotation; fulfills AR-17 | Requires exact transaction API/lifetime tests |
| B      | Fail closed to reauthentication after every persistence failure.                                                                                                                                                                   | Simpler                               | Revises AR-17's promised same-write retry     |

**Recommendation:** Option A — it is the smallest resolution consistent with the accepted AR-17 decision.
**Confidence:** High. **Hardening:** Independent challenger merged the related symptoms and converged.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-008: Stale Credential-Lock Recovery Is Race-Prone 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-02-authentication-and-credentials.md:103-105`
**Codebase Evidence:** `packages/cli/src/credential-store.ts` has no existing cross-process lock primitive to inherit.
**The Problem:** Proving only age and process state is unsafe under PID reuse and check-then-remove races; one process can delete a replacement lock owned by another.

**Options:**

| Option | Description                                                                                               | Pros                          | Cons                                  |
| ------ | --------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| A      | Use a reviewed OS/kernel advisory-lock primitive or maintained library with bounded acquisition/recovery. | Smaller correctness surface   | Adds platform/dependency evaluation   |
| B      | Specify a tokenized lease with atomic takeover, revalidation, and hostile replacement/PID-reuse tests.    | No native dependency required | More custom concurrency logic         |
| C      | Remove automatic recovery and require an explicit safe recovery command.                                  | Simplest automatic path       | Revises AF-15 and worsens recovery UX |

**Recommendation:** Option A — concurrency correctness should rely on a proven primitive if a suitable Node 22/Linux-compatible choice passes dependency review.
**Confidence:** Medium. **Hardening:** Challenger upheld the risk and required an explicit architectural choice.
**User Decision:** Resolved — User accepted Option A, with an explicit constraint to use the smallest sufficient implementation and avoid overengineering.

### PF-009: Public SDK Hook Names Remain Provisional 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-02-authentication-and-credentials.md:85-101`; `99-execution-plan.md:55,67,79`
**Codebase Evidence:** `packages/sdk/src/auth/types.ts` and `packages/sdk/src/auth/cli-auth.ts` define the current public auth surface; compatibility checks consume emitted declarations.
**The Problem:** Immutable contract tests cannot be authoritative while exact exported names and placement are deferred to implementation.

**Options:**

| Option | Description                                                                                               | Pros                                       | Cons                                 |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| A      | Freeze the displayed `CliCredentialPersistence` contract and its exact integration into `CliAuthOptions`. | Minimal design churn; testable before code | Commits to the proposed naming       |
| B      | Select and document a different exact public API before specification tests.                              | Allows API-owner preference                | Requires another explicit API design |

**Recommendation:** Option A — the shown contract is already narrow and preserves opt-in persistence.
**Confidence:** Medium. **Hardening:** Challenger found no uniquely correct naming; explicit user/API-owner authority is required.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-010: Authentication Gates Run Too Late 🟠 MAJOR

**Dimension:** Ordering & Sequencing
**Location:** `99-execution-plan.md:73-89,201-206`; AR-25
**Codebase Evidence:** Project guidance requires browser, harness, and applicable protocol/security assurance for authentication/OIDC changes; these remain outside `yarn verify`.
**The Problem:** Phase 1 can be declared complete after changing browser, OIDC, token, and SDK boundaries without running their required gates, so dependent phases may build on a broken security boundary.

**Options:**

| Option | Description                                                                                                             | Pros                                 | Cons                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- |
| A      | Run applicable UI, harness, protocol, and production-security gates at Phase 1 close and repeat final gates in Phase 4. | Fails early at the affected boundary | Adds earlier runtime cost |

**Recommendation:** Option A — gate the security boundary before dependent UI/playground work.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Superseded on 2026-08-27 — because this feature leaves the server implementation untouched, the user limited execution to affected CLI/SDK package verification and repository structure tests. Server verification, server browser tests, and server protocol/security harnesses are not feature gates.

### PF-011: No Integrated CLI-to-Playground Authentication Proof 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `07-testing-strategy.md:109-120`; `99-execution-plan.md:205`
**Codebase Evidence:** Existing packed smoke and harness commands exercise package resolution and OIDC behavior separately; no current test supplies this new cross-component journey.
**The Problem:** The plan can prove that the playground serves OIDC and that `porta admin` starts, yet never prove the packed command logs in against that playground and reaches an authenticated shell.

**Options:**

| Option | Description                                                                                                                                  | Pros                               | Cons                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| A      | Add a packed CLI PTY plus controlled browser journey against disposable playground isolation, asserting verified shell identity and cleanup. | Reproducible end-to-end acceptance | More involved test orchestration |
| B      | Require a documented manual evidence run.                                                                                                    | Lower implementation effort        | Weaker and less repeatable       |

**Recommendation:** Option A — it proves the milestone's central integration rather than its halves.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-012: Playground Lifecycle Is Not Serialized or Failure-Atomic 🟠 MAJOR

**Dimension:** Edge Cases
**Location:** `03-03-admin-playground.md:53-85`
**Codebase Evidence:** No existing playground lifecycle implementation supplies a lock; Docker operations are external, partially failing operations.
**The Problem:** Concurrent `up`/`reset`/`stop`, or partial volume deletion followed by secret rotation, can leave retained encrypted data unreadable or destroy the wrong lifecycle state.

**Options:**

| Option | Description                                                                                                                                     | Pros                                       | Cons                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| A      | Add one bounded mutation lock; reset must prove every exact volume absent before rotating secrets, and preserve old secrets on partial failure. | Deterministic ownership and recoverability | Adds lifecycle state/concurrency tests |

**Recommendation:** Option A — it is the only resolution that preserves the stated shared lifetime of encrypted data and keys.
**Confidence:** High. **Hardening:** Independent challenger converged; reuse PF-008's safe primitive where appropriate.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-013: `reset --yes` Can Destroy Data Before Bootstrap Is Possible 🟠 MAJOR

**Dimension:** Edge Cases
**Location:** `03-03-admin-playground.md:64,77-79`; AR-12 and AR-23
**Codebase Evidence:** The existing `porta init` requires interactive hidden password input and additional administrator fields.
**The Problem:** In a non-TTY environment, `--yes` can bypass confirmation and delete volumes before the mandatory interactive rebootstrap can run.

**Options:**

| Option | Description                                                                                               | Pros                                           | Cons                                                          |
| ------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| A      | Prove hidden-input/TTY capability before any destructive reset mutation; `--yes` skips confirmation only. | In-scope; prevents unrecoverable partial reset | Keeps reset interactive                                       |
| B      | Add the secure password-file automation channel mentioned by AR-12.                                       | Enables CI automation                          | Explicitly outside current scope and needs separate authority |

**Recommendation:** Option A — it fixes the destructive ordering without expanding automation scope.
**Confidence:** High. **Hardening:** Independent challenger converged.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-014: Coverage Completion Gate Cannot Be Executed 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:10-16,130-137`; no matching task in `99-execution-plan.md`
**Codebase Evidence:** Root `package.json:30` collects server coverage only; CLI/SDK scripts and Vitest configs have no coverage thresholds (`packages/cli/package.json:15-22`, `packages/sdk/package.json:30-37`).
**The Problem:** Three overlapping numeric goals have no exact file attribution, metric, collection command, threshold enforcement, or execution task, despite being an explicit verification checkbox.

**Options:**

| Option | Description                                                                                                            | Pros                                 | Cons                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------- |
| A      | Define exact globs/metrics, add CLI/SDK collection and failing thresholds, and add one plan-owned final coverage task. | Makes the declared gate reproducible | Adds coverage wiring                    |
| B      | Remove the percentages and completion checkbox; rely on the behavior/edge-case matrix.                                 | Smaller scope                        | Gives up the accepted quantitative goal |

**Recommendation:** Option A — retain the plan's stated quality bar without broadening routine CI policy.
**Confidence:** High. **Hardening:** The batch challenger proposed Minor after overlooking line 137's explicit completion checkbox; a separate independent coverage challenge upheld Major. The lead retained Major on direct artifact evidence.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-015: ST-06 Freezes an Unauthorized Clock-Skew Policy 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:35`; `03-02-authentication-and-credentials.md:58-67`; AF-07 and AR-27
**Codebase Evidence:** Existing 60-second constants in `packages/sdk/src/auth/cli-auth.ts:98-102,168-175` and `packages/cli/src/credential-store.ts:176-184` are early-refresh buffers, not ID-token future-issuance tolerance.
**The Problem:** An implementation analogy becomes an immutable security oracle without requirements authority. The tolerance determines which future-issued identities are accepted.

**Options:**

| Option | Description                                                                                                  | Pros                       | Cons                                  |
| ------ | ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------- |
| A      | Explicitly authorize a 60-second ID-token clock-skew policy in requirements/AR authority, then retain ST-06. | Interoperable and testable | Accepts a bounded future-issued token |
| B      | Require strict non-future `iat` and update ST-06.                                                            | Strictest acceptance       | More sensitive to clock drift         |

**Recommendation:** Option A — 60 seconds is bounded and operationally tolerant, but it must be an explicit security decision.
**Confidence:** Medium. **Hardening:** Challenger upheld the defect and identified a real security/availability tradeoff requiring user authority.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-016: Feature-Sized Plan Is Misclassified as a Lightweight Task 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `00-index.md:6`; `01-requirements.md`; `99-execution-plan.md`; `codeops/features/admin-ui/00-roadmap.md:18`
**Codebase Evidence:** Current CodeOps layout authority routes cohesive capabilities through RD → plan and limits a nontrivial `T-NN` lane item to one `99-<task>-plan.md`, not a 00–07 document set.
**The Problem:** A 19-requirement, 10-document, 53-task capability is stored and tracked as `T-01`, which breaks current artifact discovery, lifecycle semantics, and future execution routing.

**Options:**

| Option | Description                                                                               | Pros                                       | Cons                                                   |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| A      | Preview and migrate it to an RD-owned feature plan, preserving all content and decisions. | Matches current workflow; preserves detail | Changes paths and roadmap identity                     |
| B      | Compress it to a task mini-plan.                                                          | Retains T-01                               | Misclassifies and discards necessary feature structure |

**Recommendation:** Option A — the content is already a cohesive capability and should not be weakened to fit the task lane.
**Confidence:** High. **Hardening:** Independent challenger converged; migration must use the appropriate CodeOps artifact workflow.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-017: Bootstrap Names Are Unspecified 🟡 MINOR

**Dimension:** Implicit Assumptions
**Location:** AR-12; `03-03-admin-playground.md:61-67`; bootstrap tasks in `99-execution-plan.md`
**Codebase Evidence:** `packages/server/src/cli/commands/init.ts` requires given name and family name as well as email/password.
**The Problem:** The bootstrap identity cannot be reproduced from the documented values alone.

**Options:**

| Option | Description                                                                                 | Pros          | Cons                          |
| ------ | ------------------------------------------------------------------------------------------- | ------------- | ----------------------------- |
| A      | Freeze non-secret given/family names and pass them through the existing init flags/prompts. | Deterministic | Small documentation/task edit |

**Recommendation:** Option A — use stable playground-only names.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-018: Dependency Check Is Claimed but Unscheduled 🟡 MINOR

**Dimension:** Completeness Gaps
**Location:** Packaging/verification prose and `99-execution-plan.md`
**Codebase Evidence:** Root `package.json` defines `yarn deps:check`, but no execution task runs it.
**The Problem:** New direct JSVision dependencies can complete the plan without the promised dependency-health evidence.

**Options:**

| Option | Description                                                 | Pros                  | Cons               |
| ------ | ----------------------------------------------------------- | --------------------- | ------------------ |
| A      | Add `yarn deps:check` to the final dependency/package gate. | Uses existing command | Small runtime cost |

**Recommendation:** Option A — it closes the stated dependency check with no new mechanism.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-019: Literal Pipes Corrupt Two Markdown Tables 🟡 MINOR

**Dimension:** Consistency
**Location:** `00-ambiguity-register.md:22`; `00-index.md:38`
**Codebase Evidence:** Not applicable; document-only formatting defect.
**The Problem:** Unescaped shell-pipeline pipes split table cells, making the accepted command/readiness contract render incorrectly.

**Options:**

| Option | Description                                                                          | Pros              | Cons |
| ------ | ------------------------------------------------------------------------------------ | ----------------- | ---- |
| A      | Escape the literal pipes or place the command in inline HTML/code outside the table. | Correct rendering | None |

**Recommendation:** Option A — escape the pipes.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-020: AR-5 Resolution Note Is Stale 🟡 MINOR

**Dimension:** Consistency
**Location:** `00-ambiguity-register.md:46`
**Codebase Evidence:** Not applicable; later AR-9–AR-15 and AR-23 already resolve these details.
**The Problem:** The note says lifecycle details remain discovery decisions even though the same register records them as resolved.

**Options:**

| Option | Description                                                            | Pros                         | Cons |
| ------ | ---------------------------------------------------------------------- | ---------------------------- | ---- |
| A      | Replace the stale sentence with cross-references to the resolving ARs. | Restores one source of truth | None |

**Recommendation:** Option A.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-021: Post-Green Tests Are Misclassified and Concern-Mismatched 🟡 MINOR

**Dimension:** Testability
**Location:** `99-execution-plan.md:79-80`
**Codebase Evidence:** `packages/sdk/tests/type-compatibility/types.test.ts` is an entity-shape compatibility suite, not an authentication-hook contract suite.
**The Problem:** Public hook assertions are scheduled after implementation in an unrelated unsuffixed file, while new credential internals also remain unclassified, violating the repository's specification/implementation test convention.

**Options:**

| Option | Description                                                                                                           | Pros                                          | Cons                    |
| ------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------- |
| A      | Move public hook assertions to the Phase 1 immutable spec oracle; place internals in dedicated `.impl.test.ts` files. | Correct oracle ordering and concern isolation | Adds focused test files |

**Recommendation:** Option A.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### PF-022: Cleanup Promise Includes Uncatchable Signals 🟡 MINOR

**Dimension:** Feasibility Concerns
**Location:** `03-01-command-and-tui-shell.md`, terminal cleanup; related signal test in `07-testing-strategy.md`
**Codebase Evidence:** POSIX `SIGKILL` and `SIGSTOP` cannot be caught by a Node process.
**The Problem:** “Every signal” makes the terminal-restoration acceptance claim impossible to satisfy.

**Options:**

| Option | Description                                                                                                            | Pros                   | Cons                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| A      | Narrow the contract to normal exit and catchable termination signals; test at least `SIGINT`, `SIGTERM`, and `SIGHUP`. | Executable and precise | Cannot promise cleanup after forced kernel termination |

**Recommendation:** Option A.
**User Decision:** Resolved — User accepted Option A, subject to the standing smallest-sufficient-implementation constraint.

### Domain Review Recommendation

This plan is both identity-security-sensitive and architecturally foundational. Consider having an OIDC/security domain expert review the resolved artifact in addition to this automated preflight.

### Iteration 1 Report Validation

- Prettier validation passed for the complete audited Markdown set.
- `yarn verify` passed 79 repository-structure tests, 356 CLI tests, 404 SDK tests, and 2,861 server unit tests. It then stopped before integration testing because PostgreSQL was unavailable at the configured local test URL. This is an environment prerequisite failure, not evidence that an audited plan correction regressed code.

### Iteration 1 Decision State

PF-001 through PF-022 have user-approved resolutions, all constrained to the smallest sufficient implementation. No corrections have been applied to the audited artifact, so this iteration remains blocked and the roadmap has not advanced. Applying the accepted corrections requires explicit authorization, followed by a bounded verification re-scan.

---

## Iteration 2: Accepted-Fix Verification Re-scan

### Result

All 22 accepted corrections were applied and verified against the current repository. The bounded re-scan covered all 13 dimensions and found no remaining Critical, Major, Minor, or Observation finding. Direct correction regressions discovered during the scan were fixed and rechecked: server-guidance wording, per-attempt cancellation ownership, ST-41 ordering, POSIX signal scope, native-lock verification timing, the Phase-1 cancellation oracle, final evidence decomposition, and phase-count bookkeeping. A later explicit user ruling superseded PF-008's separate native qualification matrix with Porta's existing Node 24 LTS development and verification workflow; AR-47 records that ruling.

|   # | Dimension              | Open Findings | Highest Severity |
| --: | ---------------------- | ------------: | ---------------- |
|   1 | Ambiguities            |             0 | —                |
|   2 | Implicit Assumptions   |             0 | —                |
|   3 | Logical Contradictions |             0 | —                |
|   4 | Completeness Gaps      |             0 | —                |
|   5 | Dependency Issues      |             0 | —                |
|   6 | Feasibility Concerns   |             0 | —                |
|   7 | Testability            |             0 | —                |
|   8 | Security Blind Spots   |             0 | —                |
|   9 | Edge Cases             |             0 | —                |
|  10 | Scope Creep Indicators |             0 | —                |
|  11 | Ordering & Sequencing  |             0 | —                |
|  12 | Consistency            |             0 | —                |
|  13 | Codebase Alignment     |             0 | —                |

### Finding Closure

| Finding | Iteration-2 verification                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001  | Closed — non-empty subject and exact ID-token/UserInfo/refresh continuity are authoritative and tested.                                                                                  |
| PF-002  | Closed — playground bootstrap uses the existing `porta-admin` organization.                                                                                                              |
| PF-003  | Closed — CLI, server initialization output/tests, and active project guidance remove stale GUI surfaces together.                                                                        |
| PF-004  | Closed — ordinary gates and governed assurance outcomes have distinct completion rules.                                                                                                  |
| PF-005  | Closed — live tests preserve the fixed Compose identity inside a disposable isolated Docker context/daemon.                                                                              |
| PF-006  | Closed — a fresh current-operation `AbortSignal` covers every authentication stage; ST-42 precedes implementation.                                                                       |
| PF-007  | Closed — refresh dispatch, validation, persistence, commit, and retry boundaries are explicit and fail closed.                                                                           |
| PF-008  | Superseded by AR-47 — verify the exact dependency and adapter through focused tests and packed CLI evidence in Porta's existing Node 24 LTS workflow; no separate matrix or CI workflow. |
| PF-009  | Closed — the exact public SDK persistence types and option property are frozen.                                                                                                          |
| PF-010  | Closed — authentication-specific UI, harness, protocol, and production-security gates close Phase 1.                                                                                     |
| PF-011  | Closed — ST-41 is authored and observed red before CLI/playground implementation, then taken green after the playground exists.                                                          |
| PF-012  | Closed — one kernel lock serializes playground mutation and reset rotates secrets only after every exact volume is absent.                                                               |
| PF-013  | Closed — reset proves hidden-input/TTY capability before confirmation or mutation, including with `--yes`.                                                                               |
| PF-014  | Closed — exact 90/80/60 line-coverage groups, exclusions, and final gates are executable.                                                                                                |
| PF-015  | Closed — the positive future-`iat` allowance is an explicit 60-second ID-token policy.                                                                                                   |
| PF-016  | Closed — the capability is an authoritative `admin-ui/RD-01` with deterministic plan traceability.                                                                                       |
| PF-017  | Closed — bootstrap given/family names are fixed as `Playground Administrator`.                                                                                                           |
| PF-018  | Closed — dependency drift and production audit commands are scheduled as their own final evidence task.                                                                                  |
| PF-019  | Closed — literal pipeline pipes render correctly in Markdown tables.                                                                                                                     |
| PF-020  | Closed — AR-5 now points to the decisions that resolve its lifecycle details.                                                                                                            |
| PF-021  | Closed — public specifications precede implementation and internal assertions use focused implementation-test files.                                                                     |
| PF-022  | Closed — terminal restoration is limited to catchable POSIX signals and Node-deliverable Windows events.                                                                                 |

### Corrected Artifact Validation

- The CodeOps plan parser reports `Ready`, 55 unchecked tasks, and no structural problem; all 53 original tasks remain, with two atomic evidence tasks added by the accepted corrections.
- ST-01 through ST-42 are unique and complete; relative Markdown files and anchors resolve.
- Prettier passes for the authoritative RD, feature roadmap, and complete plan/report set.
- `yarn test:structure` passes all 79 repository-contract tests.
- Final `yarn verify` passed 79 repository-contract tests, 356 CLI tests, 404 SDK tests, and 2,861 server unit tests, then stopped at integration global setup because PostgreSQL was unavailable at the configured local test URL. This repeats the iteration-1 environment prerequisite limitation; no product source changed in this preflight correction.

### Iteration 2 Decision State

✅ **PREFLIGHT PASSED.** The corrected `admin-ui/RD-01` plan is internally consistent, codebase-grounded, specification-first, and ready for execution. No finding is carried forward and no scope-expansion register was required.
