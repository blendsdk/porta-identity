# Requirements: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-security-risk-slice-assurance.md) — the OWNING requirements document

## Scope of this plan (delta view)

### In this plan

| RD-05 | One-line gloss                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R5.2  | The case already defines actors, assets, entry points, trust boundaries, expected rejection, prohibited side effects, required logs without sensitive data, and recovery behaviour; this plan supplies the live observation of each.             |
| R5.7  | Delivered artifacts must be unpredictable, bound to the intended recipient and tenant, expire at the configured boundary, be single-use, reject sequential replay, throttle, and never expose secrets outside the allowlisted synthetic channel. |
| R5.11 | Negative probes use raw HTTP requests, not browser/client libraries that would normalize the input.                                                                                                                                              |
| R5.13 | No existing pentest assertion is deleted, skipped, relaxed, or replaced by this new evidence.                                                                                                                                                    |
| R5.14 | Any observed invariant violation blocks the slice and is reported truthfully; no expectation is changed to bless a defect.                                                                                                                       |

### Deferred / out of this plan

| RD-05 | Why out of this plan                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5.12 | This plan covers the **sequential** delivered-artifact lane only. Concurrent-consume, response-loss, and restart consistency remain the deferred consistency catalog (ST-49, `evidenceAllowed: false`). |
| R5.6  | Enumeration-resistance timing distributions stay diagnostic (DEF-23, policy-blocked). This plan adds no timing credit.                                                                                  |

## Plan-local decisions

| Decision                   | Chosen                                    | AR Ref |
| -------------------------- | ----------------------------------------- | ------ |
| Live coverage boundary     | ST-46 only; other sentinels fail closed   | AR-2   |
| Step coverage              | All 21 steps                              | AR-3   |
| Evidence path              | Public HTTP + MailHog + admin APIs; no DB | AR-5   |
| Invitation rejection audit | Add the missing event                     | AR-6   |
| Configured expiry          | Catalog-minimum TTL + one bounded wait    | AR-7   |
| Security-log observation   | Admin audit API, normalized class         | AR-8   |
| Fixtures                   | Reuse the seeded fixtures                 | AR-9   |

## Acceptance Criteria

1. [ ] `createHumanAuthCasesContract()` in live mode returns a working ST-46 adapter and fails closed for every other sentinel (AR-2, AR-25).
2. [ ] All 21 ST-46 steps are observed through public HTTP, MailHog, and admin APIs only (AR-3, AR-5).
3. [ ] The invitation invalid/used/expired path emits a rejection audit event consistent with magic-link and password-reset (AR-6).
4. [ ] `human-auth-recovery.spec.test.ts` asserts the observed ST-46 case and is skipped unless the live adapter is active (AR-4, AR-20).
5. [ ] The service-free `human-auth-live` selector stays service-free; the live spec runs in its own registered selector and in the production-security harness block (AR-22).
6. [ ] One owned production-security harness run passes ST-46 and its result artifact is recorded (AR-27, AR-28).
7. [ ] `yarn verify` and `yarn test:structure` pass; no pentest assertion is weakened (R5.13).
