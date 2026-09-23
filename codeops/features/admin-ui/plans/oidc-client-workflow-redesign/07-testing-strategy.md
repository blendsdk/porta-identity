# Testing Strategy: OIDC Client Workflow Redesign

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The selected lenses are web application and data/compatibility. Tests cover authenticated Admin API
input, the additive SDK boundary, organization-scoped terminal state, secret non-retention, terminal
layout, and compatibility when expiry is omitted. Existing real services and repositories are used
where the current suites provide them; mocks remain limited to established transport and dialog
boundaries.

### Coverage Goals

| Code type | Target |
|---|---|
| Secret expiry validation and serialization | Every accepted and rejected boundary |
| Admin UI registration and editor behavior | Every RD-04 acceptance path changed by this plan |
| Context and plaintext security | Every affected failure/cancellation transition |
| Existing OIDC behavior | No regression in affected package suites and retained harness |

## 🚨 Specification Test Cases

### Server and SDK Initial-Secret Contract

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-1 | Confidential create with `secretExpiresAt: 2027-03-08T00:00:00.000Z`, while request time is earlier | 201 response; returned secret carries that expiry and plaintext appears only in the create response | RD-04 AC-11; 03-01 §Public Contract |
| ST-2 | Confidential create omits `secretExpiresAt` | 201 response; generated secret has `expiresAt: null` | AR-7, AR-11; 03-01 §Compatibility |
| ST-3 | Public create includes label and future `secretExpiresAt` | Client is created without a secret or plaintext response | RD-04 AC-11; 03-01 §Validation |
| ST-4 | Create or rotation supplies malformed or parseable non-ISO expiry, or an initial/rotated label containing C0, DEL, or C1 controls | Sanitized 400 response; neither client nor secret creation proceeds | RD-04 acceptance 6 and validation; 03-01 §Error Handling |
| ST-5 | Client create supplies expiry equal to or before frozen request time | Sanitized 400 response; neither client nor secret creation proceeds | RD-04 validation; 03-01 §Validation |
| ST-6 | Secret rotation supplies expiry equal to or before frozen request time | Sanitized 400 response; no secret row is stored | RD-04 AC-12; 03-01 §Validation |
| ST-7 | Secret rotation omits expiry | Generated secret has `expiresAt: null` and remains metadata-only after the one-time response | AR-7; 03-01 §Compatibility |
| ST-8 | SDK create receives `secretExpiresAt` | Request body contains the exact supplied ISO string and response validation remains unchanged | AR-11; 03-01 §Integration Points |
| ST-9 | Existing SDK caller omits the new field | Request body has no `secretExpiresAt`; TypeScript contract remains valid | AR-7, AR-11; 03-01 §Compatibility |

### Registration and Navigation

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-10 | Open Create client with an active organization and active application | Compact dialog shows name, application, client type, application type, and one redirect URI; no advanced protocol/login collections appear | RD-04 AC-08; AR-3 |
| ST-11 | Required registration value is empty or invalid | Create is disabled and no intent is returned | RD-04 acceptance 6; 03-02 §Compact Registration |
| ST-12 | Confidential registration first opens | Secret label is optional; expiry is initially 6 months from the frozen civil date | RD-04 AC-11; AR-6 |
| ST-13 | Registration changes client type to public | Secret controls are unavailable and resulting payload omits `secretLabel` and `secretExpiresAt` | RD-04 acceptance 6; 03-02 §Compact Registration |
| ST-14 | Valid registration succeeds with a returned confidential secret | One-time dialog shows the exact expiry or `Never` and completes first; then `select(created.id)` authoritatively reloads the client and publishes its focused Overview | RD-04 AC-11, AC-14; AR-12 |
| ST-15 | Valid public registration succeeds | No secret dialog opens; `select(created.id)` authoritatively reloads the client and publishes its focused Overview | RD-04 AC-09, AC-14; AR-12 |
| ST-16 | Organization changes while registration or secret presentation is active | Owned work aborts, plaintext is discarded, and no prior-organization client is published | RD-04 AC-13; 03-02 §Error Handling |
| ST-17 | Create returns failure or outcome-unknown | Prior validated list remains; no client placeholder or secret is retained | RD-04 AC-14; 03-02 §Error Handling |

### Detail Workspace

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-18 | Select one client from the list | Maximized OIDC Clients surface displays Overview with captioned identity/context regions, concise authoritative Protocol/Login summaries, and separate section navigation | RD-04 AC-09, AC-18; AR-4 |
| ST-19 | Navigate through every detail section | One `ListBox` selects Overview, Authentication, Protocol, Login experience, Credentials, or Lifecycle within the same module surface | RD-04 acceptance 7; 03-02 §Detail Sections |
| ST-20 | View a public client | Credentials shows no secret operations; all other applicable sections remain reachable | RD-04 AC-11; 03-02 §Detail Sections |
| ST-21 | Render at 80×24, 48×12, then repeated shrink/grow cycles | The same selected `ListBox` appears left at normal size and above content at compact size; sections and bottom Back navigation remain reachable with no stale border, tab surface, or hard-coded scroller artifact | RD-04 AC-15–AC-16; AR-4 |
| ST-22 | Inspect action widths in detail and dialogs | Layout DSL allocates each button from its complete label with leading and trailing padding | RD-04 presentation directive; 03-02 §Detail Sections |

