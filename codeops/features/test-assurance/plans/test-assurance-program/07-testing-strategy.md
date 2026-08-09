# Testing Strategy: Porta Test Assurance Program

> **Parent**: [Plan Index](00-index.md)
> **Method**: independent specification → observed red or controlled-fault red → green → implementation tests → full verification

## Oracle Policy

Specification tests are authored from the RDs, security invariants, published contracts, and
version-qualified standards. They do not derive expectations from Porta production code. Internal
imports are permitted only in fixture arrangement tests and live in `*.impl.test.ts`; black-box
sentinels observe HTTP, browser, cookie, email, packed SDK, or CLI behavior.

For an already-correct legacy implementation, the first specification run may be green. The task
records that result and obtains red evidence by executing the designated curated fault. Expectations
are never intentionally made wrong merely to manufacture red.

## Specification Test Cases

### Assurance governance and evidence

| ID     | Scenario                                                                                    | Exact expected behavior                                                             | Source     |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| ST-01  | Validate a complete claim                                                                   | Schema accepts it and preserves every required field                                | R1.1, AC1  |
| ST-02  | Duplicate claim IDs                                                                         | Validation exits non-zero and names the duplicate                                   | R1.10, AC2 |
| ST-03  | Critical claim lacks a negative sentinel                                                    | Validation rejects it                                                               | R1.3, AC3  |
| ST-04  | Claim references a missing test/case                                                        | Validation rejects the exact reference                                              | R1.10      |
| ST-05  | Mark claim assured with a gap, stale evidence, failed verify, or no killed fault            | Every invalid transition is rejected                                                | R1.8, AC4  |
| ST-06  | Import current inventory into an empty catalog                                              | Zero claims become assured                                                          | R1.9, AC7  |
| ST-07  | Render evidence containing token/password/cookie/client-secret canaries                     | None of the canaries appear in output                                               | R1.5, AC5  |
| ST-08  | Record a confirmed product defect                                                           | Claim becomes blocked; routing record changes; production source is untouched       | R1.7, AC6  |
| ST-08A | Validate an oracle that imports a production helper or copies current output                | Validation rejects the self-derived expectation                                     | R1.2       |
| ST-08B | Review conditional exits, swallowed setup, broad status allowlists, and `not 500` sentinels | Every vacuous sentinel is rejected or remains untrusted                             | R1.4       |
| ST-08C | Complete surface review with insufficient evidence                                          | A named gap is mandatory and the report cannot imply safety                         | R1.6       |
| ST-08D | Validate decomposition of every supported external surface                                  | OIDC/admin/SDK/CLI/email/config/lifecycle domains each map to exact contract claims | R4.1       |
| ST-08E | Validate new test naming and runner ownership                                               | New specs/implementation tests use required names and exactly one runner            | R4.3       |

### Harness lifecycle and fixtures

| ID     | Scenario                                                                         | Exact expected behavior                                                                         | Source           |
| ------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| ST-09  | Redis reset fails                                                                | Dependent project aborts before assertions                                                      | R2.4–R2.5, AC2   |
| ST-10  | MailHog reset returns non-success                                                | Dependent project aborts before assertions                                                      | R2.4–R2.5, AC2   |
| ST-11  | DNS, health, migration, seed, or fixture verification fails                      | Harness exits non-zero with the failed prerequisite                                             | R2.5             |
| ST-12  | Start/stop/signal succeeds or fails                                              | Only identity-matched owned resources are removed or exactly reported                           | R2.3, AC1        |
| ST-13  | Inspect fixture manifest                                                         | Alpha/bravo have disjoint tenant data; global apps/roles and super-admin actors are explicit    | R2.6–R2.8, AC3   |
| ST-13A | Inspect public/confidential positive and deliberately invalid clients            | Redirects, origins, grants, scopes, credentials, and tenant associations are distinct and exact | R2.8             |
| ST-14  | Tenant-A actor addresses tenant-B resource                                       | Fixture is unambiguous and tenant-B identity is independently observable                        | R2.6, R2.10, AC4 |
| ST-15  | Run selected suite twice in reverse/shuffled order                               | Outcomes match and no durable/cache/mail/session residue remains                                | R2.9, AC5        |
| ST-16  | Enumerate specification imports                                                  | No production module calculates an expected result                                              | R2.10, AC6       |
| ST-17  | Collect Playwright tests                                                         | `spa`, `bff`, `protocol`, `security`, `compatibility` each own files exactly once               | R2.2, AC7        |
| ST-18  | Search production source after harness changes                                   | No assurance-only reset/bypass/fault control exists                                             | R2.11, AC8       |
| ST-18A | Race two worktrees for endpoints and interrupt one                               | Atomic leases differ; cleanup is fenced; stale reclaim proves owner absence                     | R2.3, R7.10, AC9 |
| ST-18B | Interrupt each durable reset boundary                                            | Pre-mutation retry is safe; post-mutation run is poisoned and stack recreated                   | R2.4–R2.5, AC10  |
| ST-18C | Inspect retained harness topology and package graph                              | Existing services remain in one harness; no harness workspace/package/framework is added        | R2.1             |
| ST-18D | Generate configuration, credentials, certificates, traces, reports, and coverage | Every generated/sensitive path is ignored and absent from commits                               | R2.12            |

