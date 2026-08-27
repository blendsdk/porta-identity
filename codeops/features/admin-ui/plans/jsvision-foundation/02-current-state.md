# Current State: JSVision Admin Foundation

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The CLI is already a Node 22 TypeScript ESM package with global server and automation flags, a single owner-readable credential file, SDK-backed API clients, and a browser/manual OIDC Authorization Code + PKCE login. The retained `porta gui` command only tries to dynamically import a removed `@portaidentity/admin-gui` package; no working administration application exists.

The login flow checks state and PKCE but decodes ID-token claims without verifying their signature or binding a nonce. The SDK can rotate a refresh token in memory, while the CLI credential store writes directly and has no cross-process transaction. A server override can currently be resolved independently of the server recorded in credentials, so the admin entry point needs an explicit pre-bearer boundary.

The repository has production/development Docker assets and an ephemeral OIDC harness, but no persistent admin playground. The harness already demonstrates isolated Compose ownership and loopback DNS preflight patterns; MailHog is already a required test dependency.

### Relevant Files

| File                                           | Current purpose                               | Required change                                                                          |
| ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/cli/src/index.ts`                    | Registers CLI commands and global options     | Register `admin`; remove `gui`                                                           |
| `packages/cli/src/commands/gui.ts`             | Dynamically imports the retired GUI package   | Delete after command contract is specified                                               |
| `packages/cli/src/commands/login.ts`           | Runs login and persists one profile           | Delegate to shared UI-neutral coordinator                                                |
| `packages/cli/src/auth/browser-flow.ts`        | PKCE/state callback and token exchange        | Add nonce and verified JOSE identity processing; remove direct terminal-reader ownership |
| `packages/cli/src/auth/metadata.ts`            | Fetches issuer discovery metadata             | Supply exact issuer/JWKS inputs to verifier                                              |
| `packages/cli/src/credential-store.ts`         | Loads and directly writes one credential file | Validate shape, lock, and atomically persist rotated credentials                         |
| `packages/cli/src/global-options.ts`           | Resolves flag/environment/credential server   | Preserve priority and expose absence to the TUI prompt                                   |
| `packages/cli/src/client-factory.ts`           | Creates SDK clients and auth provider         | Enforce selected-server binding before bearer use; opt into refresh transaction          |
| `packages/sdk/src/auth/cli-auth.ts`            | Refreshes access/refresh tokens in memory     | Add validated, opt-in persistence/locking transaction and single-flight behavior         |
| `packages/sdk/src/transport/node-transport.ts` | Retries once after a 401 refresh              | Consume the transactional refresh result without changing default consumers              |
| `packages/cli/package.json`                    | CLI runtime dependencies and package contents | Add lockstep JSVision core/UI plus the exact reviewed kernel-lock utility                |
| `package.json`                                 | Root orchestration                            | Add `admin:env` lifecycle entry point                                                    |
| `test-harness/scripts/check-loopback-dns.mjs`  | Existing A-record preflight pattern           | Reuse behavior through playground-local ownership and add no-AAAA proof                  |
| `packages/server/src/cli/commands/init.ts`     | Initializes an organization/admin/client      | Reuse bootstrap behavior; update post-init guidance to `porta admin`                     |
| `docker/`                                      | Existing development/production assets        | Add isolated `docker/admin-playground/` assets only                                      |

### Proven Feasibility

- Current JSVision core/UI packages support Node 22 ESM, application/menu/dialog primitives, asynchronous work, terminal restoration, and headless rendering tests. An isolated install/import probe successfully constructed an application and UI control. (AR-4, AR-19–AR-22)
- Porta already depends on `jose` in the CLI, so complete ES256 verification can reuse an established runtime dependency rather than adding a second JOSE implementation. (AR-27)
- `porta init` already creates the public PKCE client and marks the bootstrap administrator email verified, so the playground can compose existing operations rather than add a bootstrap bypass. (AR-12, AR-23)
- `porta-admin-playground.ci.portaidentity.com` currently resolves to IPv4 loopback with no AAAA response; startup must re-prove this rather than trusting the observation. (AR-9)

## Gaps Identified

### Gap 1: No Embedded Administration Runtime

**Current behavior:** `porta gui` loads an absent optional browser-GUI package.

**Required behavior:** `porta admin` directly starts a responsive JSVision shell in an interactive terminal.

**Fix required:** replace command registration, add the `src/admin/` boundaries, dependencies, and headless shell tests. (AF-01–AF-05)

### Gap 2: Identity Is Decoded, Not Authenticated

**Current behavior:** token response identity uses unverified JWT payload decoding and has no nonce.

**Required behavior:** verify ES256 signature and all confirmed OIDC claims before any identity is stored or displayed.

**Fix required:** introduce a testable verifier, bind nonce through authorization/token processing, and share the corrected coordinator with `porta login`. (AF-06, AF-07)

### Gap 3: Refresh Is Not a Durable Transaction

**Current behavior:** SDK refresh rotation is memory-only; CLI storage is a direct write; concurrent CLI processes are uncoordinated.

**Required behavior:** opt-in refresh locking and atomic persistence complete before the SDK exposes the refreshed access token.

**Fix required:** extend the SDK public auth contract, align optional refresh-token types, add shape validation and single-flight, then implement CLI filesystem hooks. (AF-09, AF-10)

### Gap 4: Stored Credentials Can Be Paired With Another Selected Server

**Current behavior:** global server resolution and credential loading are independent inputs to client creation.

**Required behavior:** exact normalized origin equality is checked before any bearer is sent, followed by live UserInfo verification.

**Fix required:** centralize selected-server/session evaluation and represent unauthenticated versus authenticated-but-unauthorized states. (AF-03, AF-08)

### Gap 5: No Persistent Mail-Capable Playground

**Current behavior:** existing environments serve development or black-box testing and do not provide an owned, persistent admin exploration lifecycle.

**Required behavior:** one isolated lifecycle command safely owns trusted TLS, runtime secrets, Compose, initialization, health, MailHog, persistence, and bounded reset.

**Fix required:** add playground assets/scripts/tests and technical documentation without changing existing environments. (AF-12–AF-16)

## Dependencies

### Internal Dependencies

- CLI global option parsing, prompt/output/error conventions, credential store, OIDC metadata/callback/PKCE modules, and SDK client factory.
- SDK CLI auth provider and Node transport retry behavior.
- Server migration/init commands, configuration schema, nginx-compatible forwarding behavior, and MailHog SMTP configuration.
- Root Yarn/Turbo orchestration, structure tests, assurance registry, retained UI/harness, and public/technical docs.

### External Dependencies

- Direct runtime dependencies: compatible lockstep releases of `@jsvision/core` and `@jsvision/ui`, plus one narrow `fs-ext-extra-prebuilt@2.2.13` kernel-lock utility used by credential and playground adapters. (AR-22, AR-35)
- Existing `jose` dependency for remote-JWKS ES256 verification.
- Local operator tools for the playground: Docker Compose, mkcert, a locally trusted mkcert CA, and a resolver capable of A/AAAA queries.

## Risks and Concerns

| Risk                                                      | Likelihood   | Impact   | Mitigation                                                                                                                             |
| --------------------------------------------------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid ID token accepted as identity                     | Existing gap | Critical | Nonce and complete JOSE/claim specification before implementation; protocol/security assurance (AR-27)                                 |
| Token sent to a different environment                     | Medium       | Critical | Exact origin comparison before auth provider/client construction (AR-7)                                                                |
| Refresh rotation loses the only usable refresh token      | Medium       | High     | Freeze dispatch/commit states, preserve omitted token, atomic-save before expose, and never replay indeterminate grants (AR-17, AR-34) |
| TUI leaves terminal in raw/broken state                   | Medium       | High     | Native host owns terminal mode; centralized finalization; headless and PTY exit tests (AR-19, AR-26)                                   |
| Remote errors leak sensitive content                      | Medium       | High     | Typed allowlisted categories and bounded redacted diagnostics (AR-26)                                                                  |
| Persistent database becomes unreadable after secret churn | Medium       | High     | Serialize mutation and rotate only after every exact data volume is proven absent (AR-8, AR-13, AR-39)                                 |
| Public loopback DNS drifts or gains IPv6                  | Low          | High     | Fail closed before Compose if A/AAAA contract is not exact (AR-9)                                                                      |
| Playground reset affects unrelated Docker state           | Low          | Critical | Fixed project name, exact volume allowlist, confirmation, and destructive-scope tests (AR-14)                                          |
| JSVision package/API incompatibility                      | Low          | Medium   | Exact lockstep dependencies, frozen install, build, headless tests, and packed CLI smoke (AR-4, AR-22, AR-25)                          |
