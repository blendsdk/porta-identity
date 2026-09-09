# Preflight Report: Roles and Permissions Implementation Plan

> **Status**: ✅ PREFLIGHT PASSED — all 8 findings resolved
> **Iteration**: 3 (focused verification of the final ordering correction)
> **Artifact**: Full implementation plan at `codeops/features/admin-ui/plans/roles-and-permissions/`
> **Artifact ref**: SHA-256 manifest captured 2026-09-09 13:01 in the completed scan evidence
> **Codebase Grounded**: 73 explicit file references mapped; 50 existing paths verified and 23 correctly planned-new
> **Scope mode**: strict
> **Last Updated**: 2026-09-09

## Codebase Context Summary

**Tech stack:** Node.js 24, TypeScript ESM, Koa, PostgreSQL, Redis, `oidc-provider`, Yarn workspaces,
Vitest, Playwright assurance, and the JSVision terminal UI.

**Architecture:** Administrative mutations already use a request-owned PostgreSQL transaction and
post-commit hooks. RBAC data is application-owned. Public SDK domains feed conventional CLI and
embedded Admin UI adapters. The terminal UI uses immutable state, focused controllers/dialogs,
DataGrid, TabView, Layout DSL, and session-epoch invalidation.

**Key files examined:** RBAC repositories/services/routes; Admin authentication and permission
definitions; OIDC account, client metadata, and provider configuration; deletion cleanup and
database transaction ownership; canonical user-deletion protection; SDK RBAC domains/helpers;
Admin command/session/application composition; existing server, SDK, CLI, and Admin UI tests;
package manifests and assurance command registration.

**Product baseline:** Direct application-scoped RBAC CRUD, mappings, and selected-user role
assignment only. The smallest implementation reuses existing transaction, cleanup, SDK, command,
and terminal patterns. No migration, worker, queue, policy engine, distributed lock, ETag, generic
RBAC framework, pagination, or new dependency is authorized.

The clustered scan used two independent auditors plus inline fallback for the remaining clusters
because the repository agent-thread limit prevented five simultaneous auditor threads. Two
independent challenger passes reviewed the complete high-severity finding set.

## Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        1 | 🟠 Major         |
|   2 | Implicit Assumptions   |        4 | 🔴 Critical      |
|   3 | Logical Contradictions |        3 | 🟠 Major         |
|   4 | Completeness Gaps      |        2 | 🟠 Major         |
|   5 | Dependency Issues      |        1 | 🟠 Major         |
|   6 | Feasibility Concerns   |        1 | 🔴 Critical      |
|   7 | Testability            |        3 | 🟠 Major         |
|   8 | Security Blind Spots   |        2 | 🔴 Critical      |
|   9 | Edge Cases             |        1 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        2 | 🟠 Major         |
|  12 | Consistency            |        3 | 🟠 Major         |
|  13 | Codebase Alignment     |        5 | 🔴 Critical      |

## Summary by Severity

| Severity       | Count | Status   |
| -------------- | ----: | -------- |
| 🔴 Critical    |     1 | Resolved |
| 🟠 Major       |     7 | Resolved |
| 🟡 Minor       |     0 | —        |
| 🔵 Observation |     0 | —        |

## Findings

### PF-001: Production OIDC context lacks the planned application UUID 🔴 CRITICAL

**Dimensions:** Implicit Assumptions; Feasibility; Security; Codebase Alignment
**Plan location:** `03-01-authority-boundaries.md` §OIDC Application Claims;
`99-execution-plan.md` tasks 1.2.1–1.2.2; ST-5–ST-8
**Codebase evidence:** `packages/server/src/oidc/account-finder.ts:127` reads
`ctx.oidc.client.applicationId`, but `packages/server/src/clients/service.ts:578` does not emit it
and `packages/server/src/oidc/configuration.ts:640` does not register it as preserved metadata.

**Problem:** Synthetic account tests can pass while every production client receives empty RBAC
claims. The trusted application identifier must enter the real provider metadata path.

**Options:**

