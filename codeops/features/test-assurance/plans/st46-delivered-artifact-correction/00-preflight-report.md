# Preflight Report: ST-46 Delivered-Artifact Requirement Correction

> **Status**: ✅ PREFLIGHT PASSED — all 5 findings resolved (iteration 2)
> **Iteration**: 2 (re-scan after accepted fixes)
> **Artifact**: Implementation plan at `codeops/features/test-assurance/plans/st46-delivered-artifact-correction/` (8 docs)
> **Artifact Hash**: `904e580fe803` (content hash of the revised plan, uncommitted)
> **Codebase Grounded**: ~14 source files examined, 20+ references verified
> **Last Updated**: 2026-09-24 23:43

> **⚠️ SAME-SESSION REVIEW:** This plan was created in the current session. Same-agent bias risk
> is elevated. Consider a fresh-session audit or a human security-domain review before execution.

### Codebase Context Summary

**Tech Stack:** TypeScript ESM, Node 22, `node:test`; Porta server (Koa, `oidc-provider`) plus a
black-box `test-harness/assurance` suite.
**Architecture:** A declarative requirement catalog (slice profiles + claim bindings) feeds an
executable case catalog (`human-auth-recovery-case-requirements.ts`) exposed through an adapter
seam and compared by an immutable live spec; the production-security harness runs the spec against
a live stack.
**Key Files Examined:** `human-auth-recovery-case-requirements.ts`,
`human-auth-recovery-live-adapter.ts`, `human-auth-recovery.spec.test.ts`,
`human-auth-recovery-observations.impl.test.ts`, `human-auth-case-requirements.ts`,
`human-auth-slice-profile-requirements.ts`, `human-auth-slice-profiles.spec.test.ts`,
`password-reset.ts`, `invitation.ts`, `token-repository.ts`, `users.ts`,
`admin-rate-limiter.ts` (+ its unit test), `run-command.ts`.

**Reference Verification:** 22 references mapped — 21 verified, 1 unverifiable (ST-10/ST-11 are
def-8 plan-local case ids, not harness sentinels — confirmed).

### Summary by Dimension

| # | Dimension | Findings | Highest Severity |
| --- | --- | --- | --- |
| 1 | Ambiguities | 0 | — |
| 2 | Implicit Assumptions | 0 | — |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 1 | 🟠 |
| 5 | Dependency Issues | 1 | 🟡 |
| 6 | Feasibility Concerns | 0 | — |
| 7 | Testability | 1 | 🟡 |
| 8 | Security Blind Spots | 0 | — |
| 9 | Edge Cases | 0 | — |
| 10 | Scope Creep | 0 | — |
| 11 | Ordering & Sequencing | 1 | 🟡 |
| 12 | Consistency | 1 | 🟡 |
| 13 | Codebase Alignment | 2 | 🟠 |

### Summary by Severity

| Severity | Count | Status |
| --- | --- | --- |
| CRITICAL | 0 | — |
| MAJOR | 1 | resolved |
| MINOR | 4 | resolved |
| OBSERVATION | 0 | — |

---

### PF-001: A second, immutable ST-46 requirement surface still asserts invitation throttling and reset/invitation wrong-recipient 🟠 MAJOR

**Dimension:** 4 Completeness Gaps, 13 Codebase Alignment, 12 Consistency
**Location:** `03-01-st46-catalogue-correction.md` (scope), `03-02-rd05-clarification.md`, `01-requirements.md` in-scope table
**Codebase Evidence:**
- `test-harness/assurance/tests/human-auth-slice-profile-requirements.ts:610` defines a second
  `sentinelId: 'ST-46'` — the claim `human-auth-st46-delivered-artifacts` (`:604-623`) and the
  declarative `invitation` slice profile (`:~360-390`).
- The invitation profile lists abuse case `request-throttling-bypass`, exact rejection
  `request-limit-exhausted:public-throttled-rejection`, prohibited side effect
  `delivery-after-throttle`, and abuse case `wrong-recipient-use`; the password-reset profile also
  lists `wrong-recipient-use`.
- `test-harness/assurance/tests/human-auth-slice-profiles.spec.test.ts:~180-194` **requires** each
  of `['magic-link','password-reset','invitation','email-otp']` to declare
  `/public-throttled-rejection/` in `exactRejections` and `/intended-recipient-and-tenant/` in
  `allowedOutcomes` — an immutable assertion.
- The claim invariant (`:604-623`) still states "bound to its intended recipient" with negative
  outcome "wrong recipient or tenant is rejected without state change".

**The Problem:** The plan claims to "correct the ST-46 delivered-artifact assurance specification",
but ST-46 exists in two places. It corrects the executable case catalog and clarifies RD-05 while
leaving the declarative claim/profile catalog — which is pinned by its own immutable spec test —
asserting exactly the behavior the correction removes (invitation public-throttled-rejection and
reset/invitation wrong-recipient rejection). After the correction the requirement surface
contradicts itself: the clarified R5.7 says invitation throttling is administrative, while the
slice-profile catalog (and its immutable test) still demand a public throttled rejection. It does
not break the build (that catalog is declarative, `evidenceStatus: 'specification-only'`), but the
correction is incomplete and `yarn test:structure`/harness will not reveal it.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Extend the plan to also correct the slice-profile catalog: remove `request-throttling-bypass` + `request-limit-exhausted:public-throttled-rejection` + `delivery-after-throttle` from the invitation profile, adjust `wrong-recipient-use` for reset/invitation, align the ST-46 claim invariant/negative outcomes, and update `human-auth-slice-profiles.spec.test.ts` accordingly | Requirement surface becomes consistent; correction is complete | Touches a second immutable spec test; more tasks |
| B | Keep the declarative catalog as an intentionally broader threat model and record in the plan and RD-05 why the executable case is narrower (specification-only vs executable) | Smallest change; no second spec edit | Catalog and its immutable test still contradict the clarified R5.7; future re-litigation |
| C | Defer the catalog alignment as a named follow-up | Bounded now | Repo carries a contradictory, test-pinned requirement until then |

