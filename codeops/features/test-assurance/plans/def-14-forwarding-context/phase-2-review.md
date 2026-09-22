# DEF-14 Phase 2 Review

> **Document**: phase-2-review.md
> **Parent**: [Index](00-index.md)
> **Phase**: 2 — ST-53 forwarding observers (harness)
> **Reviewed**: 2026-09-21
> **Reviewers**: phase-reviewer (RV), security-auditor (SA), dispatched in parallel; one fix re-review by the security auditor

## Findings and rulings

| ID | Severity | Finding | Ruling | Resolution |
| -- | -------- | ------- | ------ | ---------- |
| SA-001 / RV-001 | 🔴 / 🟠 | The origin and cookie observers were not attack-driven: plain GETs without the attacker header, so a server trusting `X-Forwarded-Proto` or `X-Forwarded-Host` could still pass | Fix | `readConfiguredOrigin` and `readPublicCookiePolicy` now send the case's attacker headers; the adapter passes `requirement.request.headers` |
| SA-002 | 🟠 | The origin observation was an inference, not a host-trust signal | Fix | Discovery is read with the attacker `X-Forwarded-Host` and must equal the configured origin |
| SA-003 / RV-002 | 🟠 / 🟡 | The rate-limit probe returned `second < first`, which is false on a saturated budget or rollover and produced a false product-failure | Fix | Extracted `directPeerBudgetDecision`; returns `null` on `429`, zero or unknown headroom, and rollover |
| RV-003 | 🟡 | `attacker-origin-used` and `secure-cookie-policy-weakened` derived from the vacuous header contract | Fix | They now derive from the corresponding state observation when present |
| RV-004 / SA-005 / RV-005 | 🟡 | Stale `gapId` union and stale admission-gate comment | Fix | `gapId` removed; the gate comment describes deny-by-default behavior |
| RV-006 / SA-006 | 🟡 | Unused exported helper, over-broad module name, no observer tests | Fix | Helpers are covered by `production-exposure-observers.impl.test.ts`; the module is `live-observation-primitives.ts` |
| SA-007 / SA-009 | 🟠 / 🟡 | The general token/introspection rate limiter matches `/{orgSlug}/oidc/token`, but the real endpoints are `/{orgSlug}/token` and `/{orgSlug}/token/introspection`, so the real token endpoint is not throttled; a stale test comment remained | Record + fix comment | The product defect is recorded as DEF-25. The probe now targets `/{orgSlug}/token`, so the rate-limit identity fact reports `unobserved` honestly instead of resting on a non-token path. The stale comment was corrected |

## Consequence

The ST-53 origin and cookie facts are now observed through real attack-driven probes. The
rate-limit identity fact stays `unobserved` until the token limiter is mounted correctly (DEF-25),
so the case remains `incomplete` and the collector still exits 40. No forwarding prohibited effect
is observed.

## Fix verification

| Command | Result |
| ------- | ------ |
| `tsc --project test-harness/tsconfig.assurance.json --noEmit` | exit 0 |
| eslint on the changed files | exit 0 |
| `npx tsx --test` observer impl + aggregate spec/impl + production-exposure impl + validation spec | 45/45 pass |

The live end-to-end behaviour is verified in Phase 3.
