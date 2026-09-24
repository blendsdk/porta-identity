# Ambiguity Register: ST-46 Delivered-Artifact Requirement Correction

> **Status**: ✅ GATE PASSED — all 15 items resolved
> **Last Updated**: 2026-09-24 23:34

This register gates the plan that corrects the `ST-46` delivered-artifact assurance specification
so the production-security harness proves the real security properties truthfully. It closes the
two open findings recorded by the `def-8-sequential-use-evidence` plan: AR-29 (reset/invitation
`wrong-recipient` acceptance) and AR-30 (invitation issuance has no dedicated public-input
limiter). The correction must not weaken a genuine security assertion; RD-05 R5.14 forbids
changing an expectation to bless an observed defect.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
| --- | --- | --- | --- | --- | --- |
| AR-1 | Scope | Which open findings does this plan resolve? | (A) AR-29 only; (B) AR-29 + AR-30; (C) A/B + AR-20 forwarding-context gaps; (D) C + DEF-3/6/22; (E) all open | (B) AR-29 + AR-30 — user direction: fix the items that make Porta production ready fastest | ✅ Resolved |
| AR-2 | Behavioral | AR-29 residual: the `password-reset-wrong-recipient` and `invitation-wrong-recipient` probes expect `invalid-artifact`, but reset/invitation consumption has no recipient input to vary, so the expectation is unreachable by construction | (a) amend ST-46 to match bearer-token flows; (b) harden the product to bind reset/invitation consumption to a recipient context; (c) keep the finding recorded and do not remediate | (a) amend ST-46 — user | ✅ Resolved |
| AR-3 | Scope / Technical | Exact form of the wrong-recipient amendment: remove the two probes, or redefine their expectations | (a) remove both probes — they present a valid token, and redefining to `accepted`/1 would change `intended-account-state` and fail the probe's protected-state check while duplicating the consumption control; (b) redefine as `accepted`/1 (infeasible under protected-state); (c) remove only the invitation probe | (a) remove both — user accepted recommendation | ✅ Resolved |
| AR-4 | Behavioral | AR-30: `invitation-throttled-request` expects `throttled`, but invitation issuance is the admin-authenticated `POST /api/admin/organizations/:orgId/users/invite`, has no dedicated limiter, and the only bound is the global admin per-IP limiter (60 writes / 60 s) which is warn-logged, not audited | (1) report the truthful gap; (2) exhaust the shared admin limiter; (3) add a dedicated invitation limiter + `rate_limit.invitation` audit event | (Remove the invitation throttle probe — amend ST-46) user chose the removal option | ✅ Resolved |
| AR-5 | Integration | ST-46 is owned by `test-assurance/RD-05` requirement R5.7, so correcting the oracle touches the owning requirement | (A) combined narrow RD-05 R5.7 clarification + ST-46 correction; (B) ST-46 correction only, RD-05 untouched; (C) separate requirements revision first | (A) combined — user | ✅ Resolved |
| AR-6 | Security & compliance | R5.14 forbids changing an expectation to bless a defect. What independently proves the removal weakens no real security property? | (a) keep and rely on the retained probes — `*-wrong-tenant` (rejected, 0 durable effect), `*-configured-expiry`, `*-sequential-replay`, `magic-link-wrong-recipient` (mismatched interaction), `magic-link`/`password-reset-throttled-request` — plus the five `protectedStateKeys` (including `wrong-recipient-account-state`) asserted unchanged on every probe, plus token-to-owner binding; (b) remove and add nothing (would weaken); (c) move the assertions elsewhere | (a) retained probes plus protected-state evidence prove no real property is dropped; no product defect is blessed — user accepted recommendation | ✅ Resolved |
| AR-7 | Data & state | Probe count and frozen spec shape after removal | Three probes removed (`password-reset-wrong-recipient`, `invitation-wrong-recipient`, `invitation-throttled-request`): probes 15 → 12; controls stay 6; update the spec's frozen `probes.length` from 15 to 12 and any other count assertion | Derived: magic-link 5 + password-reset 4 + invitation 3 = 12; controls 6 | ✅ Resolved |
| AR-8 | Naming / Technical | Live-adapter edits and dead-code removal | Remove the three probe steps; keep the `second` artifact issuance (still used by the delivery control in both flows); delete `observeInvitationThrottle`; remove any helper that becomes unused (verify `mailCountGlobal`); rename the misleading `wrongRecipient` local to `second` | Derived from AR-3 and AR-4 | ✅ Resolved |
| AR-9 | Data & state | Are the protected-state keys, prohibited side effects, required log event, and exposure effects unchanged? | Yes — keep `protectedStateKeys` (all five), `prohibitedSideEffects`, `requiredLogEvent` (`delivered-authentication-artifact-rejection`), and `authenticationArtifactExposureEffects` exactly as-is; only the probe list changes | Derived: the removed probes are the defect; surrounding guarantees remain | ✅ Resolved |
| AR-10 | Naming / Technical | Wording of the RD-05 R5.7 clarification | Refine R5.7's first sentence (or add one clarifying clause) to state that intended-recipient/interaction binding applies to artifacts with a recipient/interaction authority (magic-link, email OTP); token-delivered bearer artifacts (password-reset, invitation) establish the intended recipient by token ownership and must additionally reject wrong-tenant; throttling applies to public issuance while admin-authenticated invitation issuance is bounded by the administrative limiter. Preserve R5.14 and every existing detail | Recommended — user accepted recommendation | ✅ Resolved |
| AR-11 | Integration | Harness prerequisites: the production-security harness requires a clean committed revision and a freshly built stack to exercise the organization-scoped invitation/reset fix | Commit the correction first (auto-commit mode satisfies this), then run `yarn assurance:harness --project security --profile production-security` against a fresh stack started by the harness | Derived from AGENTS.md harness rules | ✅ Resolved |
| AR-12 | Naming / Scope | Plan slug plus backlog and roadmap bookkeeping | Slug `st46-delivered-artifact-correction` under `codeops/features/test-assurance/plans/`; add one roadmap row and update the DEF-8 resolved note in `00-remaining-work.md` and `00-roadmap.md` | Recommended — user accepted recommendation | ✅ Resolved |
| AR-13 | Scope | Does the correction require any product code change? | No — no limiter, no audit event, no recipient-binding rework; the invitation rejection audit and organization-scoped invitation lookup already shipped with DEF-8 Phase 1 and 2.4 | Derived from AR-2, AR-3, AR-4 | ✅ Resolved |
| AR-14 | Scope / Consistency | Preflight PF-001: a second, immutable `ST-46` exists as a declarative slice profile plus claim (`human-auth-slice-profile-requirements.ts:610`), pinned by `human-auth-slice-profiles.spec.test.ts`, which still asserts invitation `request-limit-exhausted:public-throttled-rejection` and reset/invitation `wrong-recipient-use` | (A) extend the plan to correct that catalog and its spec test; (B) keep it as an intentionally broader specification-only model; (C) defer | (A) correct the second catalog too — user | ✅ Resolved |
| AR-15 | Integration / Consistency | Preflight PF-002–PF-005: roadmap double-link risk, stale def-8 findings, non-automated RD-05 wording check, and uncommitted plan artifacts before the harness | Accept all four recommendations: advance only the DEF-26 row; cross-reference def-8; accept the manual RD-05 check; commit all docs before 3.1.1 | Accepted — user | ✅ Resolved |

