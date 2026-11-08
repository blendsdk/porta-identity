# Execution Plan: Resource-Server Admin Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-11-09 00:22
> **Progress**: 0/33 tasks (0%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the resource-server Admin surface in five phases: server contract, SDK, CLI, docs, and the
full verification gate. Provider resolution and the database schema remain unchanged. The
specification-first ordering is mandatory in every behavioral phase.

**🚨 Update this document after EACH completed task!**

## Implementation Phases

| Phase | Title | Tasks |
| --- | --- | --- |
| 1 | Server contract | 13 |
| 2 | SDK | 7 |
| 3 | CLI | 7 |
| 4 | Documentation | 4 |
| 5 | Final verification | 2 |

**Total: 33 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for
> progress. Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp —
>    `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` —
>    `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** (`> **Progress**: X/Y tasks (Z%)`) and the Last Updated stamp
>    after EVERY task — never batch updates. Only `[x]` counts as complete.
> 4. **Resume** by scanning the phase sections top-to-bottom: the first `[~]` task is resumed first,
>    else the first `[ ]` task.
> 5. **On blocker:** mark the task `[!]` and append `Blocked: <short reason>` on the same line.
>    The plan lifecycle is `Ready`, `Executing`, `Done`, or `Blocked`, derived from these markers.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'` — never invented. Failure to keep the marks current
> means progress is invisible after crashes, context resets, or session handoffs.

---

## Phase 1: Server contract

> **Phase baseline tree**: _(recorded by the exec-plan skill from a temporary-index snapshot of
> committed, staged, unstaged, and untracked phase-start state)_
> **Lenses**: web application, data and migration, distributed and concurrent
> **Reasoning**: high — Admin authorization, exact application ownership, and transactional persistence

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-server-api.md) · [07](07-testing-strategy.md) · AR-1, AR-2
**Objective**: Write the API and validation expectations before implementation.

- [ ] 1.1.1 [spec-author] Write integration spec tests for ST-1–ST-19 — `packages/server/tests/integration/resource-servers/resource-server-admin.spec.test.ts`
- [ ] 1.1.2 [spec-author] Write unit spec tests for ST-6, ST-7, ST-16, ST-17 — `packages/server/tests/unit/resource-servers/resource-server-admin.spec.test.ts`
- [ ] 1.1.3 Run the new spec tests and record the red phase; do not read implementation logic while writing them

### Step 1.2: Implementation

**Reference**: [03-01](03-01-server-api.md) · [RD-01](../../requirements/RD-01-resource-server-admin.md)
**Objective**: Add the module, routes, and mount.

- [ ] 1.2.1 Add `ResourceServer` types, inputs, row types, and domain errors — `packages/server/src/resource-servers/types.ts`, `errors.ts`
- [ ] 1.2.2 Add Zod schemas, scope normalization, standard-scope rejection, and audience normalization — `packages/server/src/resource-servers/validators.ts`
- [ ] 1.2.3 Add parameterized list/find/lock/insert/update/delete/scope-replacement queries and row mapping — `packages/server/src/resource-servers/repository.ts`
- [ ] 1.2.4 Add application lookup, slug generation, unique-violation mapping, and transactional service methods — `packages/server/src/resource-servers/service.ts`
- [ ] 1.2.5 Add the nested router and fixed error mapping — `packages/server/src/routes/resource-servers.ts`
- [ ] 1.2.6 Mount the router after the application router — `packages/server/src/server.ts`
- [ ] 1.2.7 Run the new spec tests and record the green phase

### Step 1.3: Implementation Tests and Hardening

**Reference**: [03-01](03-01-server-api.md) · [07](07-testing-strategy.md) · AR-5
**Objective**: Cover concurrency, cascade, and provider-boundary effects.

- [ ] 1.3.1 Write impl tests for concurrent writers, unique mapping, scope replacement, and delete cascade — `packages/server/tests/integration/resource-servers/resource-server-admin.impl.test.ts`
- [ ] 1.3.2 Run targeted server tests plus server lint, typecheck, and build
- [ ] 1.3.3 Dispatch the `oidc-provider-reviewer` on the Phase 1 diff; resolve every Critical/Major finding before proceeding

**Deliverables**:
- [ ] Admin API and service implemented
- [ ] Spec and impl tests pass
- [ ] Provider-boundary review complete

**Verify**: `pnpm --filter @portaidentity/server vitest run --project unit tests/unit/resource-servers/resource-server-admin.spec.test.ts && pnpm --filter @portaidentity/server vitest run --project integration tests/integration/resource-servers/resource-server-admin.spec.test.ts && pnpm --filter @portaidentity/server lint && pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server build`

---

## Phase 2: SDK

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: web application
> **Reasoning**: medium — bounded SDK surface reusing the applications domain

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-sdk.md) · ST-20–ST-22
**Objective**: Define the SDK method and validation expectations before implementation.

- [ ] 2.1.1 [spec-author] Write SDK spec tests for paths, methods, bodies, parsed results, and malformed responses — `packages/sdk/tests/resource-servers.spec.test.ts`
- [ ] 2.1.2 Run the SDK spec tests and record the red phase

### Step 2.2: Implementation

**Reference**: [03-02](03-02-sdk.md)
**Objective**: Add types and domain methods.

