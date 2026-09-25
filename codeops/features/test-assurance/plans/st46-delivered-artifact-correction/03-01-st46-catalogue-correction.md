# ST-46 Catalogue, Adapter, and Spec Correction: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 03-01-st46-catalogue-correction.md
> **Parent**: [Index](00-index.md)

## Overview

This component corrects the ST-46 delivered-artifact catalogue, the live adapter that produces its
observations, and the immutable live specification's frozen shape. The change removes exactly three
probes that cannot test what they claim and changes no positive control, no protected-state key,
and no prohibited side effect.

## Architecture

### Current Architecture

`deliveredArtifactSteps(kind)` returns a fixed structure — one delivery control, one consumption
control, and five probes — for every artifact kind. ST-46 concatenates the probe arrays of
`magic-link`, `password-reset`, and `invitation` (`human-auth-recovery-case-requirements.ts:114-133`).
The live adapter builds one observation per catalogue step and the spec compares facts exactly.

### Proposed Changes

Make the probe set a function of each kind's realizable interactions:

| Kind | Probes kept | Removed |
| --- | --- | --- |
| magic-link | wrong-recipient, wrong-tenant, configured-expiry, sequential-replay, throttled-request (5) | — |
| password-reset | wrong-tenant, configured-expiry, sequential-replay, throttled-request (4) | wrong-recipient |
| invitation | wrong-tenant, configured-expiry, sequential-replay (3) | wrong-recipient, throttled-request |

Total probes 15 → 12; controls stay 6. Decision per AR-2, AR-3, AR-4, AR-7.

## Implementation Details

### New Types/Interfaces

Extend the delivered-artifact builder options (exact property names are an implementation detail;
the behaviour is fixed):

```ts
interface DeliveredArtifactCapabilities {
  /** True when consumption takes a recipient/authority input that can be varied to a mismatch. */
  readonly recipientAuthority: boolean;
  /** True when issuance is a public endpoint with a dedicated equivalent-input limiter. */
  readonly publicIssuanceThrottle: boolean;
}
```

- `magic-link`: `{ recipientAuthority: true, publicIssuanceThrottle: true }`.
- `password-reset`: `{ recipientAuthority: false, publicIssuanceThrottle: true }`.
- `invitation`: `{ recipientAuthority: false, publicIssuanceThrottle: false }`.

`deliveredArtifactSteps(kind, capabilities)` includes the `wrong-recipient` probe only when
`recipientAuthority` is true, and the `throttled-request` probe only when `publicIssuanceThrottle`
is true.

### Catalogue Rules

- Every remaining probe keeps its current `expectedFacts`, `controlId`, inputs, and
  `expectedPublicResponse`. Only the set membership changes.
- `requiredLogEvent` stays `delivered-authentication-artifact-rejection`.
- `prohibitedSideEffects`, `protectedStateKeys`, `recoveryExpectation`, and `independenceRule` are
  unchanged (AR-9).
- The delivery control keeps deliveryCount 1 and intendedDeliveryOnly; the consumption control
  keeps `accepted` / `durableEffectCount: 1`.

### Live Adapter Changes

- `runPasswordReset`: remove the `password-reset-wrong-recipient` step. Keep the second issuance
  (currently the misnamed `wrongRecipient`) because `password-reset-delivery-control` compares it
  with the first issuance; rename that local to `second`.
- `runInvitation`: remove the `invitation-wrong-recipient` and `invitation-throttled-request` steps.
  Keep the `second` issuance used by `invitation-delivery-control`. Delete `observeInvitationThrottle`.
- Remove any helper that becomes unused after those deletions (check `mailCountGlobal` and the
  invitation throttle helpers); leave no dead code.
- Every other step and observer is unchanged.

### Immutable Live Specification Changes

- `human-auth-recovery.spec.test.ts`: change the frozen `probes.length` assertion from 15 to 12;
  keep the 6-control and `requiredLogEvent` assertions. The probe loop already iterates the
  catalogue, so no per-id hardcoding changes.

### Integration Points

- `human-auth-recovery-observations.impl.test.ts` iterates `controls + probes` generically; verify
  it pins no count and adjust only if it does.
- The harness selector and production-security block in `run-command.ts` are unchanged.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| A removed probe id remains referenced by a test or doc | Fail the harness/typecheck; the removal step greps for each removed id and the number 15 before finalizing | AR-7 |
| A remaining probe regresses after the catalogue edit | The immutable spec fails; fix the catalogue/adapter (never the spec) | AR-6 |
| The adapter still emits a removed probe | The spec's id-order assertion fails against the catalogue | AR-7 |

## Testing Requirements

- The corrected live spec must pass under the admitted production-security harness (ST-cases in
  [07-testing-strategy.md](07-testing-strategy.md)).
- The existing observation impl tests must pass unchanged in intent.
- No product test changes.
