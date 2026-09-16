## Preflight Report: RD-03 PostgreSQL-Backed Global Configuration

> **Status**: ✅ PASSED — all 11 findings resolved
> **Iteration**: 3 (targeted verification of PF-009)
> **Previous Iteration**: 11 findings — corrections applied
> **This Iteration**: 0 new findings
> **Carried Forward**: None
> **Artifact**: Single requirement at `codeops/features/production-readiness/requirements/RD-03-postgresql-backed-global-configuration.md`
> **Artifact Blob**: `6f3b716bcf248645735bd4624adc85b4fd432387`
> **Iteration 2 Artifact Hash**: `80f32fdd81a8fde714754f9a65d21eb50db8907e`
> **Passed Artifact Hash**: `089a90fefbc86bd7b1535e22b4434065b44f957f`
> **Codebase Grounded**: 32 relevant source, test, migration, manifest, and documentation files examined; 18 material references verified
> **Scope Mode**: Strict
> **Last Updated**: 2026-09-15

### Audit Scope

- **Audit target and authorized modification set:** RD-03 only. This report records the review.
- **Context documents:** the production-readiness ambiguity register and roadmap; RD-01 and RD-02
  are dependency context only.
- **Confirmed product scope:** the approved closed 18-key PostgreSQL-backed configuration catalog
  and its existing server, SDK, CLI, Admin UI, migration, documentation, and verification surfaces.
  No shared package, generalized framework, distributed invalidation, concurrency workflow, Redis
  cleanup, worker, or new process harness is authorized.

### Codebase Context Summary

**Tech Stack:** Node.js 24 TypeScript ESM monorepo; Koa, PostgreSQL, Redis, Zod,
`oidc-provider`, a typed HTTP SDK, yargs CLI, and JSVision terminal Admin UI.

**Architecture:** The server owns runtime configuration and a 60-second process-local cache. The SDK
owns independently published HTTP contracts. The CLI depends on the SDK and embeds the Admin UI.
Ordinary Admin mutations are transaction-wrapped and audited by shared middleware, while selected
complex operations own their transaction and specialized audit event directly.

**Key Files Examined:** `packages/server/src/lib/system-config.ts`,
`packages/server/src/routes/config.ts`, `packages/server/src/lib/database.ts`,
`packages/server/src/middleware/admin-mutation-audit.ts`, `packages/server/src/auth/i18n.ts`,
`packages/server/src/auth/rate-limiter.ts`, `packages/server/src/auth/recovery-job-processor.ts`,
`packages/server/src/routes/users.ts`, migrations 008/011/017, SDK config types/domain, conventional
CLI config command, and Admin UI application/presentation/session/workspace patterns.

**Key observations:** Existing runtime consumers already read most canonical values. Invitation
creation still hard-codes seven days. Current config reads coerce legacy strings and log raw errors
or stored values. The current API exposes arbitrary table rows and accepts string-only updates. A
rate-limit counter's Redis expiry is set only when that counter begins. Only the `en` locale bundle
is installed. No package dependency permits one imported runtime constant to span server and SDK.

**Reviewer coverage:** Independent reviewers scanned document soundness, grounding, and delivery.
The lead completed the risk and fit clusters inline because the agent thread limit prevented two
additional dispatches. One independent challenger reviewed the complete major-finding batch.

### Summary by Dimension

| # | Dimension | Findings | Highest Severity |
|---|---|---:|---|
| 1 | Ambiguities | 2 | 🟠 |
| 2 | Implicit Assumptions | 1 | 🟠 |
| 3 | Logical Contradictions | 1 | 🟠 |
| 4 | Completeness Gaps | 3 | 🟠 |
| 5 | Dependency Issues | 1 | 🟠 |
| 6 | Feasibility Concerns | 2 | 🟠 |
| 7 | Testability | 1 | 🟠 |
| 8 | Security Blind Spots | 2 | 🟠 |
| 9 | Edge Cases | 3 | 🟠 |
| 10 | Scope Creep Indicators | 2 | 🟠 |
| 11 | Ordering & Sequencing | 0 | — |
| 12 | Consistency | 2 | 🟠 |
| 13 | Codebase Alignment | 4 | 🟠 |