### Authentication Collection Editors

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-23 | Select the second redirect URI, stage an edit, switch among all three collection choices at 48×12, and return | One reused grid/input/action region follows the selector; staged values and selection remain intact | RD-04 acceptance 8, AC-16; AR-5, AR-10 |
| ST-24 | Add a valid unique redirect URI below the ten-row limit | Row appears at the end locally; no SDK update occurs before Save | AR-5, AR-10 |
| ST-25 | Edit a selected URI to a valid unique value | That row changes in place locally and collection order is preserved | AR-5, AR-10 |
| ST-26 | Enter or directly submit an exact duplicate in any redirect, logout, or origin array | UI validation blocks Add/Edit/Save, and the existing shared server validator rejects SDK/Admin API bypass attempts | RD-04 AC-09 and validation; AR-5 |
| ST-27 | For each applicable collection, enter an empty, wildcard, fragmented, malformed, overlength, path-bearing origin, or credential-bearing origin | Fixed validation appears and the collection remains unchanged | RD-04 validation; 03-03 §Error Handling |
| ST-28 | One redirect URI remains selected | Remove is disabled and the required row remains | RD-04 acceptance 8; AR-5 |
| ST-29 | Redirect has 1/10/11 candidates, while logout and origin have 0/10/11 candidates | Required minima and ten-row maxima are enforced; Add is disabled at ten while Edit/Remove remain selection-aware | RD-04 AC-09; AR-5 |
| ST-30 | Save valid staged redirect, logout, and origin collections | Exactly one update intent contains all complete replacement arrays in displayed order | AR-10; 03-03 §Authentication Collections |
| ST-31 | Cancel after staged collection edits | No update intent is emitted and authoritative client state remains unchanged | AR-10; 03-03 §Authentication Collections |

### Login and Secret Expiry Editors

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-32 | Client has `loginMethods: null` and effective Password + Magic link | Inheritance is selected, both effective methods are displayed, and method editing is disabled | RD-04 AC-09; AR-8 |
| ST-33 | Turn inheritance off and select only Password, only Magic link, then both | Save emits respectively `['password']`, `['magic_link']`, and both values | RD-04 acceptance 13; AR-8 |
| ST-34 | Turn inheritance off with neither method selected | Save is disabled until at least one method is selected | RD-04 acceptance 13; 03-03 §Login Experience |
| ST-35 | Save with inheritance selected | Update emits `loginMethods: null` and displays server-returned effective methods after reload | AR-8; 03-03 §Login Experience |
| ST-36 | From frozen 2026-09-07 choose 3/6/12/24 months; separately choose 3 months from 2026-01-31 | Selected dates are 2026-12-07, 2027-03-07, 2027-09-07, and 2028-09-07 with next-day `00:00:00.000Z` payloads; month-end clamps to 2026-04-30 and serializes as `2026-05-01T00:00:00.000Z` | RD-04 AC-12; 03-03 §Secret Expiry Selector |
| ST-37 | Choose custom 2027-03-31 | Payload expiry is `2027-04-01T00:00:00.000Z` | AR-7; 03-03 §Secret Expiry Selector |
| ST-38 | Choose today or an earlier custom date | Generate/Create is disabled and future-date validation is shown | RD-04 AC-12; AR-6 |
| ST-39 | Choose a date more than 24 calendar months away | Rotation warning appears; Generate/Create remains available | RD-04 acceptance 11; AR-6 |
| ST-40 | Choose Never | Exact rotation warning appears, no extra confirmation opens, and expiry is omitted | RD-04 AC-12; AR-6–AR-7 |
| ST-41 | Credentials receives an empty secret collection | Metadata DataGrid remains visible with its columns and Generate remains available for an authorized confidential client | RD-04 AC-12; 03-03 §Credentials |
| ST-42 | Credentials contains revoked and active rows | Revoke is enabled only for the selected active row and sends its exact client/secret IDs | RD-04 AC-12; 03-03 §Credentials |
| ST-43 | Generate returns plaintext, then dialog closes/redraws/context changes | Plaintext is absent from retained state, grids, status, logs, and later renders | RD-04 AC-11–AC-13; 03-03 §Credentials |

