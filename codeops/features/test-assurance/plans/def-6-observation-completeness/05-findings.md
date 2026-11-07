# Findings: Protocol Observation Completeness (DEF-6)

> **Plan**: `test-assurance/plans/def-6-observation-completeness`
> **Issue**: #121
> **Last Updated**: 2026-11-07

## Independent review — round 1

Two independent read-only reviewers (correctness and security) reviewed the implementation. They found
false-green paths in the first pass. Round 2 corrected the Critical/Major findings; the remaining
items are recorded as named residuals.

### Correctness reviewer

| ID | Severity | Finding | Final disposition |
| -- | -------- | ------- | ----------------- |
| F1 | CRITICAL | ST-40 computed key-set separation but never enforced it; `jwksIssuer` was URL-derived and tokens were not signature/claim verified. | **Closed.** Each token is verified with exact issuer, audience, subject, nonce and the tenant JWKS, and is rejected in the other tenant. `jwksKeySetDistinct` is recorded. R1 records the global-key limitation. |
| F2 | MAJOR | No-response probes used a synthetic server-shaped log edge. | **Closed with R2.** Local probes declare `client-side-rejection`; every no-response probe now runs the forbidden-value scan; response-bearing probes parse exactly one JSON record. |
| F3 | MAJOR | The state-substitution comparison was a tautology. | **Closed with R3.** `clientStateRejected(expected, received)` is a real comparison with positive and negative tests; server state is snapshotted after authorization and after the decision. The tampered callback value is simulated. |
| F4 | MAJOR | ST-39 returned “across processes” from a same-process replay. | **Closed.** `recoverPredecessorInvalid` invokes the owned `restart-porta` action, requires `State.StartedAt` to change, waits for discovery, then replays. |
| F5 | MAJOR | Consent controls selected any existing grant; the wrong-session probe was inverted. | **Closed.** Grants are revoked, a new grant is identified by ID, the alpha interaction is presented with the valid bravo cookie, and the consent **decision** is POSTed. Both alpha and bravo user states are unchanged; `processConsent` emits the event. |
| F6 | MINOR | Logout selected a session by list order. | **Closed.** The flow's session is the exact new-session delta; the admin read asserts the user; the captured cookie is replayed after logout and must not issue a code. |
| F7 | MINOR | Admin schemas retained PII through `.passthrough()`. | **Closed.** Zod strips undeclared fields; stable authority fields are compared; UserInfo `sub` must match the fixture subject. |
| F8 | MINOR | Session cookie values were not scanned. | **Closed.** Cookie values are in the ST-41 forbidden scans; the scan found and removed a real session-ID log leak (S1). |
| F9 | MINOR | The logout form action was followed without an origin check. | **Closed.** The end-session endpoint and form action must be same-origin before cookies are sent. |
| F10 | MINOR | No focused JWKS/recovery/state tests. | **Closed.** `protocol-live-jwks.spec.test.ts` and the recovery/state/log cases; focused protocol specs 40. |
| F11 | MINOR | The new server test did not assert the response or the non-missing negative. | **Closed.** The test asserts `400` and the error page; a non-missing error asserts no observer call. |
| F12 | MINOR | The plan was stale and claimed product code was out of scope. | **Closed.** D2 and the scope exception are corrected; residuals R1–R5 and R7; the evidence is current. |
| F13 | MINOR | Large observer files and a string-typed recovery label. | **Partially closed.** JWKS helpers are extracted and `withRecovery` is typed `ProtocolRecovery`; the two observer files are 800/701 lines and remain a maintainability residual R5. |

### Security auditor

| ID | Severity | Finding | Final disposition |
| -- | -------- | ------- | ----------------- |
| SA-1 | MAJOR | Shared global keys made ST-40 key-set separation vacuous. | **Closed with R1.** Exact issuer/audience/subject/nonce verification against the tenant JWKS plus cross-tenant rejection. The global key set is recorded, not claimed as separated. |
| SA-2 | MAJOR | “Across processes” was not observed. | **Closed** with the lifecycle restart and `StartedAt` check. |
| SA-3 | MAJOR | Synthetic log for no-response probes and skipped forbidden scan. | **Closed with R2.** The local edge is declared; the forbidden-value scan now runs and the server-response path parses one JSON record. |
| SA-4 | MAJOR | State-substitution probe was a tautology. | **Closed with R3.** Real client comparison plus positive/negative tests; the tampered callback is explicitly simulated. |
| SA-5 | MAJOR | Wrong-session/cross-interaction probes used nonexistent interactions; the ST-41 probe was inverted. | **Closed.** A valid pending alpha interaction receives the valid bravo cookie at `POST /interaction/:uid/confirm`; the decision is rejected, both user states are unchanged, and `processConsent` emits the event. |
| SA-6 | MINOR | Logout session attribution and cookie replay. | **Closed.** New-session delta, user assertion, and post-logout cookie replay. |
| SA-7 | MINOR | `showConsent` observer coverage and log volume. | **Partially closed, R7.** `showConsent` and `processConsent` emit the existing event. The remaining handlers and the route rate limit are recorded in R7. |
| SA-8 | MINOR | PII passthrough and weak state comparisons. | **Closed.** Zod strips PII; stable authority fields are compared; UserInfo subject is verified. |
| SA-9 | MINOR | Raw-log errors and cookie forbidden values; discovery endpoint origin. | **Closed.** Log errors are fixed; cookies are scanned; the end-session endpoint and form action are origin-checked; the adapter and Redis logs are bounded. |
| S1 | MAJOR | The session-destroy log wrote the internal session ID, which is the `_session` cookie value. | **Closed.** `adapter-factory.ts` logs only `errorName`/`grantCount`; `redis-adapter.ts` logs only the model name on invalid JSON. |

