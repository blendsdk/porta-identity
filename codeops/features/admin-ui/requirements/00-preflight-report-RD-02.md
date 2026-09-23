## Preflight Report: RD-02 Organization Context and Navigation

> **Status**: ✅ PASSED — 9 accepted fixes verified, 2 findings dismissed
> **Iteration**: 2 (re-scan after accepted fixes)
> **Artifact**: Single requirement at `codeops/features/admin-ui/requirements/RD-02-organization-context-and-navigation.md`
> **Artifact SHA-256**: `b654b246c3e62b5ea29796f131404d2e71f5ffa52a0dae9fa45493d576b923b0`
> **Initial Artifact SHA-256**: `0e4a62fc4f25e35f2b1d2ed79096d1396f4758a1ee10f0cec687a5d4078aa974`
> **Codebase Grounded**: 24 source, test, manifest, and dependency-declaration files examined
> **Last Updated**: 2026-08-28

> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk
> is elevated. Consider running preflight in a new session for maximum review independence.

### Audit Scope

- **Audit target and modification set:** RD-02 only
- **Context documents:** the admin-ui requirements index, ambiguity register, RD-01, feature
  roadmap, and project guidance
- **Product-scope baseline:** no server change, dependency, workspace, application, runtime matrix,
  CI workflow, search, or pagination UI
- **Scope mode:** strict

### Codebase Context Summary

**Tech Stack:** Node.js 24 LTS development baseline, TypeScript ESM, Yarn Classic/Turbo, JSVision
1.6.0, Porta SDK, Koa Admin API, PostgreSQL, and Redis.

**Architecture:** `porta admin` is an embedded CLI application with a stateful JSVision shell. It
verifies one global super-admin-organization OIDC session, then uses the existing SDK Admin API
domains. The server remains the authorization boundary. The selected organization is UI working
context only.

**Key Files Examined:** `packages/cli/src/admin/{application,presentation,session-service,state}.ts`,
`packages/cli/src/client-factory.ts`, `packages/sdk/src/domains/organizations.ts`,
`packages/sdk/src/pagination/index.ts`, `packages/sdk/src/transport/{types,node-transport}.ts`,
`packages/sdk/src/auth/{cli-auth,token-auth}.ts`, `packages/server/src/oidc/account-finder.ts`,
`packages/server/src/rbac/{user-role-service,role-service,slugs}.ts`,
`packages/server/src/middleware/admin-auth.ts`, `packages/server/src/lib/admin-permissions.ts`,
`packages/server/src/routes/organizations.ts`, and the existing CLI/playground test surfaces.

### Summary by Dimension

|   # | Dimension              | Findings | Highest Severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        0 | —                |
|   2 | Implicit Assumptions   |        0 | —                |
|   3 | Logical Contradictions |        1 | 🟠 Major         |
|   4 | Completeness Gaps      |        1 | 🟡 Minor         |
|   5 | Dependency Issues      |        1 | 🟡 Minor         |
|   6 | Feasibility Concerns   |        1 | 🟠 Major         |
|   7 | Testability            |        3 | 🟡 Minor         |
|   8 | Security Blind Spots   |        1 | 🟠 Major         |
|   9 | Edge Cases             |        1 | 🟡 Minor         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        0 | —                |
|  12 | Consistency            |        0 | —                |
|  13 | Codebase Alignment     |        2 | 🟠 Major         |

### Summary by Severity

| Severity    | Count | Status                            |
| ----------- | ----: | --------------------------------- |
| Critical    |     0 | None                              |
| Major       |     4 | 2 fixed and verified, 2 dismissed |
| Minor       |     7 | 7 fixed and verified              |
| Observation |     0 | None                              |

---

### PF-001: UI capability source conflicts with server authorization 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** OC-04, Authorization, and AC-6

**Codebase Evidence:** `packages/server/src/rbac/user-role-service.ts:185-211` builds UserInfo
permissions from mutable database mappings, while `packages/server/src/middleware/admin-auth.ts:275-309`
derives Admin API permissions from static `porta-*` role definitions in
`packages/server/src/lib/admin-permissions.ts:135-220,271-299`. Role-permission mappings are mutable
through `packages/server/src/rbac/role-service.ts:263-317`.

