# Testing Strategy: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The correction changes an assurance specification, so the tests are the corrected immutable live
specification, the catalogue-level structural assertions, the observation helper tests, and the
existing structural and production-security harness gates. No product test changes.

### Coverage Goals

| Code type | Target |
| --- | --- |
| Corrected catalogue and spec | Exact (structural counts and ids asserted) |
| Live adapter | Exact (harness observation matches the catalogue) |
| RD-05 wording | Re-read verified via structure test |

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Expectations are derived from [01-requirements.md](01-requirements.md),
> [03-01](03-01-st46-catalogue-correction.md), and [03-02](03-02-rd05-clarification.md), not from
> the current implementation. The immutable-oracle rule applies: if a spec test fails, fix the
> catalogue/adapter, never the spec's intent.

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | Inspect the ST-46 catalogue | `controls.length === 6`; `probes.length === 12`; none of `password-reset-wrong-recipient`, `invitation-wrong-recipient`, `invitation-throttled-request` exists | AR-7 |
| ST-2 | Group ST-46 probes by kind | magic-link = {wrong-recipient, wrong-tenant, configured-expiry, sequential-replay, throttled-request}; password-reset = {wrong-tenant, configured-expiry, sequential-replay, throttled-request}; invitation = {wrong-tenant, configured-expiry, sequential-replay} | AR-2, AR-3, AR-4 |
| ST-3 | Read each retained probe's `expectedFacts` | `*-wrong-tenant` → `invalid-artifact` / 0; `*-configured-expiry` → `expired-artifact` / 0; `*-sequential-replay` → `invalid-artifact` / 0; `magic-link-wrong-recipient` → `invalid-artifact` / 0; `magic-link`/`password-reset-throttled-request` → `throttled` / 0 | AR-9 |
| ST-4 | Run `human-auth-recovery.spec.test.ts` with no live adapter | Frozen shape passes: `probes.length === 12`, `controls.length === 6`, `requiredLogEvent === 'delivered-authentication-artifact-rejection'`; adapter-seam test passes | AR-7 |
| ST-5 | `observeCase(ST-46)` under the admitted production-security harness | Returns 6 controls and 12 probes in catalogue order; each passes `assertExpectedFacts`, `assertProbeEvidence` (no prohibited effect, all five protected states unchanged, required log event, recovery observed); no raw secret appears | AR-6 |
| ST-6 | `observeCase(ST-47)` under the admitted harness | Rejects with `HUMAN_AUTH_LIVE_SENTINEL_UNSUPPORTED` (unchanged) | AR-2 |
| ST-7 | Search the adapter for the three removed ids | No occurrence; no dead helper remains from the removed steps | AR-8 |
| ST-8 | Read RD-05 R5.7 | Contains the bearer-flow clarification; still contains R5.14 and the magic-link binding/atomic-consume clause verbatim | AR-5, AR-10 |
| ST-9 | Read `human-auth-slice-profile-requirements.ts` | `invitation` has no `request-throttling-bypass`, `request-limit-exhausted:public-throttled-rejection`, `delivery-after-throttle`, or `wrong-recipient-use`; `password-reset` has no `wrong-recipient-use` but keeps its public throttle; `magic-link` keeps `wrong-recipient-use` | AR-14 |
| ST-10 | Run `human-auth-slice-profiles.spec.test.ts` | Passes: `invitation` is not required to declare `/public-throttled-rejection/`; `magic-link`, `password-reset`, `email-otp` still are; all other shared assertions hold | AR-14 |
| ST-11 | Read the `human-auth-st46-delivered-artifacts` claim | Invariant and negative outcomes state the bearer-flow model and no longer claim recipient-mismatch rejection for reset/invitation | AR-14 |

## Test Categories

### Specification Tests (from ST-cases above)

| Test File | ST Cases Covered | Component |
| --- | --- | --- |
| `human-auth-recovery.spec.test.ts` | ST-1, ST-2, ST-3, ST-4, ST-5, ST-6 | Catalogue + live spec |
| `human-auth-slice-profiles.spec.test.ts` | ST-9, ST-10, ST-11 | Declarative catalog |
| harness structural search | ST-7 | Adapter |
| manual re-read + structure contract | ST-8 | RD-05 |

### Implementation Tests (edge cases, internals)

| Test File | Description | Priority |
| --- | --- | --- |
| `human-auth-recovery-observations.impl.test.ts` | Classification and control/probe assembly; confirm it pins no count and passes with the 12-probe catalogue | High |

### Integration Tests

| Test | Components | Description |
| --- | --- | --- |
| `yarn assurance:test --select human-auth-recovery-specs` | Catalogue + spec | Structural skip-safe run (3 pass, 1 skip without adapter) |
| `yarn test:structure` | Repository contracts | Docs and structure stay valid |

### End-to-End Tests

| Scenario | Steps | Expected Result |
| --- | --- | --- |
| Production-security harness | `yarn assurance:harness --project security --profile production-security` on a fresh stack from the committed correction | ST-46 passes; delivered-artifact block exit 0; no truthful failure; overall run green |

## Test Data

### Fixtures Needed

Existing harness fixtures only (`alpha`/`bravo`, the synthetic users, MailHog). No new fixture.

### Mock Requirements

None. The live adapter uses the real product through public HTTP and the admin APIs.

## Verification Checklist

- [ ] All specification test cases (ST-1…ST-8) defined with concrete input/output pairs
- [ ] Every ST case traces to a requirement, spec doc, or AR entry
- [ ] Specification tests updated before the adapter change (red phase demonstrated)
- [ ] All specification tests pass after the change (green phase)
- [ ] Implementation tests pass
- [ ] `yarn assurance:harness --project security --profile production-security` passes ST-46
- [ ] `yarn verify` and `yarn test:structure` pass
- [ ] No regressions in existing tests
