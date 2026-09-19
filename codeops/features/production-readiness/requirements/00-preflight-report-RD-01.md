# Preflight Report: RD-01 Production Security Corrections

> **Status**: ✅ PREFLIGHT PASSED — all 10 findings resolved
> **Iteration**: 2 (bounded re-scan after authorized fixes)
> **Previous Iteration**: 10 findings — all resolved
> **This Iteration**: 0 new findings
> **Carried Forward**: none
> **Artifact**: single requirement at `codeops/features/production-readiness/requirements/RD-01-production-security-corrections.md`
> **Artifact SHA-256**: `0cb8973710824d0034e9765abeac6cc0d0434efc69abd13f3177c523c412af2b`
> **Codebase Grounded**: 17 source files, 8 test files, and 8 configuration/documentation files examined; 16 named references verified
> **Scope Mode**: strict
> **Modification Set**: none until the user authorizes accepted fixes
> **Last Updated**: 2026-09-12
>
> **SAME-SESSION REVIEW:** This requirement was created in the current working session. Independent clustered auditors and a separate recommendation challenger were used to reduce same-agent bias. A human security review remains advisable before production deployment.

## Audit Scope

| Role | Documents |
|---|---|
| Audit target | `RD-01-production-security-corrections.md` |
| Context only | `requirements/README.md`, `requirements/00-ambiguity-register.md`, project `AGENTS.md` |

The confirmed baseline is limited to encrypted and atomic signing-key handling, single-use TOTP,
the directly required migration/tests, and accurate operator guidance. No new service, worker,
queue, compatibility layer, or dynamic provider-rebuild mechanism is authorized.

## Codebase Context Summary

**Tech stack:** Node.js 24 TypeScript ESM, Koa, `oidc-provider`, PostgreSQL through `pg`, Redis,
OTPAuth 9.5.1, Vitest, Playwright, and the repository assurance harness.

**Architecture:** Koa Admin mutations already share a request-owned PostgreSQL transaction and
durable audit boundary. Signing keys are loaded into an in-process cache and then passed once to
the OIDC provider at startup. TOTP setup and authentication use service and repository functions
over one `user_totp` row per user.

**Key files examined:**

- `packages/server/src/routes/keys.ts`
- `packages/server/src/lib/signing-keys.ts`
- `packages/server/src/lib/signing-key-crypto.ts`
- `packages/server/src/lib/database.ts`
- `packages/server/src/middleware/admin-mutation-audit.ts`
- `packages/server/src/two-factor/{totp,types,repository,service,cache}.ts`
- `packages/server/src/routes/two-factor.ts`
- `packages/server/src/{index,server}.ts`
- migrations `008`, `012`, and `015`, plus current migration inventory
- directly affected unit, integration, UI, pentest, and assurance tests
- public README, environment, deployment, migration, and Docker guidance

