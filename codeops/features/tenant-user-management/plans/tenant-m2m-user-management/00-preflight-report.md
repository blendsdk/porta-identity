# Preflight Report: Tenant-Scoped M2M User Management

> **Status**: ✅ PREFLIGHT PASSED WITH NOTES — 17 findings resolved; 2 accepted conditions (migration maintenance window/backup; historical deleted-actor `system` classification)
> **Iteration**: 2 (re-scan after fixes; plan promoted)
> **Artifact type**: Implementation plan (standalone; no upstream RD)
> **Audit target**: `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/` — all 10 documents (originally reviewed at `/home/gevik/.opencode/plan/tenant-m2m-user-management/`, promoted after PF-009)
> **Content identity**: 10-document set SHA-256 `7e8fa4ceea2cebc3f6947d699a6221988c401b3413549730b1ca739a09fe7656` (sorted per-file hashes; 00-index hash `35f78ce7…0f02a`)
> **Codebase grounded**: 42 source files, 19 test files, 10 plan documents, 8 docs/techdocs files examined
> **Last Updated**: 2026-10-25

## Review scope and authority

| Item | Value |
| --- | --- |
| Audit target | The whole plan directory (all 10 documents). Findings apply only to these documents. |
| Context documents | `AGENTS.md`, `codeops/codeops.json`, `codeops/.codeops.yml`, server/SDK/CLI source and tests, `docs/`, `techdocs/`, assurance registry. Context is read-only evidence; it is not passed by this review. |
| Modification set applied | **Applied on 2026-10-25.** All 10 plan documents were edited to resolve the findings; the plan was promoted into `codeops/features/tenant-user-management/`; this report was updated for iteration 2. |
| Authorized modification set | The 10 plan documents plus this report. The user accepted the recommendations, including the feature promotion and the local commit. Push is not implied. |
| Scope mode | **Strict** (no `--explore-scope`). No optional additions are reported. |
| Delegated authority | `--auto-design` active. Root invocation ID `pf-tenant-m2m-20261025-01`; policy version 1. Eligible technical resolutions are recorded below. Reserved decisions PF-005 and PF-009 were resolved by the user on 2026-10-25. |
| Commit authority | The user accepted the recommendations and the original `--auto-commit` request. A local commit is created with this change; no push is performed. |

**Same-agent bias:** The artifact was authored on 2026-10-25 in an earlier session. This scan runs in a separate session, but the same model family remains a bias risk. One independent challenger reviewed the MAJOR finding batch blind to the parent's picks. The plan is security-sensitive; a human domain expert review is still recommended before execution.

## Codebase Context Summary

**Tech stack:** TypeScript ESM (Node 22/24), Koa 3, `oidc-provider` 9, PostgreSQL 16, Redis, Zod 4.6.6, Vitest, Yarn Classic + Turbo. Nested CodeOps layout (`codeops/.codeops.yml`, integration branch `develop`).

**Architecture observed:**

- Server routes/middleware/services/repositories under `packages/server/src`; admin mutations are transaction-wrapped by `adminMutationAudit` only for `/api/admin/*`.
- Tenant invite route `routes/tenant-invitations.ts` uses `middleware/tenant-invite-auth.ts` and stores `ctx.state.tenantInviteActor`.
- Audit writers in `lib/audit-log.ts`: best-effort `writeAuditLog` and transaction-bound `writeAuditLogInTransaction`. `adminMutationAudit` also writes `admin.mutation.committed`.
- User mutations live in `users/service.ts`; role mutations in `rbac/user-role-service.ts`; both accept optional/required actor IDs today, not a typed actor contract.
- SDK domains already use `/organizations/:orgId/users`; `apiPrefix: '/api'` selects tenant paths. `CreateUserInput` deliberately excludes `phoneNumberVerified`; `UpdateUserInput` deliberately excludes `emailVerified`.
- CLI audit table uses `printTable` (which sanitizes); admin user history is rendered directly by the terminal UI.

**Key files examined:** `middleware/tenant-invite-auth.ts`, `routes/tenant-invitations.ts`, `routes/users.ts`, `routes/user-roles.ts`, `users/service.ts`, `users/invite-service.ts`, `users/invitation-service.ts`, `users/repository.ts`, `users/types.ts`, `users/errors.ts`, `rbac/user-role-service.ts`, `rbac/mapping-repository.ts`, `lib/audit-log.ts`, `lib/entity-history.ts`, `lib/database.ts`, `lib/etag.ts`, `lib/data-export.ts`, `auth/token-repository.ts`, `routes/audit.ts`, `oidc/scopes.ts`, `oidc/configuration.ts`, `server.ts`, `middleware/admin-mutation-audit.ts`, `middleware/require-user-organization.ts`, `middleware/require-existing-organization.ts`, `middleware/tenant-invite-rate-limiter.ts`, `cli/commands/init.ts`, SDK users/user-roles/types/transport/auth, CLI audit/user-service/user-state/user-workspace/output, `migrations/009_audit_log.sql`, migration inventory, assurance registry.

**Reference verification:** All material file paths and line references in the plan exist and were checked. No phantom file reference was found. At review time, three behavioral claims were stale and drove findings: Admin duplicate-email was `400`; `assignRolesToUser` used best-effort audit, not the transaction writer; and the proposed audit migration was not “additive only” at the SQL level. Two plan claims remain unverifiable from the repository: production `audit_log` volume and whether all accepted assurance observers will remain unchanged after this feature.

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
| --- | --- | --- | --- |
| 1 | Ambiguities | PF-011, PF-012 | 🟡 MINOR |
| 2 | Implicit Assumptions | — | — |
| 3 | Logical Contradictions | PF-001, PF-005, PF-013, PF-016 | 🟠 MAJOR |
| 4 | Completeness Gaps | PF-008, PF-009, PF-015 | 🟠 MAJOR |
| 5 | Dependency Issues | — (PF-002, PF-003, PF-009 touch) | — |
| 6 | Feasibility Concerns | — (PF-005 touches) | — |
| 7 | Testability | PF-004 | 🟠 MAJOR |
| 8 | Security Blind Spots | PF-010, PF-017 | 🟠 MAJOR |
| 9 | Edge Cases | — (PF-010, PF-016 touch) | — |
| 10 | Scope Creep | — (PF-001 touches) | — |
| 11 | Ordering & Sequencing | — (PF-004, PF-009 touch) | — |
| 12 | Consistency | PF-006, PF-014 | 🟠 MAJOR |
| 13 | Codebase Alignment | PF-002, PF-003, PF-007 | 🟠 MAJOR |
| **Total** | | **17** | 🟠 MAJOR |

## Summary by Severity

| Severity | Count | Status |
| --- | --- | --- |
| 🔴 CRITICAL | 0 | — |
| 🟠 MAJOR | 10 | All resolved — 8 by delegated authority, 2 by user decision (PF-005, PF-009) |
| 🟡 MINOR | 7 | All resolved by delegated authority |
| 🔵 OBSERVATION | 0 | — |

## Iteration 2 verification (2026-10-25)

**Previous iteration:** 17 findings — all addressed. **This iteration:** 0 new findings. **Carried forward:** none.