| Option | Description                                                                                                                                                                                           | Pros                                                                    | Cons                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| A      | Emit an internal application identifier from `findForOidc`, register it in `extraClientMetadata`, redact it from logs, and test the real metadata-to-account path plus every public auth-flow output. | Reuses the existing trusted metadata design; no extra claim-time query. | Adds one internal provider metadata field.  |
| B      | Resolve the provider client identifier in `account-finder` and query its application on every claims call.                                                                                            | Reads current database state at use time.                               | Adds a hot-path query and failure boundary. |

**Recommendation:** A. Use a Porta-namespaced internal metadata key. The existing client lookup has
already resolved authoritative application ownership, and provider metadata is the established
bridge. Allow only `account-finder` to consume the value. Specifications must prove the UUID is
absent from ID tokens, UserInfo, introspection, discovery, rendered login/consent/error output, and
logs. Add the identifier to the logger redaction list as a backstop.

**User Decision:** Resolved — User chose A with the explicit condition that application identity
must not leak through the authentication flow.
**Confidence:** High. **Hardening:** Challenger converged on A after tracing the complete production
metadata path.

### PF-002: Application RBAC has no production Admin-session wiring path 🟠 MAJOR

**Dimensions:** Implicit Assumptions; Completeness; Dependencies; Ordering; Codebase Alignment
**Plan location:** `03-04-admin-ui.md` §Direct Module Boundaries; `99-execution-plan.md` Phase 4
**Codebase evidence:** `packages/cli/src/commands/admin.ts:109` supplies only organization, user,
application, and client SDK factories; `packages/cli/src/admin/session-service.ts:135` accepts the
same four; `packages/cli/src/admin/application.ts:41` exposes no RBAC operation bundle. RBAC
capability booleans are scheduled only in Phase 5.

**Problem:** Phase 4 cannot wire or enforce the Application Roles/Permissions tabs in production.

**Options:**

| Option | Description                                                                                                  | Pros                                                        | Cons                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| A      | Add three separate role, permission, and user-role factory parameters.                                       | Repeats the existing one-domain convention.                 | Extends an already long positional signature by three arguments. |
| B      | Pass one feature-local lazy RBAC factory containing the three SDK domains through the existing session seam. | One cohesive feature dependency; avoids a general DI layer. | Introduces one composite domain shape.                           |

**Recommendation:** B. Add `commands/admin.ts`, production wiring tests, and Phase 4 capability and
session wiring to the executable modification set.

**User Decision:** Resolved — User accepted B with the standing condition that the composition stay
feature-local and not become a general injection layer.
**Confidence:** High. **Hardening:** Challenger converged on B; the factory remains feature-local
and is not a new dependency-injection framework.

### PF-003: Unknown mutation recovery alternates between Reload and Retry 🟠 MAJOR

**Dimensions:** Logical Contradictions; Testability; Edge Cases; Consistency
**Plan location:** `03-02-rbac-mutations.md` §Error Handling; `03-04-admin-ui.md` §Mutation State;
ST-42; `99-execution-plan.md` task 4.2.2
**Codebase evidence:** RD-05 AC-15 requires explicit reload. Existing controllers use
`recoveryRequired` to prevent another mutation before reconciliation
(`packages/cli/src/admin/application-controller.ts:28`,
`packages/cli/src/admin/client-controller.ts:32`).

**Problem:** “Retry” may replay an indeterminate destructive mutation. Tests and UI behavior need
one unambiguous read-only recovery action.

**Options:**

| Option | Description                                                                                                                     | Pros                                                     | Cons                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| A      | Standardize the visible action and normative behavior on read-only `Reload`; a new mutation requires a later deliberate action. | Safest and smallest; matches the existing recovery gate. | May require the operator to initiate the intended mutation again. |
| B      | Keep label `Retry` but define it as read-only reload.                                                                           | Retains familiar wording.                                | The label still suggests mutation replay.                         |
| C      | Reload first, then add conditional resubmission when absence is proven.                                                         | Can finish the original intent.                          | Adds unnecessary workflow and proof logic.                        |

**Recommendation:** A.

**User Decision:** Resolved — User accepted A; recovery is an explicit read-only Reload.
**Confidence:** High. **Hardening:** Challenger converged on A and rejected conditional replay as
out-of-scope machinery.

### PF-004: Canonical built-in metadata mutability is unresolved 🟠 MAJOR

