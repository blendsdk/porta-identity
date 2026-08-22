# Current Test Inventory

> **Inventory snapshot date**: 2026-08-22
> **Latest verification checkpoint**: 2026-08-22
> **Assurance architecture update**: 2026-08-22
> **Scope**: All test projects executed by the branch CI workflow
> **Purpose**: Describe what the current suite exercises before any test-trust audit or rewrite

## Executive Summary

Porta has **356 branch-CI test files containing 4,543 currently collected test cases**. The often
quoted “3K+” figure covers only the server's Vitest projects. The complete branch-CI surface also
contains SDK, CLI, browser, external OIDC harness, and repository-structure tests. At the snapshot,
six root-owned assurance-internal files contained 53 governance cases. The assurance program now
contains 113 phase-gated specification and implementation files selected by explicit root commands;
they remain outside the required branch lane until separately authorized.

The repository contains a substantial test investment: **81,182 lines of branch test code** compared with
**47,784 lines of TypeScript production source** across the server, SDK, and CLI. The branch-CI
files account for those 81,182 lines; assurance specification and implementation files add another
14,635 lines. Most cases are
isolated unit tests. Real PostgreSQL, Redis, MailHog, HTTP server, browser, and external-client
layers are also present.

This inventory describes test subjects and execution boundaries. It does not assert that every
test has an independent or sufficiently strict oracle.

## Assurance Closeout Checkpoint

The latest authoritative `yarn verify` checkpoint collected **251 server test files / 3,575
cases**, **31 SDK files / 404 cases**, and **29 CLI files / 356 cases**, in addition to 70
repository-structure cases. The assurance tree contains 113 explicitly selected specification and
implementation files; service-backed journeys and parameterized subtests make a static source
count unsuitable as a runtime total.

The product-remediation suite adds rerunnable enumeration-resistance and magic-link authority
oracles plus implementation tests. They exercise real public route handlers and production worker
logic over PostgreSQL, Redis, MailHog, and SMTP boundaries. Coverage includes equal recovery
responses, account-or-dummy Argon2id verification, durable jobs, retry/lease/shutdown limits,
tenant/interaction-bound magic-link consumption, atomic Redis continuation use, rollback, expiry,
post-commit dependency failure, and privacy-safe diagnostics. Administrative-data specifications
add whole-request bulk validation, tenant-qualified per-item transactions, atomic import modes,
bounded allowlisted exports, and packed SDK/CLI journeys with independent raw-response and state
comparison.

Delivered assurance commands now cover typed governance and traceability, fenced lifecycle and
fixtures, operational and production-security harness profiles, assembled-server V8 attribution,
curated fault tuples and their aggregate catalog campaign, clean packed SDK/CLI consumers, and
risk-sliced tenant/admin, protocol, human-authentication, validation/exposure, and administrative
data observations. Evidence is clean-revision bound, owner-only, redacted, and admitted only when
the applicable lifecycle and cleanup checks succeed.

This checkpoint is deliberately **not** certification and does not claim that Porta has no exploit
paths. The authorized enumeration-work, magic-link authority, administrative-data, and covered
terminal-decision product roots are corrected and rerunnable. Product defects and unresolved
contracts remain separately recorded, including statistical timing authority, TOTP replay
semantics, protocol/forwarding/dependency observation gaps, public nginx version disclosure, SDK cursor
pagination mismatch, and administrative session-identifier exposure. The resumed reliability work
completed the bounded mutation-tool pilot, protocol-model command/signal matrix, 100-run
protocol-candidate qualification, local ratchets, and exhaustive local aggregate/UI collection.
Real alias-stage signal injection remains unqualified, and the CI-promotion output is proposal-only.
Consequently the assurance commands are not authorized for new blocking CI, release, or
merge-policy use.

## Inventory Totals

