# Preflight Report: RD-05 Roles and Permissions

> **Status**: ✅ PASSED — 11 findings resolved (1 critical, 6 major, 4 minor)
> **Iteration**: 2 (post-resolution scan)
> **Artifact**: single requirement at `requirements/RD-05-roles-and-permissions.md`
> **Artifact SHA-256**: `06b4aa8177b2bfd7f6049c9687ef76f9c13adf85382e40f427a79e670aede3a8`
> **Codebase Grounded**: 33 source files, 22 test files, and 8 requirement/configuration files examined
> **Scope Mode**: strict
> **Last Updated**: 2026-09-09 10:50
> **CodeOps Artifact Schema**: 1

> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk is
> elevated. Five independent clustered auditors and one independent recommendation challenger were
> used. Consider an additional human security review because this feature controls authorization.

## Audit Scope

- **Target:** `codeops/features/admin-ui/requirements/RD-05-roles-and-permissions.md` only.
- **Context:** requirements README, Ambiguity Register, RD-03, RD-04, RD-10, AGENTS.md, and directly
  relevant server, SDK, conventional CLI, Admin UI, migration, and test files.
- **Authorized baseline:** application-scoped role/permission CRUD, direct role-permission mappings,
  selected-organization user-role assignments, Application detail tabs, one focused User Roles
  dialog, parent-qualified integrity, and targeted authority cleanup.
- **Excluded:** templates, hierarchy, bulk-user assignment, import/export, simulation, effective-
  permission viewer, search/pagination, ETags, workers, queues, and generalized frameworks.

## Codebase Context Summary

**Tech stack:** Node.js 24, TypeScript ESM, Koa, `oidc-provider`, PostgreSQL, Redis, Porta SDK/CLI,
and JSVision.

**Architecture:** Admin mutations run in request-owned PostgreSQL transactions. RBAC definitions and
many-to-many mappings live in PostgreSQL; Redis caches derived authority and OIDC/session state.
The SDK wraps the Admin API, and the embedded terminal UI calls the SDK through feature-local
services/controllers/workspaces.

**Key files examined:**

- `packages/server/src/middleware/admin-auth.ts`
- `packages/server/src/middleware/admin-mutation-audit.ts`
- `packages/server/src/lib/admin-permissions.ts`
- `packages/server/src/lib/database.ts`
- `packages/server/src/lib/super-admin-protection.ts`
- `packages/server/src/rbac/{role,permission,user-role}-service.ts`
- `packages/server/src/rbac/{role,permission,mapping}-repository.ts`
- `packages/server/src/routes/{roles,permissions,user-roles}.ts`
- `packages/server/src/oidc/account-finder.ts`
- `packages/server/src/users/repository.ts`
- `packages/sdk/src/domains/{roles,permissions,user-roles}.ts`
- `packages/cli/src/admin/{application,user}-workspace.ts`
- `packages/cli/src/commands/{app-role,app-permission,user-role}.ts`

**Reference verification:** all named components and primary API routes exist. The scan found
several current contracts that differ materially from the RD or make its accepted workflow unsafe.

## Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        0 | —                |
|   2 | Implicit Assumptions   |        1 | 🟠 Major         |
|   3 | Logical Contradictions |        2 | 🟠 Major         |
|   4 | Completeness Gaps      |        3 | 🟠 Major         |
|   5 | Dependency Issues      |        1 | 🟠 Major         |
|   6 | Feasibility Concerns   |        1 | 🟠 Major         |
|   7 | Testability            |        0 | —                |
|   8 | Security Blind Spots   |        3 | 🔴 Critical      |
|   9 | Edge Cases             |        1 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        0 | —                |
|  12 | Consistency            |        2 | 🟡 Minor         |
|  13 | Codebase Alignment     |        4 | 🟠 Major         |

Counts overlap where one root cause affects several dimensions. Finding totals below are deduplicated.

## Summary by Severity

| Severity       | Count | Status     |
| -------------- | ----: | ---------- |
| 🔴 Critical    |     1 | 1 resolved |
| 🟠 Major       |     6 | 6 resolved |
| 🟡 Minor       |     4 | 4 resolved |
| 🔵 Observation |     0 | —          |

## Findings

### PF-001: Application ownership does not bound authority resolution or delegation 🔴 CRITICAL

**Dimensions:** Security Blind Spots, Completeness Gaps, Codebase Alignment

**Location:** Feature Overview; AC-03, AC-09–AC-14; Server API and authorization; Security
Considerations

**Codebase evidence:**

