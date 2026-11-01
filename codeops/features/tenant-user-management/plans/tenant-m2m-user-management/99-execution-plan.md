# Execution Plan: Tenant-Scoped M2M User Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Implements**: tenant-user-management/T-01
> **Last Updated**: 2026-11-01 11:06
> **Progress**: 56/56 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement a service-client-only tenant user API with three scopes, full profile create/update, read/list, delete, lifecycle, role management, first-class client audit, SDK types, CLI display, and documentation. Work follows specification-first ordering in every implementation phase.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| --- | --- | --- |
| 1 | Tenant auth, scopes, and audit foundation | 14 |
| 2 | Tenant read, create, and update | 11 |
| 3 | Delete, lifecycle, and roles | 12 |
| 4 | SDK, CLI, docs, and techdocs | 11 |
| 5 | Security verification and handoff | 8 |

**Total: 56 tasks across 5 phases** (no fabricated hour estimates; scope is bounded by the task-size criteria in the quality checklist)

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress. Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp — `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` — `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** and Last Updated stamp after EVERY task — never batch updates. Only `[x]` counts as complete.
> 4. **Resume** by scanning top-to-bottom: the first `[~]` task is resumed first, else the first `[ ]` task.
> 5. **On blocker:** mark the task `[!]` and append `Blocked: <short reason>` on the same line. The plan lifecycle is `Ready`, `Executing`, `Done`, or `Blocked`, derived from these markers.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'` — never invented. Failure to keep the marks current means progress is invisible after crashes, context resets, or session handoffs.
>
> **Service-backed gates:** integration, pentest, harness, and compatibility runs require PostgreSQL, Redis, MailHog, and Docker. Use the repository-owned lifecycle commands (`yarn docker:up` / `yarn docker:down`) or the assurance-owned lifecycle, and remove every task-created container, network, volume, and scratch database before reporting completion.

---

## Phase 1: Tenant auth, scopes, and audit foundation

> **Phase baseline tree**: 83f258a148efb3507dc0cb53c7fd5f89e468a6d2
> **Lenses**: security, api, data
> **Reasoning**: high — authentication, tenant isolation, audit schema, and migration semantics

### Step 1.1: Specification tests and foundation

**Reference**: [03-01](03-01-tenant-auth-and-scopes.md) · [03-03](03-03-audit-client-actor.md) · AR-2, AR-3, AR-6, AR-14, AR-16, AR-18, AR-21.
**Objective**: Prove the auth matrix, scope registration, and audit migration before implementation.