## Resolution Notes

**AR-1:** Scope is AR-29 + AR-30 only. AR-20 (three accepted forwarding-context observer gaps) was
explicitly accepted by the user on 2026-09-16 and remains a qualified, not-open, gap. DEF-3, DEF-6,
and DEF-22 are harness coverage completeness, not release blockers.

**AR-2 / AR-3:** Code inspection confirms the `wrong-recipient` probes never vary a recipient.
`password-reset-wrong-recipient` issues a fresh token for `INTENDED_EMAIL` and presents it
(`human-auth-recovery-live-adapter.ts` `runPasswordReset`), and `invitation-wrong-recipient`
issues a token to a random address and presents it (`runInvitation`). Both therefore observe
`accepted` with one durable effect on the token's own account. The product resolves the account
from the token (`password-reset.ts:415-419`, `invitation.ts:139-140`), so no recipient mismatch
exists to reject. Removal is the correct correction; redefining to `accepted` is infeasible because
`captureProtected` includes the intended account and the probe's protected-state check requires it
unchanged.

**AR-4:** The `invitation-throttled-request` probe asserts an equivalent-public-input throttle that
does not and should not exist for an admin-authenticated issuance route. The global admin per-IP
limiter is the actual control. Removing the probe records the correct model; adding a dedicated
limiter is deliberately out of scope (AR-13).

**AR-5 / AR-10:** R5.7 already scopes interaction/client-authority matching to magic-link
(`RD-05-security-risk-slice-assurance.md:72-76`). The clarification makes the bearer-flow model for
reset/invitation explicit so the corrected ST-46 traces cleanly to its owning requirement.

**AR-6:** No genuine property is dropped. Wrong-tenant rejection for both flows was fixed by the
organization-scoped lookups (`token-repository.ts:429-449`, `:731-764`) and is asserted by the
retained `*-wrong-tenant` probes; single use, expiry, replay, and public-issuance throttling stay
asserted; and the five protected-state keys remain checked on every probe. Token-to-owner binding
means a consumed artifact cannot affect a wrong account, which is the property the removed probes
intended to test.

**AR-10 / AR-12:** Confirmed. R5.7 gains the bearer-flow clarification and the slug/bookkeeping are
as recommended.

**AR-14:** The second `ST-46` is declarative (`evidenceStatus: 'specification-only'`): the
`invitation` and `password-reset` slice profiles and the `human-auth-st46-delivered-artifacts`
claim. The correction mirrors the executable-case change: drop invocation-only
`request-throttling-bypass`, `request-limit-exhausted:public-throttled-rejection`, and
`delivery-after-throttle` from the invitation profile, drop `wrong-recipient-use` from the
password-reset and invitation profiles, and restate the claim invariant/negative outcomes in the
bearer-flow terms of the clarified R5.7. The immutable `human-auth-slice-profiles.spec.test.ts`
requirement that every delivered-artifact profile declare `/public-throttled-rejection/` is
narrowed to the public-issuance profiles (magic-link, password-reset, email-otp). No product change.

**AR-15:** PF-002: the plan consumes and clarifies RD-05 but must not re-point its existing
product-remediation roadmap link; only the new DEF-26 row advances. PF-003: task 3.1.3 adds a
cross-reference in the def-8 register. PF-004: the documentation-only R5.7 change keeps the manual
re-read verification. PF-005: all plan documents (including the preflight report) and the RD-05,
slice-profile, and roadmap edits are committed before the harness task 3.1.1.
