# RD-05 R5.7 Clarification: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 03-02-rd05-clarification.md
> **Parent**: [Index](00-index.md)

## Overview

ST-46 is owned by `test-assurance/RD-05` requirement R5.7, which groups magic-link, reset,
invitation, email OTP, TOTP, and recovery-code under a single list of guarantees including
"intended recipient/tenant" and "throttling". Only magic-link and email OTP accept a
recipient/authority input that can be varied to a mismatch, and only public issuance endpoints have
a dedicated equivalent-input limiter. This component makes the bearer-flow model explicit so the
corrected ST-46 traces cleanly to its owning requirement (AR-5, AR-10).

## Current Text

R5.7 first sentence (`RD-05-security-risk-slice-assurance.md:65-68`):

> Magic-link, reset, invitation, email OTP, TOTP, and recovery-code claims shall cover
> unpredictability, intended recipient/tenant, configured expiry boundary, single use, sequential
> replay, throttling, and absence of secret/token exposure outside the allowlisted synthetic
> delivery/verification channel.

The magic-link-specific detail already scopes interaction and client-authority matching to magic
links (`:72-76`); the clarification makes the same boundary explicit for the general clause.

## Proposed Change

Append the following two sentences immediately after the first sentence of R5.7, leaving the rest of
the requirement (the deferred-consistency sentence, the exposure list, the magic-link binding
clause, and the atomic-consume clause) unchanged:

> Recipient/authority matching is required only for flows that accept a recipient or authority
> input: magic-link and email OTP bind an organization, an optional interaction, and client
> authority before mutation, and reject a mismatch non-consumingly. Token-delivered bearer
> artifacts (reset, invitation) establish the intended recipient by token ownership and instead
> rely on organization-scoped lookup to reject a token presented under a wrong tenant. Throttling
> covers public issuance endpoints with a dedicated equivalent-input limiter; admin-authenticated
> invitation issuance is bounded by the administrative limiter.

## Preserved Guarantees

| Guarantee | Status |
| --- | --- |
| R5.14 — no expectation changed to bless a defect | Preserved; the change states the model, adds no leniency |
| Unpredictability, expiry, single use, sequential replay, no exposure | Preserved |
| Magic-link organization/interaction/client-authority binding and atomic consume | Preserved verbatim |
| Concurrent-consume deferral | Preserved verbatim |
| `security.decision.v1` / rejection-audit obligations (R5.17) | Preserved; `requiredLogEvent` is unchanged |

## Traceability Bookkeeping

- Add one row to `codeops/features/test-assurance/requirements/00-ambiguity-register.md` recording
  the R5.7 clarification, its authority (this plan's AR-5/AR-10), and that it does not redesign
  sibling requirements.
- Update the `test-assurance-program` traceability/testing notes only if they pin the removed probe
  ids or the number 15; the current R5.7 → ST-46–ST-51 mapping stays valid.

## Testing Requirements

- Documentation-only component: verified by `yarn test:structure` and by re-reading the amended
  R5.7 against the ST-46 catalogue. No code test.