**Dimensions:** Ambiguities; Logical Contradictions; Consistency
**Plan location:** `03-01-authority-boundaries.md` §Canonical Porta Admin Authority;
`03-04-admin-ui.md` §Application Tabs; ST-9
**Codebase evidence:** Role updates accept name, slug, and description
(`packages/server/src/routes/roles.ts:46`); permission updates accept name and description
(`packages/server/src/routes/permissions.ts:42`). Static definitions and init own canonical labels
and mappings (`packages/server/src/lib/admin-permissions.ts:114`,
`packages/server/src/cli/commands/init.ts:281`).

**Problem:** The plan protects canonical “records” but also says descriptive metadata may remain
editable. Server guards, UI buttons, and ST-9 can therefore implement incompatible field rules.

**Options:**

| Option | Description                                                                                                      | Pros                                                         | Cons                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| A      | Permit name/description edits for canonical roles and permissions; reject identity, delete, and mapping changes. | Allows harmless customization.                               | Creates two label sources and can misrepresent static authority. |
| B      | Reject all generic update, delete, and mapping mutations for canonical records; reset/init is the sole writer.   | One simple rule; canonical display and power cannot diverge. | Prevents descriptive customization.                              |

**Recommendation:** B. Keep canonical Edit/Delete/Manage-mapping actions visible-disabled with a
fixed reason; keep the server authoritative.

**User Decision:** Resolved — User accepted B; generic CRUD cannot alter canonical records.
**Confidence:** High. **Hardening:** Challenger chose B because mutable benign-looking labels can
misrepresent static control-plane power.

### PF-005: Known existing contract tests are absent from plan tasks 🟠 MAJOR

**Dimensions:** Completeness; Testability; Codebase Alignment
**Plan location:** `07-testing-strategy.md` §Implementation Tests; `99-execution-plan.md` Phases 2–5
**Codebase evidence:** Existing tests assert the old responses or shapes in
`packages/server/tests/unit/routes/{roles,permissions,user-roles}.test.ts`,
`packages/server/tests/unit/rbac/{role-repository,permission-repository}.test.ts`,
`packages/cli/tests/commands/{app,user}.test.ts`, and
`packages/cli/tests/admin/{session,session-wiring}.spec.test.ts`.

**Problem:** Workspace verification will fail after the planned status, signature, DTO, and
capability changes. The execution checklist is the single task authority but assigns no update for
these known suites.

**Only viable resolution:** Add the named suites to their owning phase tasks. Replace obsolete
expectations with exact approved contracts; do not delete, skip, weaken, or broadly rewrite tests.

**User Decision:** Resolved — User accepted the narrow phase-local test maintenance.
**Confidence:** High. **Hardening:** Challenger confirmed this is necessary contract maintenance,
not new feature scope.

### PF-006: SDK validation promise conflicts with the stated UI-only boundary 🟠 MAJOR

**Dimensions:** Implicit Assumptions; Logical Contradictions; Security; Codebase Alignment
**Plan location:** `03-03-sdk-cli-contracts.md` §SDK Contracts; ST-25 and ST-29; Phase 3
**Codebase evidence:** `packages/sdk/src/domains/{roles,permissions,user-roles}.ts` uses unchecked
generic unwrapping, while `packages/sdk/src/domains/helpers.ts:21` already provides `requireData`.
The conventional CLI and agent consume the SDK without the Admin UI.

**Problem:** TypeScript types do not validate remote JSON. In particular, malformed reduction
results cannot safely drive a committed-success or reauthentication decision.

**Options:**

| Option | Description                                                                                                               | Pros                                                               | Cons                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| A      | Add narrow structural guards in the RBAC SDK domains using `requireData`; retain terminal-specific projection validation. | One trustworthy public contract for SDK, CLI, agent, and Admin UI. | Some validation remains intentionally stricter in the terminal layer. |
| B      | Remove the SDK validation promise and define malformed-response handling separately in every non-UI consumer.             | Matches older unchecked domains.                                   | Duplicates uncertainty at security-sensitive consumers.               |

**Recommendation:** A. No schema framework is needed.

**User Decision:** Resolved — User accepted A using only existing SDK validation primitives.
**Confidence:** High. **Hardening:** Challenger converged on the existing narrow SDK helper.

