# Execution Evidence: Protocol Observation Completeness (DEF-6)

> **Plan**: `test-assurance/plans/def-6-observation-completeness`
> **Issue**: #121
> **Last Updated**: 2026-11-07

## Delivered behavior

- The live protocol observer reads real session and consent state through the public Admin APIs.
- The harness resets the confidential client's grants, authorizes, and identifies the exact new
  grant; the same grant backs the consent control and recovery.
- The logout control identifies the session created by the current flow, sends the captured
  `_session`/`_session.sig` cookies through the real confirmation form, and replays the cookie
  afterwards. A replay that issues a code fails the control.
- ST-40 verifies each tenant's token with its exact issuer, audience, subject, nonce and JWKS
  signature, and rejects it in the other tenant. Key-set distinctness is recorded as an observed
  fact; this deployment uses one global signing key set (R1).
- ST-39 restarts the owned Porta process through the lifecycle supervisor, requires
  `State.StartedAt` to change, waits for discovery, then replays the predecessor.
- Correlated server rejection logs are parsed as exactly one JSON record; actual field names are
  returned. Local JOSE/client probes declare a `client-side-rejection` observation and run the
  forbidden-value scan (R2).
- The state-substitution probe uses a tested client-state comparison; the server state is
  snapshotted after the authorization and after the client decision (R3).
- The missing-interaction consent handler emits the existing `protocol-security-rejection` event.
- The session-destroy log no longer writes the internal session ID, which is also the `_session`
  cookie value. The live cookie scan found this pre-existing leak.

## Verification

| Gate | Result |
| ---- | ------ |
| Focused protocol specs | 40 passed |
| Live operational protocol harness | 15 passed |
| Focused server unit (adapter-factory, interactions, redis-adapter) | 89 passed |
| Affected test selection (`pnpm test:changed`) | 253 passed |
| Penetration suite | 336 passed |
| Structure | 158 passed |
| Server lint / typecheck / build | Passed |
| Harness ESLint / typecheck | Passed (pre-existing unrelated BFF harness errors excluded) |
| Independent scoped re-review | Round 2 closed N1–N8 and the final review closed SA-5/SA-7/R6; R1–R5/R7 accepted |
| CI | Pending |

## Review closure

Round 1 independent correctness and security reviews returned one Critical and several Major
assurance-integrity findings. Round 2 corrected the remaining wrong-session inversion and the
bounded-log residuals. The full disposition, including residuals R1–R5 and R7 (R6 retired), is in `05-findings.md`:

| Area | Final state |
| ---- | ----------- |
| ST-40 JWKS/token verification | Fixed with exact issuer-bound token verification and cross-tenant rejection; R1 records the global key set |
| ST-39 cross-process recovery | Fixed with a real lifecycle restart and `StartedAt` check |
| ST-35/ST-41 consent and session context | Fixed with new-grant detection, valid pending interactions, the alpha state for the wrong-session probe, the flow's new session and a cookie replay; the consent decision is POSTed; R6 is retired |
| Local log edges | Accepted immutable-contract limitation R2; forbidden-value scan added |
| State substitution | Fixed comparison helper and test; R3 records the simulated callback value |
| Server log leak | Fixed; only `errorName`/`grantCount` and the model name are logged, not the internal session ID or payload |

## Evidence notes

- The immutable expected facts and `oidc-token-boundaries.spec.test.ts` are unchanged.
- The server changes are limited to the existing missing-interaction event and removing secret-
  bearing log fields; status, body and authorization are unchanged.
- Residuals R1 (global keys), R2 (local log edges), R3 (simulated callback), R5 (file size),
  R7 (remaining interaction catches/rate limit) is recorded; R6 is retired.
- Owned scratch PostgreSQL, Redis and MailHog containers are removed after the runs.
- No merge to `main`, release, or unrelated issue-state change was performed.