- [x] 1.1.1 [spec-author] Write tenant auth/scope/instrumentation specification tests from ST-1–ST-9 and ST-51 — `packages/server/tests/unit/middleware/tenant-user-auth.spec.test.ts` ✅ (completed: 2026-10-25 18:09)
- [x] 1.1.2 [spec-author] Write audit actor specification tests from ST-38–ST-42 — `packages/server/tests/unit/lib/audit-client-actor.spec.test.ts`; write migration/backfill specification tests from ST-46 — `packages/server/tests/integration/migrations/034-audit-client-actor.spec.test.ts` ✅ (completed: 2026-10-25 18:09)
- [x] 1.1.3 Run the new specification tests and verify the red phase; record any justified pre-implementation pass ✅ (completed: 2026-10-25 18:09) — auth import missing; audit writer columns/mapping absent; migration file absent. Justified pre-implementation passes: compatibility-writer swallow behavior and transaction-writer failure propagation already match the specification.
- [x] 1.1.4 Add `org:user:read`, `org:user:write`, and `org:user:delete` constants and register them in the provider scope list — `packages/server/src/oidc/scopes.ts`, `packages/server/src/oidc/configuration.ts` ✅ (completed: 2026-10-25 18:10)
- [x] 1.1.5 Generalize tenant actor auth to configurable actor kinds, required scope, required permission, and preserved security decision/reference instrumentation; rename state to `tenantActor` — `packages/server/src/middleware/tenant-user-auth.ts`, `packages/server/src/middleware/tenant-invite-auth.ts` ✅ (completed: 2026-10-25 18:10)
- [x] 1.1.6 Create the consolidated tenant user router, move the invite handler, retire `tenant-invitations.ts`, and mount it from the server — `packages/server/src/routes/tenant-users.ts`, `packages/server/src/server.ts` ✅ (completed: 2026-10-25 18:10)
- [x] 1.1.7 Add migration `034_audit_client_actor.sql` with columns, backfill, constraint, index, and down migration; record the full-table update/lock, maintenance window, backup, and historical deleted-actor classification — `packages/server/migrations/034_audit_client_actor.sql` ✅ (completed: 2026-10-25 18:12)
- [x] 1.1.8 Extend `AuditLogEntry` and both audit writers with actor type/client fields and normalization — `packages/server/src/lib/audit-log.ts` ✅ (completed: 2026-10-25 18:14)
- [x] 1.1.9 Update audit API, entity history, source direct inserts, and the existing fixture inserts for the new columns — `packages/server/src/routes/audit.ts`, `packages/server/src/lib/entity-history.ts`, `packages/server/src/auth/token-repository.ts`, `packages/server/src/lib/data-export.ts`, `packages/server/tests/integration/migrations.test.ts`, `packages/server/tests/integration/repositories/audit-log.repo.test.ts`, `packages/server/tests/integration/admin/record-deletion.spec.test.ts`, `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts`, `packages/server/tests/unit/admin/administrative-data-production-driver.ts` ✅ (completed: 2026-10-25 18:16)
- [x] 1.1.10 Keep `InviteActor` for the invitation workflow and add `inviteActorToAuditActor`; update the invite audit to first-class client attribution — `packages/server/src/users/invite-service.ts` ✅ (completed: 2026-10-25 18:18)
- [x] 1.1.11 Run the specification tests and verify the green phase ✅ (completed: 2026-10-25 18:20)
- [x] 1.1.12 Write implementation tests for token lookup order, provider failure, migration edge cases, audit normalization, and writer parameter order — `*.impl.test.ts` ✅ (completed: 2026-10-25 18:24)
- [x] 1.1.13 Update the existing writer/invite/auth/route tests and mocks affected by Phase 1: `audit-log.test.ts`, `users/invite-service.spec.test.ts`, `middleware/tenant-invite-auth.spec.test.ts` (rename/update), `routes/tenant-invitations.spec.test.ts` (move/update); add the central test-side audit insert helper. Service/role actor-test updates belong to Phases 2 and 3. ✅ (completed: 2026-10-25 18:26)
- [x] 1.1.14 Verify Phase 1: server typecheck, focused unit, migration, and existing-test suites, and `yarn test:structure` ✅ (completed: 2026-10-25 18:30)

**Deliverables**:
- [ ] New scopes registered; tenant auth reusable; invite behavior preserved
- [ ] Audit migration and first-class client actor foundation
- [ ] Existing writer/actor/fixture tests updated
- [ ] All Phase 1 verification passing

**Verify**: `yarn workspace @portaidentity/server typecheck && yarn workspace @portaidentity/server vitest run --project unit tests/unit/middleware/tenant-user-auth.spec.test.ts tests/unit/lib/audit-client-actor.spec.test.ts tests/unit/lib/audit-log.test.ts tests/unit/users/invite-service.spec.test.ts && yarn workspace @portaidentity/server vitest run --project integration tests/integration/migrations/034-audit-client-actor.spec.test.ts tests/integration/migrations.test.ts && yarn test:structure`

**Review**: Passed after fixes — 14 findings fixed (RV-001–RV-008, SA-001–SA-006); independent re-review resolved; evidence in [05-findings.md](05-findings.md). Full unit 235 files / 3,822 tests, targeted integration 59 tests, structure 138 tests.

---

## Phase 2: Tenant read, create, and update

