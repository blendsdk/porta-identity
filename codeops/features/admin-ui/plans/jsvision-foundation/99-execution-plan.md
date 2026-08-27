# Execution Plan: JSVision Admin Foundation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-27 19:29
> **Progress**: 47/55 tasks (85%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement secure OIDC/credential foundations first, then the embedded JSVision shell, the isolated MailHog-backed playground, and finally consumer/maintainer documentation plus whole-feature evidence. Every feature phase follows specification tests → observed red → implementation → green → implementation tests/hardening → verification scoped to the packages and repository contracts changed by that phase.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                            | Tasks |
| ----- | ------------------------------------------------ | ----: |
| 1     | Verified authentication and durable credentials  |    20 |
| 2     | `porta admin` and JSVision shell                 |    14 |
| 3     | Persistent MailHog-backed admin playground       |    13 |
| 4     | Documentation, package proof, and final evidence |     8 |

**Total: 55 tasks across 4 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress. Every task line appears exactly once. The executing agent MUST:
>
> 1. Mark implementation `[~]` with `⏳ (implemented: YYYY-MM-DD HH:MM)`.
> 2. Promote to `[x]` only after verification with `✅ (completed: YYYY-MM-DD HH:MM)`.
> 3. Update the Progress and Last Updated headers after every task; only `[x]` counts complete.
> 4. Resume the first `[~]`, otherwise the first `[ ]`, scanning top-to-bottom.
> 5. Mark blockers `[!]` and append `Blocked: <short reason>` on the same line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. The lifecycle is `Ready`, `Executing`, `Done`, or `Blocked`, derived from these markers.

---

## Phase 1: Verified Authentication and Durable Credentials

> **Phase baseline tree**: e6bfa24b7549a57686d5fe13c7728aeb5fe319b7
> **Scope mode**: strict
> **Expected modification set**: CLI authentication/session/credential source, manifest/lockfile, and tests; SDK CLI-auth/transport public contract and tests; execution evidence
> **Lenses**: security · api-surface · concurrency

### Step 1.1: Write the immutable authentication oracle

**Reference**: [Authentication and Credentials](03-02-authentication-and-credentials.md) · ST-01–ST-18 · AR-6, AR-7, AR-16, AR-17, AR-26, AR-27

- [x] 1.1.1 [spec-author] Write OIDC coordinator, subject-continuity, cancellation-stage, and ID-token validation specifications ST-01–ST-07, ST-18, and ST-42 — `packages/cli/tests/auth/oidc-validation.spec.test.ts` ✅ (completed: 2026-08-27 16:20)
- [x] 1.1.2 [spec-author] Write selected-server/UserInfo session specifications ST-08–ST-12 — `packages/cli/tests/admin/session.spec.test.ts` ✅ (completed: 2026-08-27 16:20)
- [x] 1.1.3 [spec-author] Write SDK frozen-state refresh and exact `CliCredentialPersistence`/`CliAuthOptions` public type specifications ST-13, ST-15, and ST-17 — `packages/sdk/tests/auth/cli-auth-refresh.spec.test.ts` ✅ (completed: 2026-08-27 16:20)
- [x] 1.1.4 [spec-author] Write cross-process/atomic persistence specifications ST-14 and ST-16 — `packages/cli/tests/credential-refresh.spec.test.ts` ✅ (completed: 2026-08-27 16:20)
- [x] 1.1.5 Run the four specification files and record capability-specific red results; justify any pre-existing passing assertion — focused CLI/SDK Vitest selectors ✅ (completed: 2026-08-27 16:20)
- [x] 1.1.6 Add the exact native dependency through Yarn Classic and verify its lockfile/install contract in Porta's existing Node 24 LTS development workflow — `packages/cli/package.json`, `yarn.lock`. ✅ (completed: 2026-08-27 16:59)

**Red evidence (2026-08-27 16:20):** CLI selectors failed 30/30 on missing planned capabilities. SDK behavior failed 2/5 while three assertions passed only because legacy memory-only/default behavior already exists. The standalone native TypeScript selector failed with the expected missing `CliCredentialPersistence`, missing `credentialPersistence`, and optional-refresh-token diagnostics. Logs: `/tmp/tmp.epijSFgjpG/task-1.1.5-*.log`.

**Dependency evidence (2026-08-27 16:59):** `yarn install --frozen-lockfile` passed under Node 24.20.0 with Yarn Classic 1.22.22. The exact dependency and integrity entry are present in the CLI manifest and root lockfile. Per AR-47, no separate platform/runtime qualification matrix, probe, or CI workflow exists.

### Step 1.2: Implement verified login and transactional refresh

**Reference**: [Authentication and Credentials §Authentication Flow](03-02-authentication-and-credentials.md#authentication-flow), [§ID-Token Verification](03-02-authentication-and-credentials.md#id-token-verification), [§SDK Refresh Transaction](03-02-authentication-and-credentials.md#sdk-refresh-transaction)

- [x] 1.2.1 Add documented runtime-validated OIDC credential/identity types and ES256 verifier — `packages/cli/src/auth/types.ts`, `packages/cli/src/auth/id-token-verifier.ts` ✅ (completed: 2026-08-27 17:04)
- [x] 1.2.2 Add nonce to authorization construction and route token identity through the verifier — `packages/cli/src/auth/pkce.ts`, `packages/cli/src/auth/browser-flow.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.3 Extract the injected UI-neutral login coordinator, propagate `AbortSignal` through network/callback work, close the callback server on cancellation, and adapt the existing login command — `packages/cli/src/auth/login-coordinator.ts`, `packages/cli/src/commands/login.ts`, `packages/cli/src/auth/browser-flow.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.4 Add normalized origin validation and selected-server/session verification before bearer construction — `packages/cli/src/global-options.ts`, `packages/cli/src/client-factory.ts`, `packages/cli/src/admin/session-service.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.5 Export exact `CliCredentialPersistence`/`CliAuthOptions.credentialPersistence` types and implement validated single-flight refresh states, omitted-token preservation, indeterminate-response handling, and same-write retry — `packages/sdk/src/auth/cli-auth.ts`, `packages/sdk/src/auth/types.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.6 Preserve one-retry transport semantics while consuming access tokens only from `committed` refresh transactions — `packages/sdk/src/transport/node-transport.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.7 Implement the qualified dependency's narrow never-unlink kernel-lock adapter and add validated owner-only atomic credential writes — `packages/cli/src/credential-store.ts`, `packages/cli/src/credential-lock.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.8 Wire CLI refresh hooks and confirmed cross-server replacement into the shared coordinator/client factory — `packages/cli/src/auth/login-coordinator.ts`, `packages/cli/src/client-factory.ts`, `packages/cli/src/credential-store.ts` ✅ (completed: 2026-08-27 17:16)
- [x] 1.2.9 Run ST-01–ST-18 and ST-42 to green; stop and correct implementation rather than changing oracle expectations — focused CLI/SDK Vitest selectors ✅ (completed: 2026-08-27 17:16)

### Step 1.3: Add implementation coverage and complete the security boundary

**Reference**: [Testing Strategy §Implementation Tests](07-testing-strategy.md#implementation-tests) · AR-17, AR-25–AR-27

- [x] 1.3.1 Add JOSE/JWKS, missing/invalid/mismatched subject, clock, and cancellation-race implementation edges — `packages/cli/tests/auth/oidc-validation.impl.test.ts` ✅ (completed: 2026-08-27 17:22)
- [x] 1.3.2 Add session transition, origin normalization, 401/403, and late-result implementation edges — `packages/cli/tests/admin/session.impl.test.ts` ✅ (completed: 2026-08-27 17:22)
- [x] 1.3.3 Add frozen-state single-flight, before/after-dispatch faults, same-write retry, hook-error, validation, and omitted-refresh-token implementation edges — `packages/sdk/tests/auth/cli-auth-refresh.impl.test.ts` ✅ (completed: 2026-08-27 17:22)
- [x] 1.3.4 Add real temporary-file permission/atomicity, kernel-lock contention/timeout/abort/process-crash release/never-unlink, and failure-injection edges — `packages/cli/tests/credential-refresh.impl.test.ts` ✅ (completed: 2026-08-27 17:22)
- [x] 1.3.5 Run focused CLI/SDK auth selectors, both affected package verification commands, and repository structure tests; all scoped gates must pass ✅ (completed: 2026-08-27 17:31)

**Deliverables**:

- Shared login accepts identity only after complete OIDC validation and live server-bound UserInfo verification.
- SDK refresh remains backward-compatible by default and is durable/concurrency-safe when the CLI opts in.
- All Phase 1 specification, implementation, affected-package, and repository-structure verification passes.

**Verify**: `yarn workspace @portaidentity/cli verify && yarn workspace @portaidentity/sdk verify && yarn test:structure`

---

## Phase 2: `porta admin` and JSVision Shell

> **Phase baseline tree**: `3f5b6c9d304a989fd2d8bed6f7fe91d55bf35081`
> **Scope mode**: strict
> **Expected modification set**: CLI manifest/lockfile; command registration; `packages/cli/src/admin/`; SDK refresh cancellation and focused test; server initialization guidance/specification; staged/refreshed project guidance; focused affected-package/repository tests; execution evidence
> **Lenses**: security · api-surface

### Step 2.1: Write the immutable command and application oracle

**Reference**: [Command and TUI Shell](03-01-command-and-tui-shell.md) · ST-19–ST-31, ST-39 · AR-2–AR-4, AR-18–AR-22, AR-26

- [x] 2.1.1 [spec-author] Write command/preflight/server-origin specifications ST-19–ST-24, including server initialization guidance — `packages/cli/tests/admin/command.spec.test.ts`, `packages/server/tests/unit/cli/commands/init-admin-guidance.spec.test.ts` ✅ (completed: 2026-08-27 18:05)
- [x] 2.1.2 [spec-author] Write real headless JSVision layout/action/lifecycle specifications ST-25–ST-31 plus the packed CLI-to-playground authentication specification ST-41 — `packages/cli/tests/admin/application.spec.test.ts`, `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs` ✅ (completed: 2026-08-27 18:05)
- [x] 2.1.3 [spec-author] Write CLI dependency/package/source boundary portion of ST-39 — `repo-tests/monorepo/admin-playground.spec.test.mjs` ✅ (completed: 2026-08-27 18:05)
- [x] 2.1.4 Run Phase 2 specifications including ST-41 and record capability-specific red results; ST-41 remains red until the playground exists — focused CLI Vitest and Node selectors ✅ (completed: 2026-08-27 18:05)

**Red evidence (Node 24.20.0, 2026-08-27)**: the focused CLI selector failed because JSVision and the `admin` source boundary are absent (14 command failures, 3 existing origin behaviors passing); the focused server guidance test failed on retained `porta gui`; the source/package boundary selector failed 3 of 4 cases while confirming the existing-workflow/no-separate-package constraint; and ST-41 failed because the Phase 3 playground and journey driver do not yet exist.

### Step 2.2: Implement the embedded application shell

**Reference**: [Command and TUI Shell §Proposed Source Boundaries](03-01-command-and-tui-shell.md#proposed-source-boundaries), [§State Model](03-01-command-and-tui-shell.md#state-model), [§Terminal Lifecycle](03-01-command-and-tui-shell.md#terminal-lifecycle)

- [x] 2.2.1 Add lockstep direct JSVision core/UI dependencies through Yarn Classic — `packages/cli/package.json`, `yarn.lock` ✅ (completed: 2026-08-27 18:18)
- [x] 2.2.2 Add documented application/session state and narrow admin public entry point — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/index.ts` ✅ (completed: 2026-08-27 18:18)
- [x] 2.2.3 Implement responsive presentation, menus, authentication dialog, summary, shortcuts, and resize view — `packages/cli/src/admin/presentation.ts` ✅ (completed: 2026-08-27 18:37)
- [x] 2.2.4 Implement application routing, at most one current-operation `AbortController` freshly created per login/Retry/Reauthenticate attempt, temporary `SIGINT`/`SIGTERM`/`SIGHUP` handlers for injected/headless runners, native host signal ownership, and idempotent finalization — `packages/cli/src/admin/application.ts` ✅ (completed: 2026-08-27 18:37)
- [x] 2.2.5 Add the thin `admin` command and strict TTY/automation-mode preflight — `packages/cli/src/commands/admin.ts`, `packages/cli/src/index.ts` ✅ (completed: 2026-08-27 18:37)
- [x] 2.2.6 Remove the retired GUI command/loader, replace server initialization guidance with `porta admin`, and refresh project guidance through `codeops:analyze-project` after the immutable specification is red — `packages/cli/src/commands/gui.ts`, `packages/server/src/cli/commands/init.ts`, server init tests, `AGENTS.md` ✅ (completed: 2026-08-27 18:18)
- [x] 2.2.7 Run ST-19–ST-31 and ST-39 to green; correct implementation only — focused CLI Vitest and Node structure selectors ✅ (completed: 2026-08-27 18:37)

### Step 2.3: Harden terminal behavior

**Reference**: [Testing Strategy §Implementation Tests](07-testing-strategy.md#implementation-tests) · AR-19, AR-21, AR-26

- [x] 2.3.1 Add focus, resize-boundary, event-disposal, non-colour, and redaction implementation tests — `packages/cli/tests/admin/application.impl.test.ts` ✅ (completed: 2026-08-27 18:37)
- [x] 2.3.2 Add PTY installed-build launch/keyboard-quit coverage everywhere plus `SIGINT`/`SIGTERM`/`SIGHUP` restoration/exit smoke on supported POSIX hosts, including handler removal and no double finalization — `packages/cli/tests/admin/application.pty.impl.test.ts`, `packages/cli/vitest.config.ts` ✅ (completed: 2026-08-27 18:18)
- [x] 2.3.3 Run frozen install, focused headless/PTY tests, the focused server initialization-guidance unit test, affected CLI/SDK verification, and repository structure tests — `yarn install --frozen-lockfile`, focused selectors, `yarn workspace @portaidentity/server vitest run --project unit tests/unit/cli/commands/init-admin-guidance.spec.test.ts`, `yarn workspace @portaidentity/cli verify`, `yarn workspace @portaidentity/sdk verify`, `yarn test:structure` ✅ (completed: 2026-08-27 18:37)

**Deliverables**:

- `porta admin` is the only admin UI command and starts the tested JSVision shell in a supported terminal.
- Presentation is responsive, keyboard-complete, non-colour-safe, and reliably restores the terminal.
- No administrative feature screen or JSVision dependency beyond core/UI enters scope.

**Verification evidence (Node 24.20.0, 2026-08-27 18:43):** frozen install passed; CLI verification passed 39 files/443 tests plus lint, typecheck, and build; SDK verification passed 33 files/413 tests plus lint, typecheck, and build; repository structure passed 83 tests; the focused server initialization-guidance selector passed 1 test. Full Porta server verification was intentionally not run because server behavior was untouched. The independent Phase 2 review and bounded rereview are recorded in `09-phase-2-quality-review.md`; all critical and major findings are resolved.

**Verify**: `yarn workspace @portaidentity/server vitest run --project unit tests/unit/cli/commands/init-admin-guidance.spec.test.ts && yarn workspace @portaidentity/cli verify && yarn workspace @portaidentity/sdk verify && yarn test:structure`

---

## Phase 3: Persistent MailHog-backed Admin Playground

> **Phase baseline tree**: `e4833564c38d96a944361f726433b220067278bb`
> **Scope mode**: strict
> **Expected modification set**: `docker/admin-playground/`; root lifecycle script, manifest, and lockfile; repository structure tests; execution evidence
> **Lenses**: security · concurrency

### Step 3.1: Write the immutable playground oracle

**Reference**: [Admin Playground](03-03-admin-playground.md) · ST-32–ST-38 · AR-5, AR-8–AR-15, AR-23, AR-26

- [x] 3.1.1 [spec-author] Write static DNS/exposure/reset/root-command contracts ST-32, ST-33, ST-37, and ST-38 — `repo-tests/monorepo/admin-playground.spec.test.mjs` ✅ (completed: 2026-08-27 18:50)
- [x] 3.1.2 [spec-author] Write lifecycle bootstrap/persistence/email, mutation serialization, non-TTY reset, and partial-deletion specifications ST-34–ST-38 — `docker/admin-playground/tests/lifecycle.spec.test.mjs` ✅ (completed: 2026-08-27 18:50)
- [x] 3.1.3 Run all playground specification files and record capability-specific red results — Node test selectors ✅ (completed: 2026-08-27 18:50)

**Red evidence (Node 24.20.0, 2026-08-27 18:50):** the combined Node selector ran 18 tests. The four completed Phase 2 source-boundary assertions remained green; 14 Phase 3 assertions failed only because the root dispatcher, lifecycle/prerequisite scripts, Compose topology, nginx configuration, and runtime ignore contract do not yet exist.

### Step 3.2: Implement the owned lifecycle and service topology

**Reference**: [Admin Playground §Lifecycle Operations](03-03-admin-playground.md#lifecycle-operations), [§Service Topology](03-03-admin-playground.md#service-topology), [§Secrets and Persistence](03-03-admin-playground.md#secrets-and-persistence)

- [x] 3.2.1 Implement tool, exact A/no-AAAA, port, mkcert, and runtime-permission preflight — `docker/admin-playground/scripts/check-prerequisites.mjs`, `docker/admin-playground/tests/preflight.impl.test.mjs` ✅ (completed: 2026-08-27 18:52)
- [x] 3.2.2 Implement bounded kernel-lock serialization, `up`/`stop`/`status`, stable secrets, migration/init detection, exact non-secret bootstrap fields, and sanitized health reporting — `package.json`, `docker/admin-playground/scripts/admin-env.mjs`, `yarn.lock` ✅ (completed: 2026-08-27 18:56)
- [x] 3.2.3 Implement bootstrap-capability preflight before mutation, exact-volume reset with proof of complete absence before secret rotation, retained TLS/CLI credentials, and rerun bootstrap — `docker/admin-playground/scripts/admin-env.mjs`, `docker/admin-playground/tests/reset.impl.test.mjs` ✅ (completed: 2026-08-27 18:56)
- [x] 3.2.4 Add internal-only Porta/PostgreSQL/Redis/MailHog topology, named persistence, health checks, and loopback nginx publication — `docker/admin-playground/compose.yml`, `docker/admin-playground/nginx.conf` ✅ (completed: 2026-08-27 18:56)
- [x] 3.2.5 Add runtime ignore/ownership contract and root `admin:env` dispatcher without unsafe shell interpolation — `docker/admin-playground/.gitignore`, `package.json` ✅ (completed: 2026-08-27 18:56)
- [x] 3.2.6 Run ST-32–ST-38 to green plus `docker compose config` and nginx configuration validation — playground/structure selectors and config checks ✅ (completed: 2026-08-27 18:56)

**Green/configuration evidence (Node 24.20.0, 2026-08-27 18:56):** the combined immutable and preflight selector passed 21 tests; frozen installation passed; `docker compose config --quiet` passed; nginx 1.29 reported valid syntax and configuration using the generated exact-host certificate. Runtime secrets and TLS remain ignored local files.

### Step 3.3: Prove lifecycle edges and live behavior

**Reference**: [Testing Strategy §Integration and End-to-End Evidence](07-testing-strategy.md#integration-and-end-to-end-evidence) · AR-8–AR-15, AR-23, AR-25

- [x] 3.3.1 Add missing-tool/port/partial-start/idempotent stop-status, lock contention/timeout, non-TTY reset, and partial-deletion implementation tests — `docker/admin-playground/tests/lifecycle.impl.test.mjs` ✅ (completed: 2026-08-27 19:17)
- [x] 3.3.2 Add dangling-reference, ignore-rule, exposure, and destructive-scope implementation diagnostics — `repo-tests/monorepo/admin-playground.impl.test.mjs` ✅ (completed: 2026-08-27 19:17)
- [x] 3.3.3 Run the fixed isolated Compose project in the current Docker development workflow; take ST-41 to green, exercise competing mutations plus clean-up/email/stop-start/reset, and prove unrelated Docker resources survive — fixed Compose identity and loopback port overrides ✅ (completed: 2026-08-27 19:17)
- [x] 3.3.4 Run repository structure tests after exact playground cleanup — `yarn test:structure` ✅ (completed: 2026-08-27 19:17)

**Live/scoped evidence (Node 24.20.0, 2026-08-27 19:17):** the final selectors passed 41 non-live playground tests plus ST-41, including packed local CLI/SDK installation, trusted controlled-browser authentication, verified identity rendering in the PTY, keyboard exit, and terminal restoration. Live lifecycle checks proved trusted HTTPS, persistent stop/start without another bootstrap prompt, one winning and one bounded-timed-out competing mutation, MailHog password-reset delivery, exact-volume reset with secret/bootstrap rotation, empty MailHog state after reset, and survival of an unrelated Docker volume. Exact playground containers and network were removed; repository structure passed 94 tests. The independent review and single bounded rereview are recorded in `10-phase-3-quality-review.md`; all critical and major findings are resolved. Full Porta/server verification was intentionally not run because server behavior was untouched.

**Deliverables**:

- One idempotent root lifecycle command owns the exact persistent playground and MailHog workflow.
- DNS/TLS/port/secret/reset checks fail closed before unsafe mutation.
- Live evidence proves trusted HTTPS, email delivery, persistence, bounded reset, and cleanup.

**Verify**: `yarn test:structure`

---

## Phase 4: Documentation, Package Proof, and Final Evidence

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Scope mode**: strict
> **Expected modification set**: CLI package/public docs; CLI/SDK coverage configuration and package scripts; `techdocs/`; doc boundary test; package/integrated-login smoke fixtures; execution evidence
> **Lenses**: security · api-surface

### Step 4.1: Specify and implement the documentation boundary

**Reference**: [Packaging and Documentation](03-04-packaging-and-documentation.md) · ST-40 · AR-2, AR-18, AR-24–AR-26

- [ ] 4.1.1 [spec-author] Write public-versus-technical documentation specification ST-40 — `repo-tests/monorepo/admin-ui-docs.spec.test.mjs`
- [ ] 4.1.2 Run ST-40 and record the expected red result — Node structure selector
- [ ] 4.1.3 Update package/public CLI usage for generic `porta admin` behavior with no reserved CI namespace — `packages/cli/README.md`, `docs/cli/overview.md`
- [ ] 4.1.4 Add exact maintainer playground/MailHog/persistence/reset/troubleshooting guide and navigation link — `techdocs/guides/admin-playground.md`, applicable `techdocs` index
- [ ] 4.1.5 Run ST-40 to green and build public VitePress docs; correct docs rather than weakening the scope oracle — Node selector and `yarn docs:build`

### Step 4.2: Produce final package and security evidence

**Reference**: [Packaging and Documentation §Dependency and Package Contract](03-04-packaging-and-documentation.md#dependency-and-package-contract), [Testing Strategy §Integration and End-to-End Evidence](07-testing-strategy.md#integration-and-end-to-end-evidence) · AR-17, AR-25

- [ ] 4.2.1 Add package-local CLI/SDK coverage scripts and exact per-glob thresholds; run CLI/SDK and built-in Node playground coverage and require the 90/80/60 line gates to pass — package manifests and coverage configurations
- [ ] 4.2.2 Run `yarn deps:check`, `yarn audit --groups dependencies --level high`, lockfile/integrity review, focused native-lock adapter tests, and the packed CLI smoke through Porta's existing Node 24 LTS development workflow — dependency and package evidence
- [ ] 4.2.3 Pack/install CLI and SDK into isolated consumers; run ST-41, packed PTY smoke, affected CLI/SDK package verification, repository structure tests, and clean-revision `yarn assurance:compat --select protocol`; require scoped gates to pass, review the compatibility outcome under its registered taxonomy, and confirm no generated/sensitive/out-of-scope files

**Deliverables**:

- Public and technical documentation honor the confirmed namespace and audience boundary.
- Packed CLI/SDK consumers, scoped package verification, repository structure tests, and clean-revision compatibility are evidenced.
- Final diff contains no secret/generated artifact, retired GUI reference, production use of test DNS, or deferred administration screen.

**Verify**: `yarn workspace @portaidentity/cli verify && yarn workspace @portaidentity/sdk verify && yarn test:structure`

---

## Dependencies

```text
Phase 1: verified identity + durable refresh
    ↓
Phase 2: JSVision shell consumes the UI-neutral session boundary
    ↓
Phase 3: playground supplies a persistent live environment
    ↓
Phase 4: docs/package/live evidence describe and prove the completed foundation
```

The clean-revision compatibility gate requires a committed feature checkpoint. If execution uses `--no-commit`, task 4.2.3 pauses for explicit checkpoint authorization rather than weakening provenance. (AR-25)

## Success Criteria

The feature is complete when:

1. All 55 tasks and AF-01–AF-19 are complete.
2. ST-01–ST-42 and post-green implementation tests pass without oracle weakening.
3. Affected CLI/SDK package verification, repository structure tests, documentation, Compose/nginx, dependency, coverage, packed-consumer, integrated-login, and focused gates exit successfully. Clean-revision compatibility assurance produces an outcome accepted by its registered taxonomy.
4. No critical or major finding remains under the strict CodeOps independent-review policy.
5. No dead code, unsafe cast, unvalidated external input, sensitive diagnostic, tracked runtime secret/certificate, cross-server bearer path, or unbounded destructive target remains.
6. Public documentation and package contents match the delivered foundation, while full admin functionality remains explicitly deferred.