**The Problem:** RD-02 simultaneously makes malformed `permissions` fail closed, preserves legacy
`porta-admin` super-admin behavior, and says the two permission strings govern menu availability.
Those rules can disagree with one another and with the server. A later 403 safely handles a false
enable, but cannot repair a false disable that prevents the request entirely.

**Options:**

| Option | Description                                                                                                 | Pros                                                                | Cons                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A      | Derive these two advisory capabilities from validated admin role slugs using the server's current mappings. | Matches actual enforcement and legacy behavior without server work. | The small role mapping must remain synchronized when server roles change. |
| B      | Keep actions enabled after valid admin authentication and let the server decide.                            | Cannot drift from server authorization.                             | Loses the approved disabled-unavailable affordance.                       |

**Recommendation:** Option A — read is granted by `porta-admin`, `porta-super-admin`,
`porta-org-admin`, or `porta-auditor`; create by the first three except auditor. State that this
mirrors current server authorization, cover parity in tests, and keep every 401/403 authoritative.

**User Decision:** Dismissed — use the approved existing UserInfo `permissions` claims for advisory
menu state, retain the explicit legacy compatibility rule, and keep server 401/403 responses
authoritative. Do not duplicate the server's role-permission mapping in the CLI.

### PF-002: Reauthentication reconciliation has conflicting failure outcomes 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** OC-08, OC-11, State and operation boundaries, and AC-7

**Codebase Evidence:** `packages/cli/src/admin/session-service.ts:159-165` preserves the verified
state when reauthentication itself is cancelled or fails. The new post-authentication list step has
several distinct failure classes that RD-02 currently collapses.

**The Problem:** OC-08 says every load or validation failure preserves the prior selection, while
OC-11 clears it after successful reauthentication for absence, malformed data, or loss of listing
authorization. Transport, 5xx, malformed-collection, and 403 outcomes are not reconciled.

**Options:**

| Option | Description                                                                                                                                                                                             | Pros                                                                           | Cons                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| A      | Preserve the snapshot on cancelled/failed reauthentication and transient reconciliation failures; clear only on an authoritative 403 or a valid complete list proving absence/invalid matching context. | Avoids destroying usable context because a reload was temporarily unavailable. | A stale snapshot may remain visible with an explicit retryable warning. |
| B      | Once authentication succeeds, clear selection for every unsuccessful reconciliation.                                                                                                                    | Very simple and always fail-closed visually.                                   | Network trouble unnecessarily loses the user's context.                 |

**Recommendation:** Option A — clear for a 403, a valid complete list proving absence, or a malformed
matching row; retain on transport/5xx or malformed unrelated/envelope data. A 401 follows RD-01's
session-invalid path. Never treat a retained snapshot as new authorization.

**User Decision:** Resolved — user accepted Option A in simplified form: clear only when the server
authoritatively confirms the selection is unavailable or unauthorized; preserve it across temporary
reconciliation failures, with 401 continuing to follow RD-01 session-invalid handling.

### PF-003: Initial chooser is undefined without organization-read capability 🟡 MINOR

**Dimension:** Edge Cases

**Location:** OC-03 through OC-06 and AC-6

**Codebase Evidence:** `packages/server/src/lib/admin-permissions.ts:156-220` defines valid admin
roles, including user and application admins, that lack `admin:org:read`.

**The Problem:** RD-02 requires the switcher to auto-open for every authenticated session without a
selection, but also disables switching without read permission. Existing built-in roles do not
grant create without read, so this is a localized empty-state gap rather than a broken main flow.

**Options:**

| Option | Description                                                                                                                                                                         | Pros                                                               | Cons                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| A      | Auto-open the organization-choice modal; without read permission show a fixed unavailable state with Cancel and Reauthenticate, and keep Create reachable if independently enabled. | Preserves the approved automatic choice flow and capability rules. | The modal has an explicit no-list variant. |

**Recommendation:** Option A — it is the only target-local resolution that preserves the approved
flow and does not silently call an unauthorized list endpoint.