> **Phase baseline tree**: 1ef2ade4137aed704346cad2ee53ff842035267f
> **Lenses**: security, api, data
> **Reasoning**: high — tenant isolation, verification-flag trust, transaction-bound audit

### Step 2.1: Specification tests

**Reference**: [03-02](03-02-user-crud-routes.md) · AR-4, AR-7, AR-9, AR-10, AR-11, AR-13, AR-17, AR-20.
**Objective**: Define create/list/get/update behavior before implementation.

- [x] 2.1.1 [spec-author] Write create/list/get/update specification tests from ST-10–ST-26 — `packages/server/tests/unit/routes/tenant-users.spec.test.ts` ✅ (completed: 2026-10-25 19:08)
- [x] 2.1.2 [spec-author] Write live tenant API specification tests from ST-1–ST-26 — `packages/server/tests/integration/security/tenant-user-management.spec.test.ts`; Phase 3 extends the same file to ST-27–ST-46 and the rate cases ✅ (completed: 2026-10-25 19:08)
- [x] 2.1.3 Run the new specification tests and verify the red phase; record any justified pre-implementation pass ✅ (completed: 2026-10-25 19:08) — CRUD unit routes and live tenant routes are absent as expected; the pre-existing invite regression tests pass.

### Step 2.2: Implementation

**Reference**: [03-02](03-02-user-crud-routes.md) · [03-03](03-03-audit-client-actor.md)
**Objective**: Implement the non-destructive tenant user surface.

- [x] 2.2.1 Extract shared create/update/list/identifier/role schemas and a shared route-error mapper, add `emailVerified`, and add tenant create/update variants with password rejection and phone-verification consistency — `packages/server/src/users/schemas.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/routes/user-roles.ts` ✅ (completed: 2026-10-25 19:23)
- [x] 2.2.2 Extend create/update services with `AuditActor`, `emailVerified`, typed duplicate-email conflict (Admin `400`, tenant `409`), target `user_id`, service-owned `runDatabaseTransaction`, transaction-bound audit, and post-commit cache effects; keep `InviteActor` for invite display/delegation — `packages/server/src/users/service.ts`, `packages/server/src/users/errors.ts`, `packages/server/src/users/invite-service.ts` ✅ (completed: 2026-10-25 19:23)
- [x] 2.2.3 Add tenant create/list/get/update routes with target-user organization guard and ETag handling — `packages/server/src/routes/tenant-users.ts` ✅ (completed: 2026-10-25 19:23)
- [x] 2.2.4 Add write rate limiting and `user.read`/`user.listed` audit calls — `packages/server/src/middleware/tenant-user-rate-limiter.ts`, `packages/server/src/routes/tenant-users.ts` ✅ (completed: 2026-10-25 19:23)
- [x] 2.2.5 Pass the Admin actor into shared create/update/lifecycle services in both the organization-scoped and standalone routers; use the shared schemas; document the CLI bootstrap `system` actor — `packages/server/src/routes/users.ts`, `packages/server/src/cli/commands/init.ts` ✅ (completed: 2026-10-25 19:23)

### Step 2.3: Green phase, implementation tests, and verification

- [x] 2.3.1 Run the specification tests and verify the green phase ✅ (completed: 2026-10-25 19:23)
- [x] 2.3.2 Write implementation tests for schema strictness, ETag, body organization mismatch, and audit failure rollback — `packages/server/tests/unit/routes/tenant-users.impl.test.ts`, `packages/server/tests/unit/users/tenant-user-service.impl.test.ts`; update existing service/route tests for typed actors, transaction mocks, and Admin duplicate `400` ✅ (completed: 2026-10-25 19:23)
- [x] 2.3.3 Verify Phase 2: server typecheck, focused unit/integration/existing tests, and `yarn test:structure` ✅ (completed: 2026-10-25 19:23)

**Deliverables**:
- [ ] Tenant create/list/get/update with full profile and verification flags
- [ ] Admin and standalone routes pass actors and share schemas; CLI bootstrap uses `system`
- [ ] Read audit and write rate limiting
- [ ] All Phase 2 verification passing

