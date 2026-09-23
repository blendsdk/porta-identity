# RD-01: JSVision Admin Foundation

> **Document**: RD-01-jsvision-admin-foundation.md
> **Status**: Planning Complete
> **Created**: 2026-08-27
> **Feature**: Porta Admin UI
> **Depends On**: None
> **CodeOps Artifact Schema**: 1

## Feature Overview

Provide the minimum secure foundation for Porta administration inside the existing CLI. The result is an authenticated, keyboard-complete JSVision application shell and a maintainer playground—not a complete administration product. AR-1 through AR-46 in the plan's [Ambiguity Register](../plans/jsvision-foundation/00-ambiguity-register.md) own the approved decisions.

## Functional Requirements

### Must Have

- [ ] **AF-01 — Command replacement:** `porta admin` is the sole administration UI command; `porta gui`, its registration, optional-package lookup, related tests, server initialization guidance, and active project guidance are removed or replaced without an alias. (AR-2–AR-4, AR-30)
- [ ] **AF-02 — Terminal preflight:** the command requires interactive stdin/stdout, rejects `--json` and `--force`, exits 2 with concise stderr when incompatible, restores the terminal on normal exit and, on supported POSIX hosts, catchable `SIGINT`, `SIGTERM`, and `SIGHUP`, and keeps an explicit `--insecure` warning visible. Windows guarantees apply only to normal quit and console events Node can deliver to a handler; uncatchable termination is outside the guarantee. (AR-18, AR-19, AR-26, AR-45)
- [ ] **AF-03 — Server selection:** resolution follows flag, environment, then stored credentials; otherwise the TUI requests an HTTPS origin with no credentials, path, query, or fragment. No CI-only hostname is a product default. (AR-18)
- [ ] **AF-04 — Application shell:** the shell provides Application/Quit and Session/Reauthenticate actions, visible shortcuts, and a summary of selected server, verified identity, and connection state; it contains no administrative data screens. (AR-20, AR-22)
- [ ] **AF-05 — Responsive accessibility:** required actions work by keyboard, meaning survives without colour or non-ASCII glyphs, normal layouts work at 80×24 and 48×12, and smaller terminals retain a reachable Quit action. (AR-21)
- [ ] **AF-06 — Integrated authentication:** an unauthenticated shell offers Authenticate, Retry, and Quit and runs the shared browser/manual Authorization Code + PKCE flow without another process or competing terminal reader. One request-owned `AbortSignal` cancels discovery, JWKS, token, UserInfo, and callback-server work. (AR-6, AR-33)
- [ ] **AF-07 — Authenticated identity:** before persistence/display, the flow binds a nonce and verifies ES256 signature, issuer, audience/authorized party, time claims, nonce, and a non-empty string `sub`. A 60-second future-`iat` allowance is the explicit ID-token clock-skew policy. (AR-27, AR-46)
- [ ] **AF-08 — Environment and subject binding:** bearer credentials are used only for an exact normalized stored/selected origin match. UserInfo `sub` and any accepted refreshed ID-token `sub` must exactly equal the original validated subject. Mismatch fails authentication before display; 401/determinate refresh failure becomes unauthenticated, while a later admin 403 is authenticated but unauthorized. (AR-7, AR-28)
- [ ] **AF-09 — Credential replacement:** one credential profile remains; authentication to another server displays both non-secret origins and requires confirmation before replacement. (AR-16)
- [ ] **AF-10 — Durable refresh:** SDK refresh is read-only by default and exposes exact opt-in `CliCredentialPersistence` hooks through `CliAuthOptions.credentialPersistence`. The CLI uses in-process single-flight, one kernel-lock adapter over `fs-ext-extra-prebuilt@2.2.13`, and atomic owner-only persistence. An omitted refresh token preserves the prior token. Only proven pre-dispatch failures may retry a grant; post-dispatch loss requires reauthentication. A validated snapshot may retry only its same atomic write and is usable only after commit. (AR-17, AR-34–AR-36)
- [ ] **AF-11 — Sanitized diagnostics:** output uses bounded allowlisted categories and never emits raw response bodies, stack traces, tokens, secrets, internal paths, or uncontrolled remote text. Fatal stderr follows terminal restoration. (AR-26)
- [ ] **AF-12 — Local playground:** `docker/admin-playground/` is controlled through `yarn admin:env up|stop|reset|status`, uses reserved loopback DNS, and does not change existing environments. Live tests run the same fixed Compose identity inside a disposable isolated Docker context/daemon. (AR-5, AR-9, AR-15, AR-31)
- [ ] **AF-13 — Playground exposure and TLS:** startup proves exact A=127.0.0.1 and no AAAA, binds configurable HTTPS 3543 and MailHog UI 8026 only to 127.0.0.1, and terminates a trusted exact-SAN mkcert certificate at nginx; other services remain internal. (AR-9–AR-11)
- [ ] **AF-14 — Playground persistence and secrets:** named data and owner-only secrets survive stop/start. One bounded kernel lock serializes mutating commands. Reset removes only exact owned volumes, proves all absent, then rotates secrets/clears mail while preserving TLS and CLI credentials. Partial removal stops with old secrets intact. Confirmation or `--yes` is required. (AR-8, AR-13, AR-14, AR-35, AR-39)
- [ ] **AF-15 — Playground lifecycle:** `up` owns ordered preflight, startup, migrations, and hidden-password initialization of verified `admin@playground.porta.test` in existing organization `porta-admin`, with given name `Playground` and family name `Administrator`. `reset`, including `--yes`, proves hidden-input/TTY capability before mutation whenever rebootstrap is required. All email routes to MailHog. (AR-12, AR-23, AR-29, AR-40, AR-43)
- [ ] **AF-16 — Documentation boundary:** public docs describe generic `porta admin` usage without the CI namespace; maintainer docs explain the exact playground, MailHog, reset, and non-production restrictions. (AR-24)
- [ ] **AF-17 — Verification:** immutable specifications precede implementation. Phase 1 runs affected UI, harness, protocol, and production-security gates before dependent phases. Final completion requires ordinary gates to pass, named assurance outcomes to satisfy their registered taxonomy, exact line-coverage goals, `yarn deps:check`, packed-package smoke including one CLI-to-playground authentication journey, and clean-revision SDK compatibility. (AR-25, AR-32, AR-37, AR-38, AR-41, AR-44)