- `packages/server/src/middleware/admin-auth.ts:275-299` accepts assigned `porta-*` role slugs
  without checking their application and resolves static capabilities by slug.
- `packages/server/src/lib/admin-permissions.ts:275-303` maps known slugs to static capability sets.
- `packages/server/src/rbac/mapping-repository.ts:217-254` resolves user roles and permissions
  without an application predicate.
- `packages/server/src/oidc/account-finder.ts:85-105` places those global unions into every client's
  claims even though the client application is available.
- `packages/server/src/routes/user-roles.ts:107-119` lets any holder of `admin:role:assign` assign
  any role ID, including a stronger canonical Admin role.
- `packages/server/src/cli/commands/init.ts:282-320` persists the canonical Admin application,
  permissions, roles, and mappings.

**Problem:** A foreign application can define `porta-super-admin` and gain Admin API significance.
An existing User Admin can also assign a stronger canonical role to themselves. Separately, OIDC
clients receive role and permission claims from unrelated applications. Switching Admin API
authorization directly to live mappings does not solve delegation: an Application Admin with role
update could add stronger permissions to its own role.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                                                      | Pros                                                                                                                         | Cons                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A      | Qualify OIDC claims to the requesting client application. Qualify Admin roles to the canonical `porta-admin` application, keep canonical built-in capability definitions static, keep their identity/mappings synchronized and protected, and enforce a capability ceiling when assigning canonical Admin roles. | Smallest secure change; prevents foreign-app claims and self-escalation; preserves current Admin authorization architecture. | Canonical built-ins become a narrow exception to ordinary CRUD, revising AR-131 with new security evidence.  |
| B      | Qualify OIDC/Admin roles by application, resolve Admin capabilities from live mappings, and add delegation checks preventing actors from granting capabilities they do not hold.                                                                                                                                 | Makes Admin mappings fully customizable and truthful.                                                                        | Adds a broader delegation-policy surface; every Admin role/mapping mutation becomes authorization-sensitive. |

**Recommendation:** Option A. The independent challenger chose a strengthened live-mapping design,
but that design still requires a new delegation boundary to stop an Application Admin from
expanding its own role. Static, canonical built-ins plus a small assignment ceiling are safer and
smaller; ordinary application roles and permissions remain fully manageable.

**Confidence:** High. **Hardening:** diverged from the challenger after testing live mappings against
the current `ROLE_UPDATE` and `ROLE_ASSIGN` capabilities. **Challenger:** diverged — preferred live
canonical mappings with narrow super-admin rules.

**User Decision:** Accepted Option A on 2026-09-09.

### PF-002: The last-super-admin guard is inaccurate and bypassable 🟠 MAJOR

**Dimensions:** Logical Contradictions, Security Blind Spots, Edge Cases

**Location:** AC-03, AC-04, AC-11, acceptance criteria 8 and 12

**Codebase evidence:** `packages/server/src/lib/super-admin-protection.ts:47-65,104-111` protects a
configured bootstrap user unconditionally and performs no survivor check. The route invokes it
before considering the requested role IDs (`packages/server/src/routes/user-roles.ts:125-134`). The
safe user-deletion pattern locks the control-plane organization and checks another active user with
the exact canonical role (`packages/server/src/users/repository.ts:745-795`).

**Problem:** The RD incorrectly says the survivor rule already exists for assignment removal.
Concurrent removals can remove both remaining assignments, while deleting or renaming the single
canonical super-admin role bypasses the user-level check entirely.

**Recommendation:** Replace the bootstrap-ID-only role-removal guard with the existing transaction-
local control-plane lock and exact canonical role survivor check. Apply the same serialization point
to every survivor-reducing path. Reject deletion or slug changes for the single canonical super-admin
role because one shared record represents all holders. This is a targeted invariant, not a protected-
role subsystem.

**Confidence:** High. **Hardening:** the challenger converged and clarified that the single canonical
role cannot safely be renamed or deleted. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-003: Authority capture has no deterministic concurrent-write boundary 🟠 MAJOR

**Dimensions:** Feasibility Concerns, Edge Cases

**Location:** AC-12–AC-15; Data integrity and mutation boundaries

**Codebase evidence:** request transactions provide no implicit domain locking
(`packages/server/src/lib/database.ts:68-108`), and mapping inserts/removals are independent SQL
statements (`packages/server/src/rbac/mapping-repository.ts:38-89,154-206`).

**Problem:** A concurrent mapping write can occur outside the affected-user capture and let stale
authority escape cleanup. AC-15's broad `no lock` wording may forbid the row locks needed for
correctness.

