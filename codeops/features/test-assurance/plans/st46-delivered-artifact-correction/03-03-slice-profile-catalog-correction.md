# Slice-Profile Catalog Correction: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 03-03-slice-profile-catalog-correction.md
> **Parent**: [Index](00-index.md)

## Overview

`human-auth-slice-profile-requirements.ts` holds a second, declarative definition of `ST-46`: the
`human-auth-st46-delivered-artifacts` claim and the `magic-link`, `password-reset`, and `invitation`
slice profiles. It is `evidenceStatus: 'specification-only'` (it defines no executable
observation), but it is validated by the immutable `human-auth-slice-profiles.spec.test.ts`. It
still asserts the two controls the executable correction removes. This component aligns it with the
clarified R5.7 (AR-14).

## Current State

| Location | Statement that must change |
| --- | --- |
| `invitation` profile `abuseCases` | `wrong-recipient-use`, `request-throttling-bypass` |
| `invitation` profile `exactRejections` | `request-limit-exhausted:public-throttled-rejection` |
| `invitation` profile `prohibitedSideEffects` | `delivery-after-throttle` |
| `password-reset` profile `abuseCases` | `wrong-recipient-use` |
| ST-46 claim `invariant` / `negativeOutcomes` | "bound to its intended recipient" / "wrong recipient or tenant is rejected" |
| `human-auth-slice-profiles.spec.test.ts` | blanket `/public-throttled-rejection/` assertion for `['magic-link','password-reset','invitation','email-otp']` |

## Changes

1. **Invitation profile.** Remove `request-throttling-bypass` and `wrong-recipient-use` from
   `abuseCases`; remove `request-limit-exhausted:public-throttled-rejection` from `exactRejections`;
   remove `delivery-after-throttle` from `prohibitedSideEffects`. Keep `wrong-tenant-use`,
   `expired-use`, `sequential-replay`, and the retained rejections and exposure effects.
2. **Password-reset profile.** Remove `wrong-recipient-use` from `abuseCases`. Keep
   `request-throttling-bypass` and `request-limit-exhausted:public-throttled-rejection` — password
   reset has a dedicated public limiter, so its throttle probe and claim stay.
3. **Also remove `wrong-recipient-use` from the magic-link profile?** No — magic-link has a
   recipient/interaction authority, so `wrong-recipient-use` stays, mirroring the retained
   `magic-link-wrong-recipient` probe.
4. **ST-46 claim.** Restate the invariant and negative outcomes in the clarified bearer-flow terms:
   magic-link/email-OTP bind organization, interaction, and client authority; password-reset and
   invitation bind by token ownership and reject a wrong tenant. Remove the claim that a bare
   "wrong recipient" is rejected for bearer artifacts.
5. **Spec test.** In `human-auth-slice-profiles.spec.test.ts`, apply the
   `/public-throttled-rejection/` assertion only to the public-issuance profiles (`magic-link`,
   `password-reset`, `email-otp`) and assert that the `invitation` profile does not declare a public
   throttled rejection. Keep the other shared assertions (unpredictable,
   intended-recipient-and-tenant, configured-expiry, sequential-replay, exposure effects).

## Preserved Guarantees

- The catalog remains versioned (`profileVersion`/`schemaVersion`), non-empty in every field, and
  free of orphan sources.
- No executable case, product source, or pentest assertion changes.
- `wrong-tenant`, expiry, replay, and the exposure side effects remain declared for all four
  delivered-artifact profiles.

## Integration Points

- If `test-harness/assurance/traceability.json`, `traceability-nodes.json`, or the
  `test-assurance-program` traceability/testing notes reference the removed catalog strings, update
  them in the same change; verify with `yarn test:structure`.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Spec test still requires invitation public throttling | The red phase fails; update the assertion with the catalog (never the other way) | AR-14 |
| A traceability artifact pins a removed string | `yarn test:structure` fails; update the traceability artifact | AR-14 |

## Testing Requirements

- The corrected `human-auth-slice-profiles.spec.test.ts` passes (ST-cases in
  [07-testing-strategy.md](07-testing-strategy.md)).
- `yarn test:structure` passes.
