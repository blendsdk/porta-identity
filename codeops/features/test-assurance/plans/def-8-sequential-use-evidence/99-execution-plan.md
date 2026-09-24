# Execution Plan: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-24 13:25
> **Progress**: 2/14 tasks (14%)
> **CodeOps Artifact Schema**: 1

## Overview

Deliver live ST-46 evidence: the product invitation rejection audit fix, the live adapter and its
observation helpers, the immutable live spec and harness wiring with bounded TTL control, and one
owned production-security harness run. Specification tests precede implementation in every phase.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                | Tasks |
| ----- | ------------------------------------ | ----- |
| 1     | Product invitation rejection audit   | 4     |
| 2     | Live adapter and observation helpers | 4     |
| 3     | Live spec and harness wiring         | 4     |
| 4     | Live evidence and closure            | 2     |

**Total: 14 tasks across 4 phases**

> **⚠️ EXECUTION RULE:** the phase checkboxes below are the single source of truth. Mark `[~]` on
> implementation, `[x]` on verify pass, update the Progress header after every task, and append
> `Blocked: <reason>` on failure.

---

## Phase 1: Product Invitation Rejection Audit

> **Lenses**: security
> **Reference**: [03-02](03-02-invitation-rejection-audit.md) · AR #6, AR-9

### Step 1.1: Specification tests (RED)

- [x] 1.1.1 [spec-author] Add rejection-audit cases (ST-18, ST-19) to `packages/server/tests/unit/routes/invitation.test.ts`
- [x] 1.1.2 Run the suite and confirm the new cases FAIL (RED)

### Step 1.2: Implementation

- [ ] 1.2.1 Add the `user.invite.failed` audit event on the invalid/used/expired path — `packages/server/src/routes/invitation.ts`
- [ ] 1.2.2 Add the integration coverage (ST-18) — `packages/server/tests/integration/services/invitation-enhanced.test.ts`

### Step 1.3: Impl tests and verify

- [ ] 1.3.1 Confirm the invitation suites pass and no existing assertion changed

**Verify**: `yarn workspace @portaidentity/server verify`

---

## Phase 2: Live Adapter and Observation Helpers

> **Lenses**: security
> **Reference**: [03-01](03-01-live-adapter.md) · AR #2, AR #3, AR #5, AR #10–AR #21, AR #24, AR #25

### Step 2.1: Tests first (RED)

- [ ] 2.1.1 [spec-author] Write helper impl tests (ST-1, ST-2, ST-14, ST-16) — `test-harness/assurance/tests/human-auth-recovery-observations.impl.test.ts`
- [ ] 2.1.2 Run the impl test file directly and confirm RED

### Step 2.2: Implementation

- [ ] 2.2.1 Add the observation/classification helpers — `test-harness/assurance/tests/human-auth-recovery-observations.ts`
- [ ] 2.2.2 Add the live ST-46 adapter — `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts`
- [ ] 2.2.3 Dispatch live mode to the adapter — `test-harness/assurance/tests/human-auth-cases-adapter.ts`

### Step 2.3: Verify

- [ ] 2.3.1 Register the impl test in the `human-auth-live` selector and confirm it stays service-free — `test-harness/assurance/scripts/run-command.ts`

**Verify**: `yarn assurance:test --select human-auth-live`

---

## Phase 3: Live Spec and Harness Wiring

> **Lenses**: security
> **Reference**: [03-01](03-01-live-adapter.md), [03-03](03-03-harness-wiring.md) · AR #4, AR #7, AR #20, AR #22

### Step 3.1: Specification test (skips unless live)

- [ ] 3.1.1 [spec-author] Write the immutable live spec (ST-3..ST-15, ST-17) — `test-harness/assurance/tests/human-auth-recovery.spec.test.ts`
- [ ] 3.1.2 Confirm the suite SKIPS without the adapter env

### Step 3.2: Wiring and TTL control

- [ ] 3.2.1 Register `humanAuthRecoverySpecificationFiles`, the `human-auth-recovery-specs` selector, and the aggregate entry — `test-harness/assurance/scripts/run-command.ts`
- [ ] 3.2.2 Add the production-security recovery block (reset + live env + fail-fast) — `test-harness/assurance/scripts/run-command.ts`
- [ ] 3.2.3 Implement the bounded TTL control (set minimums, single wait, restore in `finally`) — `human-auth-recovery-live-adapter.ts`

### Step 3.3: Verify

- [ ] 3.3.1 Confirm the selectors and structure contracts pass

**Verify**: `yarn test:structure`

---

## Phase 4: Live Evidence and Closure

> **Lenses**: security
> **Reference**: [03-03](03-03-harness-wiring.md) · AR #27, AR #28

### Step 4.1: Live run

- [ ] 4.1.1 Run `yarn assurance:harness --project security --profile production-security` and record the result artifact id and pass counts (if ST-46 fails, report truthfully — do not weaken the assertion)

### Step 4.2: Closure

- [ ] 4.2.1 Mark DEF-8 resolved in `codeops/features/test-assurance/00-remaining-work.md` and set the roadmap row to Done
- [ ] 4.2.2 Run the full verification

**Verify**: `yarn verify`

---

## Dependencies

```
Phase 1 (product audit)
    ↓
Phase 2 (adapter + helpers)
    ↓
Phase 3 (live spec + wiring)
    ↓
Phase 4 (live evidence + closure)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `human-auth-recovery-specs` and `human-auth-live` pass; `human-auth-live` stays service-free
3. ✅ One owned production-security harness run passes ST-46 and its artifact is recorded
4. ✅ `yarn verify` and `yarn test:structure` pass
5. ✅ The invitation rejection audit event exists with product test coverage
6. ✅ No existing pentest assertion is deleted, skipped, relaxed, or replaced
7. ✅ DEF-8 is marked resolved in the backlog and roadmap
