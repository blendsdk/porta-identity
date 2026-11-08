# Execution Plan: Protocol Observation Completeness

> **Plan**: [00-index](00-index.md) · **Feature**: test-assurance · **Task**: DEF-6 / #121
> **Status**: Complete
> **Progress**: 6/6 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Execution contract

The immutable protocol oracle, `oidc-token-boundaries.spec.test.ts`, the `ProtocolCaseObservation`
contract and all expected facts stay unchanged. Update this file after every task. Mark a task `[x]`
only after its verification passes.

## Tasks

### Phase 1 — Behavior oracle and red

- [x] T-01.1 Add focused behavior specs for exactly one correlated JSON log record and its
  actual field names, forbidden values, zero/ambiguous records, RFC 7638 JWKS identity, state
  comparison, client-state comparison and a missing recovery label failing closed. ✅ (completed:
  40 focused protocol specs pass).

### Phase 2 — Observation implementation

- [x] T-01.2 Implement `protocol-live-log.ts`, `protocol-live-jwks.ts`, the full-admin
  token/session/grant readers in `protocol-live-http.ts`, and `protocol-live-recovery.ts`. ✅
  (completed: content identity, parsed logs, admin reads, restart, cookie replay and ownership
  checks).
- [x] T-01.3 Extend `StepEvidence` with `recoveryObserved`; require it for every probe; update
  the live context cases to use real consent/session state, new-grant detection, valid pending
  interactions and real recovery checks. ✅ (completed: all expected facts and the boundaries spec
  unchanged; no-response probes run the forbidden-value scan).

### Phase 3 — Live and repository verification

- [x] T-01.4 Run `pnpm assurance:harness --project protocol --profile operational` and
  `pnpm assurance:test --select protocol-specs`; fix only observation-caused failures. ✅
  (completed: live 15/15 including real ST-39 restart, ST-40 cross-tenant rejection, ST-41
  cookie replay; focused 40/40).
- [x] T-01.5 Update the roadmap, findings and evidence; run `pnpm test:pentest`,
  `pnpm test:structure`, server typecheck/lint, and the applicable full gate. ✅ (completed:
  findings and evidence recorded; structure 158, focused server 89, pentest 336, affected 253, lint/typecheck
  pass).
- [x] T-01.6 Obtain independent review, close necessary findings, run PR CI, merge through
  `develop`, close #121 and record final evidence and cleanup. ✅ (completed: both reviewers closed
  every Critical/Major; residuals R1–R5 and R7 accepted; PR #224 all six CI jobs passed; squash
  merge `5698bef0`; post-merge CI `42363015714`; #121 closed; owned containers, worktree and
  temporary artifacts removed).

## Verification

| Check | Command |
| ----- | ------- |
| Focused helper/protocol specs | `pnpm assurance:test --select protocol-specs` |
| Live protocol harness | `pnpm assurance:harness --project protocol --profile operational` |
| Security regression | `pnpm test:pentest` |
| Structure | `pnpm test:structure` |
| Server static checks | `pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server lint` |

## Evidence plan

Record the spec-red output, focused-green counts, the live harness result, the observed log fields,
the recovery checks, the client-side residual, review findings, CI, merge commit and cleanup.
