# Current State: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The `def-8-sequential-use-evidence` plan delivered a live ST-46 adapter that observes the
delivered-artifact journeys through public HTTP, MailHog, and the admin APIs. The ST-46 catalogue
declares 6 positive controls and 15 negative probes (5 per artifact kind), and the immutable live
specification compares the adapter's observations against the catalogue's exact expected facts. The
product was independently hardened during DEF-8: invitation rejection now writes
`user.invite.failed`, and the invitation-token lookup is organization-scoped.

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `test-harness/assurance/tests/human-auth-recovery-case-requirements.ts` | ST-46 catalogue | Remove 3 probes; make the probe set per-kind |
| `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts` | Live adapter | Remove 3 steps and dead code; rename one local |
| `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` | Immutable live spec | Frozen probe count 15 → 12 |
| `test-harness/assurance/tests/human-auth-recovery-observations.impl.test.ts` | Observation helpers/tests | Verify no count is pinned; adjust if it is |
| `test-harness/assurance/tests/human-auth-slice-profile-requirements.ts` | Declarative slice-profile catalog (second ST-46) | Correct the invitation/password-reset profiles and the ST-46 claim |
| `test-harness/assurance/tests/human-auth-slice-profiles.spec.test.ts` | Immutable structural spec for the catalog | Narrow the blanket `public-throttled-rejection` assertion |
| `codeops/features/test-assurance/requirements/RD-05-security-risk-slice-assurance.md` | Owning requirement | Clarify R5.7 |
| `codeops/features/test-assurance/plans/test-assurance-program/07`,`08` | Program traceability | Add a correction note if needed |
| `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md` | Backlog and roadmap | Record closure of AR-29/AR-30 |

### Code Analysis

**Catalogue.** `deliveredArtifactSteps(kind)` builds a fixed set of five probes for every artifact
kind (`human-auth-recovery-case-requirements.ts:60-110`); ST-46 then concatenates the magic-link,
password-reset, and invitation probes. The removed probes are named by that shared builder.

**Adapter.** `captureProtected` captures five keys
(`human-auth-recovery-live-adapter.ts:517-537`): `intended-account-state` (the intended account),
`wrong-recipient-account-state` (`alpha-user-enumeration`), `wrong-tenant-state`
(`bravo-user-active`), and `membership-and-role-state` / `artifact-consumption-state` (aliased to
the intended account). Every probe asserts all five unchanged. `countDurableEffects` counts changed
keys between two durable snapshots of the intended account (`human-auth-recovery-observations.ts:59-69`),
and `classifyArtifactResponse` maps a response to `throttled`, `expired-artifact`, `accepted`,
`generic-response`, or `invalid-artifact` (`:44-50`).

## Gaps Identified

### Gap 1: `password-reset-wrong-recipient` and `invitation-wrong-recipient` are unreachable

**Current Behavior:** `runPasswordReset` issues a fresh token for `INTENDED_EMAIL` and presents it;
`runInvitation` issues a token to a random address and presents it. Neither varies a recipient
because the product resolves the account from the token alone
(`password-reset.ts:415-419`, `invitation.ts:139-140`). Both probes observe `accepted` with one
durable effect on the token's own account, while the catalogue expects `invalid-artifact` with
zero.
**Required Behavior:** The catalogue must not assert an `invalid-artifact` outcome for a flow with
no recipient authority. The security property — no effect on a wrong account — is instead proven by
the retained `*-wrong-tenant` probes and the protected-state checks.
**Fix Required:** Remove both probes (AR-2, AR-3).

### Gap 2: `invitation-throttled-request` asserts a control the route does not have

**Current Behavior:** Invitation issuance is the admin-authenticated
`POST /api/admin/organizations/:orgId/users/invite` route (`users.ts:459`). It has no dedicated
limiter and no rejection audit; the only bound is the global admin per-IP limiter
(60 writes / 60 s) which warn-logs rather than audits (`admin-rate-limiter.ts:83-109`, mounted at
`server.ts:137`). The adapter makes a small bounded set of attempts and reports `generic-response`.
**Required Behavior:** The catalogue must not require an equivalent-public-input throttle for an
admin-authenticated route. The global admin limiter is the actual control.
**Fix Required:** Remove the probe (AR-4).

### Gap 3: The frozen spec shape and RD-05 do not describe the bearer-flow model

**Current Behavior:** `human-auth-recovery.spec.test.ts:120-125` freezes `probes.length === 15`, and
RD-05 R5.7 groups reset/invitation with magic-link under "intended recipient/tenant" and
"throttling" without distinguishing recipient-authority from bearer artifacts.
**Required Behavior:** The spec must freeze 12 probes, and R5.7 must state the bearer-flow model.
**Fix Required:** Update the count (AR-7) and clarify R5.7 (AR-5, AR-10).

### Gap 4: A second, immutable ST-46 still asserts the removed controls

**Current Behavior:** Besides the executable case catalog, `human-auth-slice-profile-requirements.ts`
defines `sentinelId: 'ST-46'` again (`:610`) as a declarative claim plus the `invitation` and
`password-reset` slice profiles. The invitation profile lists `request-throttling-bypass`,
`request-limit-exhausted:public-throttled-rejection`, `delivery-after-throttle`, and
`wrong-recipient-use`; the password-reset profile lists `wrong-recipient-use`. The immutable
`human-auth-slice-profiles.spec.test.ts` requires every delivered-artifact profile to declare
`/public-throttled-rejection/`. It is declarative (`evidenceStatus: 'specification-only'`), so it
does not run against the product, but it is pinned by its own spec test.
**Required Behavior:** The declarative catalog must match the clarified R5.7: no invitation public
throttling; no reset/invitation recipient-mismatch rejection.
**Fix Required:** Correct the profiles and the ST-46 claim and narrow the spec-test assertion
(AR-14).

## Dependencies

### Internal Dependencies

- The retained probes rely on the DEF-8 product fixes: organization-scoped reset lookup
  (`token-repository.ts:429-449`) and organization-scoped invitation lookup (`:731-764`).
- The harness requires a clean committed revision and a freshly built stack (AGENTS.md).

### External Dependencies

- None. No new package, service, or infrastructure.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Removal is mistaken for weakening a security assertion | Medium | High | The plan documents R5.14 compliance and the retained evidence per AR-6; the spec wording records why the probes were unreachable |
| A stale harness stack hides the DEF-8 org-scope fix | Medium | Medium | Start a fresh stack from the harness; run against the committed corrected revision |
| A count or probe id is pinned elsewhere | Low | Low | Search the harness and program docs for the removed ids and the number 15 before finalizing |
