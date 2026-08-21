# Ambiguity Register: Assurance Product Remediation

> **Status**: ✅ GATE PASSED — all 9 items resolved
> **Last Updated**: 2026-08-21 08:21

## Planning boundaries

| Boundary | Authorized scope |
| --- | --- |
| Planning target | Resolve the four product/security root causes recorded as DEF-7, DEF-10, DEF-12, and DEF-13 by the completed test-assurance program. |
| Context artifacts | Test-assurance requirements, plan, roadmap and evidence; affected Porta server source, tests, public docs, and maintainer techdocs. |
| Modification set | This new plan, RD-05 and its roadmap/traceability state, affected server product code and tests, and directly affected public/technical documentation. The completed test-assurance implementation, CI workflows, release/publishing/deployment policy, and unrelated Porta features remain outside scope. |

## Ambiguity Register

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Security & non-functional | The enumeration timing requirement has no predeclared hypothesis, effect-size bound, sample/power rule, or invalid-run controls. | A: approve an exact statistical-equivalence contract. B: remove timing-distribution pass/fail credit and require design-level work equivalence plus functional indistinguishability. | User approved B: timing remains diagnostic only; the product must remove known branch-level work differences and preserve exact public equivalence. | ✅ Resolved |
| 2 | Security & state | A magic-link session issued for one organization is accepted through another tenant route; mismatch consumption semantics are undefined. | A: reject before consumption and preserve the artifact. B: consume then reject. C: formally support cross-tenant use. | User approved A: bind artifact, user, tenant, interaction, and client before mutation; mismatch is generic and non-consuming. | ✅ Resolved |
| 3 | Behavioral, data & compatibility | Bulk, import, and export contracts conflict or are incomplete for partial results, rollback, collisions, versions, tenant scope, and sensitive fields. | Define exact per-item versus atomic behavior, mode semantics, provenance/version rules, tenant scope, and export allowlists. | User approved partial per-item bulk, atomic-on-error import with intentional merge/overwrite/dry-run semantics, and strictly scoped allowlisted exports. | ✅ Resolved |
| 4 | Security & integration | Malformed-request and admin authorization outcomes lack one correlated, privacy-safe decision event with the fields required by assurance. | A: one complete terminal decision event. B: correlate separate request/audit records. C: weaken the assurance requirement. | User approved A: one versioned privacy-safe event per covered request; authorized admin mutations retain fail-closed durable audit semantics. | ✅ Resolved |
| 5 | Technical unknowns | Uniform recovery work needs a durable transport without adding an external service. | A: PostgreSQL transactional outbox. B: process-local queue. C: add an external queue. | AI selected A under `--auto-design`: reuse PostgreSQL with bounded claims and idempotent jobs. | ✅ Resolved |
| 6 | Data & migration | New artifact authority and outbox state require a schema evolution policy. | A: additive forward migration. B: rewrite existing migrations. | AI selected A under `--auto-design`: add one ordered migration and preserve applied history. | ✅ Resolved |
| 7 | Integration & testing | Independent verification could use public boundaries plus owned state, or production-only hooks. | A: public HTTP/browser plus database/Redis/MailHog/log observers. B: add production test hooks. | AI selected A under `--auto-design`: layered ordinary boundaries only. | ✅ Resolved |
| 8 | Security & configuration | Protected event references need a rotation-compatible HMAC key without introducing another unmanaged secret. | A: derive domain keys from the existing rotating cookie-key ring. B: add a new standalone secret. | AI selected A under `--auto-design`: HKDF derives event-reference keys with a fixed domain label and non-secret key ID. | ✅ Resolved |
| 9 | Reliability | Recovery-job claim batch, retry, and wake-up behavior is unspecified. | A: fixed bounded worker policy. B: operator-tunable unbounded policy. | AI selected A under `--auto-design`: fixed safe bounds with explicit terminal failure. | ✅ Resolved |

### Resolution Notes

