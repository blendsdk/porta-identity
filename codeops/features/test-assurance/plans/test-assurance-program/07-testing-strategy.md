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

| ID    | Scenario                                                                         | Exact expected behavior                                                       | Source     |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| ST-01 | Validate a complete claim                                                        | Schema accepts it and preserves every required field                          | R1.1, AC1  |
| ST-02 | Duplicate claim IDs                                                              | Validation exits non-zero and names the duplicate                             | R1.10, AC2 |
| ST-03 | Critical claim lacks a negative sentinel                                         | Validation rejects it                                                         | R1.3, AC3  |
| ST-04 | Claim references a missing test/case                                             | Validation rejects the exact reference                                        | R1.10      |
| ST-05 | Mark claim assured with a gap, stale evidence, failed verify, or no killed fault | Every invalid transition is rejected                                          | R1.8, AC4  |
| ST-06 | Import current inventory into an empty catalog                                   | Zero claims become assured                                                    | R1.9, AC7  |
| ST-07 | Render evidence containing token/password/cookie/client-secret canaries          | None of the canaries appear in output                                         | R1.5, AC5  |
| ST-08 | Record a confirmed product defect                                                | Claim becomes blocked; routing record changes; production source is untouched | R1.7, AC6  |

### Harness lifecycle and fixtures

| ID    | Scenario                                                    | Exact expected behavior                                                           | Source         |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| ST-09 | Redis reset fails                                           | Dependent project aborts before assertions                                        | R2.4–R2.5, AC2 |
| ST-10 | MailHog reset returns non-success                           | Dependent project aborts before assertions                                        | R2.4–R2.5, AC2 |
| ST-11 | DNS, health, migration, seed, or fixture verification fails | Harness exits non-zero with the failed prerequisite                               | R2.5           |
| ST-12 | Start/stop succeeds or test fails                           | Only the run's recorded stack/processes/volumes/ports are removed                 | R2.3, AC1      |
| ST-13 | Inspect fixture manifest                                    | Two ordinary tenants have disjoint apps, clients, users, roles, and secrets       | R2.6–R2.8, AC3 |
| ST-14 | Tenant-A actor addresses tenant-B resource                  | Fixture is unambiguous and tenant-B identity is independently observable          | R2.6, AC4      |
| ST-15 | Run selected suite twice in reverse/shuffled order          | Outcomes match and no durable/cache/mail/session residue remains                  | R2.9, AC5      |
| ST-16 | Enumerate specification imports                             | No production module calculates an expected result                                | R2.10, AC6     |
| ST-17 | Collect Playwright tests                                    | `spa`, `bff`, `protocol`, `security`, `compatibility` each own files exactly once | R2.2, AC7      |
| ST-18 | Search production source after harness changes              | No assurance-only reset/bypass/fault control exists                               | R2.11, AC8     |

### Coverage attribution and ratchets

| ID    | Scenario                                                    | Exact expected behavior                                                     | Source     |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| ST-19 | Run one fixed harness seed with process capture             | Raw V8 records exist only for recorded Porta process/build                  | R3.1–R3.4  |
| ST-20 | Gracefully stop versus forcibly terminate a fixture process | Graceful run emits complete data; incomplete run is invalid, never baseline | R3.3       |
| ST-21 | Remap known executed/unexecuted compiled branches           | TypeScript paths and counts match sampled source-map lines                  | R3.4–R3.6  |
| ST-22 | Supply mismatched revision/map/image identity               | Converter rejects the run                                                   | R3.2, R3.5 |
| ST-23 | Execute two clean fixed-seed runs                           | Exact totals and covered counts are identical                               | R3.7, AC5  |
| ST-24 | Apply observation policy                                    | Threshold miss reports but does not fail ordinary verification              | R3.8       |
| ST-25 | Reduce covered count after baseline                         | No-regression command fails and names metric/file                           | R3.9       |
| ST-26 | Increase total count without evidence                       | Ratchet reports unexplained growth and fails governed lane                  | R3.9       |
| ST-27 | Attempt to merge unmatched Vitest/harness reports           | Merge is rejected until equivalence evidence exists                         | R3.5       |

### P0/P1 functional and security slices