**User Decision:** Resolved — user accepted Option A with the fixed unavailable state and no
unauthorized list request.

### PF-004: SDK automatic 401 replay violates one-request creation 🟠 MAJOR

**Dimension:** Feasibility Concerns

**Location:** OC-10, State and operation boundaries, Authorization, and AC-5

**Codebase Evidence:** `packages/sdk/src/transport/node-transport.ts:66-80` refreshes and replays
every request after a 401 when `refreshToken` exists; `packages/sdk/src/auth/cli-auth.ts:343-353`
provides it; `packages/sdk/src/domains/organizations.ts:63-65` sends create through that transport.
`packages/sdk/src/auth/token-auth.ts:40-59` deliberately has no replay callback.

**The Problem:** A single `organizations.create()` call can issue two POSTs, contradicting the
exactly-one-request and never-retry requirements.

**Options:**

| Option | Description                                                                                                                                                          | Pros                                                                | Cons                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| A      | Define one logical Create activation and permit the SDK's existing single refresh-and-replay only after a definite 401 response; never retry indeterminate failures. | Reuses the current workflow with no new client or transport policy. | One logical activation can produce two authenticated POSTs. |
| B      | Build a one-shot token-authenticated client that cannot replay a POST.                                                                                               | Preserves an exactly-one-HTTP-request invariant.                    | Adds token/client machinery solely for this edge case.      |

**Recommendation:** Option A — a received 401 is a definite authentication rejection before the
protected create handler runs. The duplicate-creation risk applies to response loss or transport
failure, which remains non-retryable.

**User Decision:** Resolved — user accepted Option A. Keep the standard SDK workflow and clarify
that exactly one logical submission may have the SDK's single 401 refresh replay; transport and
indeterminate failures are never retried.

### PF-005: Physical and logical cancellation are conflated 🟡 MINOR

**Dimension:** Dependency Issues

**Location:** OC-10, OC-13, State and operation boundaries, and integration requirements

**Codebase Evidence:** `packages/sdk/src/domains/organizations.ts:30-65` exposes no operation options
and forwards no signal. `packages/sdk/src/transport/types.ts:22-45` and
`packages/sdk/src/pagination/index.ts:110-144` already support AbortSignal.

**The Problem:** The UI can safely cancel modal ownership and quarantine late results, but cannot
physically abort these SDK requests. RD-02 does not say which meaning is required. For creation,
post-dispatch physical abort is indeterminate anyway and is already covered by the recovery rule.

**Options:**

| Option | Description                                                                                                                         | Pros                                                                   | Cons                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| A      | Define organization cancellation as closing modal ownership and ignoring all late completion; retain indeterminate-create recovery. | No public SDK change; gives the terminal the safety property it needs. | In-flight network work may finish in the background.           |
| B      | Add optional AbortSignal options to the organization SDK methods.                                                                   | Also aborts transport and paging work.                                 | Expands the public SDK for a property the UI does not require. |

**Recommendation:** Option A — it is the smaller contract and matches the real terminal invariant:
cancelled work must never mutate application state.

**User Decision:** Resolved — user accepted Option A. Cancellation closes modal ownership and late
results cannot mutate application state; no SDK cancellation API is added.

### PF-006: List metadata is trusted before bounded validation 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** OC-06, State and operation boundaries, Validation and presentation, and AC-4/AC-9

**Codebase Evidence:** `packages/sdk/src/domains/organizations.ts:49-52` casts each response without
runtime validation. `packages/sdk/src/pagination/index.ts:118-150` spreads response data and trusts
`totalPages` before the UI can inspect the final collection.

**The Problem:** A malformed or hostile selected server can drive excessive page requests and
memory growth before UI validation runs. “All organizations” cannot mean unbounded resource use.

**Options:**

| Option | Description                                                                                                                                                                                                           | Pros                                                       | Cons                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| A      | Validate each organization page envelope before iteration and impose one generous fixed page-traversal safety ceiling; reject invalid data, invalid progression, repeated cursor, or a ceiling breach all-or-nothing. | Bounds remote work without adding UI search or pagination. | Requires a small SDK validation/limit contract. |