**Verify**: `yarn workspace @portaidentity/server typecheck && yarn workspace @portaidentity/server vitest run --project unit tests/unit/routes/tenant-users.spec.test.ts tests/unit/routes/tenant-users.impl.test.ts tests/unit/users/tenant-user-service.impl.test.ts tests/unit/routes/users.test.ts tests/unit/users/service.test.ts && yarn workspace @portaidentity/server vitest run --project integration tests/integration/security/tenant-user-management.spec.test.ts && yarn test:structure`

**Verification**: Passed — typecheck; 84 focused unit tests; 6 live tenant API tests; 138 structure tests. Full unit 237 files / 3,845 tests and full integration 61 files / 508 tests also pass.

**Review**: Passed after fixes — 9 findings fixed (RV-001, RV-002, RV-003, RV-005, RV-006, SA-007–SA-010); RV-004 accepted as a Phase 5 handoff gate (the route-level live spec substitutes token lookup; one real tenant `client_credentials` cycle remains). Independent re-review resolved; evidence in [05-findings.md](05-findings.md).

---

## Phase 3: Delete, lifecycle, and roles

> **Phase baseline tree**: 99ae35fff7d4c7c756ca61ecb668bb363b4f2b7c
> **Lenses**: security, api, data
> **Reasoning**: high — destructive operations, privilege boundaries, and role authority

### Step 3.1: Specification tests and pentest contract

**Reference**: [03-02](03-02-user-crud-routes.md) · [03-03](03-03-audit-client-actor.md) · AR-8, AR-12, AR-17.
**Objective**: Define delete/lifecycle/role behavior and the attack matrix before implementation.

- [x] 3.1.1 [spec-author] Write delete/lifecycle/role specification tests from ST-27–ST-37 and ST-43–ST-45 — `packages/server/tests/unit/routes/tenant-users.spec.test.ts`, `packages/server/tests/unit/rbac/tenant-user-roles.spec.test.ts`; extend the live integration spec to ST-27–ST-46 and the rate cases — `packages/server/tests/integration/security/tenant-user-management.spec.test.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.1.2 [spec-author] Write the tenant boundary pentest specification from ST-1–ST-9, ST-22, ST-28, ST-34, and ST-36 — `packages/server/tests/pentest/admin-security/tenant-user-boundary.spec.test.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.1.3 Run the new specification tests and verify the red phase; record any justified pre-implementation pass ✅ (completed: 2026-10-25 20:01)

### Step 3.2: Implementation

**Reference**: [03-02](03-02-user-crud-routes.md) · [03-03](03-03-audit-client-actor.md)
**Objective**: Implement delete, lifecycle, and app-bound role management.

