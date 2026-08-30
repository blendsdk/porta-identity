# Testing Strategy: Applications and OIDC Clients

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The immutable specification suite covers the server safety boundary, corrected public contracts,
both terminal workspaces, and shell integration. Implementation tests cover internal validation,
state transitions, rendering, and failure mechanics. Real PostgreSQL/Redis/MailHog and a real
`oidc-provider` instance are used where behavior crosses those boundaries (AR-6).

### Coverage Goals

Use the repository's existing enforced coverage policy; this plan does not add a second numerical
threshold. Every RD-04 happy path, rejection path, ownership boundary, and secret-handling terminal
transition receives direct behavior coverage (AR-1, AR-6).

## 🚨 Specification Test Cases

> These cases are immutable requirement-derived oracles. Implementation must change when it
> disagrees with a case; the expected behavior must not be weakened to match implementation.

### Server Safety and Runtime

| #      | Input / Scenario                                                                                                           | Expected Output / Behavior                                                                                                                                | Source                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| ST-01  | Create a public authorization-code client with auth method `none`, PKCE enabled, and one exact absolute redirect URI       | Validation succeeds and runtime requires PKCE                                                                                                             | RD-04 AC-08; 03-01 §Shared Protocol Compatibility |
| ST-02  | Submit a public client with `client_secret_basic`, `client_credentials`, or PKCE disabled                                  | Validation rejects each combination before persistence                                                                                                    | RD-04 Validation and supported client values      |
| ST-03  | Submit a confidential client with auth method `none`                                                                       | Validation rejects the combination before persistence                                                                                                     | RD-04 Validation and supported client values      |
| ST-04  | Submit a redirect URI containing a fragment or wildcard, or an allowed origin containing a path/query/fragment/credentials | Validation rejects the exact invalid entry                                                                                                                | RD-04 Validation and supported client values      |
| ST-05  | Submit the same supported protocol input through Admin create and data import                                              | Both paths accept or reject it identically                                                                                                                | RD-04 focused server corrections                  |
| ST-06  | Update/deactivate module M through application A when M belongs to application B                                           | Return not-found and leave M unchanged                                                                                                                    | RD-04 AC-06; 03-01 §Nested Parent Integrity       |
| ST-07  | Revoke secret S through client A when S belongs to client B                                                                | Return not-found and leave S active                                                                                                                       | RD-04 AC-12; 03-01 §Nested Parent Integrity       |
| ST-07A | Create a client with only client-create, only app-read, or both permissions                                                | Either single permission returns 403 before service dispatch; both allow validated dispatch                                                               | RD-04 Authorization                               |
| ST-07B | Generate or list secrets for a public or revoked client                                                                    | The server returns the same rejection as an absent eligible parent                                                                                        | RD-04 AC-09, AC-12                                |
| ST-07C | Generate a resulting total of 10 or 11 secrets, including two concurrent attempts from 9; upgrade with 10 or 11 existing   | Generation permits total 10 and atomically rejects total 11; migration accepts 10 and aborts without mutation at 11                                       | RD-04 Security Considerations; AR-4               |
| ST-08  | Apply the role correction to an initialized database twice                                                                 | `porta-app-admin` has exactly one `admin:org:read` mapping                                                                                                | RD-04 AC-01; AR-5                                 |
| ST-09  | Authenticate with either of two modern active, unexpired confidential-client secrets using Basic and post                  | Every credential authenticates through the real provider                                                                                                  | RD-04 AC-12; AR-4                                 |
| ST-10  | Authenticate with a wrong, expired, revoked, unknown-client, public-client, malformed, or duplicate-mechanism credential   | Authentication fails without credential/internal-detail disclosure                                                                                        | RD-04 Security Considerations; AR-4               |
| ST-10A | Authenticate a client having only modern active secrets with a valid or wrong credential                                   | Indexed SHA-256 decides the modern path without Argon2 verification                                                                                       | RD-04 AC-12; AR-4                                 |
| ST-10B | Send legacy attempts with 0, 10, and 11 candidates plus concurrent valid/invalid attempts from distinct source addresses   | 0/10 perform at most that many Argon2 checks; 11 fails closed; busy/rate-limited requests receive fixed 429/Retry-After without credential classification | RD-04 Security Considerations; AR-4               |
| ST-11  | Generate one modern secret for a client that retains an active legacy Argon2-only secret, then authenticate with either    | Both secrets authenticate during overlap                                                                                                                  | AR-7                                              |
| ST-12  | Authenticate a legacy-only client with no SHA-backed active secret                                                         | Authentication fails through the normal provider category without internal detail disclosure                                                              | AR-7                                              |
| ST-13  | Revoke one overlapping secret, then issue a new authentication request with it                                             | The new request fails while another active secret still succeeds                                                                                          | RD-04 AC-12; AR-8                                 |
| ST-14  | Revoke at the middleware validation/provider handoff, then start another request                                           | Focused middleware integration permits the in-flight request to finish; real provider rejects the later request                                           | AR-8                                              |
| ST-15A | A confidential client persists `requirePkce=false`; a public authorization-code client persists or supplies false          | Runtime honors false for the confidential client and still requires PKCE for the public client                                                            | RD-04 focused server corrections                  |
| ST-15B | Deactivate or archive an application that already has an active client, then authenticate and try creating another client  | Existing active client still authenticates; new client creation for that application is rejected                                                          | RD-04 AC-05                                       |

