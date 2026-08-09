# Component: Harness Lifecycle and Fixtures

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-02

## Playwright Projects

| Project         | Directory/pattern                  | Boundary                                      |
| --------------- | ---------------------------------- | --------------------------------------------- |
| `spa`           | existing `tests/spa-*.spec.ts`     | Browser public-client journeys                |
| `bff`           | existing `tests/bff-*.spec.ts`     | Browser confidential/BFF journeys             |
| `protocol`      | `tests/protocol/**/*.spec.ts`      | Raw HTTP/OIDC/JOSE contract probes            |
| `security`      | `tests/security/**/*.spec.ts`      | Adversarial and prohibited-side-effect probes |
| `compatibility` | `tests/compatibility/**/*.spec.ts` | Packed SDK and CLI consumer behavior          |

A collection specification proves each file belongs to exactly one project. Workers stay at one
until reliability promotion; project boundaries improve ownership, not immediate parallelism.

## Lifecycle Controller

`test-harness/fixtures/` owns typed environment, manifest, reset, health, and scenario helpers.
Scripts call these modules rather than embedding opaque shell strings.

| Boundary           | Operation                                                                                                | Postcondition                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Job                | Unique validated Compose project and ports; build/start/migrate/seed                                     | Exact revision healthy; manifest verified         |
| Risk slice/project | Restore known PostgreSQL baseline, flush dedicated Redis, clear mail, restart Porta when cache-sensitive | Expected row/key/message counts and health probe  |
| Scenario           | Unique prefix, fresh contexts/cookies/credentials/tokens                                                 | No predecessor resources or authentication state  |
| Shutdown           | Gracefully stop Porta, collect evidence, stop owned clients/services, remove owned resources             | No recorded process/container/volume/port remains |

Reset, health, DNS, migration, seeding, or cleanup failure exits non-zero. Unknown timeout state
forces a complete project recreation before retry. Cleanup targets resolved project identifiers,
never broad directories, globs, or unrelated containers.

## Fixture Manifest

The seed creates a fresh baseline instead of discovering and reusing arbitrary prior objects.

- Ordinary tenants `alpha` and `bravo`, plus the bootstrapped super-admin tenant.
- Separate applications, public clients, confidential clients, allowed/invalid redirects, origins,
  scopes, and secrets per ordinary tenant.
- Super-admin, organization-admin, limited-role, and unprivileged actors.
- Active, locked, suspended, 2FA-enabled, recovery-enabled, and enumeration-control identities as
  required by a slice.
- Synthetic boundary values only; no developer or production-derived data.

The generated manifest exposes identifiers through a typed fixture but never writes or logs raw
passwords, client secrets, tokens, cookies, TOTP seeds, or recovery codes into result artifacts.
Setup may use internal services for hashing/arrangement; fixture verification and every
specification assertion use public HTTP, browser, protocol, email, packed SDK, or CLI boundaries.

## Recovery and Concurrency

- Duplicate setup is either idempotent for the same run identity or rejected exactly.
- Interrupted reset is repeatable; durable DB changes complete transactionally.
- Redis and MailHog are harness-dedicated; absence fails preflight.
- Run/scenario identifiers use strict allowlists and cannot reach a shell or filesystem unchecked.
- A 100-run fixed representative set executes in deterministic shuffled orders. Promotion requires
  fewer than one flaky failure per 100 completed runs and recorded p50/p95 runtime.

## Verification

ST-09 through ST-18 establish fatal lifecycle, isolation, fixture, project ownership, and cleanup
contracts before implementation. Shell changes also receive `bash -n` and available shell lint;
Compose changes receive `docker compose config`; every checkpoint ends with `yarn verify`.
