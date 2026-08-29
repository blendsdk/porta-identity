## Preflight Report: RD-03 User Management

> **Status**: ⛔ BLOCKED — 10 findings (0 critical, 5 major, 5 minor); PF-004 fixed, remaining accepted corrections not yet applied
> **Iteration**: 1 (first scan)
> **Artifact**: Single requirement at `codeops/features/admin-ui/requirements/RD-03-user-management.md`
> **Initial Artifact SHA-256**: `763bcf8a4823f14a6e3388f1f5f25e1639a175b13c1771d3f85910bfa8a26aee`
> **Current Artifact SHA-256 (pending re-scan)**: `550a750c49d0e1d748a34fb9f6925d3fcb6f482374d319338118d1b69d98d67f`
> **Codebase Grounded**: 24 source, test, manifest, dependency, and requirements files examined; 15 contract references verified
> **Last Updated**: 2026-08-29

> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk is
> elevated. Five independent dimension-cluster audits and one independent major-finding challenge
> were used to reduce that risk.

### Audit Scope

- **Audit target:** RD-03 only
- **Context:** admin-ui ambiguity register, RD-01/RD-02, current-compatibility policy, and affected
  CLI, SDK, server, JSVision, tests, and documentation surfaces
- **Product baseline:** the approved complete organization-scoped core user-management feature
- **Strict exclusions:** later roadmap features, generalized UI machinery, new dependencies,
  endpoints, runtime matrices, concurrency subsystems, and rare-deletion handling
- **Mode:** strict scope with `--auto-design`; root invocation
  `preflight-admin-ui-rd03-20260829`

### Codebase Context Summary

**Tech Stack:** Node.js 24 LTS workflow, TypeScript ESM, Yarn Classic/Turbo, JSVision 1.6.0,
Porta SDK, Koa Admin API, PostgreSQL, and Redis.

**Architecture:** `porta admin` is an embedded JSVision application using direct menus, dialogs,
commands, immutable validated state, and generation-based late-result rejection. It calls the
existing organization-scoped SDK user domain; the server remains authoritative for authentication,
permissions, tenant scoping, lifecycle rules, and destructive operations.

**Key Files Examined:** `packages/cli/src/admin/{application,application-runtime,presentation,state,
session-service,organization-service,organization-dialogs}.ts`, `packages/cli/src/commands/user.ts`,
`packages/cli/src/client-factory.ts`, `packages/sdk/src/{domains/users,types/users,types/common,
agent}.ts`, `packages/sdk/src/transport/node-transport.ts`, `packages/sdk/tests/domains/{users,
standalone-users}.test.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/users/{types,
service,repository}.ts`, `packages/server/src/lib/entity-history.ts`, and the relevant admin UI
requirements and compatibility policy.

**Reconnaissance result:** Existing JSVision controls and application patterns are sufficient. No
new framework, package, endpoint, or server architecture is needed.

### Summary by Dimension

|   # | Dimension              | Findings | Highest Severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        1 | 🟡 Minor         |
|   2 | Implicit Assumptions   |        0 | —                |
|   3 | Logical Contradictions |        3 | 🟠 Major         |
|   4 | Completeness Gaps      |        1 | 🟠 Major         |
|   5 | Dependency Issues      |        0 | —                |
|   6 | Feasibility Concerns   |        1 | 🟠 Major         |
|   7 | Testability            |        1 | 🟡 Minor         |
|   8 | Security Blind Spots   |        1 | 🟡 Minor         |
|   9 | Edge Cases             |        0 | —                |
|  10 | Scope Creep Indicators |        1 | 🟡 Minor         |
|  11 | Ordering & Sequencing  |        0 | —                |
|  12 | Consistency            |        0 | —                |
|  13 | Codebase Alignment     |        1 | 🟠 Major         |

### Summary by Severity