**AR-1 — Enumeration resistance (sensitive):** User approved the independently challenged
recommendation to remove timing-distribution results from security pass/fail credit. Every failure
path must remain publicly indistinguishable in status, redirect/page schema, headers, cookies,
errors, and rate-limit behavior. Structurally valid password attempts perform exactly one Argon2id
verification using the real hash only for an eligible account and a process-cached dummy hash with
current production parameters otherwise. Failure accounting keeps one fixed-shape public-path
database operation. Magic-link and password-reset requests enqueue the same bounded tenant-bound
job shape after validation and throttling; the request does not await account-specific token or
mail work. Timing sampling may detect regressions diagnostically but never qualifies or fails the
security claim. **Authority**: User — approved all four exact recommendations on 2026-08-21.
**Evidence**: current password, magic-link, and reset paths perform observably different account-
dependent work, while the existing timing tests use very small samples and permissive ratios.
**Rejected alternative**: a fixed statistical-equivalence gate cannot repair known branch-level
differences and would turn scheduler/network noise into a security oracle. **Strongest
counterargument**: diagnostics can detect emergent timing drift; they remain available without
claim-bearing credit. **Confidence**: High. **Hardening**: independent challenger selected this
option over the initially considered statistical gate. **Reopen trigger**: a standards-backed,
environment-independent timing acceptance contract becomes available and is separately approved.

**AR-2 — Cross-tenant magic-link consumption (sensitive):** User approved immutable organization
and optional interaction binding at issuance. Before any mutation, the route organization,
artifact organization, current user organization, and interaction client organization must match;
a standalone artifact rejects a supplied interaction identifier. One PostgreSQL transaction locks
and validates the unused unexpired artifact, rolls back mismatch without consuming or changing
account/session state, and conditionally consumes exactly once on success. Redis continuation
consumption is atomic and deletes only when the stored organization and interaction match the
resolved request. Responses remain indistinguishable from invalid/expired links and logs retain no
token, email, or raw interaction identifier. **Authority**: User — approved all four exact
recommendations on 2026-08-21. **Rejected alternatives**: consume-on-mismatch creates an
unauthenticated destruction primitive; cross-tenant acceptance violates tenant isolation.
**Strongest counterargument**: preservation permits retry at the correct tenant, but bearer theft
already permits that and is controlled by TTL, throttling, and correct-route single use.
**Confidence**: High. **Hardening**: independent challenger converged. **Reopen trigger**: Porta
adopts an explicitly authorized cross-tenant authentication-artifact product model.

**AR-3 — Bulk/import/export public contract (complex):** User approved compatibility-preserving
per-item bulk operations: whole-request validation precedes mutation; duplicate IDs reject the
request; each ordered item uses its own tenant-scoped transaction and closed result code; an
infrastructure stop reports committed and not-attempted items truthfully. Import strictly validates
version, fields, duplicate natural keys, references, scopes, and authorization before mutation.
`merge` skips existing tenant-qualified keys, `overwrite` changes only an allowlisted mutable field
set without moving ownership or rotating credentials, and `dry-run` uses the same planner under a
consistent snapshot with no writes or secret generation. Any non-skip error rolls back the whole
import; secret-equivalent input is rejected. Export requires dedicated export plus entity-read
permission, exact tenant/application scope, closed fields, bounded results, audit metadata
allowlisting, and CSV formula neutralization. **Authority**: User — approved all four exact
recommendations on 2026-08-21. **Rejected alternatives**: atomic bulk breaks the published per-item
result contract; partial import is ambiguous across dependent entities; raw audit metadata and
application-only role scope are insufficiently isolated. **Strongest counterargument**: atomic
import makes one bad item block deployment, answered by a complete non-mutating dry run.
**Confidence**: High. **Hardening**: independent challenger converged. **Reopen trigger**: a new
versioned public import/export format or compatibility decision supersedes these semantics.