### Summary by Severity

| Severity | Count | Status |
|---|---:|---|
| 🔴 Critical | 0 | None |
| 🟠 Major | 10 | All verified resolved |
| 🟡 Minor | 1 | Verified resolved |
| 🔵 Observation | 0 | None |

---

### PF-001: Unknown keys require contradictory status codes 🟠 MAJOR

**Dimensions:** Logical Contradictions; Security Blind Spots
**Location:** AC-09–AC-10 and Acceptance Criteria 2–3
**Codebase Evidence:** `packages/server/src/routes/config.ts:88-99,123-145` currently uses `404` for
unknown path keys but has no batch behavior.

**The Problem:** AC-09 requires unknown, internal, secret, and environment-owned keys to share a
fixed `404`. AC-10 requires an unknown key to return `400 config_value_invalid`. Both cannot hold,
and different handling can reveal key categories.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Return the same fixed `404 config_entry_not_found` when a single or batch request contains any non-catalog key; reserve `400` for invalid bodies or values. | Uniform non-enumeration and one rule. | A batch member error uses `404` rather than the more usual `400`. |
| B | Use `404` for path keys and `400` for batch member keys, while treating every non-catalog category identically within each endpoint. | Conventional batch validation. | Two public rules and a larger information surface. |

**Recommendation:** Option A. It is the smallest rule and preserves the intended non-enumeration
boundary.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### PF-002: Missing catalog rows have no complete Admin contract 🟠 MAJOR

**Dimensions:** Completeness Gaps; Consistency
**Location:** AC-14 and API Representation
**Codebase Evidence:** `packages/server/migrations/008_config.sql:5-14` gives timestamps only to real
rows; `packages/server/src/routes/config.ts:59-84,136-145` lists stored rows and cannot update a
missing row.

**The Problem:** The list must contain all catalog entries and a missing row may use its default,
but `updatedAt` is required and writes do not say whether they repair the missing row.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Treat a missing catalog row as an Admin service-integrity failure; runtime readers alone may fall back. | Smallest behavior; makes corruption visible without repair machinery. | Admin configuration remains unavailable until the database is corrected. |
| B | Return a virtual default with `updatedAt: null` and repair through an upsert. | Keeps the Admin surface usable. | Adds virtual-row and repair semantics for unsupported database corruption. |

**Recommendation:** Option A. Porta owns its migrations, so an absent canonical row is corrupted
state rather than a normal editing case. A safe `503` is simpler than virtual rows and repair
upserts.

**Confidence:** High. **Hardening:** Changed after the user's explicit simplicity challenge; the
strongest argument for virtual defaults is improved outage tolerance, but it does not justify a
second representation of persisted state. **Challenger:** diverged in favor of virtual fallback;
the simpler integrity-failure rule was selected after reconciliation.

**User Decision:** Resolved — User accepted revised Option A on 2026-09-15.

### PF-003: Runtime fallback is confused with authoritative Admin reads 🟠 MAJOR

**Dimensions:** Ambiguities; Edge Cases
**Location:** AC-14, AC-19, API Representation, Acceptance Criteria 5 and 10
**Codebase Evidence:** `packages/server/src/lib/system-config.ts:56-85` currently converts database
failure into a fallback, while `packages/server/src/routes/config.ts:59-121` is the authoritative
Admin read surface.

**The Problem:** “Catalog reads” may fall back on database failure, but the UI must reload
authoritative saved values. Returning defaults from the Admin API during a database outage would
misrepresent them as persisted values.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Limit database-failure fallback to runtime typed getters; Admin list/get/update returns one fixed safe `503`. | Preserves authority without degraded-state machinery. | Config is unavailable to operators during the database outage. |
| B | Return fallback values with explicit degraded/provenance metadata. | Keeps read visibility. | Adds state and UI branches solely for an outage in the authoritative store. |