### Round 2 findings

| ID | Severity | Finding | Final disposition |
| -- | -------- | ------- | ----------------- |
| N1 | MAJOR | ST-41 `consent-wrong-session` used a bravo interaction with the revoked alpha cookie and checked the bravo user. | **Closed.** It now uses a valid alpha pending interaction, the valid bravo cookie, and POSTs the consent decision; both alpha and bravo user states are unchanged. |
| N2 | MINOR | `serverRestarted: true` was attached to pre-restart probe facts. | **Closed.** The fact was removed; the `predecessor-remains-invalid-across-processes` label is backed by the post-restart recovery replay. |
| N3 | MINOR | Some local probes had empty forbidden-value sets. | **Closed.** ST-35 state substitution, ST-38 `opaque-access-at-rp` and ST-40 now carry their ephemeral artifacts. |
| N4 | MINOR | Admin reads followed redirects with the full bearer token. | **Closed.** `adminGet`/`adminDelete` use `maxRedirects: 0`. |
| N5 | MINOR | The adapter error path logged the raw error; the Redis invalid-JSON path logged the key/payload. | **Closed.** Both log bounded non-secret fields only. |
| N6 | MINOR | New grant/session/recovery helpers lacked focused tests. | **Closed.** `newGrant`, `sameGrant`, `sessionEnded` and `tenantTokenContextsValid` have focused cases; focused protocol specs 40. |
| N7 | MINOR | `findConnectedApp` and `interactionUid` were unused. | **Closed.** Both removed. |
| N8 | MINOR | D2 still claimed disjoint keys and F13 overstated the file sizes. | **Closed in the plan; R5 records the file-size residual.** |

## Residuals

| ID | Residual | Status |
| -- | -------- | ------ |
| R1 | This deployment uses one global signing-key set, so alpha and bravo JWKS contents are identical; `jwksKeySetDistinct` is observed as `false`. | Accepted deployment residual. ST-40 verifies exact issuer/audience/subject/nonce and cross-tenant rejection instead of claiming disjoint keys. |
| R2 | Local JOSE/client probes carry a declared `client-side-rejection` log edge because the immutable contract requires a log event for every probe. | Accepted immutable-contract limitation. Server-response probes use parsed JSON; local probes run the forbidden-value scan. |
| R3 | The state-substitution probe simulates the tampered callback value. `sessionCreated`, `tokenIssuedCount` and `identityDisclosed` are local client-side facts, not server observations. | Accepted local-observation limitation; the server state is snapshotted around the client decision. |
| R4 | The session-destroy and Redis invalid-JSON logs were bounded to remove the session ID and payload. | Security improvement; covered by the live cookie scan and focused session tests. |
| R5 | `protocol-live-http.ts` is 800 lines and `oidc-token-cases-live.ts` is 701 lines, above the ~700-line guidance. | Maintainability residual; JWKS is already extracted. A follow-up split is required and should be scheduled before either file grows further. |
| R6 | ~~Consent probes observe the `/interaction/:uid/consent` page boundary, not a `POST /confirm` decision.~~ | **Retired.** Consent probes now POST `/interaction/:uid/confirm` with the wrong session; `processConsent` rejects and emits the event; both user states are unchanged. |
| R7 | `showConsent` and `processConsent` emit the existing event, but `showLogin`, `processLogin`, `handleSendMagicLink` and `abortInteraction` still swallow missing-interaction errors; the interaction route has no dedicated rate limiter. | MINOR detection/volume gap; no new product logging framework or limiter was added in this task. |

## Verification

| Gate | Result |
| ---- | ------ |
| Focused protocol specs | 40 passed |
| Live operational protocol harness | 15 passed |
| Focused server unit (adapter-factory, interactions, redis-adapter) | 89 passed |
| Penetration suite | 336 passed |
| Affected test selection (`pnpm test:changed`) | 253 passed |
| Structure | 158 passed |
| Server lint / typecheck / build | Passed |
| Harness ESLint / typecheck | Passed (pre-existing unrelated BFF harness errors excluded) |
| Independent scoped re-review | Round 2 closed N1–N8; final review closed SA-5/SA-7/R6; R1–R5/R7 accepted |
| CI | Pending |

## Notes

- The immutable expected facts and `oidc-token-boundaries.spec.test.ts` are unchanged.
- The server changes emit the existing missing-interaction event and remove secret-bearing log
  fields. They do not change status, body or authorization.
- No source variation, forced race, or new harness framework was added.
