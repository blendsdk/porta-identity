# Execution Plan: ST-46 Delivered-Artifact Requirement Correction

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-25 01:30
> **Progress**: 17/17 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Correct the ST-46 delivered-artifact catalogue, live adapter, immutable live spec, and the owning
RD-05 R5.7 requirement, then re-run the production-security harness to prove ST-46 truthfully. No
product change.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| ----- | ----- | ----- |
| 1 | Catalogue and live-spec correction | 8 |
| 2 | Requirement clarification (RD-05 and the slice-profile catalog) | 6 |
| 3 | Live production-security verification | 3 |

**Total: 17 tasks across 3 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth for progress. Mark `[~]` on
> implementation, promote to `[x]` on verify pass, update the Progress header after every task, and
> resume from the first `[~]` else the first `[ ]`. Timestamps come from `date '+%Y-%m-%d %H:%M'`.

---

## Phase 1: Catalogue and live-spec correction

> **Phase baseline tree**: 50f216ef325d412742a9763e26f10493c1c9ef02
> **Scope**: strict
> **Expected modification set**: `test-harness/assurance/tests/human-auth-recovery-case-requirements.ts`, `human-auth-recovery-live-adapter.ts`, `human-auth-recovery.spec.test.ts`, `human-auth-recovery-observations.impl.test.ts`, and this plan's `99-execution-plan.md`
> **Lenses**: web application; distributed & concurrent (single-use / atomic consume, replay)

### Step 1.1: Specification tests

**Reference**: [03-01](03-01-st46-catalogue-correction.md) · AR-2, AR-3, AR-4, AR-7, AR-9
**Objective**: Update the immutable live spec's frozen shape to the corrected 12-probe model and confirm the red phase.

- [x] 1.1.1 [spec-author] Update the frozen shape in `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` to `probes.length === 12` and add the ST-1/ST-2/ST-3 structural assertions (retained ids and expected facts) ✅ (completed: 2026-09-24 23:45; written inline — spec-test-author agent is manual-only)
- [x] 1.1.2 Run `yarn assurance:test --select human-auth-recovery-specs` and verify it FAILS against the current 15-probe catalogue (red phase); record the failure ✅ (completed: 2026-09-24 23:45; EXIT=21, 2 spec tests fail: 15 !== 12 and probe-set mismatch)

### Step 1.2: Implementation

**Reference**: [03-01](03-01-st46-catalogue-correction.md)
**Objective**: Make the catalogue capability-gated and remove the three probes from the adapter.

- [x] 1.2.1 Gate the probe set in `test-harness/assurance/tests/human-auth-recovery-case-requirements.ts` on `recipientAuthority` and `publicIssuanceThrottle` per kind ✅ (completed: 2026-09-24 23:46) ✅ (completed: 2026-09-24 23:46)
- [x] 1.2.2 Remove the three probe steps from `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts`, keep the `second` issuance used by the delivery controls, delete `observeInvitationThrottle` and any now-unused helper, and rename the misnamed local ✅ (completed: 2026-09-24 23:46) ✅ (completed: 2026-09-24 23:46)
- [x] 1.2.3 Run `yarn assurance:test --select human-auth-recovery-specs` and verify it PASSES (green phase) ✅ (completed: 2026-09-24 23:46)

### Step 1.3: Implementation tests and hardening

**Reference**: [03-01](03-01-st46-catalogue-correction.md) · AR-8
**Objective**: Confirm supporting tests and remove dead code.

- [x] 1.3.1 Verify `test-harness/assurance/tests/human-auth-recovery-observations.impl.test.ts` pins no count; adjust only if it does; run it ✅ (completed: 2026-09-24 23:48)
- [x] 1.3.2 Search the harness for the three removed ids and the number 15; remove every remaining reference and confirm no dead helper remains ✅ (completed: 2026-09-24 23:48)
- [x] 1.3.3 Run `yarn assurance:test --select human-auth-live` and `yarn test:structure` ✅ (completed: 2026-09-24 23:48)

**Deliverables**:
- ST-46 declares 6 controls and 12 probes
- Adapter emits exactly the 12 probes with no dead code
- `yarn test:structure` passing

**Verify**: `yarn test:structure`

---

## Phase 2: Owning requirement clarification

> **Phase baseline tree**: bfb8011036342ba31efdb263dfb0e28b489f3d78
> **Scope**: strict
> **Expected modification set**: `codeops/features/test-assurance/requirements/RD-05-security-risk-slice-assurance.md`, `requirements/00-ambiguity-register.md`, `test-harness/assurance/tests/human-auth-slice-profile-requirements.ts`, `human-auth-slice-profiles.spec.test.ts`, `human-auth-boundaries.spec.test.ts`, and this plan's `99-execution-plan.md`
> **Mechanical correction**: the executable catalogue change also required updating the boundary specification (`human-auth-boundaries.spec.test.ts`) probe-existence loop, which the plan did not name — same capability-aware principle, no scope change