**Recommendation:** Option A. It is direct and cannot present defaults as saved data.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### PF-004: Specialized config audit collides with the generic mutation audit 🟠 MAJOR

**Dimensions:** Implicit Assumptions; Codebase Alignment
**Location:** AC-11, AC-16, Runtime Consumption
**Codebase Evidence:** `packages/server/src/middleware/admin-mutation-audit.ts:6-11,23-29,47-68`
owns config `PUT` requests and emits `admin.mutation.committed`; it is mounted before the config
router at `packages/server/src/server.ts:245,323-327`.

**The Problem:** Adding the required `admin.config.updated` event produces two audit rows; keeping
only the generic event produces the wrong event and metadata.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Exclude `/api/admin/config` from the generic wrapper. Let config updates own one existing PostgreSQL transaction, specialized audit row, and post-commit cache clear. | Matches the existing self-managed-prefix pattern. | Duplicates a small amount of transaction orchestration. |
| B | Generalize the middleware with route-selected audit events and metadata. | Centralizes orchestration. | Adds a new framework surface for one feature. |

**Recommendation:** Option A. It reuses an existing exception pattern without generalization.

**Confidence:** High. **Hardening:** Rejected a middleware framework as disproportionate.
**Challenger:** converged.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### PF-005: Locale completeness and client-side validation are undefined 🟠 MAJOR

**Dimensions:** Ambiguities; Completeness Gaps; Codebase Alignment
**Location:** AC-08, AC-10, AC-19, Closed Catalog, API Representation
**Codebase Evidence:** `packages/server/src/auth/i18n.ts:45-57,75-97,236-245` keeps namespaces
private, preloads only `en`, and currently treats `common` alone as availability. The API metadata
has no allowed-values field.

**The Problem:** “Complete locale bundle” has no exact rule, and the Admin UI cannot disable Save
for an unsupported locale without receiving the supported values.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Keep one small server `SUPPORTED_LOCALES` allowlist, verify in tests that every listed locale has every required namespace, and expose it as optional `allowedValues` catalog metadata. | Deterministic, direct, and currently just `en`. | Adding a locale requires a code and resource update. |
| B | Discover complete locale directories dynamically and expose the result as `allowedValues`. | File installation alone adds a locale. | Adds runtime filesystem discovery for no current need. |

**Recommendation:** Option A. It provides exact validation without a locale registry or discovery
framework.

**Confidence:** High. **Hardening:** Changed from dynamic discovery to a tested allowlist after the
independent challenge. **Challenger:** diverged, and supplied the smaller choice adopted here.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### PF-006: Invalid canonical values have no migration outcome 🟠 MAJOR

**Dimensions:** Edge Cases; Data and Migration
**Location:** AC-15, Migration and Cleanup, Acceptance Criterion 10

**The Problem:** The migration preserves valid canonical values but never states whether an invalid
type or out-of-range value is reset, retained, or causes the migration to fail.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Write the exact defaults for all 18 canonical keys and delete obsolete public rows. | Smallest deterministic migration; no legacy validation or conversion path. | Replaces any development-only custom values. |
| B | Preserve valid values and validate or repair invalid values individually. | Retains development customization. | Adds legacy inspection and branching despite the confirmed unused-product boundary. |

**Recommendation:** Option A. Porta has no adopted production configuration and development systems
can be reset, so unconditional canonical defaults avoid a legacy migration subsystem.

**Confidence:** High. **Hardening:** Simplified further after the user's explicit complexity check.
**Challenger:** diverged in favor of fail-fast validation; that protects adopted data which this
repository explicitly does not have.

**User Decision:** Resolved — User accepted revised Option A on 2026-09-15.

### PF-007: A literal cross-workspace catalog constant has no dependency path 🟠 MAJOR

**Dimensions:** Dependency Issues; Feasibility Concerns; Scope Creep Indicators; Codebase Alignment
**Location:** Closed Catalog
**Codebase Evidence:** `packages/server/package.json` has no SDK dependency,
`packages/sdk/package.json` is independently published with no runtime dependencies, and only
`packages/cli/package.json` depends on the SDK.