### Cross-Cutting Editor Contracts

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-44 | Table-driven public and confidential edits cover grants, fixed `code`, scope, token authentication, and PKCE | Every editable field maps once to `UpdateClientInput`; public emits `none`, excludes `client_credentials`, and requires PKCE; confidential emits a supported secret method, may include `client_credentials`, and preserves explicit PKCE | RD-04 AC-09 and compatibility rules; 03-03 §Protocol |
| ST-45 | Organization/session changes while one representative focused editor or its continuation update is active | The dialog aborts; a late result cannot publish into the replacement context. Reuse an existing controller assertion when it already covers the changed branch | RD-04 AC-13; 03-03 §Error Handling |
| ST-46 | Choose Edit name from Overview and submit a valid changed name | One `{clientName}` update intent is emitted, the authoritative client reloads, and all immutable identity/type fields remain unchanged | RD-04 AC-09, AC-14; 03-02 §Detail Sections |

## Test Categories

### Specification Tests

| Test File | ST Cases Covered | Component |
|---|---|---|
| `packages/server/tests/unit/routes/client-secret-expiry.spec.test.ts` | ST-1–ST-7 | Admin API expiry and secret-label boundary |
| existing `packages/server/tests/unit/clients/protocol-compatibility.spec.test.ts` | Server half of ST-26 | Shared server collection uniqueness |
| `packages/sdk/tests/type-contracts/client-secret-expiry-contract.spec.test.ts` | ST-8–ST-9 | SDK contract |
| `packages/cli/tests/admin/oidc-client-registration.spec.test.ts` | ST-10–ST-17 | Registration/controller |
| `packages/cli/tests/admin/oidc-client-detail.spec.test.ts` | ST-18–ST-22, ST-46 | Detail workspace and name edit |
| `packages/cli/tests/admin/oidc-client-editors.spec.test.ts` | ST-23–ST-45 | Focused editors |
| existing `packages/cli/tests/admin/oidc-clients-workspace.spec.test.ts` | Still-valid existing safety, focus, sizing, and lifecycle assertions | Revised RD-04 oracle migration |

### Implementation Tests

| Test File | Description | Priority |
|---|---|---|
| `packages/server/tests/unit/routes/client-secret-expiry.impl.test.ts` | Strict ISO/label Zod boundary and route-to-service plumbing | High |
| existing `packages/server/tests/unit/clients/validators.test.ts` | Exact duplicate implementation edges | High |
| `packages/sdk/tests/domains/client-secret-expiry.impl.test.ts` | Request serialization details | Medium |
| `packages/cli/tests/admin/oidc-client-registration.impl.test.ts` | Payload builders and file-split facade | High |
| `packages/cli/tests/admin/oidc-client-detail.impl.test.ts` | Section signal, focus, and render cleanup | Medium |
| `packages/cli/tests/admin/oidc-client-editors.impl.test.ts` | Collection/date helper edges and enabled states | High |
| existing `packages/cli/tests/admin/oidc-clients-workspace.impl.test.ts` | Replace superseded shared-tab/scroller assertions; preserve valid implementation coverage | High |

### Integration Tests

| Test | Components | Description |
|---|---|---|
| Initial secret expiry | Server route, service, repository | Persist future expiry and preserve null omission |
| Expired secret rejection | Secret repository and token endpoint | Existing expiry behavior remains authoritative |
| Admin client workflow | SDK facade and Admin controller | Create, present once, continue to Overview, edit and reload |

### End-to-End Tests

| Scenario | Steps | Expected Result |
|---|---|---|
| Retained OIDC harness | Run the existing SPA/BFF black-box workflow after contract changes | Existing authorization and token behavior passes unchanged |
| Browser Playwright | N/A | The changed UI is terminal-rendered, not browser-rendered; no new browser harness is created (AR-13) |

## Test Data

### Fixtures Needed

- Existing organization, global application, public client, and confidential client fixtures.
- Frozen clock values around today, tomorrow, month-end, 24 months, and beyond 24 months.
- Valid, duplicate, malformed, fragmented, wildcard, and maximum-length URI/origin values.

### Mock Requirements

- Existing SDK operation seams for Admin UI specification tests.
- Existing modal host and render-root test utilities for terminal interaction.
- No new test harness, clock service, server, or infrastructure abstraction.

## Verification Checklist

- [ ] All ST-1–ST-46 specification tests are written before their implementation.
- [ ] Each specification suite is observed failing for the missing behavior.
- [ ] Implementation makes the immutable specification expectations pass.
- [ ] Implementation tests cover internal boundaries without replacing specification assertions.
- [ ] `yarn test:structure` passes.
- [ ] `yarn workspace @portaidentity/server verify` passes.
- [ ] `yarn workspace @portaidentity/sdk verify` passes.
- [ ] `yarn workspace @portaidentity/cli verify` passes.
- [ ] `yarn docs:build` passes.
- [ ] `yarn harness:test` passes.
- [ ] `yarn assurance:harness --project protocol --profile operational` passes.
- [ ] From a clean committed implementation revision, `yarn assurance:compat --select p1-admin`
      and `yarn assurance:compat --select protocol` pass.
- [ ] Root `yarn verify` is not run (AR-13).
