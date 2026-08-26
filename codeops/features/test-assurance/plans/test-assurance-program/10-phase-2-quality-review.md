# Phase 2 Quality Review: Isolated Harness Lifecycle

> **Status**: Closed — corrections and the single permitted re-review are complete
> **Phase baseline**: `57b278e9dc5b1ae50df6c0a9cdf87199a0c657a5`
> **Implementation roll-up**: `eaf43e49`
> **Correction authority**: `--auto-design`

## Finding Disposition

No finding is waived or dismissed. Overlapping reviewer and security-auditor findings are grouped
by root cause. Product source, CI workflows, deployment, publishing, and fixture ontology remain
out of scope.

| Finding | Severity | Required correction | Status |
| ------- | -------- | ------------------- | ------ |
| P2-QA-01 | Major | Make complete reset unavailable fail closed; give transitional Redis/MailHog preparation a narrower name and keep Phase 3 activation explicit | Implemented; green |
| P2-QA-02 | Major | Persist and compare actual complete Docker container/network identities, then delete only immutable recorded IDs | Implemented; green |
| P2-QA-03 | Major | Persist PID-reuse-resistant SPA/BFF process identities and clean them during stop/recovery | Implemented; green |
| P2-QA-04 | Major | Use atomic startup intent, install pre-readiness signal cleanup, and never infer clean state from missing discovery | Implemented; green |
| P2-QA-05 | Major | Serialize reset, stop, recovery, and signal cleanup under one supervisor-owned state machine | Implemented; green |
| P2-QA-06 | Major | Preserve an occupied tombstone when malformed/incomplete lease state is quarantined | Implemented; green |
| P2-QA-07 | Major | Enforce real operation/network/child deadlines, propagate abort signals, and join complete child process groups before returning | Implemented; green |
| P2-QA-08 | Major | Atomically exclude two starters in one worktree and recover stranded acquisition intent safely | Implemented; green |
| P2-QA-09 | Minor | Set the control socket to `0600` and remove absolute bind paths from recovery identifiers | Implemented; green |

## Review Boundary

The 240 lifecycle cases, retained harness journeys, concurrent-worktree smoke, signal smokes, and
full repository verification passed before review. The reviewers correctly found that most failure
cases exercised capability doubles rather than the live adapters. Green pre-review evidence is
retained as the implementation checkpoint, not treated as closure evidence.

AR-40 remains a sequencing decision only. It cannot authorize a complete-reset success result.
Until Phase 3 installs the deterministic fixture manifest and exact database oracle, the complete
reset command must fail closed and retained browser setup may invoke only an explicitly narrower
preparation action.

## Correction and Re-review Contract

Corrective specifications must fail for the named contracts before implementation. After the
accepted corrections pass focused tests and unchanged `yarn verify`, one independent re-review may
confirm closure. Any residual Critical or Major finding keeps Phase 2 open.

The corrective RED checkpoint contained five named failures: reset/stop serialization, signal/stop
serialization, aborting startup deadline, missing post-start resource discovery, and persistence of
actual Docker identities. The single permitted re-review then found residual deadline joining,
startup-intent identity, immutable cleanup, and crash-recovery consistency defects. Those residuals
were corrected without another review cycle. The implemented suite now passes 259/259 cases.

Live checks cover same-worktree starter contention with one exit-0 winner and one exit-30 loser,
malformed control input followed by a healthy valid control, SIGTERM exit 143 with joined cleanup,
forced supervisor-crash recovery, exact durable resource/process identity, fail-closed complete
reset, and all six retained browser journeys. The unchanged full repository verification passed 68
structure tests, 224 server files / 3,348 tests, 31 SDK files / 404 tests, and 29 CLI files / 355
tests; Phase 2 is closed.