**AR-4 — Correlated security-decision events (sensitive):** User approved one authoritative
`security.decision.v1` terminal event per covered request. The closed schema carries server-created
request ID, timestamp, surface, method, normalized route template, status, outcome, decision point,
reason code, and only applicable protected references or closed permission/schema facts. Actor,
tenant, resource, and source references are domain-separated keyed digests; raw paths, queries,
bodies, headers, credentials, emails, identifiers, stack traces, SQL/infrastructure errors, IPs,
and user agents are forbidden. Middleware records typed facts and one finalizer emits once after
error handling, including parser/Zod and admin authentication/authorization outcomes. Denial-event
failure never changes denial into success; authorized state-changing admin mutations retain
fail-closed durable business-audit/outbox persistence. **Authority**: User — approved all four
exact recommendations on 2026-08-21. **Rejected alternatives**: separate records cannot prove one
complete outcome and require privacy-sensitive joins; weakening the oracle preserves the known
gap. **Strongest counterargument**: a terminal event flattens stage detail, answered by a closed
decision-point/reason vocabulary plus separate non-authoritative operational diagnostics.
**Confidence**: High. **Hardening**: independent challenger converged. **Reopen trigger**: the
security event is replaced by an equally complete, independently correlated durable mechanism.

**AR-5 — Durable recovery-work transport:** **Authority**: AI — delegated by `--auto-design`.
**Eligibility**: internal persistence and failure-recovery mechanism within the approved constant-
work recovery contract; no product behavior or external dependency choice changes. **Objective**:
make the public request account-independent without losing valid recovery delivery on restart.
**Decision**: use a PostgreSQL transactional outbox with closed job types, normalized tenant-bound
input, idempotency identity, bounded `FOR UPDATE SKIP LOCKED` claims, attempt limits, and explicit
terminal state. No new hosted or package dependency is introduced. **Evidence**: PostgreSQL is
already Porta's durable authority; a process-local queue loses jobs on restart, while an external
queue expands deployment scope. **Rejected alternatives**: process memory is not durable; a new
queue service is disproportionate. **Strongest counterargument**: an outbox adds schema and worker
complexity, but it preserves delivery and transaction provenance using an existing dependency.
**Confidence**: High. **Hardening**: forced comparison against process-local and external queues did
not change the choice. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-REMEDIATION-20260821`. **Reopen trigger**: Porta adopts an authorized durable job service or
PostgreSQL is no longer available to authentication flows.

**AR-6 — Schema evolution:** **Authority**: AI — delegated by `--auto-design`. **Eligibility**:
reversible migration mechanism under the repository's existing applied-migration constraint.
**Objective**: add authority/outbox fields without corrupting or rewriting deployed state.
**Decision**: add one ordered forward migration with nullable/backfilled authority where legacy
rows require it, explicit constraints/indexes, and migration tests; never rewrite an applied file.
**Evidence**: project guidance forbids rewriting applied migrations. **Rejected alternative**:
rewriting history is unsafe for existing installations. **Strongest counterargument**: a single
migration spans two related tables, but splitting it would expose an unusable mixed schema between
steps. **Confidence**: High. **Hardening**: no viable historical-rewrite alternative survived.
**Policy version**: 1. **Root Invocation ID**: `AD-TA-REMEDIATION-20260821`. **Reopen trigger**: the
current migration sequence or deployment compatibility contract changes before execution.

**AR-7 — Verification boundary:** **Authority**: AI — delegated by `--auto-design`.
**Eligibility**: testing architecture inside approved public behavior. **Objective**: prove effects
without creating a production bypass. **Decision**: use public HTTP/browser actions and independent
owned PostgreSQL, Redis, MailHog, and structured-log observations; production-only headers,
credentials, reset endpoints, fault switches, and source variants are forbidden. **Evidence**: the
retained harness already owns and fences these dependencies. **Rejected alternative**: production
test hooks weaken the runtime boundary and can create bypass paths. **Strongest counterargument**:
layered observers know some storage details, but they remain independent of response assertions and
are needed to prove nonmutation and durability. **Confidence**: High. **Hardening**: no safer
equally observable boundary was found. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-REMEDIATION-20260821`. **Reopen trigger**: an ordinary public observer can prove the same
durable facts without reducing independence.

