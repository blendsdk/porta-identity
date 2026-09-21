# Ambiguity Register: DEF-13 Live Boundary

> **Document**: 00-ambiguity-register.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1
> **Note**: Entries tagged `(runtime)` were added during execution.

This register owns the material decisions for building the P1 live boundary adapter. Every entry
records the grounded options, the authority that decided, and the durable evidence. Items marked
**OPEN** block affected tasks until resolved.

## AR-1 — Raw transport and live orchestrator (complexity escalation)

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| Category       | Technical (complexity escalation) (runtime) |
| Status         | APPROVED                                    |
| Decided by     | User, explicit, 2026-09-21                  |
| Affected tasks | 2.1–2.3, 3.1–3.2                            |

**Question.** The immutable oracle requires `rawTransport === true` and includes a case whose header
value carries CR/LF octets (`validation-exposure-raw-case-requirements.ts:161`). No socket sender
exists in the assurance harness, and `request-material.ts:68-74` defers networking to "the retained
harness", which does not exist. Building a raw transport plus a live orchestrator is a material new
support surface.

**Options presented.**

| Option                     | Effect                                  | Trade-off                        |
| -------------------------- | --------------------------------------- | -------------------------------- |
| A — build it               | Satisfies the immutable oracle honestly | Large; live runs                 |
| B — descope raw-byte cases | Smaller                                 | Weakens DEF-13; edits the oracle |
| C — pause DEF-13           | Keeps Phase 0/1                         | Defect stays open                |

**Decision.** User approved **A**. B was rejected because it silently weakens a security assertion.

**Independent challenge.** A blind `design-challenger` returned **REVISE** (2026-09-21). Corrections
accepted:

1. The new transport is small (~100 lines) and must reuse `renderRawHttpRequest`
   (`request-material.ts:123`) for framing, not re-implement it.
2. `TRACE`, malformed JSON, and limit-plus-one bodies are sendable by `node:http`; only the CRLF
   case strictly requires a raw socket. The raw sender is still used for all raw cases as the only
   honest basis for `rawTransport: true`.
3. The oracle hard-asserts `profile === 'operational'` for the raw cases
   (`p1-live-boundaries.spec.test.ts:36`), so the P1 lane runs under **operational**, not
   production-security. See AR-2.
4. `correlatedLogCredit` (`production-exposure/evidence.ts:39`) is consumed by the
   production-exposure lane, not by the P1 oracle. See AR-3.
5. The admin lane (18 cases) is the real bulk; no existing adapter executes it.

**Approval evidence.** User selected "Approve building it (A)" in response to the stop packet that
carried the options above. The challenger's verdict is recorded above.

## AR-2 — P1 lane profile

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| Category       | Technical (runtime)                             |
| Status         | RESOLVED                                        |
| Decided by     | Mechanical correction (oracle is authoritative) |
| Affected tasks | 2.1–2.3, 4.2                                    |

**Question.** The plan's Phase 4 assumed a `production-security` evidence run, but the immutable
oracle asserts `observed.profile === 'operational'` for every raw case
(`p1-live-boundaries.spec.test.ts:29-36`).

**Resolution.** Mechanical: the oracle is authoritative, so the P1 live spec runs under
`--profile operational`. The plan's Phase 4 is corrected.

## AR-3 — Raw-case expected outcomes that the product may not meet

| Field          | Value                          |
| -------------- | ------------------------------ |
| Category       | Technical (runtime) — reserved |
| Status         | RESOLVED (evidence-first)      |
| Decided by     | User, explicit, 2026-09-21     |
| Affected tasks | 0.2, 2.2, 4.3                  |

**Question.** The `design-challenger` flagged that `st52-header-crlf` expects status `400`
(`validation-exposure-raw-case-requirements.ts:166`), but the request it describes is well-formed
HTTP: the CR/LF octets split the injected value into two legal header lines, and Porta neither
reflects inbound `x-request-id` nor rejects the request. Source confirmation:
`packages/server/src/middleware/request-logger.ts:55-58` creates its own UUID and ignores inbound
values. nginx validates header names only and forwards the injected name; there is no raw-header
guard in `packages/server/src`. The live outcome is therefore expected to be `200` with the injected
header absent — which satisfies the security intent (no response-header injection) but not the
oracle's `400` assertion.