**Recommendation:** Require ordinary transaction-local PostgreSQL row locks on the existing target
user/roles or role/permissions, acquired in stable UUID order. Capture/recheck immediately before
mutation. Clarify that the exclusion covers UI locks, ETags, distributed locks, and locking
subsystems—not bounded database row locks.

**Confidence:** High. **Hardening:** the challenger converged and rejected advisory/global
Serializable machinery. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-004: Role-slug updates omit authority cleanup 🟠 MAJOR

**Dimensions:** Completeness Gaps, Codebase Alignment

**Location:** Domain Model; AC-03, AC-12, AC-13

**Codebase evidence:** role slugs are emitted into claims (`packages/server/src/rbac/user-role-service.ts:143-155`),
but role update invalidates only the role-object cache (`packages/server/src/rbac/role-service.ts:165-207`).

**Problem:** Changing a role slug changes authority claims for every assigned user, but the RD only
defines cleanup for mapping removal and deletion.

**Recommendation:** Treat an actual ordinary role-slug change as an authority reduction: lock and
capture assigned users, update the slug and revoke their tracked authority in the same transaction,
then schedule targeted cache cleanup. Name/description-only edits do not log users out. The
canonical super-admin slug remains protected by PF-002.

**Confidence:** High. **Hardening:** the challenger converged. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-005: Self-revocation conflicts with mandatory post-success reload 🟠 MAJOR

**Dimensions:** Logical Contradictions, Completeness Gaps

**Location:** AC-12, AC-15, acceptance criteria 4 and 6

**Codebase evidence:** targeted reductions may revoke the acting user's session, while current
controllers normally reload after success (`packages/cli/src/admin/application-controller.ts:341-344`;
`packages/cli/src/admin/user-controller.ts:269-274`). Existing session-invalid handling clears
protected state and re-enters authentication.

**Problem:** A known successful self-affecting reduction cannot perform the required authenticated
reload after its own session and token state have been removed.

**Recommendation:** Return a fixed server-derived `reauthenticationRequired` result when the
captured affected-user set contains the actor. On true, treat the mutation as definite success,
clear protected UI state, advance the session epoch, and enter authentication without a reload.
Never exempt the actor from revocation.

**Confidence:** High. **Hardening:** the challenger converged and established that the UI cannot
safely infer indirect role-permission impact. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-006: SDK user-role contracts cannot call the server 🟠 MAJOR

**Dimensions:** Implicit Assumptions, Codebase Alignment

**Location:** AC-10; SDK and conventional CLI contracts

**Codebase evidence:** the server returns `Role[]` and uses collection `PUT`/`DELETE` with
`{ roleIds }` (`packages/server/src/routes/user-roles.ts:88-139`). The SDK expects a fictitious
assignment projection, sends `POST { roleId }`, and deletes a suffixed path
(`packages/sdk/src/domains/user-roles.ts:11-32`).

**Problem:** The proposed User Roles dialog and existing conventional commands cannot list or mutate
assignments through the current SDK.

**Recommendation:** Align the SDK to `Role[]` and collection `PUT`/`DELETE` with role-ID arrays;
wrap the selected UI/CLI role in a one-element array. Update types, tests, CLI rendering, agent
metadata, and public docs. Do not change the coherent server contract.

**Confidence:** High. **Hardening:** the challenger converged. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-007: Required discovery capabilities are missing from the workflow matrix 🟠 MAJOR

**Dimensions:** Dependency Issues, Codebase Alignment

**Location:** AC-09, AC-10; Server API and authorization

**Codebase evidence:** application discovery requires `admin:app:read`
(`packages/server/src/routes/applications.ts:161-175`), but User Admin lacks it
(`packages/server/src/lib/admin-permissions.ts:157-174`). Permission discovery independently
requires `admin:permission:read` (`packages/server/src/routes/permissions.ts:123-133`).

**Problem:** User Admin cannot populate the application chooser needed to add a role. A role editor
without permission-read cannot populate the available-permission chooser.

**Recommendation:** Define the exact capability combinations. Grant `admin:app:read` to User Admin
through reset/init. Require role update plus permission read for role-permission Add; require role
assign plus application read for user-role Add. Keep unavailable controls visible-disabled with a
fixed reason.

**Confidence:** High. **Hardening:** the challenger converged. **Challenger:** converged.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-008: Published SDK agent metadata and docs are omitted 🟡 MINOR

**Dimension:** Completeness Gaps

**Location:** SDK and conventional CLI contracts; Verification Requirements

