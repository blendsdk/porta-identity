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
