# Execution Plan: Consent Flag Surfaces

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Executing
> **Last Updated**: 2026-09-24 10:55
> **Progress**: 16/21 tasks (76%)
> **CodeOps Artifact Schema**: 1

## Overview

Carry the server's existing per-client `requireConsent` flag to the SDK, the conventional CLI, the
Admin UI Protocol tab, and the portability export/import contract, with the client-field
documentation updated. No server schema, API, or consent-logic change.

## Execution Contract

The task checkboxes below are the single source of truth for progress. Mark the active task `[~]`
with the current date on implementation; promote to `[x]` only after its targeted command passes and
update Progress/Last Updated every task. A specification RED succeeds only when the named new
assertion fails while the existing required lanes stay green.

## Targeted Verification Bindings

| Phase | Required targeted commands                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `yarn workspace @portaidentity/sdk vitest run tests/clients-rd04.spec.test.ts` (RED); `yarn workspace @portaidentity/cli vitest run tests/commands/application-client-contracts.spec.test.ts` (RED)                                                                              |
| 2     | `yarn workspace @portaidentity/sdk verify`                                                                                                                                                                                                                                       |
| 3     | `yarn workspace @portaidentity/cli vitest run tests/commands/`; `yarn workspace @portaidentity/cli verify`                                                                                                                                                                       |
| 4     | `yarn workspace @portaidentity/cli vitest run tests/admin/`; `yarn workspace @portaidentity/cli verify`                                                                                                                                                                          |
| 5     | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/portability/`; `yarn workspace @portaidentity/server vitest run --project integration tests/integration/admin/`; `yarn test:structure`; `yarn assurance:compat --select compatibility`; `yarn verify` |

---

## Phase 1: Specification tests first

> **Lenses**: correctness, compatibility
> **Phase baseline tree**: 1fd22ca19642aa86120940114ff280cb8f32f7d5

**Reference**: `03-01`–`03-04`; `07-testing-strategy.md`; AR-1, AR-2, AR-3, AR-4, AR-8, AR-9.
**Scope mode**: strict
**Expected modification set**: the listed `.spec.test` files plus existing test fixtures.

- [x] 1.1 [spec-author] Add the SDK contract oracle (ST-1, ST-2, ST-3): `Client`/input exact types, the `isClient` guard, and the `create`/`update` body — `packages/sdk/tests/clients-rd04.spec.test.ts` ✅ (completed: 2026-09-24 10:35; `packages/sdk/tests/clients-rd04.spec.test.ts`; guard RED via `clients.get` rejecting a response missing or mistyping `requireConsent`; the exact-type oracle is a type-contracts typecheck RED)
- [x] 1.2 [spec-author] Add the CLI contract oracle (ST-4, ST-5, ST-6): create/update mapping including `--no-require-consent` and omission, and the `get` row — `packages/cli/tests/commands/application-client-contracts.spec.test.ts` ✅ (completed: 2026-09-24 10:35; `packages/cli/tests/commands/application-client-contracts.spec.test.ts`; 3 RED — create `--require-consent`, update `--no-require-consent`/omission, and the `get` row)
- [x] 1.3 [spec-author] Add the Admin UI oracle (ST-7, ST-8, ST-9): Protocol switch render, dirty/save input, and strict projection — `packages/cli/tests/admin/oidc-client-detail.spec.test.ts`, `packages/cli/tests/admin/application-client-state.spec.test.ts` ✅ (completed: 2026-09-24 10:35; `oidc-client-detail.spec.test.ts` (two-switch render + both `save-protocol` inputs) and `application-client-state.spec.test.ts` (ST-9 single-client rejection) RED)
- [x] 1.4 [spec-author] Add the portability oracle (ST-10, ST-11, ST-12): export payload, round-trip, import-plan diff, and the SDK import type — `packages/server/tests/unit/portability/portability-engine.spec.test.ts`, `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts`, `packages/sdk/tests/type-contracts/portability.spec.test.ts` ✅ (completed: 2026-09-24 10:35; SDK portability type oracle RED; server unit portability 11 RED from the `.strict()` schema rejecting `require_consent` and the export assertion)
- [x] 1.5 Run the new specifications and record the exact RED for each; confirm typecheck and `yarn test:structure` stay green ✅ (completed: 2026-09-24 10:35; SDK/CLI lint clean; `yarn test:structure` 126/126 green; expected SDK type-contracts typecheck RED recorded)

**Phase gate:** every new specification fails for the intended missing field while the existing
required suites stay green.

---

## Phase 2: SDK contract

> **Lenses**: correctness, compatibility

**Reference**: `03-01`; AR-1, AR-5.
**Scope mode**: strict

- [x] 2.1 Add `requireConsent` to `Client`, `CreateClientInput`, and `UpdateClientInput`, and the `isClient` guard — `packages/sdk/src/types/clients.ts`, `packages/sdk/src/domains/clients.ts` ✅ (completed: 2026-09-24 10:40; `Client`/`CreateClientInput`/`UpdateClientInput` and the `isClient` guard; the SDK portability import type `require_consent` was also added here because the SDK type-contracts include the portability type oracle)
- [x] 2.2 Update the remaining SDK fixtures and implementation tests that construct a `Client` and confirm the Phase 1 oracle turns green — `packages/sdk/tests/` ✅ (completed: 2026-09-24 10:40; `packages/sdk/tests/domains/{clients,client-secret-expiry.impl}.test.ts` and `tests/type-contracts/client-secret-expiry-contract.spec.test.ts` fixtures)
- [x] 2.3 Run `yarn workspace @portaidentity/sdk verify` ✅ (completed: 2026-09-24 10:40; `yarn workspace @portaidentity/sdk verify` 562/562, lint + typecheck + build clean)

**Phase gate:** the SDK exposes and validates the field, the exact-type oracle passes, and the SDK
verify command is green.

---

## Phase 3: Conventional CLI

> **Lenses**: correctness, security

**Reference**: `03-02`; AR-3, AR-6, AR-8.
**Scope mode**: strict

- [x] 3.1 Add the `require-consent` boolean option (no default) and the conditional spread to `client create` and `client update`, and the "Require Consent" row to `client get` — `packages/cli/src/commands/client.ts` ✅ (completed: 2026-09-24 10:45; create/update option + conditional spread and the `get` row in `packages/cli/src/commands/client.ts`)
- [x] 3.2 Update the CLI fixtures and implementation tests — `packages/cli/tests/commands/client.test.ts` ✅ (completed: 2026-09-24 10:45; added `requireConsent` to the `sampleClient` fixture in `packages/cli/tests/commands/client.test.ts`)
- [x] 3.3 Run `yarn workspace @portaidentity/cli verify` ✅ (completed: 2026-09-24 10:45; `tests/commands/` 367/367 and CLI lint clean; the full `cli verify` also runs the still-RED Admin UI specs, so it moves to task 4.5)

**Phase gate:** create/update reach the SDK input, an omitted flag is never sent, and `client get`
prints the value.

---

## Phase 4: Admin UI Protocol tab

> **Lenses**: UX, correctness

**Reference**: `03-03`; AR-4, AR-5.
**Scope mode**: strict

- [x] 4.1 Add `requireConsent` to `AdminClient` — `packages/cli/src/admin/client-state.ts` ✅ (completed: 2026-09-24 10:55; `packages/cli/src/admin/client-state.ts`)
- [x] 4.2 Validate and project the field in `clientValue` — `packages/cli/src/admin/client-service.ts` ✅ (completed: 2026-09-24 10:55; `clientValue` rejects a missing/non-boolean flag and projects it — `packages/cli/src/admin/client-service.ts`)
- [x] 4.3 Add the switch, dirty check, and save input to `protocolSection` — `packages/cli/src/admin/client-workspace.ts` ✅ (completed: 2026-09-24 10:55; `signal` + `Re~q~uire consent` Switch, `isDirty`, and the `save-protocol` input — `packages/cli/src/admin/client-workspace.ts`)
- [x] 4.4 Update every `AdminClient` fixture the compiler reports plus both exact `save-protocol` input assertions in `oidc-client-detail.spec.test.ts`, then confirm the Admin UI suite — `packages/cli/tests/admin/` ✅ (completed: 2026-09-24 10:55; added `requireConsent` to all 13 remaining admin fixtures; both `save-protocol` assertions were extended in Phase 1; admin suite 902/902)
- [x] 4.5 Run `yarn workspace @portaidentity/cli verify` ✅ (completed: 2026-09-24 10:55; `yarn workspace @portaidentity/cli verify` 1434/1434, lint + typecheck + build clean)

**Phase gate:** the Protocol tab shows and saves the flag, the strict projection rejects an untrusted
shape, and the CLI workspace verify is green.

---

## Phase 5: Portability, documentation, and closeout

> **Lenses**: integration, documentation, security

**Reference**: `03-04`; AR-2, AR-7, AR-9.
**Scope mode**: strict

- [ ] 5.1 Add `require_consent` to the portability contract: `packages/server/src/portability/{types,repository,schema,plan-support,import-user-client-writers}.ts` and the SDK import type `packages/sdk/src/types/imports.ts`
- [ ] 5.2 Extend the portability specification/implementation tests and run the server unit + integration portability suites — `packages/server/tests/`
- [ ] 5.3 Update the client-field documentation — `docs/api/clients.md`, `docs/cli/clients.md` (add the flag row and align the create/get/update sections to the real flags), `docs/database/schema.md`, `techdocs/architecture/data-model.md`; run `yarn docs:build`
- [ ] 5.4 Resolve the DEF-21 follow-up row for these surfaces in `codeops/features/test-assurance/00-remaining-work.md` and note the pre-existing migrations-doc gap (R-02); run `yarn test:structure`
- [ ] 5.5 Full verification: `yarn workspace @portaidentity/sdk verify`, `yarn workspace @portaidentity/cli verify`, `yarn test:structure`, `yarn assurance:compat --select compatibility`, `yarn verify`

**Phase gate:** the flag round-trips through export/import, the documentation lists it, the backlog
row is resolved, and every AR-9 command passes.

---

## Dependencies

```
Phase 1 (specs)
    ↓
Phase 2 (SDK)  ← the CLI and Admin UI types depend on the SDK Client shape
    ↓
Phase 3 (CLI)  ┐
Phase 4 (Admin UI) ┘  (both consume the SDK contract)
    ↓
Phase 5 (portability, docs, closeout)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn workspace @portaidentity/sdk verify`, `yarn workspace @portaidentity/cli verify`, `yarn test:structure`, `yarn assurance:compat --select compatibility`)
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules
5. ✅ Security hardened — an omitted CLI flag never trusts a client; a restore preserves the flag
6. ✅ Documentation updated
7. ✅ Code reviewed (if applicable)
8. ✅ Post-completion project re-analysis (handled by the exec-plan skill)