**Recommendation:** Option A — trusting pagination metadata was rejected because it conflicts with
the project's remote-input and bounded-terminal guarantees. Keep the ceiling far above the expected
organization count so it remains a safety limit, not a product pagination limit.

**User Decision:** Dismissed — the user confirmed that organization counts rarely approach 100 and
directed the implementation not to overengineer this workflow. The admin UI will reuse the existing
SDK `listAll()` behavior unchanged; no pagination ceiling, validation framework, search, or
pagination UI is added.

### PF-007: RBAC claim bounds are not testable 🟡 MINOR

**Dimension:** Testability

**Location:** Validation and presentation and AC-6

**Codebase Evidence:** `packages/server/src/rbac/slugs.ts:91-139` bounds role slugs to 100 characters
and permission slugs to 150, but RD-02 gives no array cardinality. The current CLI display-claim
boundary is explicit at `packages/cli/src/admin/session-service.ts:30-37`.

**The Problem:** The document requires bounded arrays and says oversized claims disable actions,
but an immutable specification cannot determine what “oversized” means.

**Options:**

| Option | Description                                                                              | Pros                                                            | Cons                                      |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| A      | Freeze a generous fixed cardinality plus role-entry 100 and permission-entry 150 limits. | Deterministic, bounded, and consistent with server slug limits. | Adds three small constants.               |
| B      | Remove the array-size guarantee and validate only the exact relevant role values.        | Smaller parser.                                                 | Does not bound work over a hostile array. |

**Recommendation:** Option A — use at most 256 entries per array and JavaScript string length, with
the existing 100/150 entry limits.

**User Decision:** Resolved — user chose the simplified Option B. Do not invent an array-cardinality
policy; validate the array shape and the relevant claim strings using existing bounds.

### PF-008: Completion gates do not explicitly prove the organization workflow 🟡 MINOR

**Dimension:** Testability

**Location:** AC-10

**Codebase Evidence:** `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs:25-41` and
`docker/admin-playground/tests/support/admin-cli-journey.mjs:251-260` currently prove login,
identity, exit, and restoration only. `packages/cli/package.json:15-23` and
`packages/sdk/package.json:15-23` expose scoped verification; `package.json:57` registers
compatibility verification.

**The Problem:** The requirement names the correct verification surfaces, but it does not explicitly
say that the existing packed journey must exercise chooser, switch, create, and restoration. Exact
test selectors can remain an execution-plan concern.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                          | Pros                                                                         | Cons                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A      | Require the existing packed playground journey to cover chooser, switch, create-auto-select, and restoration; require SDK verification plus clean `assurance:compat --select tenant-admin` only if SDK code or contracts change. Leave exact narrow selectors to the execution plan. | Proves the actual workflow without a new matrix/workflow or full server run. | Adds a few focused journey observations.                   |
| B      | Treat the playground as regression-only and prove the workflow solely with headless CLI specifications.                                                                                                                                                                              | Faster and simpler live journey.                                             | Misses packed CLI/SDK/server/terminal integration defects. |

**Recommendation:** Option A — it directly covers the user-visible behavior while respecting the
approved scoped-verification boundary.

**User Decision:** Resolved — user accepted Option A in scoped form. Extend the existing packed
playground journey for choose, switch, create, and terminal restoration; do not run full server
verification when server code is untouched.

### PF-009: Selected state retains an unnecessarily broad SDK object 🟡 MINOR

**Dimension:** Codebase Alignment

**Location:** State and operation boundaries, Validation and presentation, and AC-5/AC-9

**Codebase Evidence:** `packages/sdk/src/types/organizations.ts:19-35` requires sixteen fields, while
`packages/sdk/src/domains/organizations.ts:49-65` performs no runtime validation. RD-02 validates
only the few context fields it uses.

**The Problem:** “Validated SDK Organization snapshot” either requires unstated validation of every
unused SDK field or permits a partial validation while claiming the whole object is validated.

**Options:**