**External standard check:** RFC 6238 requires a successfully validated OTP not to be accepted a
second time and recommends a 30-second time step and a bounded delay window. The RD's replay goal
and fixed 30-second contract align with [RFC 6238 sections 5.2 and 6](https://www.rfc-editor.org/rfc/rfc6238.html#section-5.2).

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
|---:|---|---:|---|
| 1 | Ambiguities | 1 | 🟠 Major |
| 2 | Implicit Assumptions | 0 | — |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 2 | 🟠 Major |
| 5 | Dependency Issues | 0 | — |
| 6 | Feasibility Concerns | 0 | — |
| 7 | Testability | 2 | 🟡 Minor |
| 8 | Security Blind Spots | 2 | 🟠 Major |
| 9 | Edge Cases | 2 | 🟠 Major |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 0 | — |
| 12 | Consistency | 0 | — |
| 13 | Codebase Alignment | 1 | 🟠 Major |

## Summary by Severity

| Severity | Count | Status |
|---|---:|---|
| 🔴 Critical | 0 | — |
| 🟠 Major | 6 | All resolved |
| 🟡 Minor | 4 | All resolved |
| 🔵 Observation | 0 | — |

---

## Findings

### PF-001: Key transaction ownership conflicts with the existing Admin mutation boundary 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** Technical Requirements, “Signing-Key Storage and Transactions,” lines 116–127

**Codebase Evidence:** `packages/server/src/server.ts:243` mounts the generic Admin mutation
transaction before the key router. `packages/server/src/middleware/admin-mutation-audit.ts:19-64`
owns the transaction and durable audit row. `packages/server/src/lib/database.ts:34-65` routes
`getPool()` through that client and provides the exact post-commit hook.

**The Problem:** The instruction that rotation shall check out, commit, roll back, and release its
own client can lead implementation to open a second transaction. Key state could then commit even
if the outer Admin mutation/audit transaction fails, and cache clearing in the route would still
occur before the real outer commit.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Require key routes to reuse `adminMutationAudit()`, `getPool()`, and `afterDatabaseCommit()`; an extracted function may use nested-safe `runDatabaseTransaction()`. | Preserves the existing atomic audit boundary with minimal code. | Requires correcting the RD's client-ownership wording. |
| B | Exclude key routes from generic handling and self-manage mutation, audit, and cache timing. | Gives the key module full ownership. | Duplicates established infrastructure and adds failure paths. |

**Recommendation:** Option A. The existing transaction system already provides every required
property and is the smallest correct design.

**Confidence:** High. **Hardening:** Independent challenger confirmed Option A after checking the
middleware order and transaction proxy.

**User Decision:** Resolved — User accepted recommendation: Option A, reuse the existing Admin
transaction and post-commit boundary.

### PF-002: TOTP enrollment confirmation is not rate-limited 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** AC-10, AC-13, and Security Considerations “Rate limiting”

**Codebase Evidence:** `packages/server/src/routes/two-factor.ts:75-79,328-352` defines and applies
the `2fa_verify` limit to normal verification. The enrollment path at
`packages/server/src/routes/two-factor.ts:647-708` reaches `confirmTotpSetup()` without that check.

**The Problem:** The RD says setup and verification retain rate limiting, but setup confirmation
has no existing limiter. Leaving it unchanged preserves an unlimited online six-digit-code attempt
surface and contradicts the project's authentication security invariant.

Only one viable resolution remains: apply the existing organization/user-scoped `2fa_verify`
limiter to enrollment confirmation. Deliberately allowing unlimited confirmation was rejected as
unsafe.

**Recommendation:** Reuse the existing limiter and existing public rate-limit handling. This adds
no new subsystem.

**Confidence:** High. **Hardening:** Independent challenger confirmed the missing route boundary
and the direct reuse approach.

**User Decision:** Resolved — User accepted recommendation: apply the existing organization/user
2FA verification limiter to enrollment confirmation.

### PF-003: Replay consumption is not bound tightly enough to the validated TOTP row 🟠 MAJOR

**Dimension:** Edge Cases

**Location:** TOTP Replay Model, lines 139–150

**Codebase Evidence:** `packages/server/src/two-factor/repository.ts:78-87` loads by user ID.
`packages/server/src/two-factor/service.ts:202-216` can delete and replace a setup row, while setup
and authentication validate a decrypted secret before a later mutation.

**The Problem:** A conditional update by user ID and step alone can validate an old row's secret,
then consume or verify a replacement row created concurrently. Authentication must also refuse an
unverified replacement row.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Bind the conditional update to loaded row ID, user ID, expected `verified` state, and a lower/null prior step. | Short transaction; proof stays bound to the exact secret-bearing row. | Adds predicates to the update. |
| B | Lock the row from read through decryption and validation. | Serializes replacement directly. | Holds a database lock during cryptographic work and is larger than needed. |

**Recommendation:** Option A. A precise compare-and-set update closes the race without longer
transactions.

**Confidence:** High. **Hardening:** Independent challenger confirmed Option A and rejected the
long-lived row lock.

**User Decision:** Resolved — User accepted recommendation: Option A, bind compare-and-set replay
consumption to the loaded row ID, user ID, expected verification state, and prior step.

### PF-004: Unsupported stored TOTP parameters have no consistent public outcome 🟠 MAJOR

**Dimension:** Ambiguities

**Location:** AC-06, AC-10, and AC-13

**Codebase Evidence:** `packages/server/src/two-factor/types.ts:38-50` carries stored algorithm,
digits, and period values. Normal verification collapses service errors to invalid-code at
`packages/server/src/routes/two-factor.ts:367-400`, while setup can reach the outer generic failure
at lines 702–747.

**The Problem:** AC-06 requires unsupported stored parameters to be rejected, but it does not say
whether this server-state fault is a bad-code result or an availability/configuration error. The
two current routes would handle it differently.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Return the ordinary invalid-code outcome in both flows and log a fixed internal event. | Reuses one public response. | Misleads users and can consume retries for an operator-owned fault. |
| B | Return one generic configuration/service-unavailable outcome in both flows and log a fixed safe diagnostic. | Correctly classifies server state without exposing parameter details. | Requires a consistent safe route mapping. |

**Recommendation:** Option B. Unsupported persisted state is not a credential mistake; users
should not be encouraged to retry it.

**Confidence:** High. **Hardening:** Independent challenge changed the initial reviewer preference
from A to B after considering user behavior and rate-limit effects.

**User Decision:** Resolved — User accepted recommendation: Option B, use one safe generic
configuration/service-unavailable outcome in enrollment and authentication.

### PF-005: An in-flight JWKS load can restore stale cache after invalidation 🟠 MAJOR

**Dimension:** Edge Cases

**Location:** AC-03 and Verification Contract signing-key coverage

**Codebase Evidence:** `packages/server/src/lib/signing-keys.ts:45-54` asynchronously loads and then
unconditionally installs cache state. `clearJwksCache()` at lines 60–63 only clears current state.

**The Problem:** A pre-commit cache miss can read old state, pause, and then install it after the
post-commit clear. The next call can therefore return stale state for up to 60 seconds, violating
the explicit immediate-local-visibility contract.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Add a local cache-generation counter and install a load only if its captured generation is still current. | Small, process-local, and preserves AC-03. | Adds one cache invariant and overlap test. |
| B | Weaken AC-03 to permit the existing 60-second TTL. | No cache change. | Does not deliver the approved immediate visibility behavior. |

**Recommendation:** Option A. It is a small local guard, not distributed coordination.

**Confidence:** High. **Hardening:** Independent challenger reproduced the ordering and confirmed
the generation-counter solution.

**User Decision:** Resolved — User accepted recommendation: Option A, protect cache installation
with a local generation counter.

### PF-006: Key rotation has no testable all-instance restart completion rule 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** Errors, Audit, and Availability, lines 164–166; AC-12 and Acceptance Criteria

**Codebase Evidence:** Startup passes a one-time JWKS snapshot to the provider at
`packages/server/src/index.ts:43-53`. `clearJwksCache()` affects only the separate loader cache at
`packages/server/src/lib/signing-keys.ts:29-63`. The CLI currently reports rotation success without
a restart instruction at `packages/cli/src/commands/keys.ts:94-120`.

**The Problem:** Rotation can report success while running providers continue signing with a now
retired key until restart. The RD mentions restart narratively but does not require operator-facing
guidance or post-restart verification.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Require the CLI/operator guidance to say that every instance must restart after generation/rotation, then verify the committed signing state after restart. | Makes the existing startup boundary operationally complete. | Adds a small CLI/docs contract and verification. |
| B | Dynamically rebuild running OIDC providers. | Avoids restart. | Disproportionate, risky, and outside the approved boundary. |

**Recommendation:** Option A. It matches AR-19 and avoids live provider mutation.

**Confidence:** High. **Hardening:** Independent challenger confirmed Option A and found no need
for new coordination machinery.

**User Decision:** Resolved — User accepted recommendation: Option A, require all-instance restart
guidance and post-restart signing-state verification.

### PF-007: “Distinct” production encryption secrets is not testably defined 🟡 MINOR

**Dimension:** Security Blind Spots

**Location:** AC-12 and Security Considerations “Encryption needs”

**Codebase Evidence:** `packages/server/src/config/schema.ts:35-46,108-133` validates each key's
format and known placeholder independently but permits both variables to contain the same value.

**The Problem:** The RD calls these distinct externally supplied keys without saying whether that
means separate variable names or different secret values.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Require different values in production and add one schema test. | Enforces cryptographic domain separation directly. | Adds one production validation rule. |
| B | Define “distinct” as separate variables only and permit equal values. | No runtime change. | Allows one compromised key to expose both domains. |

**Recommendation:** Option A. It is one validation check and matches the stated security intent.

**User Decision:** Resolved — User accepted recommendation: Option A, reject equal production
encryption-key values through the existing configuration schema.

### PF-008: The fixed signing-key failure diagnostic is not precise enough to verify 🟡 MINOR

**Dimension:** Testability

**Location:** AC-05, AC-15, and Acceptance Criterion 5

**Codebase Evidence:** `packages/server/src/lib/signing-key-crypto.ts:114-119` embeds the underlying
crypto message in `SigningKeyCryptoError`. Invalid PEM conversion logs the error object at
`packages/server/src/lib/signing-keys.ts:183-190`, and startup logs the full error at
`packages/server/src/index.ts:96-98` through Pino's stack serializer
(`packages/server/src/lib/logger.ts:39-46`).

**The Problem:** “Fixed non-secret diagnostic” and “same bounded diagnostic class” do not identify
the stable error/message/event boundary. An implementation could still place raw crypto text or a
stack in production logs while nominally throwing one domain class.

Only one viable resolution remains: require one fixed domain error message and one stable
`kid`-only event for invalid signing rows, and require the startup boundary not to serialize the
underlying error or stack. Continuing raw error serialization conflicts with the project security
invariants.

**Recommendation:** Reuse the existing domain error rather than create an error hierarchy, and
test the complete observed production log arguments for forbidden data.

**User Decision:** Resolved — User accepted recommendation: use one fixed signing-key error
diagnostic and one stable `kid`-only log event.

### PF-009: Documentation changes are not covered by the verification contract 🟡 MINOR

**Dimension:** Testability

**Location:** Verification Contract, lines 179–183

**Codebase Evidence:** Root `package.json` defines `docs:build`, while `verify` does not invoke it.
AC-12 changes several public documentation pages.

**The Problem:** The required final verification can pass while documentation links or VitePress
syntax fail.

Only one viable resolution remains: add `yarn docs:build` to the RD-01 verification contract.

**Recommendation:** Add the existing command; no new documentation tooling is needed.

**User Decision:** Resolved — User accepted recommendation: include `yarn docs:build` in
verification of documentation changes.

### PF-010: The public migration index would retain a stale encryption statement 🟡 MINOR

**Dimension:** Completeness Gaps

**Location:** AC-12 documentation inventory

**Codebase Evidence:** `docs/database/migrations.md:56` describes migration 015 as preparation for
future at-rest encryption, which becomes false when every live creation path encrypts and plaintext
loading is rejected.

**The Problem:** AC-12 names several documents but omits this directly contradictory public page.

Only one viable resolution remains: include `docs/database/migrations.md` in the documentation
correction. Applied migration SQL remains historical and is not rewritten.

**Recommendation:** Correct the one public index entry.

**User Decision:** Resolved — User accepted recommendation: correct the stale public migration
index while leaving applied migration SQL unchanged.

## Adversarial Close-Out Check

- The scan did not assume key routes own transactions; it verified middleware order and found the opposite.
- The scan checked the actual enrollment route rather than assuming the existing verification limiter covered it.
- The scan challenged concurrent TOTP row replacement and asynchronous cache invalidation ordering.
- No optional KMS, worker, queue, distributed lock, provider hot reload, or compatibility layer was introduced.
- External TOTP claims were checked against RFC 6238 rather than memory.

## Verdict

**✅ PREFLIGHT PASSED — all 10 findings resolved.**

The bounded iteration-2 scan verified every accepted correction against the codebase and found no
new ambiguity, contradiction, dependency, feasibility, security, edge-case, testability, scope,
ordering, consistency, or alignment defect. RD-01 is ready for implementation planning.