- [ ] 2.2.1 Add resource-server entity/input types and export them — `packages/sdk/src/types/resource-servers.ts`, `packages/sdk/src/types/index.ts`
- [ ] 2.2.2 Add the response guard and five methods to the applications domain — `packages/sdk/src/domains/applications.ts`
- [ ] 2.2.3 Run the SDK spec tests and record the green phase

### Step 2.3: Implementation Tests and Hardening

**Reference**: [03-02](03-02-sdk.md)
**Objective**: Cover malformed responses and transport failures.

- [ ] 2.3.1 Write impl tests for malformed success bodies and non-2xx errors — `packages/sdk/tests/resource-servers.impl.test.ts`
- [ ] 2.3.2 Run SDK lint, typecheck, tests, and build

**Deliverables**:
- [ ] SDK types and methods exported
- [ ] Spec and impl tests pass
- [ ] SDK type contracts pass

**Verify**: `pnpm --filter @portaidentity/sdk lint && pnpm --filter @portaidentity/sdk typecheck && pnpm --filter @portaidentity/sdk test && pnpm --filter @portaidentity/sdk build`

---

## Phase 3: CLI

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: web application
> **Reasoning**: medium — command composition over the reviewed SDK

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-cli-docs.md) · ST-23–ST-27
**Objective**: Define the command behavior before implementation.

- [ ] 3.1.1 [spec-author] Write CLI spec tests for command paths, flags, human/JSON output, empty list, and confirmation — `packages/cli/tests/commands/app-resource-server.spec.test.ts`
- [ ] 3.1.2 Run the CLI spec tests and record the red phase

### Step 3.2: Implementation

**Reference**: [03-03](03-03-cli-docs.md)
**Objective**: Add and register the command family.

- [ ] 3.2.1 Add the `resource-server` command module with list/get/create/update/delete — `packages/cli/src/commands/app-resource-server.ts`
- [ ] 3.2.2 Register the command under `app` — `packages/cli/src/commands/app.ts`
- [ ] 3.2.3 Run the CLI spec tests and record the green phase

### Step 3.3: Implementation Tests and Hardening

**Reference**: [03-03](03-03-cli-docs.md)
**Objective**: Cover flag edges, empty states, and confirmation bypass.

- [ ] 3.3.1 Write impl tests for flag edge cases, empty lists, and `--yes` behavior — `packages/cli/tests/commands/app-resource-server.impl.test.ts`
- [ ] 3.3.2 Run CLI lint, typecheck, tests, and build

**Deliverables**:
- [ ] CLI command family registered
- [ ] Human/JSON output and confirmation verified
- [ ] CLI tests pass

**Verify**: `pnpm --filter @portaidentity/cli lint && pnpm --filter @portaidentity/cli typecheck && pnpm --filter @portaidentity/cli test && pnpm --filter @portaidentity/cli build`

---

## Phase 4: Documentation

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: web application
> **Reasoning**: low — bounded documentation updates over a settled contract

### Step 4.1: Public and Technical Docs

**Reference**: [03-03](03-03-cli-docs.md) · AR-3
**Objective**: Make the surface discoverable and remove the "no Admin API" claim.

- [ ] 4.1.1 Add the public API page and cross-link it from the applications page — `docs/api/resource-servers.md`, `docs/api/applications.md`
- [ ] 4.1.2 Add the public CLI page and cross-link it from the applications page — `docs/cli/resource-servers.md`, `docs/cli/applications.md`
- [ ] 4.1.3 Update the technical API and data-model docs — `techdocs/architecture/api-design.md`, `techdocs/architecture/data-model.md`
- [ ] 4.1.4 Run the docs build and structure link checks (ST-28)

**Deliverables**:
- [ ] Public API and CLI pages exist and are linked
- [ ] Technical docs no longer claim the Admin API is absent
- [ ] Docs build and structure checks pass

**Verify**: `pnpm docs:build && pnpm test:structure`

---

## Phase 5: Final verification

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: web application, data and migration, distributed and concurrent
> **Reasoning**: high — multi-workspace release gate

### Step 5.1: Full Gate

**Reference**: AR-4 · [RD-01](../../requirements/RD-01-resource-server-admin.md)
**Objective**: Prove the complete feature against the project's authoritative gate.

- [ ] 5.1.1 Run the full `pnpm verify` gate
- [ ] 5.1.2 Confirm no migration file was added and the existing `038` schema tests remain green

**Deliverables**:
- [ ] `pnpm verify` passes
- [ ] No schema change
- [ ] Plan and roadmap progress reflect completion

**Verify**: `pnpm verify`

---

## Dependencies

```text
Phase 1 (Server contract)
        ↓
Phase 2 (SDK)
        ↓
Phase 3 (CLI)
        ↓
Phase 4 (Documentation)
        ↓
Phase 5 (Final verification)
```

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `pnpm verify` passes
3. ✅ No warnings or errors
4. ✅ No dead code
5. ✅ Security hardened: validation, parameterized SQL, Admin authorization, exact application ownership, fixed errors, no secret/row logging
6. ✅ Public and technical documentation updated
7. ✅ Phase 1 provider-boundary review complete
8. ✅ No new migration; existing schema tests green
9. ✅ Post-completion project re-analysis handled by the exec-plan skill