### SDK and Conventional CLI

| #     | Input / Scenario                                                        | Expected Output / Behavior                                                                                                        | Source                  |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| ST-16 | Call application activate, deactivate, or archive with an internal UUID | SDK sends the corresponding existing POST route; no restore method exists                                                         | RD-04 SDK corrections   |
| ST-17 | Update an application with name and nullable description                | SDK sends only supported update fields; slug and organization ID are absent                                                       | RD-04 AC-04             |
| ST-18 | Update or deactivate a module                                           | SDK sends both internal application and module UUIDs to the existing nested route                                                 | RD-04 AC-06             |
| ST-19 | Call client create and server returns `{ client, secret }`              | SDK preserves `clientName`, full client fields, and optional secret `plaintext` exactly                                           | RD-04 AC-08, AC-11      |
| ST-20 | Call client activate, deactivate, or revoke with an internal UUID       | SDK sends the corresponding existing POST route; no restore method exists                                                         | RD-04 SDK corrections   |
| ST-21 | Revoke a secret with internal client and secret UUIDs                   | SDK sends POST to the existing nested revoke route                                                                                | RD-04 AC-12             |
| ST-22 | The second page of application/client `listAll` fails                   | Promise rejects and callers receive no partial collection                                                                         | RD-04 AC-02, AC-07      |
| ST-23 | Run every command in the bounded conventional CLI inventory             | Each argv maps to its named SDK call/internal IDs and sanitized human/JSON output; unsupported restore/remove commands are absent | 03-02 §Conventional CLI |

ST-23 covers exactly application create/list/get/update/activate/deactivate/archive; module
add/list/update/deactivate; client create/list/get/update/activate/deactivate/revoke; and secret
generate/list/revoke. It does not add command families.

### Admin State and Ownership

| #     | Input / Scenario                                                                                           | Expected Output / Behavior                                                                   | Source                        |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| ST-24 | A list/detail response contains an invalid UUID, enum, control character, or oversized remote text         | Service returns fixed `invalid-response` and publishes no invalid value                      | RD-04 Security Considerations |
| ST-25 | Organization changes while a client list/detail/mutation is pending                                        | Client state clears immediately and the late result cannot publish                           | RD-04 AC-13                   |
| ST-26 | Organization changes while the global application list is ready                                            | Application state remains global and retains its global label                                | RD-04 AC-13                   |
| ST-27 | Authentication is replaced or invalidated during either workspace                                          | Both states, pending operations, dialogs, and plaintext ownership clear                      | RD-04 AC-13                   |
| ST-28 | Mutation receives one definite 401 followed by a successful refresh                                        | It replays once and publishes only the validated result                                      | RD-04 AC-14                   |
| ST-29 | Mutation is cancelled, forbidden, conflicting, malformed, transport-failed, or indeterminate               | It does not retry; prior validated state remains; indeterminate blocks mutation until reload | RD-04 AC-14                   |
| ST-30 | A client response names an organization other than the active one, or a secret/module names another parent | Entire response is rejected before state publication                                         | RD-04 AC-06, AC-07, AC-12     |
| ST-31 | The same mutation action is activated twice while its dialog/operation is owned                            | Exactly one mutation dispatch occurs                                                         | RD-04 AC-13                   |