### Coverage attribution and ratchets

| ID     | Scenario                                                    | Exact expected behavior                                                                   | Source     |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| ST-19  | Run one fixed harness seed with process capture             | Every raw script is provenance-bound and classified; eligible Porta output exists         | R3.1–R3.6  |
| ST-20  | Gracefully stop versus forcibly terminate a fixture process | Graceful run emits complete data; incomplete run is invalid, never baseline               | R3.2–R3.3  |
| ST-21  | Remap known executed/unexecuted compiled branches           | TypeScript paths and counts match sampled source-map lines                                | R3.3–R3.6  |
| ST-22  | Supply mismatched revision/map/image identity               | Converter rejects the run                                                                 | R3.3, R3.5 |
| ST-23  | Execute two clean fixed-seed runs                           | Exact totals and covered counts are identical                                             | R3.7, AC5  |
| ST-24  | Apply observation policy                                    | Threshold miss reports but does not fail ordinary verification                            | R3.7       |
| ST-25  | Reduce covered count after baseline                         | No-regression command fails and names metric/file                                         | R3.8       |
| ST-26  | Increase total count without evidence                       | Ratchet reports unexplained growth and fails governed lane                                | R3.8       |
| ST-27  | Attempt to merge unmatched Vitest/harness reports           | Reports remain distinct and merge is rejected until equivalence exists                    | R3.4–R3.5  |
| ST-27A | Apply a local no-regression ratchet or per-slice floor      | Exact counts fail on regression; a slice floor is accepted only after claim/fault closure | R3.8–R3.9  |

### Tenant isolation and administrative authorization

| ID    | Scenario                                                                                                                                            | Exact expected behavior                                                                                     | Source    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| ST-28 | Ordinary alpha principal uses ID/slug/list/write paths for bravo-owned user/client/session/token/data                                               | Contract denial/not-found and independent bravo non-mutation                                                | R5.2–R5.3 |
| ST-29 | Authorized super-admin control reaches each admin handler; then permission or target organization is varied                                         | Control succeeds; negative variant is denied at the intended authorization/resource boundary                | R5.2–R5.3 |
| ST-30 | Concurrent alpha/bravo OIDC requests warm issuer and tenant caches                                                                                  | Issuers, cache keys, sessions, and responses never cross tenants                                            | R5.3      |
| ST-31 | Warm caches, then remove admin role, deactivate/suspend actor, and revoke session through supported APIs; reuse old/fresh clients and restart Porta | Privilege is denied with no side effect; organization reassignment/removal is not-applicable or a named gap | R5.3      |
| ST-32 | Exercise full, limited, and unprivileged super-admin-org actors against global app/role and tenant-owned targets                                    | Only the exact documented super-admin exception/permission permits each action                              | R5.3      |

### OIDC, ID-token, and opaque-token boundaries

