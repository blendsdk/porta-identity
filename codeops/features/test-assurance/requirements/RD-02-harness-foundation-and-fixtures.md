# RD-02: Harness Foundation and Deterministic Fixtures

> **Document**: RD-02-harness-foundation-and-fixtures.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

The existing Docker and Playwright harness becomes Porta's single external system-assurance
environment. It must provide deterministic, multi-tenant, fail-fast fixtures without introducing
test-only product endpoints or using Porta internals as an oracle (AR #3, AR #9–AR #12).

## Functional Requirements

### Must Have

- [ ] **R2.1 (L)** Preserve the existing nginx/TLS, Porta, PostgreSQL, Redis, MailHog, SPA, BFF,
      Playwright, startup, and cleanup topology; no second harness or runner shall be introduced.
- [ ] **R2.2 (L)** Add named `protocol`, `security`, and `compatibility` Playwright projects beside
      `spa` and `bff`, with non-overlapping file ownership and shared typed fixtures (AR #12).
- [ ] **R2.3 (L)** A fresh harness job shall own a new ephemeral stack and shall tear down only its
      recorded containers, processes, volumes, generated configuration, and certificates.
- [ ] **R2.4 (L)** Each risk-slice/project reset shall restore a known database baseline, flush the
      harness-dedicated Redis state, clear MailHog, and restart Porta when required to clear
      process-local caches (AR #11).
- [ ] **R2.5 (M)** Required reset, dependency health, DNS preflight, migration, seeding, or fixture
      verification failure shall abort the affected suite; best-effort continuation is prohibited.
- [ ] **R2.6 (L)** The baseline shall contain at least two ordinary organizations and, where the
      tested slice requires them, a super-admin organization; their users, applications, clients,
      roles, credentials, and data shall be distinct (AR #10).
- [ ] **R2.7 (L)** Fixture roles shall support super-admin, organization administrator, limited-role,
      and unprivileged-user scenarios; lifecycle variants shall include active, locked, suspended,
      2FA-enabled, and recovery-flow identities when applicable.
- [ ] **R2.8 (M)** Public and confidential clients shall include permitted and deliberately invalid
      redirect/origin configurations suitable for positive and negative OIDC cases.
- [ ] **R2.9 (M)** Scenario-created resources shall use a validated run/scenario namespace and fresh
      browser contexts and cookie jars; tests shall not depend on execution order.
- [ ] **R2.10 (M)** Setup may call Porta services or direct fixture storage only from harness-owned
      code; every fixture required by a specification shall be verified through an independent
      observable boundary before test execution (AR #9).
- [ ] **R2.11 (M)** Harness code shall never add a reset endpoint, bypass flag, fault switch, default
      credential, or test-only authorization path to the production server.
- [ ] **R2.12 (M)** Generated configuration, certificates, coverage, browser traces, reports, and
      credentials shall remain ignored and uncommitted (AR #22).

### Should Have

- [ ] **R2.13 (M)** Repeated shuffled-order runs should prove that no test depends on predecessor
      state before worker count is increased above one.
- [ ] **R2.14 (M)** Destructive or process-cache-sensitive scenarios should be grouped so full
      project reset is used only where scoped cleanup cannot prove isolation.

### Won't Have (Out of Scope)

- A per-scenario Docker rebuild as the default — retained only as a fallback when scoped reset
  cannot prevent leakage (AR #11).
- A production-accessible test control plane or bypass.
- Firefox/WebKit expansion in this feature (AR #23).

## Technical Requirements

### Lifecycle Boundaries

| Level              | Required isolation                                                                    |
| ------------------ | ------------------------------------------------------------------------------------- |
| Job                | Fresh Compose project, ephemeral stores, generated TLS, exact source revision         |
| Project/risk slice | Known schema/data baseline, Redis reset, mail reset, process-cache reset where needed |
| Scenario           | Namespaced resources, fresh credentials/tokens, fresh browser/request context         |

The reset operation shall report counts and identifiers of removed/recreated state and shall verify
the postcondition. Cleanup failure is an infrastructure failure, never a test pass (AR #11).

### Fixture Boundary

Harness-only setup is an arrangement mechanism. Tests may not import production code to decode a
token, calculate a redirect, decide authorization, or obtain an expected value. Raw JOSE/HTTP
inspection shall use an independent library or protocol rules (AR #7, AR #9).

### Concurrency and Recovery

- Duplicate scenario creation shall be idempotent or rejected with an exact fixture error.
- Reset interrupted after durable database mutation shall be safely repeatable.
- Redis or MailHog unavailability shall fail before security assertions begin.
- A timeout with unknown reset outcome shall require complete project reset.
- Port and Compose-project identities shall support concurrent worktrees without cross-cleanup.

## Integration Points

- RD-01 consumes the fixture manifest in every evidence bundle.
- RD-03 mounts and retrieves server-process coverage from this Compose topology.
- RD-04 uses SPA, BFF, protocol, and compatibility projects.
- RD-05 uses multi-tenant actors and negative clients.
- RD-06 applies faults only to temporary build contexts consumed by this harness.

## Scope Decisions

| Decision | Options Considered                                   | Chosen                                   | Rationale                                         | AR Ref |
| -------- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- | ------ |
| Harness  | Existing / new / server-only                         | Existing harness                         | Real external boundary already exists             | AR #3  |
| Reset    | Best effort / scoped / per-test stack                | Fatal scoped reset with fallback rebuild | Isolation without prohibitive default cost        | AR #11 |
| Setup    | Public only / internal arrangement / internal oracle | Internal arrangement, public oracle      | Practical secure fixtures without self-validation | AR #9  |

## Security Considerations

- **Data sensitivity**: Use synthetic identities and secrets only.
- **Input validation**: Namespace, port, path, project, fixture, and environment inputs use strict
  allowlists; reject `..`, separators, control characters, and unsafe shell content.
- **Authentication and authorization**: Fixture roles must be intentionally minimal and distinct.
- **Injection risks**: Parameterize database operations; pass process arguments without shell
  interpolation; escape generated JSON and HTML.
- **Encryption**: TLS remains enabled at the browser/OIDC boundary; test keys are ephemeral.
- **Rate limiting**: Resets target only the harness-dedicated Redis namespace/database and must not
  disable product limits.
- **Infrastructure**: Porta remains inaccessible except through harness nginx; no production network
  or credential is used.

## Acceptance Criteria

1. [ ] `yarn harness:test` starts and stops only its own named Compose stack and leaves no owned
       container, volume, process, generated credential, or listening port after success or failure.
2. [ ] If Redis cleanup, MailHog cleanup, fixture seeding, DNS preflight, or fixture verification is
       forced to fail, the harness exits non-zero before executing dependent assertions.
3. [ ] The fixture manifest contains two ordinary tenants with disjoint user, application, public
       client, confidential client, role, and secret identifiers.
4. [ ] A cross-tenant read and write probe can address a resource owned by tenant B while
       authenticated in tenant A without fixture ambiguity.
5. [ ] Running the same selected suite twice in reversed or shuffled order produces identical test
       outcomes and no residual rows, cache keys, sessions, tokens, or email.
6. [ ] No test under `test-harness/tests` imports a production module for expected-value calculation.
7. [ ] The new project list contains `spa`, `bff`, `protocol`, `security`, and `compatibility`, and
       each test file is collected by exactly one project.
8. [ ] A search of production source finds no assurance-only reset endpoint, bypass flag, or fault
       switch introduced by this feature.