**The Problem:** One imported constant cannot directly source the server, independently published
SDK, CLI, Admin UI, and SQL migration without a new shared package, reversed server-to-SDK
dependency, or code generation.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Make one server catalog the runtime authority; API metadata drives CLI/Admin UI; the SDK owns small public types; contract tests prove exact agreement. The SQL migration duplicates only required seed facts and is checked against the catalog. | Preserves package direction and adds no package or generator. | SDK and SQL parity is enforced by tests rather than imports. |
| B | Add a shared contracts package or generation pipeline. | Structurally shares data. | Expands release topology and maintenance for 18 fixed keys. |

**Recommendation:** Option A. It is the only viable choice inside the approved complexity boundary.

**Confidence:** High. **Hardening:** Explicitly rejected new package and generation surfaces.
**Challenger:** converged.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### PF-008: Recovery TTL is attached to the wrong lifecycle point 🟠 MAJOR

**Dimensions:** Codebase Alignment; Consistency
**Location:** Runtime Consumption and Acceptance Criterion 9
**Codebase Evidence:** `packages/server/src/auth/recovery-service.ts:36-59` enqueues work without
creating a token; `packages/server/src/auth/recovery-job-processor.ts:57-88` reads the TTL and
creates the expiring token artifact.

**The Problem:** Requiring “job creation” to read the TTL is stale. It would either read an unused
value or require storing a TTL snapshot in the durable job.

**Viable resolution:** Require the existing processor to read the current value when it creates the
token. Queued but unprocessed work uses the value at processing time; issued tokens keep their
absolute expiry. Snapshotting at enqueue was rejected because it adds schema/state without benefit.

**Recommendation:** Apply the direct resolution above.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — User accepted the direct resolution on 2026-09-15.

### PF-009: Duration changes do not define effects on existing state 🟠 MAJOR

**Dimensions:** Edge Cases; Feasibility Concerns; Security Blind Spots
**Location:** AC-03–AC-06, AC-12–AC-14, Runtime Consumption, Acceptance Criterion 9
**Codebase Evidence:** `packages/server/src/auth/rate-limiter.ts:104-114` sets Redis expiry only when
a counter starts. Tokens, invitations, and sessions store absolute expiries, while automatic locks
store only `locked_at` (`packages/server/src/users/repository.ts:589-607`).

**The Problem:** The RD does not say whether changed durations rewrite existing tokens, locks,
sessions, invitations, or Redis counter windows. Retroactive rewriting would require unapproved
database and Redis scans.

**Viable resolution:** New tokens, invitations, locks, sessions, and counters use the new duration
when their governing setting becomes active. Existing absolute expiries and active Redis-window
expiries remain unchanged. A changed rate-limit maximum applies on the next decision even for an
existing counter. Startup-loaded OIDC durations apply after restart. No state rewrite occurs.

**Recommendation:** Apply this prospective-only rule. Emergency revocation remains a separate
operation, not configuration-save behavior.

**Confidence:** High. **Hardening:** Explicitly removed Redis/database cleanup machinery.
**Challenger:** converged.

**User Decision:** Resolved — User accepted the direct resolution on 2026-09-15.

**Iteration 2 evidence:** Reopened. Both automatic-lock eligibility paths derive the cutoff from the
current `lockout_duration_seconds` value
(`packages/server/src/users/service.ts:476-486,660-675`). The corrected prospective-only wording
therefore contradicts the existing direct model.

**Iteration 2 options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Existing automatic locks use the current configured duration on their next eligibility check; stored token/session/invitation and Redis expiries remain unchanged. | Matches the current schema and needs no migration. | Increasing or decreasing the setting changes the effective duration of an active lock. |
| B | Persist an absolute lock deadline or duration snapshot for every lock. | Freezes each lock under its creation-time policy. | Adds schema, backfill, write-path, and mixed-version behavior solely for this setting. |