### PF-007: Canonical survivor SQL would be duplicated 🟠 MAJOR

**Dimensions:** Implicit Assumptions; Codebase Alignment
**Plan location:** `03-02-rbac-mutations.md` §Canonical Survivor and Audit; task 2.2.5
**Codebase evidence:** The exact lock and survivor algorithm is embedded in
`packages/server/src/users/repository.ts:732`; `super-admin-protection.ts` instead protects one
bootstrap user through `system_config`.

**Problem:** The listed Phase 2 files cannot reuse the existing transaction algorithm. Copying its
security-sensitive SQL into the RBAC service would create two survivor implementations.

**Options:**

| Option | Description                                                                                                                                | Pros                                                              | Cons                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| A      | Expose a narrowly named repository-owned survivor primitive from `users/repository.ts`; reuse it from user deletion and user-role removal. | Keeps SQL in persistence code; smallest extraction; no new layer. | Adds a narrow cross-domain repository dependency.              |
| B      | Move the primitive into `super-admin-protection.ts` and call it from both paths.                                                           | Centralizes the named protection behavior.                        | Mixes database locking with the existing bootstrap-user guard. |

**Recommendation:** A. Add `users/repository.ts` and its exact lock/order tests to Phase 2.

**User Decision:** Resolved — User accepted A and prohibited a new repository or protection
framework.
**Confidence:** High. **Hardening:** Challenger preferred A and rejected a new authority repository
as needless abstraction.

### PF-008: Phase 4 capability wiring follows its consumers 🟠 MAJOR

**Dimensions:** Logical Contradictions; Ordering & Sequencing; Testability; Consistency
**Plan location:** `03-04-admin-ui.md` §Direct Module Boundaries; `99-execution-plan.md` tasks
4.2.1–4.2.5 and 5.2.2
**Codebase evidence:** `packages/cli/src/admin/state.ts:6` centrally owns capabilities and
`packages/cli/src/admin/session-service.ts:265` derives them from UserInfo.

**Problem:** The design requires capability and session wiring before Application RBAC consumers,
but task 4.2.5 currently follows the controller, workspace, and mount tasks. Phase 5 then repeats
the instruction to add exact RBAC capability booleans.

**Options:**

| Option | Description                                                                                                                                                                                | Pros                                                                 | Cons                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| A      | Move the central capability mapping and lazy RBAC session bundle before the Phase 4 consumers; narrow Phase 5 to User Roles mounting and use of the already-defined assignment capability. | Matches dependency order; one capability owner; no new code surface. | Renumbers Phase 4 tasks.                                      |
| B      | Split exact capability fields between Phase 4 Application RBAC and Phase 5 User Roles.                                                                                                     | Keeps user assignment work in Phase 5.                               | Reopens the same central files and creates divided ownership. |

**Recommendation:** A. This is only task reordering and wording; it adds no abstraction or product
behavior.

**User Decision:** Resolved — User accepted A; central capability and session wiring precedes its
consumers, and Phase 5 only mounts and consumes that contract.
**Confidence:** Medium. **Hardening:** The two-challenger scan budget was already consumed by the
earlier critical/major batches; the recommendation follows the direct import and production
composition dependency.

**Iteration 3 evidence:** The RBAC state/service adapter task now precedes production capability and
session wiring, which in turn precedes every controller/workspace consumer. Phase 5 only mounts the
User Roles workflow using the established capability contract. The reviewer confirmed that this
exact swap closes the residual dependency and found no additional issue in the focused surface.

## Rejected Candidate Findings

- Existing-database reconciliation is not a finding. The user explicitly confirmed that Porta has
  no deployed users or production data and development state is disposable through
  `yarn admin:env reset`; adding migration or upgrade machinery would violate scope.
- The root `yarn verify` prohibition is not a finding. It is an explicit user instruction and the
  accepted plan names the current equivalent structure plus server, SDK, and CLI workspace gates.
  Root `yarn verify` remains prohibited.

## Verdict

✅ **PREFLIGHT PASSED — all 8 findings are resolved and verified.**

No finding requires new infrastructure or generalized machinery. The recommended correction set
adds only missing production seams, direct validation, precise recovery wording, explicit existing
test maintenance, and one extraction of already-existing survivor SQL.