| ID    | Scenario                                                                                                 | Exact expected behavior                                                                                             | Source          |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| ST-33 | Public client omits/wrongs/plain-PKCE or changes redirect by one character                               | Rejected before code issuance; valid S256/exact redirect succeeds                                                   | R5.4            |
| ST-34 | Exchange a code with a different client or redirect, or reuse it sequentially/concurrently               | Binding holds and exactly one durable exchange succeeds                                                             | R5.4, R5.12     |
| ST-35 | State round trip, requested nonce, consent substitution, and confidential-client authentication variants | State is client-verified, nonce is in the ID token, consent cannot cross interaction, and invalid client auth fails | R5.4            |
| ST-36 | Independently verify an issued ID token                                                                  | ES256/P-256 trusted JWKS, exact `kid`/issuer/audience/sub/nonce/exp/nbf all validate                                | R5.5            |
| ST-37 | Forge alg/key/issuer/audience/sub/exp/nbf/unknown-kid and attacker `jku`/`x5u`/embedded-JWK variants     | Independent verifier/real consumer rejects every variant and ignores attacker key locations                         | R5.5            |
| ST-38 | Substitute opaque access, ID, authorization code, and refresh token types at real consumers              | Every wrong token type is rejected without treating opaque access tokens as JWTs                                    | R5.5            |
| ST-39 | Rotate refresh token and replay predecessor concurrently/sequentially                                    | Replacement differs; predecessor replay issues no additional valid token/grant                                      | R5.5, R5.12     |
| ST-40 | Run concurrent alpha/bravo issuer requests and fetch discovery/JWKS                                      | Each issuer and cache context remains request-scoped with no cross-talk                                             | R5.3–R5.5       |
| ST-41 | UserInfo, consent, and logout use wrong client/session/tenant context                                    | No identity, consent, or session state crosses context                                                              | R4.1, R5.4–R5.5 |

### Human authentication, recovery, and distributed consumption

| ID    | Scenario                                                                                                                                 | Exact expected behavior                                                                                                                                       | Source                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| ST-42 | Existing/absent identity login and recovery samples                                                                                      | Status/body/header match; timing uses a pre-measurement security-authority hypothesis, effect bound, power/sample rule, and noise invalidation rule           | R5.6, AC7                              |
| ST-43 | Failed-login/recovery variants exhaust limits and disabled login methods are attempted                                                   | Equivalent inputs share enforcement; disabled methods fail exactly                                                                                            | R5.6                                   |
| ST-44 | Authenticate into an anonymous session, then expire/logout/revoke it                                                                     | Session renews at auth; revoked/expired session is unusable                                                                                                   | R5.6                                   |
| ST-45 | Same-origin, cross-origin/same-site, and loopback-IP cross-site browser requests vary CSRF tokens while production cookies are inspected | Mutation is denied where required; cross-site sending is exact; cookies are Secure/HttpOnly/SameSite/host-only                                                | R2.8, R5.6                             |
| ST-46 | Magic-link/reset/invitation artifacts vary recipient, tenant, expiry, reuse, and exposure channels                                       | Intended synthetic mailbox/tenant within lifetime succeeds once; value appears nowhere outside the allowlisted delivery channel and is redacted from evidence | R5.7                                   |
| ST-47 | Email OTP varies recipient/tenant/expiry/reuse and delivery rate                                                                         | Intended synthetic mailbox only; expiry/single-use/throttling exact; code appears nowhere outside delivery and redacted verification                          | R5.7                                   |
| ST-48 | TOTP enforcement and recovery-code concurrent reuse                                                                                      | 2FA cannot be bypassed; exactly one recovery consume succeeds                                                                                                 | R5.7, R5.12                            |
| ST-49 | Read during consumption and synchronized duplicate consumes for every replay-sensitive artifact                                          | Exactly one durable success; observers never obtain a reusable intermediate value                                                                             | R5.7, R5.12                            |
| ST-50 | Disposable fault pauses/crashes immediately before and after durable commit                                                              | Before-commit retry may succeed once; after-commit retry cannot duplicate the effect                                                                          | R5.7, R5.12, Distributed Interleavings |
| ST-51 | Client times out with unknown outcome, retries, then retries after fresh Porta process                                                   | Durable state decides the result; no duplicate token/session/account effect occurs                                                                            | R5.7, R5.12, Distributed Interleavings |

### Injection, exposure, and P1 administrative data