| Option | Description                                                                                                       | Pros                                                      | Cons                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| A      | Store a validated narrow context projection: id, name, slug, status, and only another field if actually rendered. | Minimal state, exact validation, no unused remote fields. | The create/list response is projected before storage.         |
| B      | Runtime-validate the complete SDK Organization contract.                                                          | Makes the snapshot wording literal.                       | Retains and validates twelve fields the feature does not use. |

**Recommendation:** Option A — it matches the deliberately minimal landing view.

**User Decision:** Resolved — user accepted Option A. Store only the validated organization ID,
name, slug, and status projection.

### PF-010: Successful reauthentication does not refresh the selected snapshot 🟡 MINOR

**Dimension:** Completeness Gaps

**Location:** OC-11, State and operation boundaries, Landing view, and AC-7

**Codebase Evidence:** Organization name and status are mutable through
`packages/server/src/routes/organizations.ts:243-305`.

**The Problem:** RD-02 says to reload and clear on invalidation but not whether a valid same-UUID
item replaces the previous snapshot. Keeping it leaves the landing view stale after the mandated
reload.

**Options:**

| Option | Description                                                                          | Pros                                        | Cons                                                        |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| A      | Atomically replace the selected projection with the unique validated same-UUID item. | Fresh name/status and deterministic redraw. | None beyond explicit reconciliation logic already required. |
| B      | Clear and force reselection when displayed fields changed.                           | Never retains a changed snapshot.           | Unnecessarily interrupts the user.                          |

**Recommendation:** Option A — refresh the projection in place; selection identity remains UUID.

**User Decision:** Resolved — user accepted Option A. Replace the selected projection with the
fresh unique same-UUID item after successful reconciliation.

### PF-011: Disabled-action reasons have no presentation contract 🟡 MINOR

**Dimension:** Testability

**Location:** OC-03 and AC-1/AC-6

**Codebase Evidence:** JSVision 1.6.0 menu items expose title, command, and optional key; command
disablement greys and blocks activation but provides no reason property.

**The Problem:** “Provides a short fixed reason” does not say where or what text is presented, so
accessibility and immutable tests cannot prove it.

**Options:**

| Option | Description                                                                                                                  | Pros                                                      | Cons                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| A      | Include exact concise suffixes in disabled menu labels: `(requires organization read)` and `(requires organization create)`. | Works with the existing menu model and is always visible. | Labels are slightly longer at narrow sizes.                   |
| B      | Add a separate contextual status/help line for the highlighted item.                                                         | Keeps labels short.                                       | Requires focus-sensitive help behavior and more UI machinery. |

**Recommendation:** Option A — it is explicit and avoids a custom help mechanism.

**User Decision:** Resolved — user accepted Option A in concise form. Disabled organization actions
show a short fixed unavailable reason without adding contextual-help machinery.

---

### Current Verdict

**✅ PREFLIGHT PASSED — 9 accepted fixes verified, 2 findings dismissed.** All 13 dimensions were
re-scanned against the target-only modification set. No critical, major, minor, or observation
finding remains open.

### Iteration 2 Verification

| Findings               | Result                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PF-001, PF-006         | User dismissals preserved; no role mapping, pagination ceiling, search, or pagination UI added.                  |
| PF-002, PF-004         | Reauthentication reconciliation and standard SDK 401 replay now have consistent, testable outcomes.              |
| PF-003, PF-005, PF-007 | No-read state, logical organization-operation cancellation, and independent RBAC claim validation verified.      |
| PF-008                 | Existing packed playground journey owns the new flow; verification remains scoped when server code is untouched. |
| PF-009, PF-010         | Selected state is the narrow four-field projection and refreshes after valid reconciliation.                     |
| PF-011                 | Disabled actions use fixed concise reasons without a help framework.                                             |

The re-scan also corrected three direct residual wording issues: the no-read acceptance path, the
preserve-versus-clear security-test summary, and the distinction between logical organization SDK
cancellation and RD-01 authentication cancellation.

### Recommendation Hardening

The complete Major batch was independently challenged against the unchanged target and current
implementation. Four candidates were retained as Major and four were downgraded to Minor to keep
the result proportional and avoid unnecessary SDK work.

**Confidence:** High.

**Hardening:** Independent whole-batch challenge completed; its refinements are incorporated above.