**Decision.** User chose **evidence-first**: build the adapter, run the live lane, and collect the
real outcome of every raw case; then decide each mismatch individually. No requirement or product
change is authorized yet.

**Consequence.** Task 0.2 becomes the evidence-collection step and is unblocked. Task 2.2 may report
honest outcomes; any case whose real outcome differs from the oracle is escalated per case with the
captured status, body contract, and headers rather than being forced to pass.

**Related concern.** The same class of mismatch may affect other cases (`st52-path-traversal`
expects `400`; `st54-unsupported-method` expects `405` with an `Allow` header). The live run settles
each.

## AR-4 — Correlated-log credit scope

| Field          | Value                                    |
| -------------- | ---------------------------------------- |
| Category       | Technical (runtime)                      |
| Status         | RESOLVED                                 |
| Decided by     | Mechanical correction (grounded in code) |
| Affected tasks | 4.1                                      |

**Question.** The plan's Phase 4 assumed the P1 lane must flip `correlatedLogCredit`.

**Resolution.** Mechanical: the P1 oracle consumes `observedLogFields`
(`p1-live-boundaries.spec.test.ts:61`), while `correlatedLogCredit` is a
`production-exposure` evidence field (`production-exposure/evidence.ts:39,167`). Flipping it does
not advance the P1 oracle. The plan's Phase 4 is corrected; the production-exposure credit change is
out of scope for this plan.

## AR-5 — Operational log format for correlated decision capture

| Field          | Value                         |
| -------------- | ----------------------------- |
| Category       | Technical (runtime) — product |
| Status         | APPROVED                      |
| Decided by     | User, explicit, 2026-09-21    |
| Affected tasks | 0.2, 2.2, 3.1, 4.2            |

**Question.** The P1 lane runs as `operational` (AR-2), and the operational harness sets
`NODE_ENV=development` (`test-harness/docker-compose.yml`). Porta selects the `pino-pretty`
transport whenever `NODE_ENV !== 'production'` (`packages/server/src/lib/logger.ts:41`), so the
container emits human-readable (ANSI-coloured) lines and the Phase 1 JSON parser finds no records.
The oracle requires the five symbolic log fields for all 15 raw and 18 admin cases
(`validation-exposure-raw-case-requirements.ts`; `admin-data-case-requirements.ts:117-123`), so the
lane fails regardless of adapter correctness. No log-format override existed.

**Options presented.**

| Option                               | Effect                                   | Trade-off                          |
| ------------------------------------ | ---------------------------------------- | ---------------------------------- |
| A — explicit `PORTA_LOG_FORMAT=json` | Structured logs in the operational stack | Small product surface (env var)    |
| B — parse pino-pretty output         | No product change                        | Fragile, ANSI-coloured, unreliable |
| C — relax the oracle log-field rule  | No product change                        | Weakens the assurance claim        |
| D — stop and leave DEF-13 open       | No change                                | Defect stays open                  |

**Decision.** User approved **A**. Added `resolveJsonLogFormat`
(`packages/server/src/lib/log-format.ts`), which returns true when `NODE_ENV=production` or when
`PORTA_LOG_FORMAT=json`, and wired it into the logger transport. The harness porta service now sets
`PORTA_LOG_FORMAT: json` (`test-harness/docker-compose.yml`). Production behavior is unchanged and
the oracle is untouched. B and C were rejected because they weaken or destabilise a security claim.

**Correlation note.** The server echoes its own request id in the `X-Request-Id` response header
(`packages/server/src/middleware/request-logger.ts:58`), so the adapter correlates by that value
rather than by a client-supplied id (inbound ids are intentionally ignored).

## AR-6 — Raw-case control and probe mismatches with the live product

| Field          | Value                              |
| -------------- | ---------------------------------- |
| Category       | Requirements / product (runtime)   |
| Status         | **RESOLVED** — raw lane green live |
| Decided by     | User, explicit, 2026-09-21         |
| Affected tasks | 0.2, 2.2, 2.3 (done)               |