ST-24 uses one canonical valid UUID and one malformed value; every accepted enum and one unknown
value; each field's documented maximum length and maximum plus one; and one ASCII/C1-control case.
The application/client boundary tables below own the exact field maxima.

### Applications Workspace

| #     | Input / Scenario                                                                                 | Expected Output / Behavior                                                                          | Source             |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------ |
| ST-32 | Open Applications with app-read and no selected organization                                     | Complete global DataGrid loads with Name, Slug, Status and persistent global notice                 | RD-04 AC-01, AC-02 |
| ST-33 | Complete application catalog is empty or its underlying load fails                               | Explicit empty state is shown, or failed state with no partial rows                                 | RD-04 AC-02        |
| ST-34 | Open application detail                                                                          | Safe fields, timestamps, textual status, modules, global label, and permitted actions render        | RD-04 AC-03        |
| ST-35 | Create/edit with every value in the application boundary table; attempt slug edit after creation | Exact valid edges dispatch, adjacent invalid edges do not, and slug is immutable after creation     | RD-04 AC-04        |
| ST-36 | Deactivate/archive confirmation opens                                                            | It names the application and states new-client creation stops while existing clients remain enabled | RD-04 AC-05        |
| ST-37 | Open archived application or modules beneath it                                                  | Detail remains readable and all mutation actions are visible-disabled; no restore action exists     | RD-04 AC-04–AC-06  |
| ST-38 | Create/edit/deactivate a module under the selected application                                   | Returned same-parent module reloads the detail; no delete/restore action appears                    | RD-04 AC-06        |

#### Application and module field boundaries

| Field                         | Accepted cases                                      | Rejected adjacent cases                  |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------- |
| Name                          | lengths 1 and 255, control-free                     | lengths 0 and 256; any ASCII/C1 control  |
| Optional slug                 | omitted; lengths 3 and 100 with server-valid syntax | lengths 2 and 101; invalid server syntax |
| Optional/nullable description | omitted/null as applicable; lengths 0 and 2,000     | length 2,001; any disallowed control     |

### OIDC Clients Workspace

| #     | Input / Scenario                                                                            | Expected Output / Behavior                                                                                                  | Source                   |
| ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| ST-39 | No organization is active                                                                   | OIDC Clients remains visible-disabled with exactly `organization required`                                                  | RD-04 AC-01              |
| ST-40 | Open OIDC Clients with client-read                                                          | Complete same-organization DataGrid shows required columns; app name or immutable app ID fallback is used                   | RD-04 AC-07              |
| ST-41 | Open create or a focused Basic/Redirects/Protocol/Login action                              | One movable, vertically scrollable Layout DSL dialog opens on the requested tab; collection fields use DataGrid row actions | RD-04 AC-08, AC-09; AR-3 |
| ST-42 | Inspect every single-line field at normal and minimum supported sizes                       | Each remains exactly one terminal row and does not vertically stretch                                                       | RD-04 AC-15              |
| ST-43 | Leave an optional protocol field at `Server default` during create                          | Field is omitted from payload and replaced by authoritative returned value afterward                                        | RD-04 AC-18              |
| ST-44 | Create a confidential client with optional initial label                                    | Client is created and a one-time warning shows name, Client ID, label, plaintext, and fixed warning                         | RD-04 AC-11              |
| ST-45 | Create a public client                                                                      | Client is created and no secret dialog or plaintext state appears                                                           | RD-04 AC-11              |
| ST-46 | Close/cancel/resize/switch context/reauthenticate/quit while plaintext dialog owns a secret | Plaintext reference is permanently discarded and cannot be reopened                                                         | RD-04 AC-11              |
| ST-47 | Open secret management for a confidential non-revoked or legacy-only client                 | Metadata-only DataGrid renders, actions obey permissions, and legacy-only state explains modern-secret generation           | RD-04 AC-12; AR-7        |
| ST-48 | Open a revoked client or a public client's Secrets action                                   | Detail is read-only or secret actions are visible-disabled as applicable                                                    | RD-04 AC-09, AC-12       |
| ST-49 | Deactivate/revoke confirmation opens                                                        | It names both client and organization; revoke is permanent with no restore action                                           | RD-04 AC-10              |

#### Client and secret field boundaries