| Finding | Fix applied | Verification |
| --- | --- | --- |
| PF-001 | Admin duplicate-email keeps `400`; tenant maps to `409`; AR-20/01/03-02/07 aligned. | `00-ambiguity-register` AR-20, `01` Compatibility, `03-02` schemas/create/error table, `07` ST-13 and Existing Test Updates are consistent. |
| PF-002 | `InviteActor` kept for invite; `AuditActor` at service/audit boundaries; mapping helpers and caller/test list added. | `03-03` Audit Actor Contract/Mutation Coverage; `02` relevant files; `99` 1.1.10/2.2.2/3.2.3. |
| PF-003 | Mutation services own `runDatabaseTransaction`; stale role-assignment durability claim corrected. | `02` Gap 4/5; `03-02` delete/role behavior; `03-03` mutation table; `99` 2.2.2/3.2.1/3.2.3. |
| PF-004 | Spec tasks extended to ST-38–ST-42, integration ST-27–ST-46/rate, and ST-22 pentest. | `07` spec table; `99` 1.1.2/2.1.2/3.1.1/3.1.2; `99` 56-task count. |
| PF-005 | User chose B: keep backfill, correct “no rewrite” claims, require maintenance window/backup, accept historical `system`. | `00-ambiguity` AR-21; `01` Performance; `02` risk; `03-03` operational note/error/testing; `07` ST-46; `99` 1.1.7/5.1.8/Success 9. |
| PF-006 | Harness recorded against accepted baseline; expected exit `40`; never called fully passed. | `00-ambiguity` AR-23; `01` Verification/Acceptance 7; `00-index` Key Decisions; `07` checklist; `99` 5.1.3/Success 3. |
| PF-007 | Existing test/mock/fixture updates enumerated; central audit insert helper added; SDK exact contracts scheduled. | `02` relevant files; `07` Existing Test Updates; `99` 1.1.9/1.1.13/2.3.2/3.2.8/4.1.1/4.2.7. |
| PF-008 | Admin and standalone lifecycle actor propagation added; CLI bootstrap documented as `system`. | `01` R18; `02` code analysis/relevant files; `03-02` lifecycle/integration; `99` 2.2.5/3.2.2. |
| PF-009 | User chose A: new `tenant-user-management` feature, plan moved, roadmap `T-01`, branch from `origin/develop`. | Plan now in `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/`; feature and portfolio roadmaps added; branch `feat/tenant-m2m-user-management` created from `origin/develop` (PR #189 present). |
| PF-010 | CLI history validates client actor strings and degrades unsafe names to a placeholder; render sanitized. | `03-04` CLI/error/testing; `07` ST-52; `99` 4.1.2/4.2.2/4.2.7. |
| PF-011 | `RoleApplicationBoundaryError` mapped to `400`; ST-34/ST-36 aligned. | `03-02` Role Behavior/Error Handling; `07` ST-34/ST-36; `99` 3.2.3. |
| PF-012 | `UserRoleMutationOptions`; `assigned_by=null` for service; `system` rejected. | `03-02` Role Behavior; `99` 3.2.3. |
| PF-013 | R10/acceptance qualified; `acceptInvitation` explicitly out of scope. | `01` R10/Acceptance 5; `03-03` mutation table. |
| PF-014 | `tenant-invitations.ts` retired; no re-export shim. | `03-01` Integration Points; `99` 1.1.6. |
| PF-015 | List/identifier/role schemas and shared error mapper extracted. | `03-02` Validation/Read/Integration; `99` 2.2.1. |
| PF-016 | Invalid/foreign org `403` separated from absent user `404`. | `03-01` Error Handling; `03-02` error table. |
| PF-017 | Security decision/reference instrumentation preserved with ST-51. | `03-01` Middleware/Testing; `07` ST-51; `99` 1.1.1/1.1.5. |

**Re-scan result:** All 13 dimensions were re-checked within the changed artifact. No new ambiguity,
contradiction, dependency, feasibility, testability, security, edge-case, scope, ordering,
consistency, or codebase-alignment finding was introduced by the fixes. The two accepted conditions
are the migration maintenance window/backup and the historical deleted-actor `system`
classification required by PF-005; neither is an unresolved finding.

**Residual risk:** Production `audit_log` volume remains unknown. The plan chooses a maintenance
window and backup instead of a multi-phase online migration. If production volume is large, reopen
PF-005 and switch to the multi-phase option before deploying migration `034`.

---

## Findings

### PF-001: Admin duplicate-email status change contradicts AR-20 and the compatibility contract [🟠 MAJOR]

**Dimension:** 3 — Logical Contradictions
**Location:** `01-requirements.md` → Compatibility; `03-02-user-crud-routes.md` → Validation Schemas / Create Behavior; `00-ambiguity-register.md` AR-20
**Codebase Evidence:**

- `packages/server/src/routes/users.ts:211-213` maps `UserValidationError` to `400`.
- `packages/server/tests/unit/routes/users.test.ts:228-237` asserts `400` for duplicate email.
- `packages/server/src/routes/users.ts:247-260` and `:315-335` use the shared Admin create/update schemas.
- AR-20 (`00-ambiguity-register.md:27`) authorizes adding `emailVerified` to shared schemas but says “Keep the Admin route behavior otherwise unchanged.”
- `01-requirements.md:66` says Admin behavior remains unchanged except the actor ID.

**The Problem:** The plan adds a typed `UserEmailConflictError` and says it must map to `409` in **both** the Admin and tenant error handlers. That changes the Admin duplicate-email response from `400` to `409` without an authorized compatibility change, contradicts AR-20, and breaks the existing Admin route test. The shared-schema addition of `emailVerified` is authorized by AR-20; the defect is the Admin status change and the inaccurate compatibility statement.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Keep Admin `400`; map the typed conflict to `409` only in the tenant handler; update the compatibility statement to mention the additive `emailVerified` field. | Preserves the public Admin contract and AR-20; tenant still gets the required `409`; small change. | Two mappings for one error type; needs a clear Admin error-handler test. |
| B | Change Admin and tenant to `409`; revise AR-20 and the compatibility statement. | One consistent status. | Public Admin behavior break; requires explicit user approval; existing Admin test changes. |

**Recommendation:** Option A — it is the only option that satisfies both AR-20 and the tenant `409` requirement without a public compatibility break.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: failure/response mapping and schema ownership; inside the confirmed goal; preserves the existing public contract, so no reserved compatibility consequence.
- Objective: give the tenant surface `409` while keeping Admin behavior as AR-20 requires.
- Evidence: `routes/users.ts:211-213`, `users.test.ts:228-237`, AR-20, `01-requirements.md:66`.
- Rejected: Option B (public Admin change; reserved authority).
- Strongest counterargument: one shared error type with two status mappings can drift; mitigated by a shared tenant error mapper plus explicit Admin and tenant handler tests.
- Confidence: High — the Admin `400` assertion and AR-20 are unambiguous.
- Hardening: Challenger converged after narrowing the finding to the status change; it also recommended keeping the additive `emailVerified` field (already authorized by AR-20) and documenting it in the compatibility statement.
- Reopen triggers: if the user explicitly authorizes a public Admin `409` change, or AR-20 is revised.

---

### PF-002: `AuditActor` refactor leaves `InviteActor` semantics and unlisted callers/tests unresolved [🟠 MAJOR]

**Dimension:** 13 — Codebase Alignment
**Location:** `03-03-audit-client-actor.md` → Audit Actor Contract / Mutation Coverage; `03-02-user-crud-routes.md` → Role Behavior; `02-current-state.md` → Relevant Files; `99-execution-plan.md` tasks 2.2.2 / 2.2.5 / 3.2.3
**Codebase Evidence:**

- `packages/server/src/users/invite-service.ts:107-118` defines `InviteActor` with `kind: 'admin' | 'user' | 'service'`, `userId?`, `clientId?`, `displayName`, and `permissions?`.
- `users/invite-service.ts:294` and `:318` use `actor.displayName` for invitation details and email; `AuditActor` in the plan has no `displayName`.
- `users/service.ts:101,213,338,365,728` accept optional string `actorId`.
- `rbac/user-role-service.ts:61-66,105-110` accept required string actor IDs.
- Unlisted callers: `packages/server/src/cli/commands/init.ts:367,380`; `routes/users.ts:606-720` standalone router; tests `users/service.test.ts:172,259`, `rbac/user-role-service.test.ts`, `integration/rbac/authority-mutations.spec.test.ts:214,258`, `integration/rbac/permission-deletion-concurrency.impl.test.ts:65`, `integration/admin/record-deletion.spec.test.ts:436`, `unit/routes/user-roles.test.ts:202-207,266-271`.
- `02-current-state.md` lists neither the CLI init caller nor the standalone router nor the affected tests.

**The Problem:** The plan says the services accept an `AuditActor` instead of an optional actor ID, but it does not resolve how the invitation workflow keeps its `displayName`/`admin` semantics, and it does not enumerate the string-actor callers and tests that will fail typecheck or change behavior. A blanket conversion would either break the invitation email or force an artificial extension of `AuditActor`.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Keep `InviteActor` as the invitation workflow contract; introduce `AuditActor` only at service/audit boundaries; add explicit caller/test updates and mapping helpers. | Preserves email/delegation semantics; keeps audit type narrow; clear separation. | Two actor shapes plus a mapper; needs a complete caller list. |
| B | Extend `AuditActor` with `displayName` and `admin` and use it everywhere. | One actor type. | Conflates audit attribution with invitation workflow data; wider blast radius. |
| C | Accept `AuditActor | string` and normalize strings to user actors. | Minimal immediate breakage. | Weak typing; misattributes non-user callers; hides the required migration. |

**Recommendation:** Option A — keep the invitation workflow actor and map it to a narrow audit actor. Add explicit tasks for `routes/users.ts`, the standalone router, `cli/commands/init.ts`, and the listed tests.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: internal architecture/interfaces and failure-safe actor attribution; inside the confirmed scope; no reserved consequence.
- Objective: make client/user attribution first-class without losing invitation display semantics.
- Evidence: `InviteActor` and `AuditActor` shapes above; service signatures and unlisted callers.
- Rejected: Option B (conflates concerns); Option C (weak typing and hidden migration).
- Strongest counterargument: two actor unions and a mapper add boilerplate; mitigated by one `toAuditActor` helper and a single caller inventory.
- Confidence: High — the `displayName` use is explicit in `invite-service.ts`.
- Hardening: Challenger converged on Option A and added the exact caller list; it proposed one pure `toAuditActor` helper for all actor shapes.
- Reopen triggers: if the invitation workflow is redesigned to not need `displayName`, or if a single actor type becomes a hard requirement.

---

### PF-003: Tenant delete/role routes have no transaction owner [🟠 MAJOR]

**Dimension:** 13 — Codebase Alignment
**Location:** `03-02-user-crud-routes.md` → Delete Behavior / Role Behavior; `03-03-audit-client-actor.md` → Mutation Coverage; `99-execution-plan.md` tasks 3.2.1 / 3.2.3
**Codebase Evidence:**

- `packages/server/src/middleware/admin-mutation-audit.ts:24-40` wraps only paths starting `/api/admin/`.
- Tenant routes are `/api/organizations/:orgId/users` (`routes/tenant-invitations.ts:81`; plan `03-02` route table).
- `packages/server/src/users/service.ts:735-736` throws without an active transaction for delete.
- `packages/server/src/rbac/user-role-service.ts:68-70` and `:112-115` throw without an active transaction for role assignment/removal.
- `adminMutationAudit` is mounted at `server.ts:250`; the tenant invite router is mounted at `server.ts:296-298`.
- `03-03` says `assignRolesToUser` already uses “Existing transaction + transaction writer”; in fact assignment uses `void writeAuditLog` at `user-role-service.ts:84`, while removal uses `writeAuditLogInTransaction` at `:134`.

**The Problem:** A tenant `DELETE /:userId` or a tenant role mutation will call a service that requires an active transaction, but tenant routes are not under the Admin transaction middleware. The plan says “run delete in a transaction” for delete, but role mutations only say “transaction audit” and the durability table wrongly implies an existing transaction. Implemented literally, tenant delete/roles can return a sanitized `500` instead of `204/200`, and the audit row cannot be transaction-bound.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Make each mutation service own `runDatabaseTransaction`; nested calls reuse the Admin transaction; use `writeAuditLogInTransaction`. | Works for tenant routes, Admin, CLI and tests; one commit boundary per service call; no new middleware. | Services own commit boundaries; callers batching multiple services need care. |
| B | Add a tenant mutation transaction middleware mirroring `adminMutationAudit`. | HTTP boundary is explicit. | New middleware surface; does not help CLI/tests; duplicates Admin semantics. |
| C | Wrap each tenant route handler explicitly with `runDatabaseTransaction`. | Small, local. | Easy to miss a route; inconsistent with Admin; invite/create/update would need the same treatment. |

**Recommendation:** Option A — service-owned transaction is uniform, reuses the existing nested-transaction helper, and covers non-HTTP callers. Correct the `03-03` durability table for assignment in the same edit.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: concurrency/consistency and persistence mechanism; inside the confirmed scope; no reserved consequence.
- Objective: guarantee tenant destructive/role mutations and their audit rows commit together.
- Evidence: `admin-mutation-audit.ts:24-40`, `users/service.ts:735-736`, `user-role-service.ts:68-70,112-115`, `lib/database.ts:73-74`, `03-03` durability table.
- Rejected: Option B (new middleware, incomplete for non-HTTP callers); Option C (route-specific and easy to miss).
- Strongest counterargument: service-owned transactions can hide a commit boundary from a caller that wanted to batch several service calls; mitigated by `runDatabaseTransaction` reusing an existing transaction.
- Confidence: High — the services explicitly throw without a transaction.
- Hardening: Challenger converged on Option A and noted the `03-03:113` stale claim; it proposed a shared `withUserMutation` wrapper if duplication appears.
- Reopen triggers: a future need to batch multiple mutation services under one caller-owned transaction; a new tenant mutation middleware proposal.

---

### PF-004: Specification-first task coverage has gaps for audit durability and integration cases [🟠 MAJOR]

**Dimension:** 7 — Testability
**Location:** `07-testing-strategy.md` → Specification Tests; `99-execution-plan.md` tasks 1.1.2, 2.1.2, 3.1.1, 3.1.2
**Codebase Evidence:**

- `07-testing-strategy.md:128-138` assigns `audit-client-actor.spec.test.ts` to ST-38–ST-42 and `tenant-user-management.spec.test.ts` to ST-1–ST-46.
- `99-execution-plan.md:57` says task 1.1.2 writes audit tests from **ST-38 and ST-46** only.
- `99-execution-plan.md:90-91` says task 2.1.2 writes integration tests from **ST-1–ST-26** only.
- `99-execution-plan.md:132-134` says task 3.1.1 writes unit specs from ST-27–ST-37 and ST-43–ST-45, and task 3.1.2’s pentest list omits ST-22, although `07-testing-strategy.md:134` includes it.
- No spec-author task covers ST-39–ST-42 (delete audit survival, invite client actor, audit rollback, read-audit best-effort) or integration delete/lifecycle/role/rate cases.

**The Problem:** The plan’s own hard rule is specification tests first, derived from requirements, before implementation. ST-39–ST-42 are exactly the audit durability/security cases that justify the migration; leaving them unassigned means they may become implementation tests written after the code, weakening the oracle. The integration spec file is also stopped at ST-26 even though later phases rely on it.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Extend task 1.1.2 to ST-38–ST-42; extend the integration spec to ST-27–ST-46 and rate cases; add ST-22 to the pentest task; verify in Phase 1/3. | Restores spec-first coverage; matches the `07` table. | More spec-author work in early phases. |
| B | Revise `07` to assign ST-39–ST-42 and the later integration cases to implementation tests after implementation. | Less early work. | Weakens the immutable-oracle rule for audit durability. |

**Recommendation:** Option A — the `07` table is the source of truth and the audit cases are security-critical.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: testing strategy and implementation sequencing; inside the confirmed scope; no reserved consequence.
- Objective: every ST case has a spec-author owner before implementation.
- Evidence: `07-testing-strategy.md:128-138`, `99-execution-plan.md:57,90-91,132-134`.
- Rejected: Option B (weakens spec-first for audit security cases).
- Strongest counterargument: some audit cases need a real database and are integration specs, not pure unit specs; mitigated by splitting 1.1.2 into unit audit and migration/integration audit work.
- Confidence: High — the plan states the immutable-oracle rule.
- Hardening: Challenger converged on Option A and proposed a per-phase ST traceability check.
- Reopen triggers: a deliberate decision to move audit durability cases to post-implementation testing.

---

### PF-005: Audit migration claims “no rewrite” but performs a full-table update and `SET NOT NULL` under lock [🟠 MAJOR]

**Dimension:** 3 — Logical Contradictions
**Location:** `01-requirements.md` → Performance and Availability; `03-03-audit-client-actor.md` → Migration; `02-current-state.md` → Risks and Concerns
**Codebase Evidence:**

- `01-requirements.md:77` says “The migration is additive and does not rewrite the audit table.”
- `02-current-state.md:146` says “Additive columns with a bounded backfill … no table rewrite beyond the update.”
- The proposed `034` SQL (`03-03:30-74`) runs `UPDATE audit_log` for every row to set `actor_type`, then `ALTER COLUMN actor_type SET NOT NULL`.
- `packages/server/migrations/009_audit_log.sql:5-17` shows `actor_id` is a nullable FK with `ON DELETE SET NULL`; historical rows whose actor user was deleted have `actor_id` null and will be classified as `system` by the second update.
- `packages/server/src/lib/migrator.ts:25-36` runs each SQL migration in the migration framework’s transaction; `ADD COLUMN` takes `ACCESS EXCLUSIVE` and holds it through the update and `SET NOT NULL` scan.

**The Problem:** The migration is not additive-only: it updates every audit row and then scans the table to set `NOT NULL`, under a lock held for the migration transaction. The risk table’s “bounded backfill” is not bounded. The second update also misclassifies historical user-actor rows whose actor user was deleted as `system`, losing attribution that the plan says it preserves for future deletions. Production audit volume is unknown from the repository; the plan cannot truthfully promise no rewrite.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Multi-phase/online migration: add nullable columns + `NOT VALID` shape check + index; backfill in batches; derive historical `user`/`system` at read time or use an explicit fallback; validate the check and set `NOT NULL` later. | Minimizes lock time; preserves historical attribution options. | More migration code and release coordination; temporarily nullable invariant. |
| B | Keep the simple single-migration backfill, correct the false “no rewrite” claims, and require a documented maintenance window/backup before deploy; accept the full-table update/scan and historical `system` classification. | Smallest change; honest; no new migration machinery. | Table lock/rewrite risk if `audit_log` is large; historical attribution loss for deleted actors. |
| C | Add `NOT NULL DEFAULT 'system'` first, then backfill client/user rows. | Avoids the expensive `SET NOT NULL` scan. | Default can misclassify rows if the backfill is incomplete; contradicts the plan’s “no default that could misclassify actors” principle. |

**Recommendation:** Option B if production audit volume is known to be small (the plan’s current “Low” risk); Option A if volume is unknown or large. Either way, correct the “no rewrite” claims and explicitly decide the historical deleted-actor classification. This is reserved risk acceptance, not an auto-design choice.

**User Decision:** Resolved — the user chose Option B on 2026-10-25. The plan keeps the single backfill, corrects the requirements/risk claims, requires a documented maintenance window and verified pre-migration backup, and accepts historical deleted-actor rows as `system`. Applied to AR-21, `01`, `02`, `03-03`, `07`, and `99`.

**Hardening:** Challenger diverged — it preferred a multi-phase online migration (Option A) and flagged the deleted-actor misclassification. The user chose B for proportionality. Reopen PF-005 and switch to A if production `audit_log` volume is large or the lock window is unacceptable. `Confidence: Med — depends on production volume and the accepted lock window.`

---

### PF-006: Assurance harness gate says “passes” despite known exit 40 / incomplete observers [🟠 MAJOR]

**Dimension:** 12 — Consistency
**Location:** `01-requirements.md` → Verification / Acceptance Criteria; `07-testing-strategy.md` → Verification Checklist; `99-execution-plan.md` → Success Criteria
**Codebase Evidence:**

- Project `AGENTS.md` records three previously accepted forwarding-context observer gaps, exit 40 preserved, and says: “Do not call this fully passed or treat the acceptance as permission to ignore new gaps or failed assertions.”
- `test-harness/assurance/commands.ts:216` maps exit `40` to `coverage-incomplete`.
- `01-requirements.md:86`, `07-testing-strategy.md:201`, and `99-execution-plan.md:250` say the harness “passes”; only task 5.1.3 (`99:213`) records the exit code and accepted incomplete observers.

**The Problem:** The plan’s requirements and acceptance criteria can never be satisfied as written without either ignoring the known exit 40 or misreporting the result. A green-looking gate can also hide a new gap or failed assertion if it only checks “exit 40 is accepted.”

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Change the gate to “run and record”; allow only the already accepted incomplete observers; require no new observer-set diff, no new gap, and no failed assertion; never call it fully passed. | Truthful; preserves the existing acceptance boundary; surfaces regressions. | Needs a recorded baseline artifact. |
| B | Require exit 0. | Simplest gate. | Not achievable with the known accepted gaps; would block indefinitely. |

**Recommendation:** Option A, with an executable baseline artifact: run ID, observer IDs, expected exit 40, and a rule that any observer-set difference, new gap, or failed assertion blocks.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: verification design and reporting; does not waive a risk or create a new acceptance; the existing accepted gaps remain explicit.
- Objective: report the assurance result truthfully and detect new gaps.
- Evidence: `AGENTS.md`; `test-harness/assurance/commands.ts:216`; plan lines above.
- Rejected: Option B (not achievable).
- Strongest counterargument: prose acceptance can rot; mitigated by the recorded baseline artifact and an observer-set diff check.
- Confidence: High — project guidance is explicit.
- Hardening: Challenger converged on Option A and proposed the baseline artifact.
- Reopen triggers: the accepted observer set changes; the harness exits 0; a new failed assertion.

---

### PF-007: Existing audit tests, mocks, and fixtures are not scheduled for update; `yarn verify` will fail [🟠 MAJOR]

**Dimension:** 13 — Codebase Alignment
**Location:** `03-03-audit-client-actor.md` → Direct Audit Inserts; `99-execution-plan.md` task 1.1.9; `07-testing-strategy.md` → Test Categories
**Codebase Evidence:**

- `packages/server/tests/unit/lib/audit-log.test.ts:48,68` asserts exact SQL parameter indices; adding columns changes them.
- Direct `INSERT INTO audit_log` fixtures: `packages/server/tests/integration/migrations.test.ts:427`; `integration/repositories/audit-log.repo.test.ts:169,174`; `integration/admin/record-deletion.spec.test.ts:431`; `integration/admin/portability-round-trip.spec.test.ts:250`; `unit/admin/administrative-data-production-driver.ts:310`.
- Mocks that assume the old writer: `unit/users/service.test.ts:22-34` mocks only `writeAuditLog`; `unit/users/invite-service.spec.test.ts:22,51,139` mocks only `writeAuditLog`; `unit/rbac/user-role-service.test.ts:16-20,167` expects `writeAuditLog` for assignment.
- Contract/behavior tests: `unit/routes/users.test.ts:228-237` duplicate 400; `unit/routes/user-roles.test.ts:202-207,266-271` actor string; SDK `tests/type-contracts/users-contract.spec.test.ts:138-139,201-211` exact input types and negative assertions.
- `yarn verify` runs all server, SDK and CLI suites.

**The Problem:** The plan says “Any test/fixture direct insert must include `actor_type`” and “affected test fixtures,” but it does not schedule the writer-unit test, the mock-only writer assumptions, the exact SDK type contract, or the listed behavioral tests. Without updates, `yarn verify` and `yarn workspace @portaidentity/sdk verify` will fail, and the failure will not be attributable to a single task.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add explicit test/mock/fixture update tasks with a file list; add a central test-side audit insert helper; classify each spec-test edit as an authorized contract change; run focused suites before full verify. | Deterministic; preserves oracle integrity; one place for audit inserts. | More task detail and test churn. |
| B | Add compatibility shims/overloads to avoid changing tests. | Less immediate churn. | Still must update direct SQL inserts and SDK exact contracts; shims hide the real migration. |

**Recommendation:** Option A — enumerate the files in the execution plan, add a central test helper, and update the SDK exact contract tests as part of the authorized additive field change.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: testing strategy and implementation sequencing; inside the confirmed scope; no reserved consequence.
- Objective: keep `yarn verify` a real gate after schema/actor/writer changes.
- Evidence: the listed test files and `yarn verify` scripts.
- Rejected: Option B (hidden migration, still fails direct SQL/SDK contracts).
- Strongest counterargument: editing spec tests can look like weakening the oracle; mitigated by classifying edits as contract changes and keeping assertions on new behavior.
- Confidence: High — the test failures are concrete.
- Hardening: Challenger converged on Option A and proposed a central test-side audit insert helper.
- Reopen triggers: a test is intentionally retired or a new writer compatibility path is added.

---

### PF-008: Admin and standalone lifecycle routes do not propagate the admin actor [🟠 MAJOR]

**Dimension:** 4 — Completeness Gaps
**Location:** `01-requirements.md` R18; `03-02-user-crud-routes.md` → Integration Points; `99-execution-plan.md` tasks 2.2.5 / 3.2.2
**Codebase Evidence:**

- `packages/server/src/routes/users.ts:250,328` Admin create/update call services without an actor.
- `routes/users.ts:348,365` Admin deactivate/activate call services without an actor.
- `routes/users.ts:629,644,658` standalone update/deactivate/activate call services without an actor.
- `routes/users.ts:452` Admin delete already passes `ctx.state.adminUser?.id`.
- `packages/server/src/cli/commands/init.ts:367,380` bootstrap `createUser`/`activateUser` have no admin actor.
- R18 says “Existing Admin user mutations pass their admin actor into the shared audit-aware services.”

**The Problem:** The execution tasks only mention Admin create/update and tenant lifecycle. Admin/standalone deactivate/activate (and standalone update) will remain system-attributed or fail to compile if the service actor parameter becomes required. The audit gap R18 claims to close remains open for lifecycle operations, and the CLI bootstrap has no documented actor policy.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Pass `{kind:'user', userId: ctx.state.adminUser.id}` in all Admin and standalone create/update/lifecycle handlers; pass `{kind:'system'}` (or omit with a documented default) in CLI bootstrap; add tasks and tests. | Satisfies R18; uniform audit attribution. | More handler/test churn. |
| B | Narrow R18 to the services actually changed; leave lifecycle system-attributed and document it. | Less work. | Contradicts the stated audit goal; inconsistent Admin audit trail. |

**Recommendation:** Option A — lifecycle is a user mutation and should carry the admin actor; document the CLI bootstrap as system.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: audit attribution and implementation completeness; within R18; no reserved consequence.
- Objective: close the Admin audit attribution gap for every shared user mutation.
- Evidence: the six call sites and R18.
- Rejected: Option B (inconsistent audit trail).
- Strongest counterargument: the standalone router may be legacy; mitigated by passing the actor where `requireAdminAuth` already supplies it.
- Confidence: High — `ctx.state.adminUser` is available on both Admin routers.
- Hardening: Challenger converged on Option A and added the CLI bootstrap system-actor note.
- Reopen triggers: the standalone router is retired; CLI bootstrap gains an authenticated actor.

---

### PF-009: Plan has no owning feature/roadmap and sits outside the nested CodeOps layout; execution path is unresolved [🟠 MAJOR]

**Dimension:** 4 — Completeness Gaps
**Location:** `00-index.md` → Implements / Plan Location; `99-execution-plan.md`; repository Git state
**Codebase Evidence:**

- The plan lives at `/home/gevik/.opencode/plan/tenant-m2m-user-management/`, outside the repository and outside `codeops/features/`.
- `00-index.md:6` declares “standalone” with no upstream RD; `00-index.md:136-138` says to promote under `user-invitations` or a new `tenant-user-management` feature later.
- `codeops/.codeops.yml` selects nested layout with `integrationBranch: develop`; no tenant feature directory exists.
- Local `develop` is stale and 8 commits behind `origin/develop`. `origin/develop` contains the tenant-invite prerequisite after PR #189 (`d712d613`); `git cat-file -e origin/develop:packages/server/src/middleware/tenant-invite-auth.ts` succeeds. The current branch `feat/tenant-user-invitations` is 3 commits behind `origin/develop` and 0 ahead.
- `exec-plan` resolves nested plans at `codeops/features/<f>/plans/<plan>/99-execution-plan.md`.
- Project `AGENTS.md` says new product features start on separate feature branches and `main` is off limits.

**The Problem:** The plan cannot be located or executed by the nested CodeOps workflow until it is promoted. It also needs a recorded owning feature, a roadmap row, and a branch base. The tenant-invite prerequisite is not an unmerged dependency: it is already on `origin/develop` (PR #189). The local `develop` and current branch are simply stale. Executing from the stale local branch would mix this feature with the invitation work and miss the latest release commits.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Create a new `tenant-user-management` feature under `codeops/features/`, move the plan there, add a roadmap row; fetch and branch from `origin/develop` (which already contains the tenant-invite prerequisite). | Clean feature ownership; correct branch base; executable via nested CodeOps. | New feature structure and roadmap work. |
| B | Add the plan to the existing `user-invitations` feature, move it there, and branch from `origin/develop`. | Uses an existing feature folder; the invite prerequisite is already integrated. | Mixes broad tenant user-management (CRUD/lifecycle/roles/audit) into an invitation feature; may not fit the roadmap charter. |
| C | Keep the standalone plan outside the repository and adapt the execution workflow. | No repository change. | Nested `exec-plan` cannot locate it; no roadmap/preflight sync; violates the project’s process. |

**Recommendation:** Option A — new `tenant-user-management` feature, plan moved into `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/`, roadmap row added, and the branch based on an up-to-date `origin/develop`. This is reserved artifact-ownership authority; the branch base is a technical sequencing choice.

**User Decision:** Resolved — the user chose Option A on 2026-10-25. The plan was moved into the new `tenant-user-management` feature, roadmap row `T-01` was added, and branch `feat/tenant-m2m-user-management` was created from `origin/develop` (PR #189 present).

**Hardening:** Challenger initially read the stale local `develop` and believed the prerequisite was unmerged. Re-checking the remote integration branch shows `origin/develop` already contains PR #189 and the tenant-invite files. The parent and challenger converge on A with an `origin/develop` base; no stacked branch is needed. The user chose the new feature. `Confidence: High on the branch base; the feature-ownership decision is now user-confirmed.`

---

### PF-010: CLI user-history client actor can carry terminal control characters [🟠 MAJOR]

**Dimension:** 8 — Security Blind Spots
**Location:** `03-04-sdk-cli-docs-contracts.md` → CLI; `AdminUserHistory` validator
**Codebase Evidence:**

- `packages/server/src/clients/validators.ts:18` defines `clientNameSchema = z.string().min(1).max(255)`; control characters are allowed.
- `packages/cli/src/admin/user-service.ts:38-60` has `containsTerminalControl`/`isText` for other display fields; the history validator at `:247-283` validates `actorId` as null/UUID and maps `entry.actorId ?? 'System'`.
- `packages/cli/src/admin/user-workspace.ts:455-457` renders `${entry.eventType} — ${entry.actor}` directly in a `Text` component.
- `packages/cli/src/output.ts:50-55` sanitizes `printTable`, but the terminal admin history path does not use it.
- The plan only says the validator must accept the new optional fields; it does not require control-character validation or sanitization.

**The Problem:** A client name can contain ANSI/terminal control sequences. Once the CLI displays the client actor in user history, a crafted name can inject terminal escape sequences into the single-operator admin UI. This is a new display path for an already loosely validated field.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Validate `actorClientName`/`actorClientId` with `isText`/`containsTerminalControl`; if invalid, degrade the label to a fixed placeholder; also sanitize at render. | Prevents injection without breaking the whole history page. | One bad client name displays a placeholder. |
| B | Sanitize only at render time in `user-workspace.ts`. | Central display fix. | Validation boundary still accepts unsafe data; other future renderers may miss it. |
| C | Leave as-is; client names are trusted admin input. | No work. | Contradicts the project’s existing terminal-safety pattern; unsafe if a tenant/admin can set a name. |

**Recommendation:** Option A plus B as defense in depth — validate with a fallback, and sanitize at the render boundary.

**Resolution (auto-design):** Option A + B — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: security mechanism within the approved policy; no reserved consequence.
- Objective: prevent terminal escape injection in admin user history.
- Evidence: `clientNameSchema`, `containsTerminalControl`, `user-workspace.ts:455-457`, `output.ts:50-55`.
- Rejected: Option C (unsafe); Option B alone (validation gap remains).
- Strongest counterargument: rejecting the page on a bad name is brittle; mitigated by a placeholder fallback.
- Confidence: High — the render path is direct and the project already uses terminal-safety helpers.
- Hardening: Challenger converged on A + B and proposed the placeholder fallback.
- Reopen triggers: client name validation is tightened at the server, or the history UI moves to a sanitizing renderer.

---

### PF-011: Cross-application/canonical role error status is unspecified [🟡 MINOR]

**Dimension:** 1 — Ambiguities
**Location:** `03-02-user-crud-routes.md` → Role Behavior / Error Handling; `07-testing-strategy.md` ST-34 / ST-36
**Codebase Evidence:**

- ST-34 and ST-36 expect `400` for cross-application/canonical role operations (`07-testing-strategy.md:89,91`).
- `packages/server/src/routes/user-roles.ts:56-70` maps `RoleNotFoundError` to `404`, `RoleDelegationError` to `403`, and `RbacValidationError` to `400`.
- `packages/server/src/rbac/user-role-service.ts:224-227` throws `RoleNotFoundError` for missing roles; the plan does not define an error for a role that exists but belongs to another application.

**The Problem:** The plan says “validate every role belongs to the application” but does not say which error/status the tenant route returns. Implemented with existing errors, ST-34/ST-36 will fail (`404` or `403` instead of `400`).

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add a tenant role-boundary error mapped to `400` (or reuse `RbacValidationError`), and align ST-34/ST-36. | Matches the spec tests; clear client error. | New/borrowed error class. |
| B | Reuse `RoleNotFoundError` → `404`; update ST-34/ST-36 to `404`. | No new error. | Hides the boundary distinction; changes the oracle. |
| C | Reuse `RoleDelegationError` → `403`; update ST-34/ST-36 to `403`. | Semantically “not permitted.” | Test oracle change; 403 may imply a retryable permission issue. |

**Recommendation:** Option A — keep the specified `400` and name the boundary error.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: API error mapping; inside the confirmed scope; no reserved consequence.
- Objective: deterministic role-boundary responses matching the spec tests.
- Evidence: ST-34/ST-36 and existing route mappings.
- Rejected: Options B/C (change the oracle and obscure the boundary).
- Strongest counterargument: adding an error class for one case; mitigated by reusing `RbacValidationError` if it fits.
- Confidence: High — the spec test says `400`.
- Hardening: In-context; no challenger required for a minor.
- Reopen triggers: the API adopts a different boundary-error convention.

---

### PF-012: Role-service contract details are inconsistent (`AssignRolesOptions`, `assigned_by`, system actor) [🟡 MINOR]

**Dimension:** 1 — Ambiguities
**Location:** `03-02-user-crud-routes.md` → Role Behavior
**Codebase Evidence:**

- `03-02` defines an `AssignRolesOptions` interface but then shows a positional function signature.
- `packages/server/src/rbac/mapping-repository.ts:272-291` accepts optional `assignedBy`; `migrations/006_roles_permissions.sql:63` makes `user_roles.assigned_by` nullable with `ON DELETE SET NULL`.
- The plan says service actors skip human delegation and are audited as clients, but does not say what `assigned_by` becomes.

**The Problem:** An implementer cannot tell whether to use the options object or positional arguments, and a service actor has no user ID for `assigned_by`. Passing an empty string or client ID would violate the FK.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Use one options object; set `assigned_by = actor.kind === 'user' ? actor.userId : null`; reject `system` for role mutations; document. | Clear contract; FK-safe. | Small signature change. |
| B | Keep positional arguments; explicitly pass `null` for service actors and document the system rejection. | Minimal signature change. | More parameter-order risk. |

**Recommendation:** Option A — the options object is already drafted and prevents parameter-order mistakes.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: internal interface design; inside the confirmed scope; no reserved consequence.
- Objective: unambiguous, FK-safe role mutation contract.
- Evidence: `AssignRolesOptions`, `mapping-repository.ts:272-291`, `006_roles_permissions.sql:63`.
- Rejected: Option B (parameter-order risk).
- Strongest counterargument: an options object is a larger refactor; mitigated because the plan already introduces the interface.
- Confidence: High — the schema is nullable.
- Hardening: In-context; minor.
- Reopen triggers: role assignment needs additional actor-specific fields.

---

### PF-013: Audit coverage statements are overbroad for invites and invitation acceptance [🟡 MINOR]

**Dimension:** 3 — Logical Contradictions
**Location:** `01-requirements.md` R10 / Acceptance 5; `03-03-audit-client-actor.md` → Mutation Coverage
**Codebase Evidence:**

- `03-03` says `inviteUser` has “No user yet; invite ID in metadata,” but R10/acceptance 5 say every mutation has a target `user_id`.
- `packages/server/src/users/invitation-service.ts:120-135` creates a user on invitation acceptance and writes `user.created` with `writeAuditLog` after commit; it is not in the mutation coverage table and remains best-effort.
- `users/invite-service.ts:334-348` currently writes `user.invited` best-effort; the plan converts it.

**The Problem:** “Every mutation” cannot mean a target `user_id` for invitations. Leaving invitation acceptance out may also be intentional, but the plan does not say so, and acceptance 5 can be read to require it.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Qualify the requirement: tenant M2M mutations with a target user set `user_id`; invitations record the invitation ID; invitation acceptance is existing behavior and remains best-effort/out of scope. | Accurate; no scope expansion. | Leaves an existing audit durability gap documented. |
| B | Extend transaction-bound audit to `acceptInvitation`. | Closes the gap. | Scope expansion beyond tenant M2M CRUD. |

**Recommendation:** Option A — document the boundary; do not silently expand into invitation acceptance.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: requirement precision and scope boundary; inside the confirmed scope; no reserved consequence.
- Objective: make the audit guarantee testable and truthful.
- Evidence: `03-03` invite row; `invitation-service.ts:120-135`; R10/acceptance 5.
- Rejected: Option B (scope expansion; invitation acceptance is a separate flow).
- Strongest counterargument: the existing best-effort `user.created` is a real audit gap; mitigated by documenting it and leaving a future task.
- Confidence: High — the invite flow has no user ID at creation.
- Hardening: In-context; minor.
- Reopen triggers: invitation acceptance is brought into the audited mutation scope.

---

### PF-014: “Retired or thin re-export” leaves dead-code ambiguity [🟡 MINOR]

**Dimension:** 12 — Consistency
**Location:** `03-01-tenant-auth-and-scopes.md` → Integration Points; AR-19; acceptance criterion 9
**Codebase Evidence:**

- AR-19 says “Create `routes/tenant-users.ts`, move the invite route into it, and mount one tenant user router. Update server and test imports.”
- `03-01` says `routes/tenant-invitations.ts` is “retired or becomes a thin re-export.”
- Acceptance criterion 9 says no dead code or duplicate tenant auth implementation remains.
- `packages/server/src/routes/tenant-invitations.ts` is a 132-line router; a re-export would leave an unused compatibility surface.

**The Problem:** “Retired or thin re-export” is two different designs. A re-export preserves a second router entry point and conflicts with the no-dead-code acceptance criterion; retirement is the AR-19 decision.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Retire the file, update all imports/tests, and mount only `createTenantUsersRouter`. | Matches AR-19; no dead code. | Tests must be updated. |
| B | Keep a thin re-export for compatibility. | Avoids import churn. | Leaves duplicate entry point; needs a sunset plan. |

**Recommendation:** Option A — the plan already commits to moving the route and updating imports.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: internal module organization; inside the confirmed scope; no reserved consequence.
- Objective: one tenant router and no dead code.
- Evidence: AR-19; acceptance 9; `tenant-invitations.ts`.
- Rejected: Option B (dead-code ambiguity).
- Strongest counterargument: a re-export eases downstream imports; mitigated because the plan already updates imports/tests.
- Confidence: High — AR-19 is explicit.
- Hardening: In-context; minor.
- Reopen triggers: an external consumer requires the old import path.

---

### PF-015: Reused list/identifier/role schemas and shared error mapping are not extracted [🟡 MINOR]

**Dimension:** 4 — Completeness Gaps
**Location:** `03-02-user-crud-routes.md` → Read Behavior / Integration Points; R17
**Codebase Evidence:**

- `packages/server/src/routes/users.ts:73-166` defines `createUserSchema`, `updateUserSchema`, `listUsersSchema`, `listUsersCursorSchema`, `setPasswordSchema`, `identifierSchema` locally; only the create/update extraction is tasked.
- `routes/users.ts:176-220` defines `handleError` locally; `routes/tenant-invitations.ts:34-72` defines a separate `handleInviteError`.
- `routes/user-roles.ts:40-42` defines `roleIdsSchema` locally.
- R17 requires the tenant router to reuse shared auth, error mapping, and rate-limit helpers.

**The Problem:** The tenant read route needs list schemas that are not exported, delete needs the path identifier schema, and role routes need `roleIdsSchema`; the tenant error mapping needs the Admin/Invite mappings. The plan only tasks create/update schema extraction, so R17 reuse is not executable without duplication.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Extract list/identifier/role schemas and a shared error mapper into `users/schemas.ts` and a shared route-error module; add a task. | Satisfies R17; one source of truth. | More extraction work. |
| B | Duplicate the schemas/mappers in `tenant-users.ts`. | Faster. | Violates R17; drift risk. |

**Recommendation:** Option A — the extraction is small and directly required by R17.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: code organization and reuse; inside the confirmed scope; no reserved consequence.
- Objective: keep Admin and tenant validation/error behavior in one place.
- Evidence: the local schemas/error helpers and R17.
- Rejected: Option B (duplication/drift).
- Strongest counterargument: more files; mitigated by one schema module and one error mapper.
- Confidence: High — R17 explicitly requires reuse.
- Hardening: In-context; minor.
- Reopen triggers: Admin and tenant schemas intentionally diverge.

---

### PF-016: Invalid/foreign organization is documented as `404` but the auth boundary returns `403` [🟡 MINOR]

**Dimension:** 3 — Logical Contradictions
**Location:** `03-01-tenant-auth-and-scopes.md` → Error Handling; AR-7
**Codebase Evidence:**

- `packages/server/src/middleware/tenant-invite-auth.ts:169-185` returns `403` when `client.organizationId !== organizationId`; it does not check organization existence before the client match.
- `requireExistingOrganization` (`middleware/require-existing-organization.ts`) exists but is not part of the planned tenant auth order.
- `03-01` says “Invalid org ID → 404 Organization not found”; AR-7 says list requires an existing organization.
- The tenant router prefix is `/api/organizations/:orgId/users`; auth runs before any route-level organization guard.

**The Problem:** An invalid or foreign `:orgId` will produce `403` at the auth boundary, not the documented `404`. Adding a pre-auth organization lookup would leak organization existence to unauthenticated callers. The error table should distinguish absent users (`404`) from unauthenticated/foreign organization access (`403`).

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Document `403` for unauthenticated/foreign organization; `404` only for an authenticated, existing organization with an absent user; remove the invalid-org `404` row. | Matches the security boundary; no enumeration leak. | Error table changes. |
| B | Add `requireExistingOrganization` before auth to return `404` for invalid org. | Matches the table. | Leaks organization existence to unauthenticated callers; not recommended. |

**Recommendation:** Option A — keep the non-enumerating `403` boundary and correct the table.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: error mapping and tenant-isolation behavior; inside the confirmed scope; no reserved consequence.
- Objective: truthful, non-enumerating error behavior.
- Evidence: `tenant-invite-auth.ts:169-185`; `requireExistingOrganization`; AR-7.
- Rejected: Option B (enumeration leak).
- Strongest counterargument: clients may prefer `404` for unknown org; mitigated by the existing fixed `403` message.
- Confidence: High — the auth order is explicit.
- Hardening: In-context; minor.
- Reopen triggers: the tenant API adds a pre-auth organization resolver with an explicit anti-enumeration design.

---

### PF-017: Security decision/reference instrumentation is not explicitly preserved in the middleware refactor [🟡 MINOR]

**Dimension:** 8 — Security Blind Spots
**Location:** `03-01-tenant-auth-and-scopes.md` → Middleware Contract / Error Handling
**Codebase Evidence:**

- `packages/server/src/middleware/tenant-invite-auth.ts` calls `recordSecurityDecision` at every denial path (e.g. `:159-166`, `:177-184`, `:188-195`, `:218-225`, `:230-237`, `:240-249`, `:253-260`, `:265-272`, `:299-306`, `:311-318`, `:323-333`, `:390-396`).
- It calls `recordSecurityReference(ctx, 'actor', …)` and `recordSecurityReference(ctx, 'tenant', organizationId)` on success (`:357-358`, `:383-384`).
- The plan’s middleware contract and error table do not mention these calls.

**The Problem:** A refactor that only preserves status codes can silently drop security decision telemetry and actor/tenant references. That weakens detection and may break security-decision tests or assurance observers.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Require the generalized middleware to preserve the same decision points and references, with regression tests. | Maintains observability; catches drops. | More test detail. |
| B | Accept reduced telemetry and document it. | Less work. | Security regression. |

**Recommendation:** Option A — preserve the existing instrumentation; it is part of the middleware contract.

**Resolution (auto-design):** Option A — Resolved.
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `pf-tenant-m2m-20261025-01`.
- Eligibility: security observability mechanism; inside the approved policy; no reserved consequence.
- Objective: no loss of security decision context during the auth refactor.
- Evidence: the listed `recordSecurityDecision`/`recordSecurityReference` calls.
- Rejected: Option B (security regression).
- Strongest counterargument: tests may not currently assert every path; mitigated by adding a focused regression matrix.
- Confidence: High — the calls are explicit in the existing file.
- Hardening: In-context; minor.
- Reopen triggers: the decision-context module is redesigned.

---

## Independent challenger reconciliation

One `design-challenger` dispatch received the MAJOR finding batch, the surviving options, and the reconnaissance summary, without the parent's picks.

| Finding | Challenger verdict | Reconciliation |
| --- | --- | --- |
| PF-001 | Keep Admin `400`; allow the additive `emailVerified` field; map `409` only tenant; update wording/tests. | Converged after narrowing the finding to the status change. The additive field is authorized by AR-20. |
| PF-002 | Keep `InviteActor`; narrow `AuditActor`; update all callers/tests; use one mapper. | Converged. |
| PF-003 | Service-owned `runDatabaseTransaction`; correct the stale `03-03` assignment claim. | Converged. |
| PF-004 | Extend spec tasks for ST-38–ST-42, integration ST-27–ST-46/rate, and ST-22 pentest. | Converged. |
| PF-005 | Multi-phase online migration; flag historical deleted-actor misclassification. | **Diverged, then user-resolved.** The user chose B (single backfill with maintenance window/backup and accepted historical `system`). Reopen if production volume is large. |
| PF-006 | Run/record with an executable baseline; never call fully passed. | Converged. |
| PF-007 | Explicit test/fixture list + central test-side insert helper. | Converged. |
| PF-008 | Pass actor in all Admin/standalone handlers; CLI bootstrap system actor. | Converged. |
| PF-009 | New feature; the initial verdict assumed the prerequisite was unmerged on local `develop`. | **Divergence resolved and user-confirmed.** `origin/develop` already contains PR #189; the user chose a new `tenant-user-management` feature branched from `origin/develop`. |
| PF-010 | Validate + sanitize; degrade to a placeholder instead of failing the page. | Converged. |

No unresolved challenge indicates that the parent’s recommendations are unsafe in a way that auto-design could override. PF-005 and PF-009 were resolved by the user; no residual challenge remains.

## Invocation notes

- `--auto-design` was applied. The root invocation ID is `pf-tenant-m2m-20261025-01`; policy version 1. Eligibility and provenance are recorded with each resolved finding.
- `--explore-scope` was not supplied, so scope is strict. No optional additions are reported.
- `--auto-commit` is not a documented preflight option, but the user accepted the recommendations and the original request. The 15 delegated fixes plus the two user decisions were applied to the 10 plan documents, the plan was promoted into the repository, and a local commit is created with this change. No push is performed.
- The plan now lives in the nested CodeOps layout and has feature roadmap `T-01` plus a portfolio row. The feature roadmap stage is advanced to `Plan Preflighted` after this pass.
- The report is saved alongside the artifact. `_preflight-notes.md` was used as a checkpoint and is removed after report persistence.

## Pass/fail

**✅ PREFLIGHT PASSED WITH NOTES — all 17 findings resolved; 2 accepted conditions.**

All critical/major findings are resolved: 8 by delegated authority and 2 (PF-005, PF-009) by explicit user decision. The seven minor findings are resolved by delegated authority. The accepted conditions are the migration maintenance window/backup and the historical deleted-actor `system` classification; they are recorded in AR-21, the requirements, and the execution plan, not left as open findings.

## Next steps

| # | Action | Owner |
| --- | --- | --- |
| 1 | Completed in this run: `tenant-user-management/T-01` advanced to `🔬 Plan Preflighted`; the promoted plan, report, feature roadmap, and portfolio row are committed locally. | Preflight |
| 2 | Start execution with `exec-plan tenant-m2m-user-management` from `feat/tenant-m2m-user-management`; Phase 1 begins with the spec-author tasks. | Execution session |
| 3 | Before Phase 5 deployment, record the migration maintenance window and verified backup; reopen PF-005 if production `audit_log` volume requires the multi-phase option. | Execution/operations |
| 4 | Run the production-security harness separately against the accepted observer baseline; expected exit `40`, never described as fully passed. | Execution session |
| 5 | Push the branch and open the integration PR only when the user explicitly requests publication. | User |
