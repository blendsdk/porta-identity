# Testing Strategy: Consent Flag Surfaces

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Testing Overview

### Coverage Goals

| Code type                   | Target |
| --------------------------- | ------ |
| SDK types / guard           | 90%    |
| CLI option mapping          | 90%    |
| Admin UI model / editor     | 80%    |
| Portability read/write/diff | 80%    |
| Documentation               | build  |

- Test names state behavior: `should [expected behavior] when [condition]`.
- No new end-to-end harness is built. The browser-to-server consent flow is covered by DEF-21; this
  plan carries the flag to consumers and is proven by contract, unit, and integration tests.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived exclusively from `01-requirements.md`, the `03-XX` specs, and the Ambiguity Register. These
> expectations are the immutable oracle: if the implementation disagrees, the implementation is
> wrong. Each ST case traces to the decision that defines it. The `Source` id lives here, not in
> code.

### SDK Contract (03-01)

| #    | Input / Scenario                                                                  | Expected Output / Behavior                                                     | Source      |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| ST-1 | Compare `Client` and both input types with the exact-type oracle                  | `Client` has `requireConsent: boolean`; inputs have `requireConsent?: boolean` | AC-1 / AR-1 |
| ST-2 | Run `isClient` on a response where `requireConsent` is `true` / missing / `"yes"` | `true` / `false` / `false`                                                     | AC-1 / AR-1 |
| ST-3 | Call `clients.create` and `clients.update` with `requireConsent: true`            | The transport body contains `requireConsent: true`                             | AC-2        |

### CLI Command (03-02)

| #    | Input / Scenario                                            | Expected Output / Behavior                                                           | Source      |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| ST-4 | `client create --require-consent`; then without the flag    | Input has `requireConsent: true`; then the input omits `requireConsent`              | AC-2 / AR-3 |
| ST-5 | `client update --no-require-consent`; then without the flag | Input has `requireConsent: false`; then the input omits `requireConsent` (unchanged) | AR-3        |
| ST-6 | `client get` for a client with `requireConsent: true`       | The table prints a "Require Consent" row with `true`                                 | AC-2 / AR-8 |

### Admin UI Protocol Tab (03-03)

| #    | Input / Scenario                                                                                   | Expected Output / Behavior                                                       | Source      |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| ST-7 | Open the Protocol tab for a client with `requireConsent: true`                                     | A "Require consent" switch is shown in the on state                              | AC-3 / AR-4 |
| ST-8 | Toggle the switch and save (exact `save-protocol` assertions in `oidc-client-detail.spec.test.ts`) | The form is dirty and the `save-protocol` input carries the new `requireConsent` | AC-3        |
| ST-9 | Project a server client whose `requireConsent` is missing or non-boolean                           | `clientValue` rejects the shape (returns undefined)                              | AR-4        |

### Portability and Import (03-04)

| #     | Input / Scenario                                              | Expected Output / Behavior                               | Source      |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| ST-10 | Export a client stored with `require_consent = true`          | The manifest payload contains `require_consent: true`    | AC-4 / AR-2 |
| ST-11 | Import that payload into an empty organization                | The imported client row has `require_consent = true`     | AC-4 / AR-2 |
| ST-12 | Plan an import where the stored flag differs from the payload | The client diff reports a change (plan does not skip it) | AR-2        |

> **⚠️ AUTHORING RULE:** Expectations come from the specs above, never from imagined implementation
> output. In-code traceability comments quote the behavior in plain language, never an ST/AR id.

## Test Categories

### Specification Tests (from ST-cases above)

| Test File                                                                     | ST Cases         | Component   |
| ----------------------------------------------------------------------------- | ---------------- | ----------- |
| `packages/sdk/tests/clients-rd04.spec.test.ts`                                | ST-1, ST-2, ST-3 | SDK         |
| `packages/sdk/tests/type-contracts/portability.spec.test.ts`                  | ST-10            | SDK import  |
| `packages/cli/tests/commands/application-client-contracts.spec.test.ts`       | ST-4, ST-5, ST-6 | CLI         |
| `packages/cli/tests/admin/oidc-client-detail.spec.test.ts`                    | ST-7, ST-8       | Admin UI    |
| `packages/cli/tests/admin/application-client-state.spec.test.ts`              | ST-9             | Admin UI    |
| `packages/server/tests/unit/portability/portability-engine.spec.test.ts`      | ST-10, ST-12     | Portability |
| `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts` | ST-11            | Portability |

### Implementation Tests (edge cases, internals)

| Test File                                                                       | Description                                         | Priority |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| `packages/cli/tests/commands/client.test.ts`                                    | Fixtures and create/update/get assertions           | High     |
| `packages/cli/tests/admin/oidc-client-detail.impl.test.ts`                      | Protocol editor internals and dirty tracking        | Medium   |
| `packages/cli/tests/admin/*.impl.test.ts` / `*.spec.test.ts` fixtures           | Add `requireConsent` to every `AdminClient` fixture | High     |
| `packages/sdk/tests/domains/clients.test.ts`                                    | Guard and body pass-through                         | High     |
| `packages/server/tests/unit/portability/portability-import-engine.spec.test.ts` | Import writer and plan comparison                   | Medium   |

### Integration Tests

| Test                                  | Components              | Description                                              |
| ------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `portability-round-trip.spec.test.ts` | Server portability + DB | Export then import a client and assert the flag survives |

### End-to-End Tests

| Scenario | Steps | Expected Result                                                                                |
| -------- | ----- | ---------------------------------------------------------------------------------------------- |
| N/A      | N/A   | No browser/HTTP flow changes; the consent page behavior was proven by DEF-21 (`yarn test:ui`). |

## Test Data

### Fixtures Needed

- An SDK `Client` fixture with `requireConsent: true`.
- A CLI `sampleClient` with `requireConsent: true`.
- All Admin UI `AdminClient` fixtures gain `requireConsent: false` unless the case needs `true`.
- A portability client manifest entry with `require_consent: true`.

### Mock Requirements

None new. Existing transport/DB mocks cover the added field.

## Verification Checklist

- [ ] All ST cases defined with concrete input/output pairs
- [ ] Every ST case traces to a requirement, spec doc, or AR entry
- [ ] Specification tests written BEFORE implementation (Phase 1)
- [ ] Specification tests verified to FAIL before implementation (red phase)
- [ ] All specification tests pass after implementation (green phase)
- [ ] Implementation tests written for edge cases and internals
- [ ] `yarn workspace @portaidentity/sdk verify` passes
- [ ] `yarn workspace @portaidentity/cli verify` passes
- [ ] `yarn test:structure` passes
- [ ] `yarn assurance:compat --select compatibility` passes from a clean committed revision
- [ ] `yarn verify` passes as the final safety net
- [ ] Documentation updated and `yarn docs:build` passes