**Question.** The live raw lane (evidence: `00-raw-lane-evidence.md`) shows the immutable oracle
cannot pass as authored. Seven of fifteen cases use an authorized control body `{"name":"…"}` that
the API rejects (`packages/server/src/routes/users.ts:97-122` accepts `nickname`, not `name`), which
the mutation boundary reports as `503 admin_mutation_unavailable`
(`packages/server/src/middleware/admin-mutation-audit.ts:71-85`). Two controls declare routes that
behave differently (`GET branding/login` → 400; `/alpha/authorize` → 404). `TRACE` is answered by
nginx with HTML 405 and never reaches Porta. A double-encoded tenant path returns 500.

**Options.**

| Option                                                                                                                             | Effect                          | Trade-off                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| A — correct the requirement catalog to match the real API                                                                          | Oracle becomes executable       | Edits the immutable oracle; must stay security-equivalent |
| B — fix the product where it is wrong (500→404; invalid body→400) and correct only the requirement fields that are factually wrong | Correct behavior, honest oracle | Larger scope; product changes need authorization          |
| C — pause DEF-13 and file the mismatches as defects                                                                                | No change                       | Defect stays open                                         |
| D — force the adapter to report observed values regardless                                                                         | Never appropriate               | Would weaken a security assertion                         |

**Decision.** Approved: fix the two clear product defects and correct the requirement facts that do
not match the API, then re-run. Progress:

| Item                                       | Status                            | Change                                                                                                                                                                            |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 status: ineffective update → 400        | **Done** (`8fad03ae`)             | `updateUserSchema` now requires one known profile field                                                                                                                           |
| E5: malformed/unknown org → 404            | **Done** (`8fad03ae`)             | `requireExistingOrganization` guard on the org user list route                                                                                                                    |
| E1 field, E2 route, E3 route, E4 ingress   | **Done** (`75568bc7`, `b0ed736a`) | Payloads target the validated `profileUrl`; branding control reads the collection; authorize uses `/alpha/auth`; TRACE keeps the ingress 405 without an Allow header or Porta log |
| Security judgement on XSS/command outcomes | **Resolved**                      | A validated `profileUrl` rejects the payload with `400`, keeping the `validation-rejected` claim and unchanged state                                                              |

**Consequence.** The raw lane now passes all 15 immutable cases live. AR-6 is closed; the remaining
admin-lane mismatch is tracked separately in AR-7.

## AR-7 — Administrative log-field expectations vs the emitted decision

| Field          | Value                            |
| -------------- | -------------------------------- |
| Category       | Requirements / product (runtime) |
| Status         | **OPEN** — blocks 3.2, 4.2       |
| Decided by     | Pending user ruling              |
| Affected tasks | 3.1 (in progress), 3.2, 4.2      |

**Question.** The admin oracle requires `synthetic-correlation-id`, `actor-id`, `action`,
`target-id-digest`, `result` for all 18 cases. Live observation shows:

1. `target-id-digest` is absent for every collection or list case (for example `/api/admin/audit`,
   `/api/admin/keys`, `/api/admin/sessions`, `/api/admin/config`), because no single resource is
   resolved, so no resource reference is recorded.
2. `actor-id` is also absent for some permission denials on collection routes.
3. `pagination-cross-tenant-cursor` expects `400` for a bravo-derived cursor, but the product
   returns `200` (the fixture has no second bravo page, so the cursor is empty, and the query stays
   alpha-scoped).

**Options.**

| Option                                                                           | Effect                                    | Trade-off                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| A — make `requiredLogFields` per case                                            | Fields reflect what the boundary can emit | Weakens the shared claim; honest                                              |
| B — record actor/resource references for every admin route                       | Fields always present                     | Product instrumentation change; target digest is meaningless for a collection |
| C — change `pagination-cross-tenant-cursor` to expect `200` with alpha-only data | Matches the real isolation claim          | Edits the immutable oracle                                                    |

**Decision.** Pending. No requirement or product change is authorized yet for AR-7.