**AR-8 — Protected-reference keys:** **Authority**: AI — delegated by `--auto-design`.
**Eligibility**: internal cryptographic key derivation within the user-approved privacy contract;
no new retention or access policy. **Objective**: produce non-reversible, domain-separated actor,
tenant, resource, and source references while preserving configured key rotation. **Decision**:
derive one HMAC-SHA-256 key per reference domain with HKDF-SHA-256 from each existing `COOKIE_KEYS`
entry using the fixed `porta/security-decision/v1` context. The active cookie key signs new
references; retained prior keys verify only. Events include a non-secret key ID derived from the
key's public digest, never the key. **Evidence**: Porta already validates and rotates a protected
cookie-key ring; a standalone event secret would duplicate operator key management. **Rejected
alternative**: an extra secret increases configuration and rotation drift. **Strongest
counterargument**: deriving from cookie keys couples two uses, mitigated by HKDF domain separation
and independent derived keys. **Confidence**: High. **Hardening**: comparison with a separate key
did not justify the operational cost. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-REMEDIATION-20260821`. **Reopen trigger**: Porta gains a centralized key-management service
or cookie-key retention becomes shorter than security-event retention.

**AR-9 — Recovery worker bounds:** **Authority**: AI — delegated by `--auto-design`.
**Eligibility**: bounded scheduling/retry mechanism inside the approved durable job contract.
**Objective**: deliver valid recovery mail without unbounded retry, duplicate processing, or slow
shutdown. **Decision**: claim at most 25 jobs, wake after enqueue with a one-second fallback poll,
use five total attempts with four inter-attempt delays of 1s, 10s, 60s, and 5m, reclaim a claim only after a
five-minute lease, and stop claiming on shutdown while allowing the active job a 30-second bounded
completion window. Terminal failures retain only closed reason codes. **Evidence**: the work is
small, MailHog/SMTP and PostgreSQL are existing dependencies, and fixed bounds are independently
testable. **Rejected alternative**: unrestricted operator tuning can create amplification or
shutdown hangs before a safe policy exists. **Strongest counterargument**: fixed bounds may not fit
all deployments; configuration can be separately authorized after operational evidence.
**Confidence**: High. **Hardening**: an independent worker-policy challenge rejected the original
five-delay wording because five total attempts permit only four inter-attempt delays; an expired
fifth claim closes without a sixth account-specific execution. **Policy version**: 2. **Root
Invocation ID**: `AD-TA-REMEDIATION-20260821`. **Reopen trigger**: measured production
load or SMTP latency exceeds the bounded policy without abuse.

**AR-10 — Specification-driver admission:** **Authority**: AI — delegated by `--auto-design`.
**Eligibility**: test architecture needed to observe the already-approved behavior; no product,
security, or compatibility outcome changes. **Objective**: preserve an honest specification-first
RED checkpoint even though the current route factories expose no dependency/observation boundary
for password operation counts or recovery-job lifecycle facts. **Decision**: keep the immutable
specification and its broad observation contract under the existing server unit project. A
test-owned adapter initially reports the capability unavailable and may never synthesize evidence.
The ordinary lane always validates the scenario/oracle catalog; the isolated RED command requires
the capability and fails with one registered marker. Once a live adapter exists, ordinary runs
automatically execute every behavioral case, so there is no permanent skip or synthetic fallback.
The adapter must drive public Koa boundaries and use independent spies or owned database, mail, and
worker-state observers. **Evidence**: the current factories expose only routers/providers and no
stable way to observe the approved operation counts, job claims, leases, retries, or timing-policy
metadata without implementation-derived module mocks. **Rejected alternatives**: a nonexistent
static import is a collection failure, private-module mocks couple the oracle to implementation,
and an always-skipped spec can never become a required regression test. **Strongest
counterargument**: conditional capability admission can hide tests; automatic behavioral
registration as soon as the adapter is live plus an explicit required-mode RED prevents that.
**Confidence**: High. **Hardening**: the independent spec author stopped rather than fabricate an
oracle and proposed the same swappable driver boundary. **Policy version**: 1. **Root Invocation
ID**: `AD-TA-REMEDIATION-20260821`. **Reopen trigger**: ordinary public route factories expose all
required observations directly before the adapter is implemented.

**AR-11 — Recovery-worker activation sequencing:** **Authority**: AI — delegated by
`--auto-design`. **Eligibility**: internal implementation sequencing inside the approved durable
recovery-job architecture; no product behavior or acceptance criterion changes. **Objective**:
prevent a partially implemented worker from consuming durable jobs before the protected
account-specific processor exists. **Decision**: Task 1.4 delivers the bounded scheduler and its
explicit start/wake/stop lifecycle boundary without activating it. Task 1.6 supplies the protected
address decoder and concrete token/mail processor, then starts and stops the worker from the
application entry point. **Evidence**: the current routes still perform token and mail work inline,
and no concrete processor exists; starting a placeholder would either falsely complete or
terminally fail durable rows. **Rejected alternative**: activate a no-op or terminal placeholder,
because that can irreversibly consume real queued work. **Strongest counterargument**: deferring
activation means Task 1.4 alone has no live background process; the explicit Task 1.6 activation
gate preserves fail-closed operation while keeping the scheduler independently verifiable.
**Confidence**: High. **Hardening**: the worker cannot be constructed by the entry point until a
real `RecoveryJobProcessor` is supplied, so accidental placeholder activation is structurally
excluded. **Policy version**: 1. **Root Invocation ID**: `AD-TA-REMEDIATION-20260821`.
**Reopen trigger**: a separately usable concrete recovery processor exists before Task 1.6 or
another process begins inserting recovery jobs before activation is deployed.

**AR-12 — Recovery-mail delivery semantics:** **Authority**: User — approved the recommended best
option on 2026-08-21. **Objective**: preserve legitimate recovery delivery without claiming an
impossible SMTP exactly-once guarantee. **Decision**: each durable job owns one deterministic,
single-use recovery artifact and stable message identity. Delivery is bounded at-least-once; a
retry after an ambiguous SMTP result may resend the identical link, but may never mint another
active artifact. **Evidence**: an SMTP relay can accept message data before the client observes a
connection failure, so retrying can duplicate mail while refusing retry can lose mail.
**Rejected alternatives**: at-most-once can silently lose legitimate recovery mail; a provider
idempotency API adds an external dependency outside scope. **Strongest counterargument**: duplicate
messages can confuse users, mitigated by identical content/link, one active artifact, and five
bounded attempts. **Confidence**: High. **Hardening**: an independent security challenger
confirmed the SMTP limitation and selected the same policy. **Reopen trigger**: Porta adopts an
authorized provider API with durable idempotency keys.

**AR-13 — Clean-provenance Phase 1 evidence checkpoint:** **Authority**: AI — delegated by
`--auto-design`. **Eligibility**: reversible execution-plan sequencing required by an existing
evidence-integrity boundary; no product or acceptance behavior changes. **Objective**: update the
Phase 1 documentation and still produce service-backed evidence bound to the exact implementation
revision. **Decision**: split the former Task 1.9 into Task 1.9a for documentation, roadmap, and
ordinary verification, followed by Task 1.9b for the clean-revision production-security harness,
final Phase 1 verification, and quality gate. **Evidence**: production-exposure evidence calls
`inspectFoundationProvenance`, which intentionally rejects staged, unstaged, or untracked paths;
the combined task therefore failed at the collector while the documentation diff was present.
**Rejected alternative**: weakening or bypassing the clean-tree guard would let evidence describe
source bytes other than its recorded revision. **Strongest counterargument**: the extra checkpoint
adds one commit and verification cycle, but it preserves the repository's established provenance
model and makes the evidence reproducible. **Confidence**: High. **Hardening**: the same
capability-then-clean-evidence sequence is already used by the packed-client and coverage
assurance paths. **Policy version**: 1. **Root Invocation ID**:
`AD-TA-REMEDIATION-20260821`. **Reopen trigger**: production-exposure evidence adopts an equally
strict content-addressed snapshot model that supports a dirty primary worktree.