- [x] 3.2.1 Extend delete service/route with the client actor, service-owned `runDatabaseTransaction`, transaction audit, and tenant delete scope — `packages/server/src/users/service.ts`, `packages/server/src/routes/tenant-users.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.2 Add tenant activate/deactivate routes with client actor audit; pass the admin actor in both Admin and standalone lifecycle handlers — `packages/server/src/routes/tenant-users.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/users/service.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.3 Extend role assignment/removal with an options object (`AuditActor`, `allowedApplicationId`), `assigned_by=null` for service actors, `RoleApplicationBoundaryError` mapped to `400`, service-owned transactions, and transaction audit — `packages/server/src/rbac/user-role-service.ts`, `packages/server/src/rbac/errors.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.4 Add tenant role list/assign/remove/effective-permission routes and filter reads to the client application — `packages/server/src/routes/tenant-users.ts`, `packages/server/src/rbac/user-role-service.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.5 Add the delete rate limiter and wire it to the delete route — `packages/server/src/middleware/tenant-user-rate-limiter.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.6 Update Admin role routes to pass the admin actor options object without changing permissions — `packages/server/src/routes/user-roles.ts` ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.7 Run the specification tests and verify the green phase ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.8 Write implementation tests for invalid transitions, repeat delete, empty/duplicate role arrays, cross-application removal, and tenant transaction ownership — `*.impl.test.ts`; update existing role/user tests (`user-role-service.test.ts`, `user-roles.test.ts`, `authority-mutations.spec.test.ts`, `permission-deletion-concurrency.impl.test.ts`, `record-deletion.spec.test.ts`) for the new actor options and transaction ownership ✅ (completed: 2026-10-25 20:01)
- [x] 3.2.9 Verify Phase 3: server typecheck, focused unit/integration/pentest/existing tests, and `yarn test:structure` ✅ (completed: 2026-10-25 20:01)

**Deliverables**:
- [ ] Permanent delete with separate authority, service-owned transaction, and existing revocation
- [ ] Lifecycle operations with client audit in the tenant surface and admin actor in Admin/standalone
- [ ] App-bound role management, filtered role reads, `400` boundary errors, and service-owned transactions
- [ ] All Phase 3 verification passing

**Verify**: `yarn workspace @portaidentity/server typecheck && yarn workspace @portaidentity/server vitest run --project unit tests/unit/routes/tenant-users.spec.test.ts tests/unit/rbac/tenant-user-roles.spec.test.ts tests/unit/rbac/user-role-service.test.ts tests/unit/routes/user-roles.test.ts tests/unit/routes/users.test.ts && yarn workspace @portaidentity/server vitest run --project integration tests/integration/security/tenant-user-management.spec.test.ts tests/integration/rbac/authority-mutations.spec.test.ts tests/integration/rbac/permission-deletion-concurrency.impl.test.ts tests/integration/admin/record-deletion.spec.test.ts && yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/admin-security/tenant-user-boundary.spec.test.ts && yarn test:structure`

**Verification**: Passed — typecheck; 91 focused unit tests; 36 focused integration tests; 8 tenant boundary pentest tests; 138 structure tests. Full unit 238 files / 3,861 tests, full integration 61 files / 513 tests, and full pentest 44 files / 286 tests also pass.

**Review**: Passed after fixes — all critical/major findings resolved; RV-007 accepted (tenant delete session revocation remains covered by the shared delete service and its existing integration evidence rather than a new tenant-local assertion). Independent re-review resolved; evidence in [05-findings.md](05-findings.md). Final full unit 3,869, integration 514, pentest 286, structure 138.

---

## Phase 4: SDK, CLI, docs, and techdocs

> **Phase baseline tree**: 04d2f74ac7a41748617d19a53abd0b7a7fb337d2
> **Lenses**: api, compatibility, documentation
> **Reasoning**: medium — additive contracts and operator-facing display, with compatibility checks

### Step 4.1: Specification and contract tests

**Reference**: [03-04](03-04-sdk-cli-docs-contracts.md) · AR-14, AR-22.
**Objective**: Define the additive SDK/CLI contract before changing it.

- [x] 4.1.1 [spec-author] Write SDK type/path contract tests from ST-47–ST-48 — `packages/sdk/tests/type-contracts/tenant-user-management.spec.test.ts`, `packages/sdk/tests/domains/tenant-user-paths.spec.test.ts`; update the existing exact expectations in `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` and replace the old negative `phoneNumberVerified`/`emailVerified` assertions ✅ (completed: 2026-10-25 20:41)
- [x] 4.1.2 [spec-author] Write CLI audit/history display and terminal-safety tests from ST-49 and ST-52 — `packages/cli/tests/commands/audit-client-actor.spec.test.ts`, `packages/cli/tests/admin/user-service-client-actor.spec.test.ts` ✅ (completed: 2026-10-25 20:41)
- [x] 4.1.3 Run the new contract tests and verify the red phase; ST-47 paths may already pass, so record that justified pass and rely on ST-48/ST-49/ST-52 for red ✅ (completed: 2026-10-25 20:41)

### Step 4.2: Implementation

**Reference**: [03-04](03-04-sdk-cli-docs-contracts.md)
**Objective**: Update SDK types, CLI display, and documentation.

- [x] 4.2.1 Add optional `emailVerified`/`phoneNumberVerified` fields to SDK user inputs and client actor fields to audit/history types; update the exact type-contract expectations — `packages/sdk/src/types/users.ts`, `packages/sdk/src/types/audit.ts`, `packages/sdk/src/types/common.ts` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.2 Update CLI audit list and user history to display client actors; validate client actor strings with `isText`/`containsTerminalControl`, degrade invalid labels to a safe placeholder, and sanitize at render — `packages/cli/src/commands/audit.ts`, `packages/cli/src/admin/user-service.ts`, `packages/cli/src/admin/user-workspace.ts` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.3 Update public API docs for tenant CRUD, scopes, client setup, no-password flow, delete safety, and audit — `docs/api/users.md`, `docs/api/audit.md` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.4 Update the SDK README and SDK guide pages with the tenant CRUD example and scope guidance — `packages/sdk/README.md`, `docs/guide/sdk.md`, `docs/guide/sdk-node.md` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.5 Update techdocs and add ADR-017 — `techdocs/architecture/api-design.md`, `techdocs/architecture/security.md`, `techdocs/architecture/data-model.md`, `techdocs/decisions/index.md`, `techdocs/index.md` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.6 Run the contract tests and verify the green phase ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.7 Write implementation tests for optional-field compatibility, client-name-only/ID-only display, historical missing actor fields, terminal-control fallback, and the exact SDK contract updates — `*.impl.test.ts` ✅ (completed: 2026-10-25 20:41)
- [x] 4.2.8 Verify Phase 4: SDK verify, CLI verify, docs build, and `yarn test:structure` ✅ (completed: 2026-10-25 20:41)

**Deliverables**:
- [ ] Additive SDK types and tenant-path contract; exact input-type expectations updated
- [ ] CLI displays client actors and degrades unsafe names to a placeholder
- [ ] Public docs and techdocs updated
- [ ] All Phase 4 verification passing

**Verify**: `yarn workspace @portaidentity/sdk verify && yarn workspace @portaidentity/cli verify && yarn docs:build && yarn test:structure`

**Verification**: Passed — SDK 55 files / 586 tests, CLI 104 files / 1,472 tests, docs build, and 138 structure tests. SDK/CLI typechecks, lint and builds pass.

**Review**: Passed after fixes — 11 minor findings fixed (SDK type-contract inclusion, CLI wiring and placeholder degradation, docs accuracy, directional-control sanitization, trust-boundary wording); no critical/major finding, so no re-review was required. Evidence in [05-findings.md](05-findings.md).

---

## Phase 5: Security verification and handoff

> **Phase baseline tree**: d52efdf2de0f40b871beff88de6318dbebbae56c
> **Lenses**: security, compatibility, operations
> **Reasoning**: high — production security gates, tenant isolation, SDK compatibility, and deployment readiness

### Step 5.1: Full gates and handoff

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) · AR-23.
**Objective**: Prove the feature across the project's full verification and security gates, then hand off deployment steps.

- [x] 5.1.1 Run the focused full server regression suites (unit, integration, and existing E2E) with the repository services running; fix any regressions ✅ (completed: 2026-10-25 21:06) — unit 238 files / 3,869; integration 61 / 514; E2E 21 / 133
- [x] 5.1.2 Run `yarn test:pentest` and review the tenant boundary results ✅ (completed: 2026-10-25 21:06) — 44 files / 286 tests
- [x] 5.1.3 Run `yarn assurance:harness --project security --profile production-security`; record the run ID, observer IDs, and exit code. Compare against the accepted incomplete-observer baseline; expected exit is `40`. Require no observer-set difference, no new gap, and no failed assertion. Never describe the run as fully passed. ✅ (completed: 2026-11-01 11:05; production-security run `069b36ff-c09e-47a3-b48a-af445540b8ee` exit 0 — production exposure 11/11, functional 7/7, second-factor 4/4, tenant/admin 17/17, human-auth recovery 5/5; exact `password-reset-throttled-request`, `magic-link-throttled-request` and `password-reset-wrong-tenant` probes pass with `delivered-authentication-artifact-rejection`. Original failures `31bfd677`/`e99a0d4c` and current repair failures `b89ea7a6`/`26887eb3` are preserved. The old expected exit 40 changed to 0 after the completed observer work; no incomplete observer or failed assertion remains. This is not a full security certification.)
- [x] 5.1.4 Use the git-commit skill to create a clean checkpoint, then run `yarn assurance:compat --select tenant-admin` from that committed revision; record the result ✅ (completed: 2026-10-25 22:12) — compat run `3a682513-5846-4b29-b16a-0da55e922bad` passed
- [x] 5.1.5 Run `yarn docs:build` and `yarn test:structure`; update `repo-tests/monorepo/server-package.spec.test.mjs` and any asserted test-inventory counts if the new test-file inventory changes their expectations, then re-run both gates ✅ (completed: 2026-10-25 22:12)
- [x] 5.1.6 Run `yarn verify`; confirm lint, typecheck, unit, integration, E2E, pentest, SDK, CLI, and structure all pass ✅ (completed: 2026-10-25 22:12)
- [x] 5.1.7 Review findings, update documentation and the ambiguity register if a new decision surfaced, remove temporary artifacts, stop task-owned Docker services, and write the handoff summary with deployment steps ✅ (completed: 2026-10-25 22:12) — [08-handoff.md](08-handoff.md)
- [x] 5.1.8 Handoff: register the new scopes, restart every Porta instance, update the tenant client scope, deploy, and test one real `client_credentials` create/update/delete cycle from the BFF. For migration `034`, record the maintenance window, verified pre-migration backup, full-stop/upgrade ordering for every instance, migration result, and post-migration audit verification. ✅ (completed: 2026-10-25 22:12) — instructions recorded in [08-handoff.md](08-handoff.md); deployment not executed.

**Deliverables**:
- [x] All security and compatibility gates recorded, including the accepted harness baseline
- [x] Migration maintenance window and backup recorded
- [x] No task-created Docker resources or temporary artifacts remain
- [x] Deployment/handoff instructions recorded

**Verify**: `yarn verify && yarn test:pentest && yarn assurance:compat --select tenant-admin && yarn docs:build && yarn test:structure`

Run the production-security harness separately against the accepted baseline; its expected exit `40` is not chained as a green gate.

---

## Dependencies

```text
Phase 1 (auth, scopes, audit foundation)
    ↓