| Suite                 |   Files |     Cases |   Test LOC | Primary boundary                                          | Required by branch CI       |
| --------------------- | ------: | --------: | ---------: | --------------------------------------------------------- | --------------------------- |
| Server unit           |     163 |     2,860 |     46,453 | Isolated modules; dependencies commonly mocked            | Yes, through `yarn verify`  |
| Server integration    |      33 |       362 |      6,506 | Real PostgreSQL, Redis, and MailHog where applicable      | Yes, through `yarn verify`  |
| Server HTTP E2E       |      20 |       129 |      3,121 | Full Porta server with real infrastructure                | Yes, through `yarn verify`  |
| Server penetration    |      35 |       224 |      5,266 | Attack-oriented HTTP requests against full Porta          | Yes, through `yarn verify`  |
| Server browser UI     |      24 |       132 |      4,783 | Chromium against a real Porta server                      | Yes, separate `ui` job      |
| SDK unit              |      31 |       404 |      5,884 | SDK behavior with mock transports                         | Yes, through `yarn verify`  |
| CLI unit              |      29 |       356 |      6,051 | CLI behavior with mocked SDK calls                        | Yes, through `yarn verify`  |
| External OIDC harness |       6 |         6 |        203 | Dockerized SPA and BFF clients using Porta over HTTP/TLS  | Yes, separate `harness` job |
| Repository structure  |      15 |        70 |      2,915 | Files, manifests, scripts, docs, CI, and package topology | Yes, through `yarn verify`  |
| **Total**             | **356** | **4,543** | **81,182** | —                                                         | **Yes**                     |

Case counts were collected through Vitest's runtime collector, Playwright's `--list` mode, and a
fresh `yarn test:structure` run. Parameterized server tests explain why runtime case counts exceed
static `it(...)` declarations.

## Execution Topology

| Command or job                                                                              | What it executes                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `yarn verify`                                                                               | 70 structure tests, all 3,575 server Vitest cases, 404 SDK tests, and 356 CLI tests, plus lint, typecheck, and builds |
| `yarn assurance:test --select assurance-governance`                                         | 53 root-owned governance specification and implementation cases; intentionally separate from branch CI                |
| `yarn assurance:coverage --project protocol --profile operational --seed coverage-baseline` | Captures observation-only V8 coverage from the assembled Porta process under exact lifecycle and build provenance     |
| `yarn test:ui`                                                                              | 132 Chromium UI cases against a full server with PostgreSQL, Redis, and MailHog                                       |
| `yarn harness:test`                                                                         | Six retained black-box SPA/BFF OIDC scenarios in Docker                                                               |
| CI `verify` job                                                                             | `yarn verify` with PostgreSQL, Redis, and MailHog services                                                            |
| CI `ui` job                                                                                 | Builds packages and runs the Playwright UI suite                                                                      |
| CI `harness` job                                                                            | Runs the independently packaged OIDC harness                                                                          |

The branch workflow therefore executes every suite in this inventory. UI and harness coverage are
not part of the local `yarn verify` command; they are separate CI jobs.

## Server Unit Tests

The server unit project accounts for **2,799 cases (63% of the complete test count)**. One hundred
and four of its 156 files directly call `vi.mock`; other files use spies, passed-in fakes, or real pure
objects. These tests mainly verify module-level logic, returned values, query construction,
dependency calls, error handling, and validation.

