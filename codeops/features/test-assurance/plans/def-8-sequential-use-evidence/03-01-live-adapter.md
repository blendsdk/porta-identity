# Live ST-46 Adapter: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 03-01-live-adapter.md
> **Parent**: [Index](00-index.md)
> **Decision per AR #2, AR #3, AR #5, AR #10–AR #21, AR #24, AR #25**

## Overview

This component implements live mode for the existing `HumanAuthCasesContract` seam. For `ST-46` it
observes all 21 delivered-artifact steps through public HTTP, MailHog, and the administrative APIs,
and returns truthful values for a new immutable live specification to compare. For any other
sentinel it fails closed. It does not change the requirement catalog, the observation shape, or the
existing boundary specification.

## Architecture

### Current Architecture

`createHumanAuthCasesContract()` (`human-auth-cases-adapter.ts:6-11`) selects `spec-rig` by default
and throws `HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE` for `live`. The seam takes no context argument, so
a live implementation must resolve its own run context from the harness environment.

### Proposed Changes

| File                                  | Change                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `human-auth-cases-adapter.ts`         | In live mode, return `createHumanAuthRecoveryContract()`. |
| `human-auth-recovery-live-adapter.ts` | New: implement the live ST-46 adapter.                    |
| `human-auth-recovery-observations.ts` | New: pure observation-assembly helpers (impl-tested).     |

The live adapter reuses, without modification: `human-auth-live-observers.ts`,
`tenant-admin-live-context.ts`, the fingerprint helpers in `human-auth-functional-observations.ts`
(`functionalBodyFingerprint`, `functionalHeaderFingerprint`), and the browser/HTTP mechanics proven
by `human-auth-functional-live-adapter.ts`.

## Implementation Details

### New Types

```ts
/** Run context the recovery adapter self-resolves from the harness manifests. */
interface HumanAuthRecoveryContext {
  readonly live: LiveTenantAdminContext;
  readonly portaUrl: string;
  readonly mailhogUrl: string;
  readonly runId: string;
}

/** One issued artifact remembered for its control and probe steps. */
interface IssuedArtifact {
  readonly kind: 'magic-link' | 'password-reset' | 'invitation';
  readonly token: string; // never logged or interpolated into errors
  readonly recipient: string;
  readonly tenantSlug: string;
}
```

### New Functions

| Function                          | Signature                                                                    | Responsibility                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `createHumanAuthRecoveryContract` | `(): HumanAuthCasesContract`                                                 | Build the live adapter; fail closed for non-ST-46 sentinels                                                 |
| `observeSt46Case`                 | `(requirement: HumanAuthCaseRequirement): Promise<HumanAuthCaseObservation>` | Orchestrate the 21 steps and return the ordered observation                                                 |
| `issueArtifact`                   | `(ctx, kind, recipient, tenant): Promise<IssuedArtifact>`                    | Drive real issuance and wait for exactly one mailbox delivery                                               |
| `consumeArtifact`                 | `(ctx, artifact, mode): Promise<HumanAuthStepObservation>`                   | Present the token (first use, replay, wrong recipient, wrong tenant) and observe the outcome                |
| `classifyArtifactResponse`        | `(response): ArtifactResult`                                                 | Map status/body/redirect to `accepted`/`invalid-artifact`/`expired-artifact`/`throttled`/`generic-response` |
| `countDurableEffects`             | `(before, after): number`                                                    | Count observable transitions across the before/after admin fingerprints                                     |
| `observeRejectionAudit`           | `(ctx, kind, since): HumanAuthStepObservation['securityLog']`                | Read `/api/admin/audit`, normalize the class, and check forbidden values                                    |

### Step Observation Map

`k` ranges over `magic-link`, `password-reset`, `invitation`. Controls run before probes.