| ID     | Scenario                                                                                                      | Exact expected behavior                                                                                     | Source      |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| ST-52  | Raw SQL/header-CRLF/XSS-template/prototype/command/path/redirect/slug-tenant payload matrix                   | Exact validation; no execution, pollution, redirect, cross-tenant effect, or internal detail                | R5.8, R5.11 |
| ST-53  | Raw forwarded-host/proto/IP variants under trusted and untrusted proxy profiles                               | Only approved proxy trust affects origin, secure cookies, and rate-limit identity                           | R5.8, R5.11 |
| ST-54  | Unsupported methods, malformed JSON, oversized bodies, and encoding/casing variants                           | Stable bounded rejection with no state change or parser/internal leakage                                    | R5.8, R5.11 |
| ST-55  | CORS/CSP/HTTPS/cookie/security headers under the production-security profile                                  | Only configured origins/methods/headers pass and every required production control is exact                 | R5.8        |
| ST-56  | Force safe DB/cache/mail errors in both profiles                                                              | Public response/log evidence omits stack, SQL, paths, infrastructure, secrets, tokens, and version          | R5.2, R5.8  |
| ST-57  | Paginate/filter tenant-owned admin resources across alpha/bravo                                               | Pages/counts never leak or skip across tenant scope                                                         | R5.9        |
| ST-58  | Audit list/filter/cleanup and forced audit-write failure                                                      | Authorization, event integrity, redaction, cleanup scope, and declared recovery behavior hold               | R5.2, R5.9  |
| ST-59  | Signing-key list/generate/rotate with full/limited actors                                                     | Authorization and lifecycle effects are exact; private material never leaks                                 | R5.9        |
| ST-60  | Session list/detail/revoke across alpha/bravo and dependency failure                                          | Scope, cascade, audit, and declared recovery state are exact                                                | R5.2, R5.9  |
| ST-61  | Configuration read/update with full/limited actors and invalid values                                         | Permission and validation hold; unauthorized/invalid writes do not mutate config                            | R5.9        |
| ST-62  | Bulk/import/export duplicate, collision, provenance, rollback, partial-result, sensitivity, and tenant matrix | Executes only after approved oracle; otherwise claims remain blocked                                        | R5.9, R4.12 |
| ST-63  | Validate each slice profile and observe required security/audit event plus recovery state                     | Missing matrix/log/recovery fields fail validation; emitted evidence is privacy-safe                        | R5.2, R5.10 |
| ST-63A | Review/classify existing tests and run every pre-existing server pentest after a slice                        | Tests receive an explicit evidence class; no pentest is deleted, skipped, relaxed, or replaced              | R4.2, R5.13 |
| ST-63B | Force one independently verified invariant violation                                                          | Expected oracle remains; affected claim/slice blocks and separate defect routing is created                 | R5.14       |
| ST-63C | Attempt to execute or close risk slices out of order                                                          | P0 tenant/admin, protocol/token, human auth, then P1 order is enforced unless an active exploit is recorded | R5.1        |

### Fault sensitivity and packed-client compatibility

| ID     | Scenario                                                                              | Exact expected behavior                                                                                | Source                      |
| ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| ST-64  | Fault target/revision or tuple metadata mismatches                                    | Runner reports `invalid`; no tuple or claim is killed                                                  | R6.1–R6.4                   |
| ST-65  | Fault causes build/setup/unrelated failure                                            | Result is distinct invalid/infrastructure failure, never killed                                        | R6.3                        |
| ST-66  | One fault has multiple claim–sentinel–signature tuples or a legacy-green spec         | Each tuple independently produces its exact failure before its claim may close                         | R6.1, R6.3–R6.6, R6.9, R7.4 |
| ST-67  | Fault survives or times out                                                           | Claim stays incomplete and survivor/invalid action is exact                                            | R6.3, R6.5, R6.8–R6.9       |
| ST-68  | Fault runner completes/fails/times out/is signalled                                   | Primary tree is unchanged; owned worktree/stack/image/evidence is removed or exactly recoverable       | R6.2–R6.3, R6.10            |
| ST-68A | Attempt automated mutation before curated reliability or outside include-only targets | Pilot refuses to run; compatible bounded pilot reports survivors without source-tree mutation          | R6.7                        |
| ST-69  | Install local SDK/CLI archives outside workspace and bind current triplet identity    | Declared exports/bin load from `dist`; CLI resolves local SDK; only current server/clients are claimed | R4.4–R4.5, R4.10            |
| ST-70  | Packed SDK performs live read/write/list/pagination and negative operations           | Exact public results/errors and independent server state match contract                                | R4.6, R4.9–R4.11            |
| ST-71  | Packed CLI performs live positive/negative operations                                 | Exit/stdout/stderr and independently observed server state match contract                              | R4.7, R4.9–R4.11            |
| ST-72  | Packed CLI success/failure/timeout/SIGINT/SIGTERM with isolated `HOME`                | Temporary credentials are removed and caller's real credential fingerprint is unchanged                | R4.8, R4.10, AC7/AC9        |
| ST-73  | Scan consumer dependency graph and loaded paths                                       | No registry SDK substitute, workspace source, alias, or symlink is loaded                              | R4.4–R4.5, R4.10, AC10      |