| Severity    | Count | Status                                        |
| ----------- | ----: | --------------------------------------------- |
| Critical    |     0 | None                                          |
| Major       |     5 | PF-004 fixed; 4 in-scope resolutions selected |
| Minor       |     5 | In-scope resolutions selected                 |
| Observation |     0 | None                                          |

---

### PF-001: Read-gated navigation makes independent create and invite unreachable 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** UM-01, UM-05, UM-06, UM-12, Authorization matrix, and AC-9

**Codebase Evidence:** `packages/cli/src/admin/presentation.ts:235-247` already uses one parent menu
with independently enabled child commands; `packages/cli/src/admin/application.ts:180-194` enables
commands independently.

**The Problem:** The only Users entry is disabled without `admin:user:read`, while create and invite
must remain independently reachable. Unconditional post-success list/detail reload also assumes read
permission.

**Options:**

| Option | Description                                                                                                                                                                                                     | Pros                                                                               | Cons                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| A      | Enable the Users parent when any user capability exists; independently gate Browse, Create, and Invite. Refresh after create/invite only with read permission; otherwise show a fixed validated success result. | Reuses the existing menu pattern and preserves every approved permission boundary. | Adds one explicit no-read success presentation. |

**Recommendation:** Option A. Separate top-level Create/Invite entries were rejected because they
fragment the approved familiar Users area without improving capability handling.

**Delegated Decision (`--auto-design`):**

- **Authority:** AI — delegated by `--auto-design`
- **Eligibility:** Internal navigation and reconciliation mechanism inside approved capability rules
- **Objective:** Keep every authorized user action reachable with the smallest existing UI pattern
- **Decision:** Option A
- **Evidence:** RD-03 UM-12 and the existing Organizations child-command pattern
- **Rejected alternatives:** Separate top-level actions add avoidable navigation duplication
- **Strongest counterargument:** Built-in user-admin roles normally include read, but the approved
  capability contract explicitly requires independent affordances
- **Confidence:** High
- **Hardening:** Independent auditors and challenger agreed this is a real major defect and selected
  the same resolution
- **Policy version:** 1
- **Root invocation ID:** `preflight-admin-ui-rd03-20260829`
- **Reopen triggers:** User permissions cease to be independently represented or navigation is
  redesigned by a later approved requirement

### PF-002: Blanket mutation no-retry rule conflicts with the inherited one-time 401 replay 🟠 MAJOR

**Dimension:** Feasibility Concerns

**Location:** UM-08, UM-13, Operation behavior

**Codebase Evidence:** `packages/sdk/src/transport/node-transport.ts:66-80` refreshes and replays once
after a definite `401`; `packages/cli/src/client-factory.ts:57-67` uses that transport. RD-02
OC-10 already defines this as one logical submission.

**The Problem:** The RD categorically prohibits mutation retries although the existing SDK transport
can replay one request after a definite authentication rejection.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                  | Pros                                                               | Cons                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| A      | Permit the existing single definite-401 refresh replay as part of one logical submission; prohibit retries after transport, `5xx`, cancellation-after-dispatch, or other indeterminate outcomes. Enter the authentication gate only after the final `401` or failed refresh. | Matches RD-02 and the current SDK without new transport machinery. | One logical submission can contain two authenticated HTTP attempts. |

**Recommendation:** Option A. A separate non-replaying client was rejected as needless machinery.

**Delegated Decision (`--auto-design`):**

- **Authority:** AI — delegated by `--auto-design`
- **Eligibility:** Failure and recovery mechanism within the approved authentication policy
- **Objective:** Preserve safe mutation semantics while reusing the current SDK
- **Decision:** Option A
- **Evidence:** Existing transport behavior and approved RD-02 OC-10 semantics
- **Rejected alternatives:** A second client path duplicates transport policy solely for this UI
- **Strongest counterargument:** A literal no-retry rule appears safer, but it is not implementable
  through the required current SDK and would add a parallel path
- **Confidence:** High
- **Hardening:** Independent document auditor and challenger agreed
- **Policy version:** 1
- **Root invocation ID:** `preflight-admin-ui-rd03-20260829`
- **Reopen triggers:** The SDK removes or materially changes its one-time 401 replay

