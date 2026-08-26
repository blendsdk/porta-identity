# Component: Harness Lifecycle and Fixtures

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-02

## Playwright Projects

| Project         | Directory/pattern                       | Boundary                                      |
| --------------- | --------------------------------------- | --------------------------------------------- |
| `spa`           | existing `tests/spa-*.spec.ts`          | Retained browser public-client journeys       |
| `bff`           | existing `tests/bff-*.spec.ts`          | Retained browser confidential/BFF journeys    |
| `protocol`      | `tests/protocol/**/*.spec.test.ts`      | Raw HTTP/OIDC/JOSE contract probes            |
| `security`      | `tests/security/**/*.spec.test.ts`      | Adversarial and prohibited-side-effect probes |
| `compatibility` | `tests/compatibility/**/*.spec.test.ts` | Packed SDK and CLI consumer behavior          |

A collection specification proves each file belongs to exactly one project. Workers stay at one
until reliability promotion; project boundaries improve ownership, not immediate parallelism.

## Lifecycle Controller

`test-harness/fixtures/` owns typed environment, manifest, reset, health, and scenario helpers.
Scripts call these modules rather than embedding opaque shell strings.

The lifecycle boundary is layered. `createLifecycleController(dependencies)` returns a controller
whose `start(request)`, `reset(ownedRun)`, and `stop(ownedRun)` operations accept validated input or
an opaque owned-run handle. Recovery after owner death uses a validated run/worktree lookup to
reload the durable lease in a fresh process; callers never supply resource identities to delete.
Capability-specific dependencies own the
durable lease store, process-identity probe, Compose inspection/execution, shell-free child
execution, endpoint availability, deadlines, and public postcondition checks. Specification tests
exercise this typed controller deterministically; a narrow spawned CLI contract proves real atomic
filesystem leasing, signal delivery, durable poison state, and argument/environment propagation.
The retained shell scripts are compatibility callers of that CLI.

| Boundary           | Operation                                                                                             | Postcondition                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Job                | Atomically lease port block; persist owner; generate endpoint manifest; build/start/migrate/seed      | Exact revision healthy; owner/endpoints verified  |
| Risk slice/project | Quiesce; stop Porta; recreate DB; migrate/bootstrap/seed; reset Redis/mail; restart clients and Porta | Migration/fixture digests, counts, public health  |
| Scenario           | Unique prefix, fresh contexts/cookies/credentials/tokens                                              | No predecessor resources or authentication state  |
| Shutdown           | Gracefully stop Porta, collect evidence, stop owned clients/services, remove owned resources          | No recorded process/container/volume/port remains |

Once durable reset mutation begins, any failure, signal, cancellation, or unknown outcome marks the
stack poisoned and forces complete owned-project recreation before retry. The endpoint manifest is
the only source for Compose, nginx, seed, SPA, BFF, Playwright, health checks, and evidence. Cleanup
is fenced by the recorded run UUID, PID/worktree identity, Compose project, and container IDs; stale
leases are reclaimed only after the owner process and Compose project are proven absent.

## Fixture Manifest

The seed creates a fresh baseline instead of discovering and reusing arbitrary prior objects.

- Ordinary organizations `alpha` and `bravo`, plus the bootstrapped super-admin organization.
- Global applications and roles with explicit associations; disjoint public/confidential clients,
  users, sessions, tokens, tenant data, redirects, origins, and secrets for alpha/bravo. OIDC scopes
  use the shared allowlisted protocol vocabulary and never encode tenant ownership.
- Administrative super-admin-organization actors with full, limited, and unprivileged permission
  sets; ordinary-tenant principals for OIDC/session/token isolation.
- Active, locked, suspended, 2FA-enabled, recovery-enabled, and enumeration-control identities as
  required by a slice.
- Synthetic boundary values only; no developer or production-derived data.

The endpoint/certificate manifest also owns an HTTPS attacker origin at a loopback IP site (for
example `https://127.0.0.1:<leased-port>` with an IP SAN). It is a different browser site from
`*.ci.portaidentity.com`, requires no public DNS, and exists only to distinguish cross-origin from
cross-site cookie and CSRF behavior.

The generated manifest exposes identifiers through a typed fixture but never writes or logs raw
passwords, client secrets, tokens, cookies, TOTP seeds, or recovery codes into result artifacts.
Setup may use internal services for hashing/arrangement; fixture verification and every
specification assertion use public HTTP, browser, protocol, email, packed SDK, or CLI boundaries.

## Recovery and Concurrency

- Duplicate setup is either idempotent for the same run identity or rejected exactly.
- Interruption before durable mutation may retry; after mutation the stack is poisoned and rebuilt.
- Redis and MailHog are harness-dedicated; absence fails preflight.
- Run/scenario identifiers use strict allowlists and cannot reach a shell or filesystem unchecked.
- A 100-run fixed representative set executes in deterministic shuffled orders. Promotion evidence
  requires 100 consecutive completed runs with zero flakes and recorded p50/p95 runtime; an invalid
  or incomplete run restarts the sequence and every retry remains visible.

## Verification

ST-09 through ST-18 establish fatal lifecycle, isolation, fixture, project ownership, and cleanup
contracts before implementation. Shell changes also receive `bash -n` and available shell lint;
Compose changes receive `docker compose config`; every checkpoint ends with `yarn verify`.