| Field            | Accepted cases                                                      | Rejected adjacent cases                                                 |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Client name      | lengths 1 and 255, control-free                                     | lengths 0 and 256; any ASCII/C1 control                                 |
| Redirect URIs    | 1 and 10 entries; each length 1 and 2,048 and an exact absolute URL | 0 and 11 entries; entry length 0 or 2,049; fragment or wildcard         |
| Post-logout URIs | 0 and 10 entries; each present value length 1 and 2,048             | 11 entries; present value length 0 or 2,049; fragment or wildcard       |
| Scope            | Server default; lengths 1 and 2,048, control-free                   | length 2,049; any ASCII/C1 control                                      |
| Allowed origins  | Server default; 0 and 10 exact origins; lengths 1 and 2,048         | 11 entries; length 0 or 2,049; path/query/fragment/credentials/wildcard |
| Secret label     | omitted; lengths 0 and 255, control-free                            | length 256; any ASCII/C1 control                                        |
| Secret expiry    | omitted or a valid instant                                          | malformed or otherwise invalid instant                                  |

#### Shared mutation oracle

| Operations                                            | Successful outcome                                                | Cancellation or failure outcome                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Application create/update/activate/deactivate/archive | Reload and publish the authoritative application/catalog          | Preserve the prior validated catalog/detail                         |
| Module add/update/deactivate                          | Reload the authoritative same-parent module/detail                | Preserve prior validated application detail                         |
| Client create/update/activate/deactivate/revoke       | Reload the authoritative same-organization client/catalog         | Preserve prior validated client view                                |
| Secret generate/revoke                                | Show returned plaintext once when generated, then reload metadata | Preserve prior metadata; never publish speculative plaintext/status |

### Shell, Layout, and Journey

| #     | Input / Scenario                                                                  | Expected Output / Behavior                                                                                              | Source                          |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| ST-50 | Navigate every control in the bounded interaction inventory by keyboard and mouse | Every named control is reachable and returns focus to its invoker                                                       | RD-04 AC-16                     |
| ST-51 | Move and close each dialog over populated content                                 | Dialog moves, covered content redraws cleanly, and no focus/command diagnostic leaks to terminal                        | RD-04 AC-16                     |
| ST-52 | Resize to 80×24 and 48×12, then below recovery threshold during a dialog          | Supported sizes remain usable; below threshold modal ownership clears and Quit remains reachable                        | RD-04 AC-16                     |
| ST-53 | Run packed journey against the playground                                         | Authenticate, manage an application/module and organization client/secret, switch context, and restore terminal on exit | RD-04 acceptance criteria; AR-6 |

ST-50 covers exactly the Applications and OIDC Clients menu items; both primary DataGrids and row
activation; application create/edit/activate/deactivate/archive; module Add/Edit/Deactivate;
client create, Basic, Redirects, Protocol, Login, Secrets, activate/deactivate/revoke; collection
Add/Edit/Remove; secret Generate/Revoke; tab selection; and every associated movable dialog and
confirmation.

## Test Categories

### Specification Tests

| Test File                                                                        | ST Cases Covered                                                | Component                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `packages/server/tests/unit/clients/client-contract-safety.spec.test.ts`         | ST-01–ST-08 including lettered subcases                         | Server validation/data/security        |
| `packages/server/tests/integration/clients/client-secret-overlap.spec.test.ts`   | ST-09–ST-13 including lettered subcases and later-request ST-14 | Real provider and secrets              |
| `packages/server/tests/integration/clients/client-runtime-policy.spec.test.ts`   | ST-15A–B                                                        | PKCE and application lifecycle runtime |
| `packages/server/tests/integration/middleware/client-secret-bridge.spec.test.ts` | Exact handoff part of ST-14                                     | Deterministic middleware boundary      |
| `packages/sdk/tests/applications-rd04.spec.test.ts`                              | ST-16–ST-18, ST-22                                              | SDK applications                       |
| `packages/sdk/tests/clients-rd04.spec.test.ts`                                   | ST-19–ST-22                                                     | SDK clients                            |
| `packages/cli/tests/commands/application-client-contracts.spec.test.ts`          | ST-23                                                           | Conventional CLI                       |
| `packages/cli/tests/admin/application-client-state.spec.test.ts`                 | ST-24–ST-31                                                     | Admin services/controllers             |
| `packages/cli/tests/admin/applications-workspace.spec.test.ts`                   | ST-32–ST-38, ST-50–ST-52                                        | Applications UI                        |
| `packages/cli/tests/admin/oidc-clients-workspace.spec.test.ts`                   | ST-39–ST-52                                                     | Clients UI                             |
| `packages/cli/tests/admin/application-client-runtime.spec.test.ts`               | Shell-owned ST-25–ST-27, ST-39, ST-50–ST-52                     | Shell/runtime                          |
| `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`                      | ST-53                                                           | Packed journey                         |