**Iteration 2 recommendation:** Option A. The lock model is intentionally simple; Option B is an
unapproved persistence expansion.

**Confidence:** High. **Hardening:** Corrected the earlier assumption that locks stored an absolute
expiry. **Challenger:** converged strongly on Option A.

**Iteration 2 User Decision:** Resolved — User accepted Option A on 2026-09-15.

**Iteration 3 verification:** RD-03 now distinguishes stored absolute expiries from automatic locks.
It states that existing locks use the current configured duration on their next eligibility check,
matching `packages/server/src/users/repository.ts:589-607` and
`packages/server/src/users/service.ts:476-486,660-675`. No schema or rewrite machinery remains.

### PF-010: Literal second-process verification invites a new harness 🟠 MAJOR

**Dimensions:** Testability; Scope Creep Indicators
**Location:** Verification Contract and Acceptance Criterion 8
**Codebase Evidence:** `packages/server/src/lib/system-config.ts:44-80` implements one deterministic
process-local cache expiry and re-query contract. Existing config tests use one module/process.

**The Problem:** Requiring an observed second healthy process can add a new multi-process harness,
even though each process independently follows the same 60-second cache rule. That support surface
is disproportionate and was not approved.

**Complexity escalation stop packet:**

- **Original goal:** prove other instances converge through the existing 60-second local cache.
- **Named extra system/support code:** a second-server/process integration harness and its lifecycle.
- **Why it may appear needed:** the acceptance text literally names a second process.
- **Codebase evidence:** the behavior is fully determined by the cache expiry/re-query code above;
  no cross-process channel exists or is requested.
- **Smallest solution that works:** deterministic test that an old cached value survives an external
  database update until cache expiry and that the next read re-queries and observes it.
- **Extra cost:** process startup, ports, database coordination, timing, cleanup, and flaky wall-clock
  behavior.
- **Independent verdict:** use the deterministic cache test; do not add a process harness.
- **Direct user decision:** Use the deterministic cache test; no process harness (approved
  2026-09-15).

**Viable resolution:** Replace the literal second-process test requirement with the deterministic
cache-expiry/re-query proof above, while retaining the documented operational 60-second boundary.

**Recommendation:** Apply the direct resolution. A cache factory created only to imitate multiple
instances is also unnecessary.

**Confidence:** High. **Hardening:** Rejected both a process harness and a new cache abstraction.
**Challenger:** converged.

**User Decision:** Resolved — User accepted the direct resolution on 2026-09-15.

### PF-011: Single-update response shape is incomplete 🟡 MINOR

**Dimensions:** Completeness Gaps; Consistency
**Location:** AC-11, AC-13, API Representation

**The Problem:** The batch success response is described, but the single-update success envelope is
not, even though both must return `restartRequired`.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Specify single `{ data: ConfigEntry, restartRequired }` and batch `{ data: ConfigEntry[], restartRequired }`. | Preserves natural single-resource and collection shapes. | The `data` field has two cardinalities. |
| B | Return an array from both endpoints. | One cardinality. | Makes the single-resource endpoint artificial and changes more existing SDK behavior. |

**Recommendation:** Option A. The methods are already distinct and can share the entry schema.

**User Decision:** Resolved — User accepted Option A on 2026-09-15.

### Adversarial Review Check

- The scan rejected the assumption that a single constant can cross package and SQL boundaries
  without adding infrastructure.
- The scan rejected retroactive expiry rewriting and a second-process harness as unnecessary
  complexity.
- The security-sensitive unresolved items are API non-enumeration, authoritative Admin reads,
  migration treatment of invalid policy, and prospective-only policy changes.
- No external protocol conformance claim is introduced by RD-03.

### Verdict

**✅ PREFLIGHT PASSED — all 11 findings resolved.** PF-001–PF-011 are corrected and verified. The
approved artifact remains within the smallest design: no shared package, generalized framework,
distributed invalidation, repair workflow, state rewrite, concurrency mechanism, or process harness.
