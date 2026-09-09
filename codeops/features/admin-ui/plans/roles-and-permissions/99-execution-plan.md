# Execution Plan: Roles and Permissions

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-09 19:36
> **Progress**: 13/62 tasks (21%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement application-qualified authority first, then transactional RBAC mutations, corrected SDK
and conventional CLI contracts, Application RBAC tabs, and the focused User Roles workflow. Every
phase uses immutable specification tests before implementation (AR-1–AR-20).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                             | Tasks |
| ----: | ------------------------------------------------- | ----: |
|     1 | Authority provenance and OIDC claims              |    10 |
|     2 | Parent-safe transactional RBAC mutations          |    14 |
|     3 | SDK, agent, and conventional CLI contracts        |    12 |
|     4 | Application Roles and Permissions tabs            |    10 |
|     5 | User Roles, documentation, and final verification |    16 |

**Total: 62 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth. Every task appears exactly once.
>
> 1. On implementation, mark the task `[~]` with `implemented: YYYY-MM-DD HH:MM`.
> 2. On verification pass, promote it to `[x]` with `completed: YYYY-MM-DD HH:MM`.
> 3. Update Progress and Last Updated after every task. Only `[x]` counts.
> 4. Resume at the first `[~]`, otherwise the first `[ ]`.
> 5. Mark blockers `[!]` with `Blocked: <short reason>` on the same line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Lifecycle is Ready, Executing, Done, or Blocked.

---

## Phase 1: Authority Provenance and OIDC Claims

> **Phase baseline tree**: `6e3dcf8044a72bea5715913dacee70cccfcb8311`
> **Scope mode**: strict
> **Expected modification set**: `packages/server/tests/unit/security/rbac-authority-boundary.spec.test.ts`, `packages/server/tests/unit/oidc/application-rbac-claims.spec.test.ts`, `packages/server/src/rbac/mapping-repository.ts`, `packages/server/src/rbac/user-role-service.ts`, `packages/server/src/clients/service.ts`, `packages/server/src/oidc/configuration.ts`, `packages/server/src/oidc/account-finder.ts`, `packages/server/src/lib/logger.ts`, `packages/server/src/lib/admin-permissions.ts`, `packages/server/src/cli/commands/init.ts`, `packages/server/src/middleware/admin-auth.ts`, `packages/server/src/routes/user-roles.ts`, the named existing Phase 1 implementation tests, this execution plan, and the feature roadmap.

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-authority-boundaries.md) · AR-3, AR-8, AR-12, AR-15 · ST-1–ST-9, ST-45

- [x] 1.1.1 [spec-author] Write canonical Admin provenance, static capability, delegation-ceiling, and canonical-mutation specifications from ST-1–ST-4 and ST-9 — `packages/server/tests/unit/security/rbac-authority-boundary.spec.test.ts` ✅ (completed: 2026-09-09 15:28)
- [x] 1.1.2 [spec-author] Write application-filtered, duplicate-slug, missing-context, query-failure, production-metadata, and non-disclosure claim specifications from ST-5–ST-8 and ST-45 — `packages/server/tests/unit/oidc/application-rbac-claims.spec.test.ts` ✅ (completed: 2026-09-09 15:30)
- [x] 1.1.3 Run the two Phase 1 specification files and record the expected red result before implementation — red confirmed: 15 failed, 1 passed ✅ (completed: 2026-09-09 15:32)

### Step 1.2: Implementation

**Reference**: [03-01](03-01-authority-boundaries.md) · AR-3, AR-8, AR-12, AR-15