### Implementation Tests

| Test File                                                                          | Description                                                                                                                                                                 | Priority |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Existing server application/client unit suites plus focused `*.impl.test.ts` files | Validator branches, SQL results, migration idempotency, credential parsing, indexed modern matching, bounded legacy concurrency, rate guard, and provider adapter mechanics | High     |
| Existing SDK domain tests plus focused `*.impl.test.ts` files                      | Serialization, guards, pagination, wrappers, and errors                                                                                                                     | High     |
| `packages/cli/tests/admin/application-client-state.impl.test.ts`                   | Generation races, aborts, retained projections, and plaintext disposal                                                                                                      | High     |
| `packages/cli/tests/admin/applications-workspace.impl.test.ts`                     | Grid/dialog rendering, action availability, focus, and redraw internals                                                                                                     | Medium   |
| `packages/cli/tests/admin/oidc-clients-workspace.impl.test.ts`                     | Tabs, list editors, validation feedback, modal and resize internals                                                                                                         | High     |

### Exact Integration and Assurance Commands

Run from the repository root with Node 24 LTS. Service-backed commands use the repository's
documented PostgreSQL, Redis, and MailHog test services. The packed journey uses the locally supplied
playground administrator password; the value is never committed.

| Gate                   | Exact command                                                                                                             | Phase                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Server unit            | `yarn test:unit`                                                                                                          | Phase 1 and final     |
| Server integration     | `yarn test:integration`                                                                                                   | Phase 1 and final     |
| Server E2E             | `yarn test:e2e`                                                                                                           | Phase 1 and final     |
| Server pentest         | `yarn test:pentest`                                                                                                       | Phase 1 and final     |
| Browser OIDC           | `yarn test:ui`                                                                                                            | Phase 1 and final     |
| Retained OIDC harness  | `yarn harness:test`                                                                                                       | Phase 1 and final     |
| Protocol assurance     | `yarn assurance:harness --project protocol --profile operational`                                                         | Phase 1 and final     |
| Production security    | `yarn assurance:harness --project security --profile production-security`                                                 | Final                 |
| SDK verify             | `yarn workspace @portaidentity/sdk verify`                                                                                | Phase 2 and final     |
| CLI/Admin verify       | `yarn workspace @portaidentity/cli verify`                                                                                | Phases 2–6 and final  |
| Packed Admin UI        | `test -n "${PORTA_ADMIN_PLAYGROUND_PASSWORD:-}" && node --test docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs` | Phase 6 and final     |
| Public docs            | `yarn docs:build`                                                                                                         | Final                 |
| Root verification      | `yarn verify`                                                                                                             | Every phase and final |
| Admin compatibility    | `yarn assurance:compat --select p1-admin`                                                                                 | Final clean commit    |
| Protocol compatibility | `yarn assurance:compat --select protocol`                                                                                 | Final clean commit    |

Final compatibility qualification requires an authorized commit-capable execution mode. Under
`--no-commit`, implementation may proceed, but plan completion stops before compatibility until a
clean committed revision is authorized. This execution is already authorized for `--auto-commit`.

## Test Data

Use dedicated organizations, global applications, modules, public/confidential clients, and
modern/legacy secret fixtures. No credential is logged or committed. Service-backed tests create
and clean their own records; immutable migration fixtures cover an already initialized App Admin.

## Verification Checklist

- [ ] All ST cases have concrete input and expected behavior with owning sources.
- [ ] Each `*.spec.test.*` is written and observed red before its implementation.
- [ ] All specification and implementation tests pass.
- [ ] Every exact phase-applicable command in the table passes.
- [ ] Node 24 LTS `yarn verify` passes.
- [ ] Phase 1 and final black-box OIDC gates pass.
- [ ] Clean committed `p1-admin` and `protocol` compatibility selectors pass.