### Continuous assurance commands and policy boundary

| ID    | Scenario                                                                 | Exact expected behavior                                                                                           | Source            |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| ST-74 | Run 100 consecutive completed shuffled executions per promoted candidate | Zero flakes, visible retries, p50/p95; invalid/incomplete run restarts sequence                                   | R7.5, AC4         |
| ST-75 | Force every documented command outcome class                             | Product/test/setup/coverage/fault/cleanup failures have distinct exit/report classes                              | R7.7, R7.10, AC5  |
| ST-76 | Send SIGINT and SIGTERM to each assurance command                        | Owned resources clean or exact bounded recovery output is emitted                                                 | R7.10, AC6        |
| ST-77 | Inspect generated evidence/config/traces and repository status           | Retention/access metadata exists; canaries/generated output are absent from commits                               | R3.10, R7.8–R7.10 |
| ST-78 | Change requirement/fixture/dependency/sentinel                           | Affected claim becomes stale before governed report succeeds                                                      | R7.3, R7.11       |
| ST-79 | Inspect root aliases, final Must roll-up, and read-only CI boundary      | `yarn verify` unchanged; commands exact; Musts report verified/blocked; only a non-enforcing proposal is produced | R7.1–R7.6, R7.12  |

## Implementation Tests

After each component is green, add `*.impl.test.ts` cases for schema error diagnostics, path
canonicalization, lease fencing, poisoned-reset transitions, V8 path classification, source-map
edge cases, redaction boundaries, fault timeout/cleanup, package integrity and SDK resolution,
signal propagation, and report aggregation.
Implementation tests may inspect internals but never replace the black-box sentinels.

## Exact Command Contract

Ordinary manifest IDs match `^[a-z0-9][a-z0-9._-]{0,63}$`; specification IDs match
`^ST-[0-9]{2}[A-Z]?$`, and claim IDs match `^CLAIM-R[1-7]-[0-9]{2}$`. A test-file selector may
instead be a canonical repository-relative path beneath `test-harness/assurance/`;
absolute paths, `..`, control characters, symlink escapes, and unregistered values are rejected.
`<run-id>` is a generated UUID. All artifact paths are ignored and resolve beneath
`test-harness/.assurance-results/<run-id>/`.

| Root alias and selector grammar                                                                                               | Required prerequisites                                                                   |                                                                                                  Initial timeout | Artifact subdirectory               | Resource/signal contract                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------: | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `yarn assurance:test --select <registered-suite\|ST-ID\|internal-test-path>`                                                  | frozen root install; definitions valid; case-declared services healthy                   |                                                                                                            120 s | `test/`                             | Node/tsx internal runner only; no owned stack unless declared; SIGINT/SIGTERM use common cleanup                                                                                                 |
| `yarn assurance:red --case <ST-ID> --signature <signature-id>`                                                                | case/signature registered; pre-existing required lanes green                             |                                                                                                            120 s | `red/`                              | child must fail with exact signature; wrapper succeeds only for that failure; common signal cleanup                                                                                              |
| `yarn assurance:baseline --case <ST-ID>`                                                                                      | case registered; required lanes green; fault tuple registered for legacy-green           |                                                                                                            120 s | `baseline/`                         | wrapper succeeds after recording exact natural RED or legacy-green; legacy-green requires the later fault and is not sensitivity evidence                                                        |
| `yarn assurance:validate`                                                                                                     | frozen root install only                                                                 |                                                                                                            120 s | `validation/`                       | no services; validates claims, profiles, commands, faults, and exact traceability graph                                                                                                          |
| `yarn assurance:harness --project <spa\|bff\|protocol\|security\|compatibility> --profile <operational\|production-security>` | DNS/IP-site preflight; Docker; leased endpoints; migrated/seeded healthy stack           |                                                                                                          1,800 s | `harness/<project>/<profile>/`      | owns endpoint lease/stack/clients; signal cleanup or exact recovery report                                                                                                                       |
| `yarn assurance:coverage --project <project-enum> --profile <profile-enum> --seed <registered-seed>`                          | harness prerequisites; matching image/maps; writable raw mount                           |                                                                                                          2,400 s | `coverage/<project>/<profile>/`     | owns capture stack and graceful Node flush; incomplete flush is coverage failure                                                                                                                 |
| `yarn assurance:fault --fault <fault-id> --claim <claim-id> --sentinel <sentinel-id>`                                         | clean baseline; registered tuple; Docker; disposable-worktree support                    |                                                                                                          3,600 s | `fault/<fault>/<claim>/<sentinel>/` | owns worktree/build/image/stack; primary tree immutable; signal cleanup/recovery exact                                                                                                           |
| `yarn assurance:compat --select <ST-69\|ST-70\|ST-71\|ST-72\|ST-73\|compatibility>`                                           | built local SDK/CLI archives; clean consumer; isolated temporary `HOME`; healthy harness |                                                                                                          1,800 s | `compat/<selector>/`                | owns consumer/home/clients; real credential fingerprint unchanged on every outcome                                                                                                               |
| `yarn assurance:report --run <run-uuid>`                                                                                      | sanitized completed/incomplete run manifest exists                                       |                                                                                                            120 s | `summary/`                          | reads one owned run only; pre-write redaction; no service ownership                                                                                                                              |
| `yarn assurance:stability --command <test\|harness\|coverage\|fault\|compat> --seed-set <registered-set>`                     | child alias prerequisites; fixed registered seed set; empty sequence state               | per attempt: child timeout + 300 s; campaign: at most 125 attempts and `125 × (child timeout + 300 s)` wall time | `stability/<command>/<seed-set>/`   | forbids recursive `stability`/`all`; needs 100 consecutive clean completed runs; invalid/incomplete resets the sequence; records every attempt/retry and fails qualification at either cap       |
| `yarn assurance:all`                                                                                                          | all above prerequisites and an explicit local operator start                             |                                                                                                          7,200 s | `all/`                              | sequentially runs validate, internal tests, both-profile registered harness set, fixed coverage, full curated faults, compatibility, and report; stops on first failure and cleans current owner |