### PF-003: Cancellation both clears and preserves the invoking view 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** UM-13, UM-14, UM-16, AC-6, and AC-10

**Codebase Evidence:** `packages/cli/src/admin/application.ts:216-227,609-616` separates operation
ownership from application teardown and quarantines late modal results.

**The Problem:** UM-14 says cancellation clears user views, while UM-16 and AC-6 require focus and the
last validated detail to remain after cancellation.

**Options:**

| Option | Description                                                                                                                                                                                                               | Pros                                                                          | Cons                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A      | Cancellation invalidates only the active operation and late results while preserving the current validated view. Organization/session changes, session invalidation, disposal, and unrecoverable resize clear user views. | Matches existing application ownership and the approved single-operator flow. | Requires distinguishing operation cancellation from context teardown. |

**Recommendation:** Option A. Clearing all state was rejected because it contradicts the approved
focus-return and unchanged-detail behavior.

**Delegated Decision (`--auto-design`):**

- **Authority:** AI — delegated by `--auto-design`
- **Eligibility:** Internal cancellation and state-ownership mechanism
- **Objective:** Prevent stale redraws without discarding valid same-context state
- **Decision:** Option A
- **Evidence:** Current generation ownership and RD-03 AC-6/AC-10
- **Rejected alternatives:** Clearing the full view is unnecessarily destructive and contradictory
- **Strongest counterargument:** Full clearing is visually fail-closed, but no security boundary is
  crossed by retaining already validated same-context state
- **Confidence:** High
- **Hardening:** Independent auditor and challenger agreed
- **Policy version:** 1
- **Root invocation ID:** `preflight-admin-ui-rd03-20260829`
- **Reopen triggers:** The application adopts persistent cross-context view caching

### PF-004: One advertised create field is silently discarded by the server 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** UM-05, UM-15, SDK create/update alignment, and AC-3

**Codebase Evidence:** `packages/server/src/routes/users.ts:59-88` accepts
`phoneNumberVerified`; `packages/server/src/users/service.ts:115-138` does not forward it, and
`packages/server/src/users/repository.ts:35-62,79-113` does not persist it during creation.

**The Problem:** “Every field accepted by the create schema” includes a value that current server
behavior silently discards. The UI cannot honestly claim successful creation of that value.

**Options:**

| Option | Description                                                                                                                                      | Pros                                                   | Cons                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| A      | Define effective create support as the fields the current server persists; exclude `phoneNumberVerified` from Create while retaining it in Edit. | Honest behavior, no server change, and no added scope. | Narrows the literal schema-field wording. |

**Recommendation:** Option A. Fixing server persistence is technically possible but is outside this
strict Admin UI/SDK modification boundary and would expand verification into server behavior.