**Problem:** `@portaidentity/sdk/agent` publishes role/permission tools, but still describes
paginated lists and lacks permission update. Public docs would also retain false contracts.

**Recommendation:** Include agent definitions/executor tests and affected public docs in the SDK
contract correction. This is part of keeping the changed public API truthful, not a new feature.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-009: Add-action visibility wording is inconsistent 🟡 MINOR

**Dimension:** Consistency

**Location:** AC-02, AC-05, AC-16

**Problem:** Add is called merely capability-dependent while selected-row actions are explicitly
visible-disabled; the final criteria require every unavailable action to remain visible-disabled.

**Recommendation:** State that Add also remains visible-disabled when its exact capability is
absent. Selected-row actions additionally require selection.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-010: Role-slug syntax omits boundary characters 🟡 MINOR

**Dimension:** Codebase Alignment

**Location:** AC-03

**Codebase evidence:** `packages/server/src/rbac/slugs.ts:90-116` rejects leading and trailing
hyphens.

**Problem:** The current wording permits role slugs that local validation is required to reject.

**Recommendation:** Specify lowercase alphanumeric characters and interior hyphens, beginning and
ending with an alphanumeric character.

**User Decision:** Accepted the recommendation on 2026-09-09.

### PF-011: Resource audit attribution is optional despite existing support 🟡 MINOR

**Dimension:** Security Blind Spots

**Location:** Security Considerations, Audit

**Codebase evidence:** RBAC services accept actor IDs, but current routes omit them; the user-role
table also has `assigned_by` (`packages/server/migrations/006_roles_permissions.sql:60-73`).

**Problem:** “Where supported” permits resource events and assignment provenance to omit the actor
even though every RD-05 mutation has an authenticated actor.

**Recommendation:** Require actor propagation for every RD-05 create, update, assignment, removal,
and deletion event and for `assigned_by`.

**User Decision:** Accepted the recommendation on 2026-09-09.

## Post-Resolution Scan

| Finding | Applied resolution                                                                                                     | Verification result |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| PF-001  | Application-filtered OIDC claims; canonical `porta-admin` provenance; static built-in capabilities; assignment ceiling | Resolved            |
| PF-002  | Transactional exact-holder survivor rule; canonical identity, mapping, and deletion guards                             | Resolved            |
| PF-003  | Stable-order, transaction-local PostgreSQL row locks around affected-user capture                                      | Resolved            |
| PF-004  | Assigned-user authority revocation for actual ordinary role-slug changes                                               | Resolved            |
| PF-005  | Fixed `reauthenticationRequired` mutation result and direct authentication transition                                  | Resolved            |
| PF-006  | SDK `Role[]` and collection `PUT`/`DELETE` user-role contracts                                                         | Resolved            |
| PF-007  | Exact discovery/mutation capability matrix and User Admin application-read capability                                  | Resolved            |
| PF-008  | SDK agent tests/metadata and public contract documentation included                                                    | Resolved            |
| PF-009  | Add actions explicitly visible-disabled without exact capabilities                                                     | Resolved            |
| PF-010  | Role-slug boundary syntax specified                                                                                    | Resolved            |
| PF-011  | Authenticated actor required for mutation audit and `assigned_by`                                                      | Resolved            |

The second 13-dimension scan found no new ambiguities, contradictions, completeness gaps,
dependency issues, feasibility concerns, untestable requirements, security blind spots, missed edge
cases, scope expansion, ordering defects, inconsistencies, or codebase-alignment findings. The
requirement keeps ordinary external-application RBAC live and application-scoped while protecting
only the canonical Porta Admin authority boundary.

Validation completed:

- focused Prettier check passed for RD-05, the Ambiguity Register, this report, and continuity notes;
- all 97 repository structure tests passed, including local-document link and anchor checks;
- `git diff --check` passed;
- root `yarn verify` was not run, following the user's active directive.

## Adversarial Review Check

- The creation-time assumption most likely to survive same-agent review was that application-owned
  RBAC data was already application-scoped at claim and Admin authorization time. It is not.
- No new external standard conformance claim is introduced. Existing OIDC claims remain custom
  product claims; the required correction is an application ownership boundary, not a new RFC
  interpretation.
- The strongest contrary design is live customizable Admin mappings. It was rejected as the primary
  recommendation because current role-update and role-assignment capabilities would require a wider
  delegation-policy surface to prevent privilege escalation.

## Verdict

**Current result:** ✅ PASSED — every accepted correction is present in RD-05 and the complete
second scan found no remaining Critical or Major issue.
