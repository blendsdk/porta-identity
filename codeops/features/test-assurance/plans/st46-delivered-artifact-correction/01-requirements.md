# Requirements: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-security-risk-slice-assurance.md) — the OWNING requirements document

## Scope of this plan (delta view)

### In this plan

| RD-05 | One-line gloss |
| ----- | --- |
| R5.2 | The case defines actors, assets, entry points, trust boundaries, expected rejection, prohibited side effects, required logs, and recovery; this plan keeps all of that and only removes three unreachable probes. |
| R5.7 | Delivered artifacts must cover unpredictability, intended recipient/tenant, expiry, single use, replay, and throttling; the clarification narrows the recipient and throttle wording to the flows where each is realizable. |
| R5.11 | Negative probes still use raw HTTP requests; the retained probes are unchanged in method. |
| R5.13 | No pentest assertion is deleted, skipped, relaxed, or replaced. |
| R5.14 | No test expectation is changed to bless an observed defect; the removed probes were unreachable by construction and every real property stays asserted. |
| R5.17 | Covered rejection paths keep their privacy-safe terminal event; `requiredLogEvent` is unchanged. |

### Deferred / out of this plan

| RD-05 | Why out of this plan |
| ----- | --- |
| R5.12 | Concurrent-consume, response-loss, and restart consistency remain the deferred consistency catalog (DEF-3). |
| R5.6 | Enumeration timing distributions stay diagnostic (DEF-23). |
| R5.9 | P1 administrative-data claims are unaffected by this correction. |

## Plan-local decisions

| Decision | Chosen | AR Ref |
| -------- | ------ | ------ |
| Findings resolved | AR-29 + AR-30 only | AR-1 |
| Wrong-recipient amendment | Remove both probes; do not redefine | AR-2, AR-3 |
| Invitation throttle amendment | Remove the probe; no product limiter | AR-4, AR-13 |
| Owning requirement | Clarify RD-05 R5.7 in this plan | AR-5, AR-10 |
| Safety proof | Retained probes + five protected-state keys + token-to-owner binding | AR-6 |
| Frozen shape | Probes 15 → 12; controls stay 6 | AR-7 |
| Second ST-46 catalog | Correct the declarative slice-profile catalog and its spec test | AR-14 |
| Product change | None | AR-13 |
| Bookkeeping | New roadmap row; update DEF-8 resolved note | AR-12 |

## Acceptance Criteria

1. [ ] The ST-46 catalogue declares 6 controls and 12 probes; the three removed probes are absent.
2. [ ] The live adapter produces exactly the 12 declared probes and 6 controls with no dead code.
3. [ ] The live specification's frozen probe count is 12 and the corrected case passes under the admitted production-security harness.
4. [ ] `yarn assurance:harness --project security --profile production-security` completes with ST-46 passing and no truthful failure in the delivered-artifact block.
5. [ ] RD-05 R5.7 states the bearer-flow model; R5.14 and every retained guarantee are preserved.
6. [ ] No product source file changes; `yarn verify` and `yarn test:structure` pass.
7. [ ] Backlog and roadmap record the closure of AR-29 and AR-30.
8. [ ] The declarative slice-profile catalog and its immutable spec test no longer require invitation public throttling or reset/invitation wrong-recipient rejection (AR-14).
