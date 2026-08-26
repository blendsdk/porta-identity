# Non-Enforcing Assurance CI Promotion Proposal

> **Date**: 2026-08-21
> **Status**: Verified proposal only — no workflow or policy change is authorized
> **Current workflow blob**: `e596521a704348b244d7597926aba3cd7bef2467`
> **Decision**: Do not promote a new assurance command yet

## Recommendation

Keep every new assurance command local and on-demand until actual registered command stages have
passed the required SIGINT/SIGTERM and cleanup campaign. The completed campaign qualifies only the
terminal reducer and isolated process-owner probe; it does not prove that every real command stage
handles interruption correctly. DEF-22 therefore blocks even non-blocking workflow adoption today.

This document is the concrete input for a later, separately authorized workflow-policy task. It
does not edit `.github/workflows/build-and-test.yml`, schedule work, target pull requests, alter a
release or merge gate, or grant promotion authority.

## Evidence Available to a Future Decision

| Evidence | Result | Promotion meaning |
| --- | --- | --- |
| Clean local aggregate | Revision `460eb1aa`, run `74ab9ba2-ba86-469f-92ae-44c1fd192a63`; all 16 invocations completed; 14 assured, 3 blocked, 2 incomplete, 0 survived, 4 unqualified | Proves the registered local composition and cleanup, not CI suitability |
| Governed coverage ratchet | Report `5cd74d53-964e-4966-b5cb-d6531a097f4c`, coverage `9d7e9351-552f-4d32-8414-5172d7b81506`; accepted, non-promoting | Suitable for local no-regression reporting only |
| Protocol-candidate stability | 100 consecutive completed attempts per candidate; p50/p95: test 274/652 ms, harness 1,022/1,246 ms, coverage 474/533 ms, fault 385/430 ms, compatibility 364/400 ms | Qualifies the bounded protocol probes only, not the real aliases or Docker journeys |
| Command outcome campaign | Terminal reducer and isolated signal probe passed | Actual alias/stage interruption remains unqualified under DEF-22 |
| UI and penetration baseline | UI 129/134 with the exact five recorded consent-contract failures; pentest 35 files / 224 cases passed | Preserves known product truth; does not authorize a new gate |

## Candidate Command Inventory

These are candidates for a future policy decision, not approved workflow steps.

| Candidate | Exact command | Contract timeout | Ownership and recovery | Proposed retained output | Current disposition |
| --- | --- | ---: | --- | --- | --- |
| Definition validation | `yarn assurance:validate` | 120 s | No services; writes one owner-only validation run | Sanitized manifest/result, mode 0600, 7 days | Hold for DEF-22 |
| Internal assurance | `yarn assurance:test --select assurance-all-internal-v1` | 120 s | Node/tsx process group only; common signal cleanup | Bounded TAP summary, 7 days | Hold for DEF-22 |
| Protocol harness | `yarn assurance:harness --project protocol --profile operational` | 1,800 s | Owns leased endpoints, Compose project, Porta, clients, networks, and ports; cleanup or exact recovery command required | Sanitized harness result only, 7 days | Hold for real-stage signal qualification |
| Security harness | `yarn assurance:harness --project security --profile production-security` | 1,800 s | Same lifecycle ownership; serial fixture reset and exact recovery | Sanitized result only; no traces, credentials, or delivered artifacts | Not eligible while two observations remain incomplete |
| Coverage observation | `yarn assurance:coverage --project security --profile production-security --seed coverage-baseline` | 2,400 s | Owns capture stack and graceful server flush; incomplete flush fails | Summary, capture manifest, ratchet decision; exclude raw V8 files | Hold for DEF-22 and CI runtime measurement |
| Packed compatibility | `yarn assurance:compat --select compatibility` | 1,800 s | Owns consumer, package cache, isolated `HOME`, clients, and stack; real credentials must remain unchanged | Sanitized compatibility result only | Hold for DEF-22 |
| Governed report | `yarn assurance:report --run <validation-run-uuid> --coverage-run <coverage-run-uuid>` | 120 s | Read-only over two exact owned runs; no service ownership | JSON/Markdown summary and ratchet decision, 14 days | Depends on validation and coverage candidates |
| Full local aggregate | `yarn assurance:all` | 7,200 s | Sequential owner across every child; stops safely and records not-run items | Aggregate JSON/Markdown only | Do not promote; contains fault work and known gaps |
| Curated faults | `yarn assurance:fault --fault full-catalog --claim catalog --sentinel all` | 3,600 s | Disposable worktree plus owned lifecycle stack; primary tree immutable | Sanitized catalog result only | Explicitly on-demand; no CI proposal |
| Mutation pilot | `yarn assurance:mutation --select bounded-pilot` | 900 s | Disposable worktree/runtime root; allowlisted targets only | Count-only result | Explicitly on-demand; no CI proposal |

## Required Future Workflow Change

A separately authorized change would add one new, non-required job rather than modify `verify`,
`ui`, or the retained SPA/BFF `harness` job. That change must:

1. preserve checkout credential isolation, Node 22, Yarn frozen-lockfile installation, and the
   existing read-only workflow behavior;
2. install Chromium only for candidates that actually require it and prove Docker availability
   before starting a resource-owning command;
3. use a run-scoped concurrency identity without cancelling or cleaning another worktree or job;
4. execute one exact allowlisted candidate command without shell-built selectors or arbitrary
   catalog input;
5. retain the command's numeric exit and sanitized result even when the job is non-blocking;
6. upload only allowlisted mode-0600 summaries/manifests, with 7-day retention for child evidence
   and at most 14 days for the governed report;
7. run cleanup in an unconditional final step and fail the job if absence is not proven or an
   exact recovery command is required;
8. prohibit secrets, raw V8 coverage, browser traces, package archives, temporary homes,
   credentials, delivered authentication artifacts, and unredacted logs from upload; and
9. leave branch protection, required checks, schedules, pull-request targeting, release gates, and
   merge policy unchanged.

## Promotion Preconditions

No workflow change should be proposed for approval until all of these are independently verified:

- table-driven SIGINT and SIGTERM injection reaches every real stage of each candidate alias;
- every interruption proves owned process, Docker, port, worktree, temporary-home, and artifact
  cleanup or emits one bounded owner-validated recovery command;
- actual CI p50/p95 and maximum runtime are measured for the complete command, not inferred from
  the millisecond protocol probes;
- the security candidate either closes its two incomplete observations or is explicitly scoped as
  a non-claim-bearing diagnostic;
- the workflow artifact allowlist and retention rules pass a redaction/canary test; and
- the user separately approves the exact workflow diff and its non-blocking trigger policy.

Fault campaigns, mutation, scheduled execution, pull-request targeting, and any required or
blocking status remain separate decisions even after these preconditions pass.