| Step                                | Boundary          | Observed facts                                                                                         | Method                                                                                                                                                                                                          |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${k}-delivery-control`             | raw-http          | `result:'generic-response'`, `deliveryCount`, `cryptographicallyUnpredictable`, `intendedDeliveryOnly` | Issue via the public route; `pollForExactHumanAuthMailValue` counts one recipient-scoped delivery; issue ≥2 artifacts to require distinct unpredictable values; search other mailboxes to confirm intended-only |
| `${k}-intended-consumption-control` | synthetic-mailbox | `result:'accepted'`, `durableEffectCount:1`                                                            | Consume the delivered token once; before/after fingerprints show exactly one transition                                                                                                                         |
| `${k}-wrong-recipient`              | synthetic-mailbox | `result:'invalid-artifact'`, `durableEffectCount:0`                                                    | Present the intended token under the wrong synthetic recipient; no state change                                                                                                                                 |
| `${k}-wrong-tenant`                 | synthetic-mailbox | `result:'invalid-artifact'`, `durableEffectCount:0`                                                    | Present the artifact under the bravo tenant; no cross-tenant effect                                                                                                                                             |
| `${k}-configured-expiry`            | synthetic-mailbox | `result:'expired-artifact'`, `durableEffectCount:0`                                                    | Issue with the catalog-minimum TTL, await past the boundary, consume (see 03-03)                                                                                                                                |
| `${k}-sequential-replay`            | synthetic-mailbox | `result:'invalid-artifact'`, `durableEffectCount:0`                                                    | Replay the exact committed value; no second effect                                                                                                                                                              |
| `${k}-throttled-request`            | raw-http          | `result:'throttled'`, `deliveryCount:0`, `durableEffectCount:0`                                        | Exhaust the real limiter with equivalent public inputs                                                                                                                                                          |

### Observation Assembly

`protectedStateUnchanged` is computed per `protectedStateKeys` entry (`intended-account-state`,
`wrong-recipient-account-state`, `wrong-tenant-state`, `membership-and-role-state`,
`artifact-consumption-state`) using `publicStateUnchanged` over `sha256:` digests of the relevant
admin-API reads. `prohibitedSideEffects` maps each named effect to its observed boolean:
wrong-mailbox via MailHog, exposure via response/redirect/referrer inspection, wrong
recipient/tenant effects via fingerprints, and second-effect/delivery-after-throttle via the
effect counters. `securityLog` is populated for probes only, from `observeRejectionAudit`.

## Error Handling

| Error Case                                     | Handling Strategy                                                                                                 | AR Ref       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| Sentinel other than ST-46 in live mode         | Throw `HUMAN_AUTH_LIVE_SENTINEL_UNSUPPORTED` (closed diagnostic)                                                  | AR-25        |
| Run not admitted / wrong profile               | Throw the same admission error as the functional adapter                                                          | AR-5         |
| Mailbox cardinality or value invalid           | Propagate the observer's closed diagnostic (`mail-cardinality-invalid`, `mail-value-invalid`, `mail-unavailable`) | AR-11        |
| Missing required audit event                   | Report `securityLog` truthfully with the observed event; do not fabricate                                         | AR-8, AR-21  |
| State digest unavailable                       | Propagate `public-state-unavailable`                                                                              | AR-13        |
| Any observed value contradicts `expectedFacts` | Return the observed value; the live spec fails                                                                    | AR-20, AR-21 |

> **Traceability:** design choices carry their AR references above and in 00-ambiguity-register.md.

## Integration Points

- Consumes the `HumanAuthCasesContract` types unchanged.
- Reuses `LiveTenantAdminContext` for endpoints, credentials, and raw requests.
- Emits observations consumed by `human-auth-recovery.spec.test.ts` (03-03).

## Testing Requirements

- Impl tests for `classifyArtifactResponse`, `countDurableEffects`, and the observation assembler
  (missing/undeclared ids, contradicting values, no secret leakage), service-free.
- The live spec plus the harness block provide the integration and end-to-end coverage (07).
