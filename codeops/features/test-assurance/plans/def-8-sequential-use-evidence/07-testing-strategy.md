# Testing Strategy: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type                                  | Target |
| ------------------------------------------ | ------ |
| Adapter observation/classification helpers | 90%    |
| Harness wiring and selector logic          | 80%    |
| Product audit change                       | 90%    |

There is no new UI. E2E coverage is the owned production-security harness run, not a new browser
suite.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived exclusively from RD-05, the ST-46 requirement catalog, the observation contract, and the
> Ambiguity Register. These are the immutable oracle; if the implementation disagrees, the
> implementation is wrong.

### Live Adapter and Observation

| #     | Input / Scenario                                                          | Expected Output / Behavior                                                                                                                    | Source      |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| ST-1  | `createHumanAuthCasesContract()` with adapter `live`, requirement `ST-46` | Returns an adapter whose `observeCase` resolves ST-46                                                                                         | AR-2        |
| ST-2  | `observeCase` for a sentinel other than ST-46 in live mode                | Throws `HUMAN_AUTH_LIVE_SENTINEL_UNSUPPORTED`; never returns rig output                                                                       | AR-25       |
| ST-3  | Delivery control for each kind                                            | `result: 'generic-response'`, `deliveryCount: 1`, `intendedDeliveryOnly: true`                                                                | AR-11, R5.7 |
| ST-4  | Two artifacts issued to the same intended recipient                       | Values differ and meet the entropy shape ⇒ `cryptographicallyUnpredictable: true`                                                             | AR-11, R5.7 |
| ST-5  | First consumption of a delivered artifact                                 | `result: 'accepted'`, `durableEffectCount: 1`                                                                                                 | AR-12, R5.7 |
| ST-6  | Artifact presented for the wrong recipient                                | `result: 'invalid-artifact'`, `durableEffectCount: 0`, recipient state unchanged                                                              | AR-17, R5.7 |
| ST-7  | Alpha artifact presented under the bravo tenant                           | `result: 'invalid-artifact'`, `durableEffectCount: 0`, no cross-tenant effect                                                                 | AR-16, R5.7 |
| ST-8  | Artifact consumed at/after its configured boundary                        | `result: 'expired-artifact'`, `durableEffectCount: 0`                                                                                         | AR-7, R5.7  |
| ST-9  | Exact committed value replayed after first use                            | `result: 'invalid-artifact'`, `durableEffectCount: 0` (no second effect)                                                                      | AR-18, R5.7 |
| ST-10 | Equivalent public inputs past the endpoint limit                          | `result: 'throttled'`, `deliveryCount: 0`, `durableEffectCount: 0`                                                                            | AR-15, R5.7 |
| ST-11 | Any rejection probe                                                       | `securityLog.event` is the normalized `delivered-authentication-artifact-rejection`, required fields present, `forbiddenValueObserved: false` | AR-8, R5.7  |
| ST-12 | A compliant run                                                           | Every `prohibitedSideEffects` entry is false and every `protectedStateUnchanged` entry is true                                                | AR-14, R5.7 |
| ST-13 | A fresh artifact after a consumed one                                     | The fresh artifact is accepted; the consumed artifact is not restored                                                                         | AR-19, R5.7 |
| ST-14 | A live value that contradicts `expectedFacts`                             | The adapter returns the observed value unchanged; no fabrication                                                                              | AR-21       |
| ST-15 | Observation for ST-46                                                     | `controls` and `probes` ids and order match the requirement; controls precede probes                                                          | AR-3, AR-20 |
| ST-16 | Any observation or error                                                  | No token, password, cookie, or secret value appears                                                                                           | AR-21, R5.7 |
| ST-17 | Live spec without the adapter env                                         | The suite skips cleanly                                                                                                                       | AR-4, AR-22 |

### Product Invitation Audit

| #     | Input / Scenario                                      | Expected Output / Behavior                                                                | Source      |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| ST-18 | POST accept-invite with an invalid/used/expired token | Exactly one `user.invite.failed` audit event, `eventCategory: 'security'`, no token value | AR-6, R5.7  |
| ST-19 | A valid invitation acceptance                         | The existing `user.invite.accepted` event is unchanged; no rejection event is written     | AR-6, R5.13 |

## Test Categories

### Specification Tests (from ST-cases above)

| Test File                                                       | ST Cases Covered   | Component                        |
| --------------------------------------------------------------- | ------------------ | -------------------------------- |
| `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` | ST-3..ST-15, ST-17 | Live adapter (skips unless live) |
| `packages/server/tests/unit/routes/invitation.test.ts`          | ST-18, ST-19       | Product audit change             |

### Implementation Tests

| Test File                                                                    | Description                                                                                                                        | Priority |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `test-harness/assurance/tests/human-auth-recovery-observations.impl.test.ts` | Classifier, durable-effect counter, assembler: missing/undeclared ids, contradicting values, no secret leakage (ST-1, ST-2, ST-16) | High     |

### Integration Tests

| Test                                                                      | Components                        | Description                                       |
| ------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| Invitation rejection audit                                                | `routes/invitation.ts`, audit log | Invalid/used/expired token writes one audit event |
| `yarn assurance:harness --project security --profile production-security` | Full stack                        | Real ST-46 evidence                               |

### End-to-End Tests

The production-security harness run is the E2E scenario; no additional browser suite is added.

## Test Data

### Fixtures Needed

- Seeded alpha `active` (intended), alpha `enumeration` (wrong recipient), bravo `active`
  (wrong tenant), alpha public client, super-admin credentials — all existing (AR-9).
- No new fixture types, tables, or endpoints.

### Mock Requirements

None for the adapter; real HTTP, MailHog, and admin APIs only (AR-5).

## Verification Checklist

- [ ] All specification test cases defined with concrete input/output pairs
- [ ] Every ST case traces to a requirement, spec doc, or AR entry
- [ ] Specification tests written BEFORE implementation
- [ ] Specification tests verified to FAIL (or skip-when-live) before implementation
- [ ] All specification tests pass after implementation
- [ ] Implementation tests written for helpers and internals
- [ ] `yarn assurance:test --select human-auth-live` and `--select human-auth-recovery-specs` pass
- [ ] The owned production-security harness run passes ST-46 and its artifact is recorded
- [ ] `yarn verify` and `yarn test:structure` pass
- [ ] No pentest assertion deleted, skipped, relaxed, or replaced