- [x] 1.2.1 Add application-qualified user role/permission repository queries and claim-builder signatures — `packages/server/src/rbac/mapping-repository.ts`, `packages/server/src/rbac/user-role-service.ts` ✅ (completed: 2026-09-09 15:36)
- [x] 1.2.2 Carry one namespaced internal application identifier through provider metadata, redact it, resolve it before RBAC claims, and expose it nowhere else — `packages/server/src/clients/service.ts`, `packages/server/src/oidc/configuration.ts`, `packages/server/src/oidc/account-finder.ts`, `packages/server/src/lib/logger.ts` ✅ (completed: 2026-09-09 15:40)
- [x] 1.2.3 Add permission-update and User Admin application-read capabilities and keep reset/init definitions synchronized — `packages/server/src/lib/admin-permissions.ts`, `packages/server/src/cli/commands/init.ts` ✅ (completed: 2026-09-09 15:43)
- [x] 1.2.4 Require canonical application provenance and static assignment ceiling without adding an authorization layer — `packages/server/src/middleware/admin-auth.ts`, `packages/server/src/routes/user-roles.ts` ✅ (completed: 2026-09-09 16:36)
- [x] 1.2.5 Run ST-1–ST-8 and ST-45 and make the Phase 1 implementation expectations green ✅ (completed: 2026-09-09 16:38)

### Step 1.3: Implementation Tests and Hardening

- [x] 1.3.1 Extend existing Admin permission, middleware, claim, client metadata, provider configuration, and logger tests for internal branches and non-disclosure — `packages/server/tests/unit/lib/admin-permissions.test.ts`, `packages/server/tests/unit/lib/logger.test.ts`, `packages/server/tests/unit/middleware/admin-auth.test.ts`, `packages/server/tests/unit/oidc/account-finder.test.ts`, `packages/server/tests/unit/clients/service.test.ts`, `packages/server/tests/unit/oidc/configuration.test.ts` ✅ (completed: 2026-09-09 16:46)
- [x] 1.3.2 Run focused Phase 1 server unit suites, server lint on changed files, and server typecheck ✅ (completed: 2026-09-09 16:52)

**Verify**: focused server unit specifications and implementation tests, scoped lint, and `yarn workspace @portaidentity/server typecheck`

---

## Phase 2: Parent-Safe Transactional RBAC Mutations

> **Phase baseline tree**: `f898459df2b0d91e76ec3ef02990045e7457b421`
> **Scope mode**: strict
> **Expected modification set**: the three named Phase 2 specification files; `packages/server/src/rbac/role-repository.ts`, `packages/server/src/rbac/permission-repository.ts`, `packages/server/src/rbac/mapping-repository.ts`, `packages/server/src/lib/authority-revocation.ts`, `packages/server/src/lib/deletion-cleanup.ts`, `packages/server/src/rbac/role-service.ts`, `packages/server/src/routes/roles.ts`, `packages/server/src/rbac/permission-service.ts`, `packages/server/src/routes/permissions.ts`, `packages/server/src/users/repository.ts`, `packages/server/src/rbac/user-role-service.ts`, `packages/server/src/routes/user-roles.ts`; the named existing Phase 2 implementation tests; repository test-inventory expectations; this execution plan, the phase review record, the feature roadmap, and incremental techdocs if required.

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-rbac-mutations.md) · AR-4, AR-7, AR-9 · ST-10–ST-24

- [x] 2.1.1 [spec-author] Write route-level parent, capability, response, no-op, and actor specifications from ST-10–ST-13, ST-18, ST-20, and ST-24 — `packages/server/tests/unit/routes/rbac-parent-contracts.spec.test.ts` ✅ (completed: 2026-09-09 19:15)
- [x] 2.1.2 [spec-author] Write real PostgreSQL/Redis revocation, addition, concurrency, survivor, and cleanup specifications from ST-14–ST-23 — `packages/server/tests/integration/rbac/authority-mutations.spec.test.ts` ✅ (completed: 2026-09-09 19:25)
- [x] 2.1.3 [security] Write the required Admin/OIDC application-isolation penetration specifications from ST-1, ST-3, ST-5, and ST-10–ST-12 — `packages/server/tests/pentest/admin-security/rbac-application-isolation.spec.test.ts` ✅ (completed: 2026-09-09 19:36)
- [ ] 2.1.4 Run the Phase 2 specification files and record the expected red result before implementation

### Step 2.2: Implementation

**Reference**: [03-02](03-02-rbac-mutations.md) · AR-4, AR-7, AR-9