Phase 2 (read, create, update)
    ↓
Phase 3 (delete, lifecycle, roles)
    ↓
Phase 4 (SDK, CLI, docs, techdocs)
    ↓
Phase 5 (security verification and handoff)
```

**Repository base:** this plan is owned by `tenant-user-management/T-01`. Start from an up-to-date
`origin/develop`, which already contains the tenant invitation prerequisite (PR #189). Do not base
the work on the stale local `develop` or the older `feat/tenant-user-invitations` branch.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed.
2. ✅ All verification passing (`yarn verify`, `yarn test:pentest`, `yarn assurance:compat --select tenant-admin`, `yarn docs:build`, `yarn test:structure`).
3. ✅ The production-security harness is recorded against the accepted incomplete-observer baseline: expected exit `40`, no observer-set difference, no new gap, no failed assertion, and never described as fully passed.
4. ✅ No warnings or errors.
5. ✅ No dead code or duplicate tenant auth implementation.
6. ✅ Security hardened: tenant isolation, scope enforcement, app-bound roles, rate limiting, sanitized errors, terminal-safe CLI display, service-owned transaction-bound mutation audit.
7. ✅ Documentation and techdocs updated.
8. ✅ Independent review completed per `codeops/codeops.json`.
9. ✅ Migration maintenance window, backup, and post-migration verification recorded; no task-created infrastructure remains.
