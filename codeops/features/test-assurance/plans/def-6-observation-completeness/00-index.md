# Task Plan: Protocol Observation Completeness (DEF-6)

> **Feature**: test-assurance · **Task**: DEF-6 / #121
> **Status**: Review
> **Created**: 2026-11-07
> **CodeOps Artifact Schema**: 1

## Objective

Make the live protocol observer independent for the four DEF-6 subclaims: session/consent state,
JWKS key-set identity, per-probe prohibited effects and recovery, and correlated security-log
fields. The immutable protocol oracle and `oidc-token-boundaries.spec.test.ts` stay unchanged.
Closes GitHub #121.

## Scope

In scope:

- Read real session and consent/grant state through the existing public Admin APIs, not the
  database and not a synthetic expectation.
- Verify JWKS identity by key-set contents (key IDs/thumbprints), not by URL path.
- Parse exactly one structured `protocol-security-rejection` JSON log line for the response
  request ID and enumerate the actual fields.
- Replace echoed recovery strings with a real post-probe recovery check that fails closed when the
  observation is absent or false.
- Emit the existing `protocol-security-rejection` event from the swallowed consent-interaction
  failure path and remove the internal session ID from the session-destroy log.
- Keep the live adapter fail-closed when its fixture environment is absent.
- Focused tests, the operational protocol harness, pentest and full verification.

Out of scope:

- The immutable oracle, the `ProtocolCaseObservation` contract, and the boundaries spec.
- New logging frameworks, source variations, forced races, or generalized observers. The only
  product changes are the existing missing-interaction event and the session-ID log removal.
- The client-side state-mismatch step, where the relying party rejects before any server request;
  that remains an explicit client-side observation and is recorded as a residual.
- DEF-23, DEF-20, or any other open test-assurance item.

## Decisions

| ID | Decision | Rationale |
| -- | -------- | --------- |
| D1 | Use the existing full super-admin fixture token and public Admin APIs for session/grant reads | They are real public boundaries, already owned by the harness, and require no product change |
| D2 | Verify each tenant token with its exact issuer, audience, subject, nonce and JWKS signature, and reject it in the other tenant; record key-set distinctness | This is the strongest observable isolation with the deployment's global signing key set. R1 records that key-set contents are not distinct. |
| D3 | Parse the actual JSON log record and return its key names | Removes the hardcoded field list while retaining no values |
| D4 | Require a real recovery check for every probe and fail closed if absent | Removes the echoed `requirement.recoveryExpectation` value |
| D5 | Use a real lifecycle restart for cross-process recovery and real session/new-grant deltas for consent recovery | Bounded scope without echoing an unverified label |
| D6 | Keep local JOSE/client log edges as declared `client-side-rejection` observations and run the forbidden-value scan for them | No server request exists at those boundaries; R2 records the immutable-contract limitation |

## Technical design

1. **`protocol-live-log.ts`.** Parse the compose log output, find exactly one JSON record for the
   request ID with `event: 'protocol-security-rejection'`, reject forbidden values in the raw logs,
   and return the actual key names.
2. **`protocol-live-jwks.ts`.** Compute RFC 7638 SHA-256 thumbprints and compare key-set content.
3. **`protocol-live-http.ts`.** Add a full-admin token read, public Admin session/grant read and
   revoke methods, a valid pending-interaction creator, a real lifecycle restart, a same-session
   logout, a user-scoped session read and a post-logout cookie replay.
4. **`protocol-live-recovery.ts`.** Implement real recovery checks (fresh authorization,
   consumed-code replay, trusted-token re-verification, userinfo, restart-based refresh replay,
   tenant token verification, new-grant detection and session/consent state). Return the exact
   requirement label only after the check passes.
5. **Live support and adapter.** Add `recoveryObserved` to `StepEvidence`; require it for every
   probe; remove the adapter's fallback to `requirement.recoveryExpectation`; scan forbidden values
   for local probes; use the parsed log for response-bearing probes.
6. **Live context cases.** Reset the confidential client's grants, identify the new grant, use a
   valid pending interaction with the wrong session, use the flow's new session for logout, verify
   the UserInfo subject and the tenant token context, and replay the captured cookie after logout.
   Keep the expected facts unchanged.
7. **Tests and evidence.** Add focused tests for log parsing, JWKS identity, state comparison and
   recovery projection; run the operational protocol harness, protocol specs, pentest and the
   repository verification. Record the findings and final evidence.

## Tasks

- [x] T-01.1 Write focused specs for JSON log parsing, JWKS key-set identity, and the fail-closed
  recovery requirement; observe the intended red.
- [x] T-01.2 Implement the log parser, JWKS identity, admin readers, restart and recovery helpers.
- [x] T-01.3 Wire the live support/adapter and update the live context cases; keep the oracle and
  boundaries spec unchanged.
- [x] T-01.4 Run the operational protocol harness and focused protocol specs; fix only
  observation-caused failures.
- [x] T-01.5 Update the roadmap, findings ledger and execution evidence; run pentest, structure,
  typecheck, lint and the applicable full gate.
- [~] T-01.6 Independent review, scoped fixes, PR/CI, merge through `develop`, close #121 and record
  final evidence/cleanup.

**Verify**: `pnpm assurance:test --select protocol-specs && pnpm assurance:harness --project protocol --profile operational && pnpm test:pentest && pnpm test:structure && pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server lint`

## Evidence plan

- Record the spec-red and focused-green counts.
- Record the operational protocol harness result and the exact observed fields.
- Record the recovery checks and the client-side residual.
- Record review findings, CI, merge commit and #121 closure; remove owned containers and temporary
  artifacts.