- [ ] 2.2.1 Parent-qualify role, permission, module, mapping, and reverse-mapping SQL; add stable-order target locks — `packages/server/src/rbac/role-repository.ts`, `packages/server/src/rbac/permission-repository.ts`, `packages/server/src/rbac/mapping-repository.ts`
- [ ] 2.2.2 Extract repeated database revocation and add narrow detached authority cleanup using existing internals — `packages/server/src/lib/authority-revocation.ts`, `packages/server/src/lib/deletion-cleanup.ts`
- [ ] 2.2.3 Implement role CRUD/mapping capture, canonical guards, targeted cleanup, actor audit, and reduction results — `packages/server/src/rbac/role-service.ts`, `packages/server/src/routes/roles.ts`
- [ ] 2.2.4 Implement permission ownership, module validation, canonical guard, targeted deletion, update capability, actor audit, and reduction results — `packages/server/src/rbac/permission-service.ts`, `packages/server/src/routes/permissions.ts`
- [ ] 2.2.5 Extract and reuse the repository-owned survivor lock/query, then implement user-role parent locks, assignment ceiling, actor provenance, targeted add/remove cleanup, and reduction result — `packages/server/src/users/repository.ts`, `packages/server/src/rbac/user-role-service.ts`, `packages/server/src/routes/user-roles.ts`
- [ ] 2.2.6 Run ST-9–ST-24 and make the immutable expectations green

### Step 2.3: Implementation Tests and Hardening

- [ ] 2.3.1 Add authority helper internals and repository coverage without duplicating specification assertions — `packages/server/tests/unit/rbac/authority-revocation.impl.test.ts`, `packages/server/tests/unit/rbac/mapping-repository.test.ts`
- [ ] 2.3.2 Extend focused role, permission, user-role, and user-repository tests for internal branches and exact survivor locking — `packages/server/tests/unit/rbac/role-service.test.ts`, `packages/server/tests/unit/rbac/permission-service.test.ts`, `packages/server/tests/unit/rbac/user-role-service.test.ts`, `packages/server/tests/unit/users/repository.test.ts`
- [ ] 2.3.3 Update existing route contract tests for exact parent IDs, actors, statuses, bodies, and no-op results without weakening assertions — `packages/server/tests/unit/routes/roles.test.ts`, `packages/server/tests/unit/routes/permissions.test.ts`, `packages/server/tests/unit/routes/user-roles.test.ts`, `packages/server/tests/unit/rbac/role-repository.test.ts`, `packages/server/tests/unit/rbac/permission-repository.test.ts`
- [ ] 2.3.4 Run focused server unit/integration suites, scoped lint, server typecheck, and `yarn test:structure`

**Verify**: focused server RBAC unit/integration suites, scoped lint, `yarn workspace @portaidentity/server typecheck`, and `yarn test:structure`

---

## Phase 3: SDK, Agent, and Conventional CLI Contracts

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-sdk-cli-contracts.md) · AR-6–AR-7 · ST-25–ST-32

- [ ] 3.1.1 [spec-author] Write SDK runtime and type-contract specifications for complete arrays, permission update, user-role collection methods, and reduction results from ST-25–ST-29 — `packages/sdk/tests/domains/rbac-contracts.spec.test.ts`, `packages/sdk/tests/type-contracts/rbac-contracts.spec.test.ts`, `packages/sdk/tests/type-contracts/tsconfig.json`
- [ ] 3.1.2 [spec-author] Write SDK agent and conventional command specifications from ST-30–ST-32 — `packages/sdk/tests/agent/rbac-tools.spec.test.ts`, `packages/cli/tests/commands/rbac-contracts.spec.test.ts`
- [ ] 3.1.3 Run the Phase 3 specification files/type contract and record the expected red result before implementation

### Step 3.2: Implementation