| Exit | Stable class          | Meaning and precedence                                                                                                                                 |
| ---: | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
|    0 | `success`             | All requested work passed; for `assurance:red`, the child produced the exact registered non-zero assertion signature                                   |
|   20 | `product-failure`     | Independent oracle shows Porta violates an approved product contract                                                                                   |
|   21 | `test-failure`        | Test/oracle/tool assertion is invalid or fails outside an approved product result                                                                      |
|   30 | `setup-failure`       | Dependency, fixture, DNS, migration, seed, lease, build, or health prerequisite failed                                                                 |
|   40 | `coverage-incomplete` | Capture, flush, provenance, classification, mapping, or reproducibility is incomplete                                                                  |
|   50 | `fault-invalid`       | After a clean baseline, the validated patch makes its disposable target unbuildable/unstartable or its tuple/signature is invalid; a survivor exits 21 |
|   60 | `cleanup-failure`     | Highest precedence: owned cleanup failed and exact identifiers/recovery command are printed                                                            |
|   70 | `timeout`             | Bounded command/child timeout after successful cleanup or recovery report                                                                              |
|  130 | `interrupted-sigint`  | SIGINT received and cleanup completed; cleanup failure instead exits 60 and records SIGINT                                                             |
|  143 | `interrupted-sigterm` | SIGTERM received and cleanup completed; cleanup failure instead exits 60 and records SIGTERM                                                           |

Classification is stage-aware and uses this precedence: cleanup failure (60) overrides the primary
outcome while retaining it in evidence; otherwise SIGINT/SIGTERM (130/143), timeout (70), validated
fault-patch invalidity (50), coverage incompleteness (40), baseline/setup failure (30), then product
or test failure (20/21). A baseline or prerequisite build/start/health failure is 30. Only after a
clean baseline and validated patch may a disposable fault target's build/start/signature failure be 50. Product failure 20 requires an approved independent oracle; malformed test/oracle/tool behavior
or a fault survivor is 21.

Phase 1 implements this frozen contract. Before the aliases exist, Tasks 1.1–1.4 use the exact
bootstrap commands declared in the execution plan. After Task 1.4, every task has an explicit
alias/selector binding there. Final local verification runs `yarn assurance:all`, then unchanged
`yarn verify`, `yarn test:ui`, and `yarn harness:test`.

## Traceability Coverage

The committed `test-harness/assurance/traceability.json` is the executable authority for
`requirement → ST/subcase → execution task → claim`. Its exact planned seed is
[08-traceability-matrix.md](08-traceability-matrix.md). Validation fails for an unmapped Must,
missing task/claim/case, wrong source clause, or dangling edge.