### Step 2.1: RD-05 R5.7

**Reference**: [03-02](03-02-rd05-clarification.md) · AR-5, AR-10
**Objective**: Make the bearer-flow model explicit in the owning requirement.

- [x] 2.1.1 Append the two clarifying sentences to R5.7 in `codeops/features/test-assurance/requirements/RD-05-security-risk-slice-assurance.md`, leaving the rest verbatim ✅ (completed: 2026-09-24 23:51)
- [x] 2.1.2 Add the clarification row to `codeops/features/test-assurance/requirements/00-ambiguity-register.md` referencing this plan's AR-5/AR-10 ✅ (completed: 2026-09-24 23:51)
- [x] 2.1.3 Confirm the `test-assurance-program` traceability/testing notes pin no removed id or the number 15; update only if needed ✅ (completed: 2026-09-24 23:51)

**Deliverables**:
- R5.7 states the bearer-flow model; R5.14 and all retained detail intact

**Verify**: `yarn test:structure`

---

### Step 2.2: Slice-profile catalog

**Reference**: [03-03](03-03-slice-profile-catalog-correction.md) · AR-14
**Objective**: Align the declarative second ST-46 with the clarified R5.7.

- [x] 2.2.1 [spec-author] Narrow the `/public-throttled-rejection/` assertion in `test-harness/assurance/tests/human-auth-slice-profiles.spec.test.ts` to the public-issuance profiles and assert invitation does not declare it; run it and verify it FAILS against the current catalog (red phase) ✅ (completed: 2026-09-24 23:51)
- [x] 2.2.2 Correct the `invitation` and `password-reset` profiles and the ST-46 claim in `test-harness/assurance/tests/human-auth-slice-profile-requirements.ts`; run `human-auth-slice-profiles.spec.test.ts` and verify it PASSES (green phase) ✅ (completed: 2026-09-24 23:51; also corrected the boundary spec probe-existence loop)
- [x] 2.2.3 Check `traceability.json`, `traceability-nodes.json`, and the program traceability/testing notes for the removed strings; update if referenced; run `yarn test:structure` ✅ (completed: 2026-09-24 23:51)

**Deliverables**:
- The declarative catalog matches the clarified R5.7; its immutable spec test passes

**Verify**: `yarn test:structure`

---

## Phase 3: Live production-security verification

### Step 3.1: Harness and closure

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) · AR-6, AR-11, AR-12
**Objective**: Prove ST-46 truthfully under the production-security harness and close the findings.

- [x] 3.1.1 Ensure all plan documents (including the preflight report) and the RD-05, slice-profile, and roadmap edits are committed, then start a fresh harness stack and run `yarn assurance:harness --project security --profile production-security`; record the run id, the ST-46 pass, and the exit code ✅ (completed: 2026-09-25 01:13; run `14c4cf25-df3c-464f-8400-fe78241bd295` exit 0 — production-exposure 11/0/0/0, functional 7/0, second-factor 4/0, tenant-admin 17/0, recovery 5/0 with ST-46 passing. An intervening run failed the unrelated flaky `st55-production-session-cookie-policy` and passed on rerun)
- [x] 3.1.2 Run `yarn verify` and record the counts ✅ (completed: 2026-09-25 01:30; structure 126, sdk 560, cli 1430, server 3689/479/133/268)
- [x] 3.1.3 Update `codeops/features/test-assurance/00-remaining-work.md` and `00-roadmap.md`: mark AR-29/AR-30 closed with the new plan, advance only the DEF-26 row (do not re-point RD-05), and add a cross-reference in the def-8 register that AR-29/AR-30 are corrected by this plan ✅ (completed: 2026-09-25 01:30)

**Deliverables**:
- ST-46 passes in the production-security harness with no truthful failure
- `yarn verify` passing
- Backlog and roadmap updated

**Verify**: `yarn verify`

---

## Dependencies

```
Phase 1 (catalogue/spec)
    ↓
Phase 2 (RD-05 wording)
    ↓
Phase 3 (live harness + closure)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ ST-46 passes in the production-security harness with no truthful failure
3. ✅ `yarn verify` and `yarn test:structure` pass
4. ✅ No dead code
5. ✅ No product source change; no pentest or existing security assertion weakened (R5.14, R5.13)
6. ✅ RD-05 R5.7 clarifies the bearer-flow model and the backlog/roadmap record AR-29/AR-30 closed
7. ✅ The declarative slice-profile catalog and its spec test match the clarified R5.7 (AR-14); RD-05's roadmap row is not re-pointed (PF-002)
8. ✅ Post-completion project re-analysis (handled by the exec-plan skill)