| Area            | Cases | What the test files exercise                                                                                                                                                                                                     |
| --------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib`           |   409 | Admin permissions, audit logs, branding assets, bulk operations, cursor pagination, import/export, entity history, ETags, image validation, logging, runtime paths, sessions, signing keys, statistics, and system configuration |
| `routes`        |   298 | Route handlers for applications, clients, claims, interactions, invitations, magic links, password resets, RBAC, statistics, 2FA, and users                                                                                      |
| `middleware`    |   266 | Admin authentication/CORS/rate limits, client-secret hashing, errors, metrics, OIDC CORS, permissions, readiness, logging, security headers, tenant resolution, and token limits                                                 |
| `rbac`          |   253 | Permission and role repositories/services, mappings, user-role assignment, caches, slugs, errors, and types                                                                                                                      |
| `clients`       |   197 | Client repository/service, secret lifecycle and cryptography, login-method resolution, validators, caches, and types                                                                                                             |
| `oidc`          |   168 | Account lookup, adapter selection, provider configuration, CORS, grants, PostgreSQL/Redis adapters, rendering hooks, and missing-session recovery                                                                                |
| `auth`          |   164 | CSRF, email rendering/transport, localization, magic-link sessions, rate limiting, templates, token generation, and token persistence                                                                                            |
| `two-factor`    |   142 | Encryption, OTP, TOTP, recovery codes, repositories, services, caches, errors, and types                                                                                                                                         |
| `custom-claims` |   140 | Claim repositories/services, caches, validators, types, and errors                                                                                                                                                               |
| `users`         |   132 | Lockout, caching, claims, GDPR behavior, passwords, repository/service behavior, types, and errors                                                                                                                               |
| `organizations` |   121 | Organization cache, destruction, repository/service, slugs, super-admin lookup, and types                                                                                                                                        |
| Migrations      |   119 | Migration-file structure and schema expectations without applying the real migration chain                                                                                                                                       |
| `applications`  |   114 | Application cache, repository/service, slugs, and types                                                                                                                                                                          |
| Server CLI      |   114 | Bootstrap, migration command handling, health, initialization, prompts, output, and errors                                                                                                                                       |
| SDK contracts   |    35 | Compile-time/runtime alignment between server routes and SDK bulk, domain, and import contracts                                                                                                                                  |
| Configuration   |    49 | Configuration parsing, validation, defaults, and production constraints                                                                                                                                                          |

## Server Integration Tests

The integration project contains **275 cases**. It uses real infrastructure and directly verifies
persistence and service boundaries without exercising every behavior through public HTTP.

| Area               | Cases | What is exercised                                                                                                                                                     |
| ------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositories       |    98 | Applications, audit logs, clients, organizations, permissions, roles, 2FA, users, and cursor pagination against PostgreSQL                                            |
| Services           |    89 | Branding assets, bulk operations, configuration, import/export, email delivery, entity history, ETag concurrency, invitations, sessions, signing keys, and statistics |
| Migration chain    |    47 | Applied schema objects, constraints, indexes, and migration outcomes in PostgreSQL                                                                                    |
| Adapters           |    17 | PostgreSQL and Redis OIDC adapter persistence behavior                                                                                                                |
| 2FA administration |    15 | Administrative 2FA operations with persistent state                                                                                                                   |
| Tenant middleware  |     6 | Organization resolution backed by real persistence/cache state                                                                                                        |
| CLI initialization |     3 | Initialization behavior against infrastructure                                                                                                                        |

## Server HTTP E2E Tests

The HTTP E2E project starts the assembled Koa/OIDC server and contains **128 cases**.

| Area               | Cases | What is exercised                                                                                            |
| ------------------ | ----: | ------------------------------------------------------------------------------------------------------------ |
| Invalid parameters |    43 | Authorization, consent, login-form, token-exchange, introspection, and revocation input handling             |
| OIDC flows         |    37 | Authorization-code construction/entry, client credentials, discovery, refresh, introspection, and revocation |
| Authentication     |    24 | Password login, magic links, forgotten passwords, and consent interactions                                   |
| Security           |    14 | CSRF, authentication rate limiting, and user-enumeration responses                                           |
| Multi-tenancy      |    10 | Issuer/endpoint resolution and selected tenant-isolation cases                                               |

These are HTTP-level tests, but not all are complete user journeys. Some authorization-code cases
test URL construction or the initial interaction redirect rather than completing login, consent,
code exchange, and token validation.

## Server Penetration Tests

The penetration project sends attack-oriented requests to a full Porta server and contains
**224 cases**.

| Attack family              | Cases | Claimed attack coverage                                                                                      |
| -------------------------- | ----: | ------------------------------------------------------------------------------------------------------------ |
| Authentication bypass      |    34 | Brute force, login-method bypass, session attacks, SQL injection in auth flows, and timing comparisons       |
| Infrastructure             |    34 | CORS, security headers, information disclosure, and HTTP method tampering                                    |
| OIDC attacks               |    34 | Code injection, PKCE bypass, redirect manipulation, refresh replay, scope escalation, and token substitution |
| Admin security             |    33 | IDOR, mass assignment, privilege escalation, 2FA administration, and unauthenticated access                  |
| Injection                  |    24 | Header/CRLF, SQL, template, prototype-pollution, and XSS inputs                                              |
| Magic-link attacks         |    19 | Enumeration, host-header injection, token entropy/prediction, and replay                                     |
| Cryptographic attacks      |    18 | JWT algorithm confusion, payload manipulation, and attacker-controlled key references                        |
| Multi-tenant attacks       |    17 | Cross-tenant authentication, slug injection, and tenant enumeration                                          |
| OIDC client authentication |    11 | Secret validation, malformed credentials, ambiguity, timing, and cross-tenant probing                        |

The test names cover the expected identity-provider threat categories broadly. Assertion strength
varies: the current files include conditional early returns and numerous broad “allowed status” or
“not 500” checks. Those are recorded as quality risks rather than removed from this inventory.

## Browser UI Tests

The UI project runs **134 cases in Chromium only** against a real server.

| Area                          | Cases | What is exercised                                                                                                                                 |
| ----------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and OIDC flows |    96 | Password and magic-link login, consent, invitations, resets, 2FA, userinfo, discovery, login methods, interaction lifecycle, and error states     |
| Browser security              |    29 | Cookie attributes, CSRF behavior, magic-link/reset abuse, tenant branding/status isolation, security headers, console errors, and failed requests |
| Accessibility                 |     5 | Labels, error associations, autofocus, keyboard navigation, and consent buttons                                                                   |
| Infrastructure smoke          |     4 | Health endpoint and seeded user/organization fixtures                                                                                             |

The accessibility cases use targeted DOM assertions; there is no automated axe scan. Firefox,
WebKit, mobile-device projects, visual regression, and snapshot testing are not configured.

## SDK Tests

All **404 SDK cases** are pure unit tests using mock transports. They establish SDK request
construction and response/error handling, but do not prove compatibility against a running Porta
server.

| Area                    | Cases | What is exercised                                                                                                                                                     |
| ----------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain clients          |   160 | Applications, organizations, users, clients, roles, permissions, claims, 2FA, audit, branding, bulk, imports/exports, keys, sessions, statistics, and helper behavior |
| Browser/Node transports |    90 | Headers, body encoding, JSON/error parsing, retries/refresh behavior, timeouts, and transport-specific behavior                                                       |
| Authentication          |    66 | CLI authorization, client credentials, stored tokens, refresh, and token-auth behavior                                                                                |
| Errors                  |    43 | SDK error classes, response mapping, fields, and messages                                                                                                             |
| Type compatibility      |    18 | Public TypeScript type shapes and assignability                                                                                                                       |
| Pagination              |    13 | Page iteration, cursor handling, and termination                                                                                                                      |
| Agent tools             |    11 | Tool definitions and SDK-backed tool invocation                                                                                                                       |
| Client construction     |     3 | Top-level client initialization                                                                                                                                       |

## CLI Tests

All **355 CLI cases** are pure unit tests; command tests generally mock SDK calls.

| Area                   | Cases | What is exercised                                                                                                                                                                      |
| ---------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands               |   230 | Applications, audit, bulk, clients, configuration, diagnostics, exports, health, keys, logout, organizations, provisioning, sessions, statistics, users, version, and identity display |
| Browser authentication |    43 | PKCE, metadata, callback server, browser flow, and refresh-token warnings                                                                                                              |
| Parsers                |    23 | CLI option and structured-value parsing                                                                                                                                                |
| Error handling         |    19 | Error classification and user-facing handling                                                                                                                                          |
| Output                 |    18 | Tables, JSON/output selection, and empty results                                                                                                                                       |
| Credential storage     |    14 | Save/load/delete behavior and file permissions/error cases                                                                                                                             |
| Global options         |     5 | Global CLI option processing                                                                                                                                                           |
| Client factory         |     3 | SDK client construction from CLI configuration                                                                                                                                         |

The suite does not invoke the compiled `porta` executable against a live Porta server. The external
OIDC harness tests the protocol surface, not CLI-to-server compatibility.

## External OIDC Harness

The retained harness provides the most implementation-independent application view, but contains
only **six scenarios**:

| Client type             | Scenarios                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| SPA/public client       | Password login through token/introspection/userinfo, magic-link delivery, and logout                     |
| BFF/confidential client | Password login through token/introspection/userinfo, magic-link delivery, and refresh followed by logout |

It uses separate SPA and BFF applications over the Dockerized network and therefore validates more
of the published integration boundary than server-internal helpers do.

## Repository-Structure Tests

The **70 structure tests** protect the migration result and assurance boundary rather than Porta's
product behavior. They
cover:

- workspace membership, package boundaries, and dependency topology;
- root scripts and Turbo delegation;
- branch-CI jobs, services, and prohibited publishing/deployment behavior;
- public-versus-technical documentation boundaries and link resolution;
- server package contents, build entry points, Docker paths, and retained test files;
- CI loopback DNS and TLS certificate configuration;
- TypeScript version alignment and dependency-maintenance commands;
- removal of retired playgrounds, obsolete wrappers, and obsolete guidance.

## Assurance Foundation

The root-owned assurance suite adds immutable requirement-derived specifications and separate
implementation diagnostics without creating another workspace or test framework. Its governance
selector contains 53 cases that validate typed claim/evidence records, exact traceability,
canonical path and inventory ownership, command/exit contracts, clean committed-source
provenance, secret and personal-data redaction, deterministic reports, and bounded descendant
cleanup after signals or timeouts. Additional phase selectors cover lifecycle, fixtures, project
collection, assembled-process coverage, curated-fault execution, and packed-client foundations.

The curated-fault runner applies one reviewed patch in a disposable Git worktree only after the
clean revision, exact target digest, registered claim/sentinel tuple, and one-target patch scope
agree. A kill requires a closed sentinel output grammar; signals, timeouts, unrelated output, or
incomplete cleanup cannot retain killed claims. Cleanup removes only the registered disposable
worktree and never prunes unrelated worktree metadata.

The packed-client foundation builds the current SDK and CLI from a clean detached source worktree,
packs each archive twice, and installs both as explicit local `file:` dependencies into an ignored
consumer outside every workspace. It verifies archive and installed-content digests, resolves every
declared SDK export from inside the installed package, requires SDK and CLI entry points to use
compiled `dist` output, and runs CLI outcomes under fresh owner-only temporary home directories.
The caller's real credential path is compared by fingerprint only and is never read into evidence.

Passing these foundation cases does not make a Porta behavior claim assured. A claim can transition
to `assured` only when its canonical sentinels and exact owned result/fault artifacts match a clean
committed tree and it has no named gaps. Black-box behavioral evidence is delivered by later
assurance phases.

## Cross-Layer Product Coverage

| Product behavior            |             Unit             |       Integration       |      HTTP E2E      |      Pentest       |        Browser        |      External harness      |
| --------------------------- | :--------------------------: | :---------------------: | :----------------: | :----------------: | :-------------------: | :------------------------: |
| Password authentication     |             Yes              |         Partial         |        Yes         |        Yes         |          Yes          |            Yes             |
| Magic-link authentication   |             Yes              |         Partial         |        Yes         |        Yes         |          Yes          |            Yes             |
| Authorization code and PKCE |             Yes              |      Adapter only       |      Partial       |        Yes         |          Yes          |            Yes             |
| Client credentials          |             Yes              |       Persistence       |        Yes         |        Yes         |        Limited        |       BFF indirectly       |
| Refresh and revocation      |             Yes              |       Persistence       |        Yes         |        Yes         |        Limited        |     BFF refresh/logout     |
| Consent                     |     Route/provider logic     |   No dedicated suite    |        Yes         |      Limited       |          Yes          |          Indirect          |
| Two-factor authentication   |             Yes              |           Yes           |      Limited       | Admin attack cases |          Yes          |             No             |
| Tenant isolation            |   Middleware/repositories    |         Partial         |   Selected cases   |  Selected attacks  | Status/branding cases |  No dedicated attack case  |
| Admin API and RBAC          |          Extensive           |  Repositories/services  |      Limited       |        Yes         |      No admin UI      |             No             |
| Password reset/invitations  |             Yes              |   Invitation service    |     Reset only     |   Reset attacks    |          Yes          |             No             |
| Sessions                    |             Yes              |           Yes           |   Selected flows   |  Session attacks   | Interaction lifecycle |        Logout flows        |
| Import/export/bulk          | Exact contract and internals | PostgreSQL transactions | Packed raw/SDK/CLI | Limited injection  |          No           | Packed operational harness |
| SDK public API              | Contract and SDK unit tests  |  Packed live journeys   |         No         |         No         |          No           | Packed operational harness |
| CLI public commands         | Unit and raw-response tests  |  Packed live journeys   |         No         |         No         |          No           | Packed operational harness |

“Yes” means a suite contains tests claiming that behavior. It does not mean the behavior is fully
specified or that every relevant mutation would be detected.

## Measured Server Coverage

The V8 coverage provider is installed at the same exact version as Vitest (`4.1.10`). A complete
`yarn test:coverage` run executed all 3,348 server cases successfully and then failed the configured
coverage gate.

| Metric     | Covered | Total | Measured | Threshold | Result                         |
| ---------- | ------: | ----: | -------: | --------: | ------------------------------ |
| Statements |   5,015 | 6,333 |   79.18% |       80% | Fail by 0.82 percentage points |
| Branches   |   2,134 | 3,036 |   70.28% |       75% | Fail by 4.72 percentage points |
| Functions  |     784 |   913 |   85.87% |       80% | Pass by 5.87 percentage points |
| Lines      |   4,859 | 6,106 |   79.57% |       80% | Fail by 0.43 percentage points |

The lowest measured source areas are:

| Source area                                                                                     |  Lines | Branches | Interpretation                                                                                               |
| ----------------------------------------------------------------------------------------------- | -----: | -------: | ------------------------------------------------------------------------------------------------------------ |
| `src/server.ts`                                                                                 |     0% |       0% | App assembly executes from Vitest global setup, whose process coverage is not merged                         |
| `src/lib/migrator.ts`                                                                           |     0% |       0% | Migration startup executes from global setup rather than an instrumented test worker                         |
| `src/oidc/provider.ts`                                                                          |     0% |       0% | Provider creation executes from global setup rather than an instrumented test worker                         |
| Selected admin routes (`audit`, `branding`, `config`, `exports`, `imports`, `keys`, `sessions`) |     0% |       0% | No direct instrumented route coverage; server-side execution may occur outside the collected worker coverage |
| `src/routes/bulk.ts`                                                                            | 15.38% |     100% | Only module initialization is measured; handler functions are not measured as called                         |
| `src/lib/data-import.ts`                                                                        | 21.79% |   16.55% | Large import implementation has substantial unexecuted line and branch surface                               |
| `src/routes/users.ts`                                                                           | 44.55% |   38.13% | User route behavior is only partially exercised in instrumented workers                                      |
| `src/lib` overall                                                                               | 64.84% |   53.34% | Primarily reduced by data import and startup/migration code                                                  |
| `src/routes` overall                                                                            | 69.03% |   53.58% | Public/admin route coverage is uneven despite route unit tests                                               |

These figures are a valid measurement of code attributed to Vitest's instrumented workers, but
they are not a complete measurement of assembled-server execution. E2E and penetration global
setup creates the Koa/OIDC server in a separate setup context. Code executed there can appear as
zero coverage even when HTTP tests demonstrably reach it. Browser UI and external harness tests are
also outside this Vitest coverage run.

Consequently, the result proves that the configured gate currently fails and identifies several
real unit-test blind spots, especially branch coverage and data import. It does not prove that every
reported zero-percent route is never exercised end to end.

### Assembled Porta process observation

The assurance coverage command separately captures V8 records from the Porta process running in
the retained Docker harness. It does not merge these records with Vitest or enforce a threshold.
The command stops the exact container recorded by the durable lifecycle lease, extracts its raw
records from a run-owned volume, and source-maps only eligible compiled server files.

Evidence is rejected unless image labels and the capture manifest agree on the committed revision,
dependency-lock digest, source-tree digest, compiled-output digest, fixture digest, lifecycle run,
and container identity. Runtime dependency exclusions come from an inventory generated inside that
same image. Node-internal and dependency records are reported as exclusions; pathless records are
explicitly deferred instead of being guessed to be Node internals. Unexpected local scripts,
unmapped eligible files, incomplete termination, malformed source maps, or collection failures
prevent an observation from being admitted.

Fixed-seed capture comparisons record exact normalized paths and totals. Those figures describe one
deterministic journey under a named runtime profile; they are observation evidence, not a quality
score, completeness claim, or CI/release gate.

Two clean fixed-seed protocol captures on 2026-08-12 each retained two raw records from one server
PID and produced the same 137 normalized source paths and observation digest,
`sha256:9c26ad1b89ba2d6cc82a492ae3c3e4643849f924f629aaa0c2c68319f387fa8f`:

| Metric     | Covered | Total |
| ---------- | ------: | ----: |
| Statements |     815 | 6,319 |
| Branches   |      84 | 3,009 |
| Functions  |     105 |   914 |
| Lines      |     811 | 6,096 |

## Current Assurance Characteristics

| Characteristic                      | Current evidence                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Real infrastructure                 | Strong: integration, E2E, pentest, and UI layers use PostgreSQL/Redis; email flows use MailHog                       |
| Full assembled server               | Strong presence in E2E, pentest, and UI projects                                                                     |
| Independent external clients        | Present but narrow: six SPA/BFF scenarios                                                                            |
| Browser coverage                    | Chromium only                                                                                                        |
| SDK-to-live-server compatibility    | Packed current SDK is provenance-bound to an owned server/fixture; live journeys start in risk slices                |
| CLI-to-live-server compatibility    | Packed current CLI resolves the exact packed SDK and proves credential isolation; live journeys start in risk slices |
| Coverage measurement                | Operational: 79.57% lines, 79.18% statements, 70.28% branches, and 85.87% functions                                  |
| Coverage enforcement in CI          | None; `yarn verify` does not invoke coverage                                                                         |
| Mutation testing                    | Not configured                                                                                                       |
| Property-based/fuzz testing         | Not configured                                                                                                       |
| Load/performance testing            | Not configured                                                                                                       |
| Snapshot/visual-regression testing  | Not configured                                                                                                       |
| Specification/implementation naming | 12 `*.spec.test.*`, 8 `*.impl.test.*`, and 275 undifferentiated Vitest/Node test files                               |
| Skipped/todo cases                  | No explicit `.skip`, `.todo`, or `.only` markers found                                                               |
| Silent conditional exits            | Present in cross-tenant and JWT-manipulation penetration tests                                                       |

## What the Suite Currently Demonstrates

The suite gives credible evidence that:

1. A large set of module-level behaviors remains stable.
2. Repository, package, build, and CI migration contracts are intact.
3. Core persistence code works against real PostgreSQL and Redis.
4. Porta can start and respond through its primary authentication and OIDC paths.
5. Major browser authentication flows work in Chromium.
6. Basic SPA and BFF integrations work through the external harness.
7. Many named attack inputs do not crash or trivially bypass the tested endpoints.

The suite does **not yet demonstrate** that:

1. Every expected result is independent of the current implementation.
2. Critical tests fail under realistic security defects.
3. The configured coverage thresholds are met; lines, statements, and branches currently fail.
4. SDK and CLI behavior is compatible with a live released server.
5. OIDC behavior passes an independent protocol-conformance suite.
6. Browser behavior works outside desktop Chromium.
7. Concurrency, performance, overload, and multi-node behavior are comprehensively covered.

## Reproduction Commands

```bash
# Enumerate runtime-collected Vitest cases without executing them.
yarn workspace @portaidentity/server vitest list --project unit
yarn workspace @portaidentity/server vitest list --project integration
yarn workspace @portaidentity/server vitest list --project e2e
yarn workspace @portaidentity/server vitest list --project pentest
yarn workspace @portaidentity/sdk vitest list
yarn workspace @portaidentity/cli vitest list

# Enumerate browser cases.
yarn playwright test --config packages/server/tests/ui/playwright.config.ts --list
yarn playwright test --config test-harness/playwright.config.ts --list

# Execute the repository-contract suite.
yarn test:structure

# Execute all server Vitest projects with V8 coverage and enforce thresholds.
yarn test:coverage

# Observe coverage from the assembled Porta process without enforcing a threshold.
yarn assurance:coverage --project protocol --profile operational --seed coverage-baseline
```