**Recommendation:** Option A — the clarified R5.7 governs the requirement model; leaving a
test-pinned catalog that asserts the removed control defeats the plan's stated purpose. The extra
edit is bounded to one catalog and one spec test.
**Confidence:** Med (no independent challenger available — see Hardening note). **Hardening:**
Independent challenge not performed; the `design-challenger`/`preflight-auditor` agents are
manual-only in this session.

**User Decision:** Resolved — User chose **Option A**: the plan now corrects the declarative slice-profile catalog and its spec test (tasks 2.2.1–2.2.3, doc 03-03, AR-14).

---

### PF-002: `Implements: RD-05` may re-point RD-05's existing roadmap row 🟡 MINOR

**Dimension:** 5 Dependency Issues, 11 Ordering & Sequencing, 12 Consistency
**Location:** `00-index.md` "Implements" line; `99-execution-plan.md` 3.1.3
**Codebase Evidence:** `codeops/features/test-assurance/00-roadmap.md:27` links RD-05 to
`plans/product-remediation/00-index.md` and is `Executing`; the make-plan roadmap-sync rule sets
the implemented RD's row to `Plan Created` with the new plan link.
**The Problem:** The plan declares `Implements: test-assurance/RD-05`, but it corrects a clause
rather than implementing the RD. Blind roadmap sync would overwrite RD-05's product-remediation
plan link. AR-12 instead added a dedicated `DEF-26` row, so the two mechanisms conflict.
**Recommendation:** In 3.1.3, advance only the new `DEF-26` row; do not re-point RD-05. Optionally
note in `00-index.md` that RD-05 is consumed and clarified, not re-planned.
**User Decision:** Resolved — User accepted recommendation: advance only the DEF-26 row and treat RD-05 as consumed/clarified (task 3.1.3).

---

### PF-003: def-8 findings remain recorded as open with no cross-reference 🟡 MINOR

**Dimension:** 12 Consistency, 13 Codebase Alignment (stale assumptions)
**Location:** `01-requirements.md` acceptance 7; `99-execution-plan.md` 3.1.3
**Codebase Evidence:** `def-8-sequential-use-evidence/00-ambiguity-register.md:61-65` still records
AR-29/AR-30 as accepted truthful gaps and "the harness run may report ST-46 as failed".
**The Problem:** After correction a reader of def-8 sees stale guidance with no pointer to the plan
that resolves it.
**Recommendation:** Add a one-line cross-reference to the def-8 register (AR-29/AR-30 now corrected
by `st46-delivered-artifact-correction`) as part of task 3.1.3.
**User Decision:** Resolved — User accepted recommendation: task 3.1.3 adds the def-8 register cross-reference.

---

### PF-004: RD-05 wording change has no automated assertion 🟡 MINOR

**Dimension:** 7 Testability
**Location:** `07-testing-strategy.md` ST-8; `99-execution-plan.md` 2.1.1
**Codebase Evidence:** `yarn test:structure` validates structure, not the text of
`RD-05-security-risk-slice-assurance.md`.
**The Problem:** ST-8 ("R5.7 contains the clarification, preserves R5.14 and the magic-link
clause") is verified only by manual re-read.
**Recommendation:** Accept the manual check (documentation-only component), or add a tiny structure
assertion that the R5.7 section contains the two clarifying sentences and the R5.14 clause.
**User Decision:** Resolved — User accepted recommendation: the documentation-only R5.7 change keeps the manual re-read check.

---

### PF-005: Harness clean-tree requirement vs uncommitted plan artifacts 🟡 MINOR

**Dimension:** 11 Ordering & Sequencing
**Location:** `99-execution-plan.md` 3.1.1
**Codebase Evidence:** AGENTS.md states the harness "requires a clean committed revision"; the plan
folder, this report, and the RD-05/roadmap edits are new/modified files.
**The Problem:** If those documents are still untracked/uncommitted at 3.1.1, the harness preflight
could refuse to run.
**Recommendation:** Ensure all plan documents (including this report) and the RD-05/roadmap edits
are committed before 3.1.1; add a note to 3.1.1.
**User Decision:** Resolved — User accepted recommendation: task 3.1.1 commits all plan documents and edits before the harness run.

---

## Iteration 2 — verification of accepted fixes

Re-scanned the changed plan sections and their code consequences:

| Finding | Fix applied | Verified |
| --- | --- | --- |
| PF-001 | New `03-03`, tasks 2.2.1–2.2.3, AR-14, acceptance 8, ST-9–ST-11 | `human-auth-slice-profile-requirements.ts:610` claim and invitation/password-reset profiles are the only edits; `human-auth-slice-profiles.spec.test.ts` is the only impacted spec; removing `wrong-recipient-use`/`delivery-after-throttle` keeps `abuseCases`/`prohibitedSideEffects` non-empty; `traceability.json`, `traceability-nodes.json`, and the program docs reference none of the removed strings (verified by search) |
| PF-002 | 3.1.3 advances only DEF-26 | RD-05 row in `00-roadmap.md:27` is not re-pointed |
| PF-003 | 3.1.3 adds the def-8 cross-reference | — |
| PF-004 | Accepted manual check | `yarn test:structure` does not assert R5.7 text |
| PF-005 | 3.1.1 commit-before-harness note | — |

No new 🔴/🟠 findings. Remaining minors are all resolved or explicitly accepted.
