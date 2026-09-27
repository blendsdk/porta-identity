# Preflight Report: Task T-02 mini-plan

> **Status**: ✅ PREFLIGHT PASSED — all 3 findings resolved
> **Iteration**: 2 (bounded re-check after fixes)
> **Artifact**: Implementation plan (lightweight task mini-plan) at
> `codeops/features/_maintenance/plans/signing-key-crypto-flake/99-execution-plan.md`
> **Artifact hash (sha256)**: `a841cc23e5a557cfa11a6e7598963995313ba8a35bc555fcc66dc02c4db99b69`
> **Codebase Grounded**: 4 source/test files examined, 8 artifact references verified
> **Last Updated**: 2026-09-27 23:05

> SAME-SESSION REVIEW: This artifact was created in the current session. Same-agent bias risk is
> elevated. No CRITICAL/MAJOR findings exist, so no independent challenger was required.

### Audit scope

| Term                  | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Audit target          | The mini-plan file named above                                          |
| Context documents     | `AGENTS.md`, `codeops/codeops.json`, the `_maintenance` roadmap         |
| Modification set      | The mini-plan file only (fixes require explicit user instruction)       |
| Product-scope mode    | Strict (no `--explore-scope`)                                           |
| Domain lenses applied | Web application (auth-adjacent test only); no data/migration lens       |

### Codebase Context Summary

**Reference verification:** 8/8 verified against `ced43f61`.

| Claim                                                        | Verified evidence                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Flaky construction at test line 118                          | `signing-key-crypto.test.ts:118` — `tag.slice(0, -2) + 'ff'`                    |
| Tag is 32 hex chars / 16 bytes                               | `signing-key-crypto.ts:23` (`TAG_LENGTH = 16`), `:75` (`tag.toString('hex')`)   |
| Ciphertext test guarantees a different value                 | `signing-key-crypto.test.ts:107-110` — `(original + 1) % 16`                    |
| Safe tamper precedent                                        | `auth/csrf.test.ts:75` — `endsWith('A') ? 'B' : 'A'`                            |
| No second occurrence of the same pattern                     | Repository-wide search of `packages/*/tests` — only line 118                     |
| Flake probability 1/256                                      | Tag's final byte equals `0xff` with probability 1/256; construction is then a no-op |
| CI failure exists and later runs passed                      | Run 36347788339 failed; subsequent branch runs succeeded                        |

### Summary by Dimension

| #   | Dimension              | Findings | Highest Severity |
| --- | ---------------------- | -------- | ---------------- |
| 1   | Ambiguities            | 1        | 🟡               |
| 2   | Implicit Assumptions   | 0        | —                |
| 3   | Logical Contradictions | 0        | —                |
| 4   | Completeness Gaps      | 1        | 🟡               |
| 5   | Dependency Issues      | 0        | —                |
| 6   | Feasibility Concerns   | 0        | —                |
| 7   | Testability            | 0        | —                |
| 8   | Security Blind Spots   | 0        | —                |
| 9   | Edge Cases             | 0        | —                |
| 10  | Scope Creep Indicators | 0        | —                |
| 11  | Ordering & Sequencing  | 0        | —                |
| 12  | Consistency            | 1        | 🔵               |
| 13  | Codebase Alignment     | 0        | —                |

### Summary by Severity

| Severity    | Count | Status    |
| ----------- | ----- | --------- |
| CRITICAL    | 0     | —         |
| MAJOR       | 0     | —         |
| MINOR       | 2     | ✅ resolved |
| OBSERVATION | 1     | ✅ resolved |

---

### PF-001: The 100× stability loop has no exact command 🟡 MINOR

**Dimension:** 1 (Ambiguities)
**Location:** T-02.3
**The Problem:** "Run the file once, then 100 times in a loop; record the pass count" leaves the
command, working directory, and failure behavior to the executor, so evidence could vary between
runs.

**Options:**

| Option | Description                                                                                          | Pros                                   | Cons             |
| ------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------- |
| A      | Pin the command and failure rule, e.g. `for i in $(seq 1 100); do yarn workspace @portaidentity/server test:unit tests/unit/lib/signing-key-crypto.test.ts; done` — any nonzero exit aborts and is reported | Reproducible, auditable evidence       | Slightly longer task text |
| B      | Keep as-is                                                                                           | Shorter                                | Evidence varies  |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (pin the exact 100× loop command and failure rule).

---

### PF-002: The delivery task does not name the branch or artifact packaging 🟡 MINOR

**Dimension:** 4 (Completeness Gaps), 12 (Consistency)
**Location:** T-02.5
**Context:** The T-01 plan carried a delivery header naming the branch and packaging; T-02 says
only "commit, push, open a pull request to `develop`". The artifacts already live on
`fix/signing-key-crypto-flake`, created from updated `develop` (`ced43f61`).

**The Problem:** The executor must infer the branch and whether the CodeOps plan/roadmap artifacts
ride with the fix commit or a separate commit.

**Options:**

| Option | Description                                                                                                        | Pros                                | Cons     |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | -------- |
| A      | Pin `branch fix/signing-key-crypto-flake` and state that the plan/roadmap artifacts are committed with the fix (or as one preceding `docs(codeops)` commit) | Unambiguous delivery, matches T-01   | One edit |
| B      | Keep as-is                                                                                                         | No edit                              | Ambiguity |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (pin branch fix/signing-key-crypto-flake and artifact packaging).

---

### PF-003: The replacement snippet is described but not pinned 🔵 OBSERVATION

**Dimension:** 12 (Consistency)
**Location:** T-02.2
**The Problem:** The task specifies "last hex digit, replace with `(digit + 1) % 16`" but does not
show the four resulting lines, so wording and the existing ciphertext-test style could drift.

**Options:**

| Option | Description                                                                                | Pros                              | Cons      |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------- | --------- |
| A      | Include the exact snippet (mirroring `signing-key-crypto.test.ts:106-110`) in T-02.2        | Removes interpretation entirely   | Slight text growth |
| B      | Keep the prose description                                                                  | Shorter                           | Minor drift risk |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (pin the replacement snippet).

---

### Context note (not a finding)

No production-code change is proposed, so the task introduces no runtime, security, or migration
surface; `AGENTS.md` security invariants are unaffected. The 100-run loop is feasible (each
targeted run is a single Vitest project launch).

---

### Iteration 2 — bounded re-check (2026-09-27)

| Finding | Fix applied                                                                 | Verified |
| ------- | --------------------------------------------------------------------------- | -------- |
| PF-001  | T-02.3 pins the exact 100× loop command and abort-on-nonzero rule            | ✅       |
| PF-002  | T-02.5 names branch `fix/signing-key-crypto-flake` and the two-commit packaging | ✅    |
| PF-003  | T-02.2 links the pinned `Replacement snippet for T-02.2` code block          | ✅       |

The corrected plan still references `signing-key-crypto.test.ts:118` (unchanged in `ced43f61`),
and the snippet mirrors the existing ciphertext-tamper style at `:107-110`. No new ambiguity or
reference failure. **Pass valid at hash `a841cc23…`.**