**User Decision:** Resolved — user directed filing the server defect and excluding
`phoneNumberVerified` from Create while retaining it in Edit. Tracked as
[`blendsdk/porta-identity#87`](https://github.com/blendsdk/porta-identity/issues/87).

**Fix status:** Applied to UM-05, the SDK input alignment table, and AC-3 on 2026-08-29. A later
preflight re-scan must verify the changed artifact before advancing the roadmap.

**Confidence:** High. **Hardening:** Every grounding review and the independent challenger confirmed
the mismatch; the challenger agreed Option A is the smallest in-scope correction.

### PF-005: SDK corrections omit affected current CLI and metadata consumers 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** UM-15, SDK contract corrections, AC-11, AC-12, and Technical Documentation Update

**Codebase Evidence:** `packages/cli/src/commands/user.ts:322-355` advertises unsupported email
updates; `packages/cli/src/commands/user.ts:436-451` sends no required lock reason;
`packages/sdk/src/agent.ts:88-103` advertises the old invitation result and lifecycle signatures.

**The Problem:** Corrected SDK inputs and signatures affect existing current consumers that are not
named by RD-03. Package compilation does not prove that public metadata and command behavior are
truthful.

**Options:**

| Option | Description                                                                                                                                       | Pros                                                                | Cons                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A      | Update the current CLI user commands, SDK agent metadata, focused tests, and docs together with the corrected SDK contracts. Add no legacy shims. | Keeps the supported current SDK/CLI triplet truthful and compiling. | Corrected public typings can require source changes for consumers using the former mismatches. |

**Recommendation:** Option A. Compatibility shims were rejected where they would preserve contracts
that the server does not actually support.

**User Decision:** Resolved by existing authority — AR-68 explicitly authorizes required SDK fixes,
the approved RD identifies them as public contract changes, and the governing compatibility policy
supports only the current server × current SDK/CLI triplet, not N/N-1 compatibility.

**Confidence:** High. **Hardening:** The independent challenger confirmed that current-consumer
updates are required and compatibility shims would be overengineering.

### PF-006: User-history bound and continuation behavior are undefined 🟡 MINOR

**Dimension:** Testability

**Location:** UM-10, History SDK correction, and Acceptance Criteria

**Codebase Evidence:** `packages/server/src/lib/entity-history.ts:31-46,122-190` defaults to 20 and
returns `hasMore` plus `nextCursor`; `packages/sdk/src/domains/users.ts:48,187-194` currently unwraps
the paginated result incorrectly as an array.

**The Problem:** “Bounded” gives no deterministic count or handling when more history exists, and no
acceptance criterion covers the history view.

**Options:**

| Option | Description                                                                                                                                                                                                 | Pros                                                                 | Cons                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| A      | Show the first newest-first page of 20, validate the paginated result, show a fixed indication when more entries exist, and add no history paging/filter UI in RD-03. Add one focused acceptance assertion. | Matches the existing endpoint and keeps global exploration in RD-08. | Older entries are not browsable in RD-03. |

**Recommendation:** Option A.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: testable paging mechanism within approved history scope; Objective: deterministic
bounded history without adding exploration UI; Decision: Option A; Evidence: server default and
RD-08 boundary; Rejected alternatives: history paging adds unapproved exploration; Strongest
counterargument: older entries remain inaccessible here, but RD-08 owns exploration; Confidence:
High; Hardening: two independent auditors agreed; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-20260829`; Reopen triggers: RD-08 changes the per-user-history boundary.

### PF-007: Invitation preview does not select a safe terminal projection 🟡 MINOR

**Dimension:** Security Blind Spots

**Location:** UM-06, User state and validation, Security Considerations, and AC-4

**Codebase Evidence:** `packages/sdk/src/domains/users.ts:51-56` and
`packages/server/src/routes/users.ts:685-745` expose subject, plain text, and HTML.

**The Problem:** “Preview the rendered invitation” does not state what the terminal displays or how a
malformed preview is handled. Raw HTML is unnecessary and conflicts with the terminal-output boundary.

**Options:**

| Option | Description                                                                                                                                    | Pros                                          | Cons                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| A      | Display only bounded, control-free subject and plain-text body; never render HTML. Treat malformed preview output as a fixed invalid response. | Safe, testable, and uses the existing result. | It is a text preview rather than visual email rendering. |

**Recommendation:** Option A.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: terminal-safe rendering mechanism under the approved preview; Objective: provide the
preview without terminal injection or an HTML renderer; Decision: Option A; Evidence: current
preview response and RD security boundary; Rejected alternatives: HTML rendering adds a new renderer
and unsafe ambiguity; Strongest counterargument: plain text is not visually identical to email, but
the approved terminal UI cannot render HTML faithfully; Confidence: High; Hardening: two independent
auditors agreed; Policy version: 1; Root invocation ID: `preflight-admin-ui-rd03-20260829`;
Reopen triggers: a later approved browser preview is added.

### PF-008: Login summary overlaps deferred lockout analysis 🟡 MINOR

**Dimension:** Ambiguities

**Location:** UM-04, RD-07 exclusion, and AC-5

**Codebase Evidence:** `packages/sdk/src/types/users.ts:70-80` exposes last login, login count, failed
login count, and last failed login fields.

**The Problem:** “Login summary” does not identify its fields and can absorb the explicitly deferred
lockout-analysis data.

**Options:**

| Option | Description                                                                                                         | Pros                                               | Cons                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| A      | Define the summary as `lastLoginAt` and `loginCount` only; leave failed-login fields and lockout analysis to RD-07. | Exact and preserves the approved roadmap boundary. | Shows less security detail in RD-03. |

**Recommendation:** Option A.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: field projection inside the approved detail view and deferral; Objective: exact detail
scope; Decision: Option A; Evidence: current SDK fields and RD-07 exclusion; Rejected alternatives:
failed-login data overlaps deferred lockout analysis; Strongest counterargument: the fields already
exist, but existence does not override the approved feature boundary; Confidence: High; Hardening:
two independent auditors agreed; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-20260829`; Reopen triggers: RD-07 is implemented into the same detail view.

### PF-009: Validation-input preservation conflicts with mandatory secret clearing 🟡 MINOR

**Dimension:** Logical Contradictions

**Location:** UM-05, UM-13, Operation behavior, and AC-3

**Codebase Evidence:** The current Admin UI keeps dialog-local inputs in
`packages/cli/src/admin/organization-dialogs.ts:359-430`; RD-03 must distinguish secret fields from
ordinary editable fields when following that pattern.

**The Problem:** One requirement preserves editable input after validation errors while another
clears password buffers after every failure.

**Options:**

| Option | Description                                                                                                     | Pros                                                   | Cons                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| A      | Preserve non-secret editable fields after validation errors, but always clear password and confirmation fields. | Preserves usability and the stronger secret invariant. | The operator must re-enter a rejected password. |

**Recommendation:** Option A.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: approved secret-lifetime and form-recovery mechanism; Objective: preserve non-secret
work without retaining credentials; Decision: Option A; Evidence: UM-05 and operation behavior;
Rejected alternatives: preserving secrets violates the explicit security rule; Strongest
counterargument: re-entry is less convenient, but the user already approved clearing on failure;
Confidence: High; Hardening: two independent auditors agreed; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-20260829`; Reopen triggers: the approved secret-lifetime policy changes.

### PF-010: “Other demonstrated mismatches” is an open-ended SDK scope hook 🟡 MINOR

**Dimension:** Scope Creep Indicators

**Location:** UM-15 and SDK contract corrections

**Codebase Evidence:** The current mismatches are bounded in `packages/sdk/src/types/users.ts:95-149`,
`packages/sdk/src/domains/users.ts:23-48,107-194`, and `packages/sdk/src/agent.ts:88-103`.

**The Problem:** The phrase can turn RD-03 into opportunistic SDK cleanup despite the exact correction
table and the user's strict feature boundary.

**Options:**

| Option | Description                                                                                                                    | Pros                                                                       | Cons                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A      | Limit UM-15 to the named user-domain corrections and only directly blocking mismatches proven by their focused specifications. | Prevents unrelated cleanup while allowing the feature to compile and work. | A newly discovered unrelated SDK defect stays outside RD-03. |

**Recommendation:** Option A.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: internal scope-control wording within the approved SDK-fix boundary; Objective: prevent
overengineering; Decision: Option A; Evidence: the exact correction table and strict exclusions;
Rejected alternatives: unrestricted cleanup contradicts the authorized scope; Strongest
counterargument: broad wording is flexible, but it weakens traceability and invites unrelated work;
Confidence: High; Hardening: independent fit auditor agreed; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-20260829`; Reopen triggers: the user explicitly expands SDK remediation scope.

---

### Verdict

RD-03 is feasible with the existing architecture and is appropriately bounded. PF-004 has been
resolved and fixed, but the remaining accepted in-scope corrections have not been applied or
re-scanned. The roadmap remains at `RD Drafted`.