### Should Have

- [ ] **AF-18 — Thin architecture:** `commands/admin.ts` is a thin adapter; UI-neutral services do not import JSVision and presentation does not own token, protocol, network, or filesystem policy. (AR-22)
- [ ] **AF-19 — Future-ready email playground:** MailHog is present from the foundation milestone for later email-driven journeys. (AR-12)

### Won't Have (Out of Scope)

- Administrative data screens or production deployment instructions. (AR-2, AR-20, AR-24)
- Multi-profile credential storage or a `porta gui` compatibility alias. (AR-3, AR-4, AR-16)
- Automated bootstrap passwords in argv or committed configuration. (AR-12, AR-23)
- A custom lock framework, generalized test orchestrator, or repository-wide coverage-policy change. (AR-35, AR-38, AR-41)

## Technical Requirements

### Reliability and Compatibility

- The application owns at most one current-operation `AbortController` and creates a fresh controller for every authentication attempt. Cancellation wins before persistence; once persistence begins, lock release and atomic write reach a definite result before returning. Late completion cannot mutate disposed state. (AR-33)
- Refresh uses the frozen state sequence `not-dispatched` → `dispatched` → `response-validated` → `persisting` → `committed`; only `committed` exposes the access token. (AR-34)
- The persistent lock file is never unlinked. Kernel locks release on process exit; bounded retry uses a monotonic deadline and only documented contention errors. The dependency and adapter are verified through Porta's existing Node 24 LTS development and verification workflow; no separate platform/runtime qualification matrix or CI workflow is introduced. (AR-35, AR-47)
- `@jsvision/core` and `@jsvision/ui` remain lockstep direct CLI dependencies; the kernel-lock package is the sole additional runtime utility. Existing credential files and SDK construction remain compatible. (AR-4, AR-17, AR-22, AR-35, AR-36)
- Mutating playground operations cannot overlap; `status` remains read-only. (AR-39)

### Coverage Attribution

The plan-owned final gate measures line coverage: 90% for CLI authentication/credentials/session, SDK CLI auth, and playground lifecycle scripts; 80% for admin state/application services and server-selection adapters; and 60% for thin command/presentation adapters. Declarative Compose/nginx, docs, generated files, barrels, and entry points are excluded and retain structural/configuration/integration evidence. (AR-41)

## Integration Points

- Server initialization owns the fixed `porta-admin` bootstrap and must advertise `porta admin`.
- SDK CLI auth owns the public opt-in persistence contract; CLI auth/storage owns verified identity and durable persistence.
- The playground owns the fixed non-production environment and destructive boundary.
- Existing UI, retained harness, assurance, compatibility, documentation, and dependency commands supply evidence.

## Security Considerations

- OIDC acceptance requires complete validation, exact subject continuity, and only the authorized positive clock skew. (AR-27, AR-28, AR-46)
- No bearer token crosses selected-server boundaries. (AR-7)
- Credentials and runtime secrets remain owner-only, atomic, and absent from logs/argv/source/public docs. (AR-12, AR-13, AR-17, AR-26)
- Indeterminate refresh and partial reset fail closed without replaying a grant or rotating keys for retained data. (AR-34, AR-39)
- Test endpoints are trusted-local HTTPS and IPv4-loopback-only; DNS is not a trust boundary. (AR-5, AR-9–AR-11)

## Acceptance Criteria

1. [ ] AF-01 through AF-19 are satisfied or explicitly accepted as not applicable.
2. [ ] `porta admin` starts the authenticated skeleton and no `porta gui` command, server guidance, or active project guidance remains.
3. [ ] Session transitions, cancellation, subject continuity, refresh response loss, and reauthentication follow the specified fail-closed states.
4. [ ] ID-token validation rejects invalid signature, issuer, audience/authorized party, time, algorithm, nonce, or subject.
5. [ ] Concurrency and persistence tests prove no consumed credential is replayed or exposed before commit.
6. [ ] The playground persists ordinary state, serializes mutation, delivers mail, and resets exact owned data without rotating secrets after partial deletion.
7. [ ] Package, dependency, coverage, Compose/nginx, docs, verification, UI/harness, assurance, integrated packed-login, and compatibility gates satisfy their exact completion rules.

## Technical Documentation Update

Execution updates public CLI documentation and the unpublished maintainer playground guide. No broader architecture-document regeneration is required.