**Reference**: [03-03 §SDK Contracts](03-03-sdk-cli-contracts.md#sdk-contracts) · AR-6–AR-7

- [ ] 3.2.1 Correct and narrowly validate Role list, update, mapping, and reduction result types/domain; remove false pagination and singular wrappers — `packages/sdk/src/types/roles.ts`, `packages/sdk/src/domains/roles.ts`
- [ ] 3.2.2 Correct and narrowly validate Permission list, update, mapping, and reduction result types/domain; remove false pagination and singular wrappers — `packages/sdk/src/types/permissions.ts`, `packages/sdk/src/domains/permissions.ts`
- [ ] 3.2.3 Correct and narrowly validate user-role types/domain to `Role[]` and collection `PUT`/`DELETE` arrays — `packages/sdk/src/types/user-roles.ts`, `packages/sdk/src/domains/user-roles.ts`, `packages/sdk/src/types/index.ts`
- [ ] 3.2.4 Update existing SDK agent definitions and executor for complete arrays and permission update — `packages/sdk/src/agent.ts`
- [ ] 3.2.5 Adapt direct conventional role, permission, and user-role commands with no compatibility shims — `packages/cli/src/commands/app-role.ts`, `packages/cli/src/commands/app-permission.ts`, `packages/cli/src/commands/user-role.ts`
- [ ] 3.2.6 Run ST-25–ST-32 and make the immutable expectations green

### Step 3.3: Implementation Tests and Hardening

- [ ] 3.3.1 Update existing SDK role, permission, and user-role domain tests for serialization and validation branches — `packages/sdk/tests/domains/roles.test.ts`, `packages/sdk/tests/domains/permissions.test.ts`, `packages/sdk/tests/domains/user-roles.test.ts`
- [ ] 3.3.2 Update existing SDK agent and conventional app/user command coverage, then add focused command implementation coverage — `packages/sdk/tests/agent/agent.test.ts`, `packages/cli/tests/commands/app.test.ts`, `packages/cli/tests/commands/user.test.ts`, `packages/cli/tests/commands/rbac-contracts.impl.test.ts`
- [ ] 3.3.3 Run focused SDK/CLI tests, both workspace typechecks, scoped lint, and builds

**Verify**: focused SDK and CLI suites plus each affected workspace's lint, typecheck, and build

---

## Phase 4: Application Roles and Permissions Tabs

### Step 4.1: Specification Tests

**Reference**: [03-04 §§Application Tabs–Layout and Validation](03-04-admin-ui.md#application-tabs) · AR-5, AR-10, AR-13–AR-16, AR-19 · ST-33–ST-38, ST-41–ST-44

- [ ] 4.1.1 [spec-author] Write Application tab order, empty grids, capability/selection, dialogs, direct mappings, reauthentication, stale/error state, and compact-layout specifications — `packages/cli/tests/admin/application-rbac.spec.test.ts`
- [ ] 4.1.2 Run the Phase 4 specification file and record the expected red result before implementation

### Step 4.2: Implementation

**Reference**: [03-04](03-04-admin-ui.md) · AR-5, AR-10

- [ ] 4.2.1 Add allowlisted RBAC projections, remote validation, failure/result types, and SDK adapter operations — `packages/cli/src/admin/rbac-state.ts`, `packages/cli/src/admin/rbac-service.ts`
- [ ] 4.2.2 Wire one lazy RBAC factory, capability mapping, and session operations through the production composition root — `packages/cli/src/commands/admin.ts`, `packages/cli/src/admin/session-service.ts`, `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/state.ts`
- [ ] 4.2.3 Add Application-owned role/permission/mapping controller with session/application generation checks and result reconciliation — `packages/cli/src/admin/application-rbac-controller.ts`
- [ ] 4.2.4 Build Roles/Permissions pages and focused CRUD/mapping dialogs with DataGrid and Layout DSL — `packages/cli/src/admin/application-rbac-workspace.ts`, `packages/cli/src/admin/rbac-dialogs.ts`
- [ ] 4.2.5 Append the two pages and wire their lifecycle through thin existing Application seams — `packages/cli/src/admin/application-workspace.ts`, `packages/cli/src/admin/application-client-features.ts`, `packages/cli/src/admin/index.ts`
- [ ] 4.2.6 Run the Phase 4 specification file and make ST-33–ST-38 and ST-41–ST-44 green

### Step 4.3: Implementation Tests and Hardening

- [ ] 4.3.1 Add sorting, selection, focus, cancellation, render-cleanup, remote-validation, capability, lazy-factory, and production-wiring coverage — `packages/cli/tests/admin/application-rbac.impl.test.ts`, `packages/cli/tests/admin/session.spec.test.ts`, `packages/cli/tests/admin/application-client-state.spec.test.ts`, `packages/cli/tests/admin/session-wiring.spec.test.ts`, `packages/cli/tests/admin/command.spec.test.ts`
- [ ] 4.3.2 Run focused Application/RBAC Admin UI suites, CLI typecheck, scoped lint, and `yarn test:structure`

**Verify**: focused CLI Application/RBAC suites, `yarn workspace @portaidentity/cli typecheck`, scoped lint, and `yarn test:structure`

---

## Phase 5: User Roles, Documentation, and Final Verification

### Step 5.1: Specification Tests

**Reference**: [03-04 §§User Roles Dialog–Mutation State](03-04-admin-ui.md#user-roles-dialog) · AR-4–AR-5, AR-7, AR-10 · ST-39–ST-44

- [ ] 5.1.1 [spec-author] Write User Roles empty-grid, capability, application/role choice, direct removal, stale-context, reauthentication, unknown-outcome, validation, and compact-layout specifications — `packages/cli/tests/admin/user-roles.spec.test.ts`
- [ ] 5.1.2 Run the Phase 5 specification file and record the expected red result before implementation

### Step 5.2: Implementation

**Reference**: [03-04](03-04-admin-ui.md) · AR-5, AR-7, AR-10

- [ ] 5.2.1 Add selected-organization/user-owned role controller and focused assigned-role dialog using the shared RBAC adapter — `packages/cli/src/admin/user-role-controller.ts`, `packages/cli/src/admin/user-role-dialog.ts`
- [ ] 5.2.2 Mount the Roles operation through thin User seams using the already-defined role-read, role-assign, and application-read capabilities — `packages/cli/src/admin/user-workspace.ts`
- [ ] 5.2.3 Wire dialog ownership, late-result cancellation, and definite reauthentication through the existing application/session coordinator — `packages/cli/src/admin/user-controller.ts`, `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/index.ts`
- [ ] 5.2.4 Run the Phase 5 specification file and make ST-39–ST-44 green

### Step 5.3: Implementation Tests, Documentation, and Final Gates

- [ ] 5.3.1 Add User Roles context, selection, focus, disposal, and reauthentication implementation coverage — `packages/cli/tests/admin/user-roles.impl.test.ts`
- [ ] 5.3.2 Update public RBAC API and concept documentation — `docs/api/rbac.md`, `docs/concepts/rbac.md`
- [ ] 5.3.3 Update SDK agent and conventional CLI documentation, then run `yarn docs:build` — `docs/guide/sdk-agent.md`, `docs/cli/applications.md`, `docs/cli/users.md`
- [ ] 5.3.4 Run `yarn test:structure`
- [ ] 5.3.5 Run `yarn workspace @portaidentity/server verify`
- [ ] 5.3.6 Run `yarn workspace @portaidentity/sdk verify`
- [ ] 5.3.7 Run `yarn workspace @portaidentity/cli verify`
- [ ] 5.3.8 Run `yarn harness:test`
- [ ] 5.3.9 Run `yarn assurance:harness --project protocol --profile operational` and `yarn assurance:harness --project security --profile operational`
- [ ] 5.3.10 After the execution workflow creates a clean committed implementation revision, run `yarn assurance:compat --select compatibility`

**Verify**: the complete AR-11 command set; do not run root `yarn verify`

---

## Dependencies

```text
Phase 1: canonical Admin and application-filtered claim boundary
    ↓
Phase 2: parent-safe transactional RBAC mutations
    ↓
Phase 3: truthful SDK, agent, and conventional CLI contracts
    ↓
Phase 4: Application Roles and Permissions tabs
    ↓
Phase 5: User Roles, docs, and complete verification
```

## Success Criteria

1. All 62 tasks are complete and every immutable ST-1–ST-45 case passes.
2. Application roles and permissions cannot cross OIDC or Admin authority boundaries.
3. Reductions revoke only captured affected authority; additions invalidate only affected caches.
4. Application and User RBAC workflows satisfy the RD at standard and compact terminal sizes.
5. The complete AR-11 verification set passes without root `yarn verify`.
6. No dead code, compatibility shim, generalized framework, migration, worker, or new dependency remains.
7. Post-completion CodeOps review and roadmap synchronization are complete.