| ID    | Scenario                                                                           | Exact expected behavior                                                        | Source          |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| ST-28 | Tenant-A token reads/writes/lists tenant-B resources by ID and slug                | Exact denial/not-found contract; tenant-B state unchanged                      | R5.1–R5.3       |
| ST-29 | Role without organization membership, and membership without role                  | Both are denied for protected admin action                                     | R5.2            |
| ST-30 | Manipulate tenant path/header/cache key across sessions                            | Authority remains resolved to authenticated organization                       | R5.1, R5.3      |
| ST-31 | Public client omits PKCE or uses plain; redirect differs by one character          | Authorization is rejected before code issuance                                 | R5.4            |
| ST-32 | JWT has wrong alg/key/issuer/audience/expiry or substituted token type             | Protected surface rejects each exact variant                                   | R5.5            |
| ST-33 | Reuse code/refresh token concurrently and sequentially                             | At most one succeeds; replay response and token/grant effects match contract   | R5.6            |
| ST-34 | UserInfo/consent/logout with wrong session/client/tenant                           | No cross-context identity or consent state is disclosed/mutated                | R4.1, R5.4–R5.7 |
| ST-35 | Existing versus absent identity login/recovery requests                            | Stable public status/body/header semantics do not enumerate identity           | R5.8            |
| ST-36 | Exhaust failed-login and recovery rate limits with parameter/header variants       | Equivalent attempts share enforcement; exact retry semantics appear            | R5.8, R5.12     |
| ST-37 | Reuse expired/consumed magic-link or password-reset token                          | Rejected with no password/session mutation                                     | R5.9            |
| ST-38 | Authenticate into an existing anonymous session; then revoke/expire it             | Session identifier renews; revoked/expired session is unusable                 | R5.7            |
| ST-39 | Mutating browser request lacks/mismatches CSRF and cookie attributes are inspected | Request rejected; production cookies remain Secure/HttpOnly/SameSite/host-only | R5.7, R5.11     |
| ST-40 | 2FA required, OTP throttled, recovery code reused concurrently                     | Enforcement holds; one recovery use succeeds; subsequent attempts fail         | R5.10           |
| ST-41 | SQL/slug/path/header/XSS/request-size payload matrix                               | Exact validation response; no injection side effect or internal detail         | R5.12–R5.13     |
| ST-42 | Authenticated CORS, CSP, HTTPS, and security-header probes                         | Only configured origins/methods/headers pass; required headers are exact       | R5.11           |
| ST-43 | Force safe DB/cache/mail error paths                                               | Public error omits stack, SQL, paths, infrastructure, secrets, and version     | R5.13           |
| ST-44 | Cross-tenant bulk/import/export operations and malformed records                   | Authorization and tenant scope hold; atomic/partial outcome matches contract   | R4.10, R5.14    |

### Fault sensitivity, compatibility, and continuous adoption

| ID    | Scenario                                                                     | Exact expected behavior                                                       | Source      |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| ST-45 | Fault target hash/revision mismatches                                        | Runner reports `invalid`; no test is counted as killed                        | R6.1–R6.4   |
| ST-46 | Fault causes build/setup failure                                             | Result is `infrastructure-failed`/`invalid`, never killed                     | R6.4        |
| ST-47 | Fault violates a critical claim                                              | Named sentinel fails with expected signature and clean baseline remains green | R6.5–R6.8   |
| ST-48 | Fault survives                                                               | Claim cannot be assured; survivor and required action are reported            | R6.9–R6.10  |
| ST-49 | Fault run completes/fails/times out                                          | Disposable worktree, stack, image, processes, and staged evidence are removed | R6.3, AC7   |
| ST-50 | Install packed SDK/CLI outside workspace                                     | Imports resolve declared `dist` exports and `porta` resolves packed bin       | R4.7–R4.9   |
| ST-51 | Packed SDK performs representative live operations                           | Exact public results/errors match server contract and tenant scope            | R4.7        |
| ST-52 | Packed CLI performs representative live operations                           | Exit code, sanitized output, and server state match command contract          | R4.8        |
| ST-53 | Scan consumer resolution                                                     | No workspace source/symlink is loaded                                         | R4.9        |
| ST-54 | Run 100 representative shuffled executions                                   | Completed-run flake rate is <1%; p50/p95 and retry-flakes are recorded        | R7.5–R7.7   |
| ST-55 | Generated evidence/config/traces are inspected and repository status checked | Sensitive/generated artifacts are ignored and no secret canary is committed   | R7.8–R7.10  |
| ST-56 | Change a governing requirement/fixture/dependency/sentinel                   | Affected claim becomes stale and governed lane requests rerun                 | R7.3, R7.11 |
| ST-57 | Inspect root commands and CI contracts before promotion                      | `yarn verify` stays unchanged; expensive campaigns remain separate            | R7.1–R7.4   |

## Implementation Tests

After each component is green, add `*.impl.test.ts` cases for schema error diagnostics, path
canonicalization, transactional reset interruption, V8 path normalization, source-map edge cases,
redaction boundaries, fault timeout/cleanup, package integrity parsing, and report aggregation.
Implementation tests may inspect internals but never replace the black-box sentinels.

## Verification Matrix

| Scope                  | Command                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Every task             | Targeted case(s), then `yarn verify`                                                                                               |
| Shell lifecycle change | `bash -n` for changed scripts; `shellcheck` when available                                                                         |
| Compose change         | `docker compose -f test-harness/docker-compose.yml config`                                                                         |
| Harness phase          | `yarn harness:test` or the phase's named project/assurance command                                                                 |
| Packed clients         | Build/pack/install isolated consumer, then compatibility project                                                                   |
| Final                  | `yarn verify`, `yarn test:ui`, `yarn harness:test`, coverage reproducibility, curated fault catalog, artifact/redaction validation |

## Traceability Coverage

ST-01–ST-08 cover RD-01; ST-09–ST-18 cover RD-02; ST-19–ST-27 cover RD-03;
ST-28–ST-44 and ST-50–ST-53 cover RD-04/RD-05; ST-45–ST-49 cover RD-06; ST-54–ST-57
plus the verification matrix cover RD-07. Every RD acceptance criterion is represented by at least
one case or final gate.
