# Testing Strategy: Selective Environment Portability

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The applicable domain lenses are **web application**, **data and migration**, and **distributed and
concurrent state**. The last lens is limited to existing PostgreSQL transaction and post-commit
cache/session behavior; no new coordination system is in scope. (AR-1, AR-2)

### Coverage Goals

Behavioral coverage is owned by ST-1–ST-63 plus focused implementation edge tests. The plan does
not introduce arbitrary numeric coverage gates or broad coverage runs.

Test names use `should [expected behavior] when [condition]`. Specification tests are authored
without reading implementation logic and remain immutable oracles. Integration tests use real
PostgreSQL and Redis where state or cleanup is material. (AR-6)

## 🚨 Specification Test Cases

### Manifest and HTTP Contract

| #     | Input / Scenario                                                                                                                 | Expected Output / Behavior                                                                                                | Source                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| ST-1  | Parse a complete v1.0 manifest containing every collection, required UTC RFC 3339 `exported_at`, and no unknown fields           | Strict parse succeeds and preserves every portable field                                                                  | RD-02 AC-01, Manifest Schema Contract |
| ST-2  | Parse an unsupported version, unknown root/record field, omitted collection, or mapping with empty `permission_slugs`            | 400 `import_manifest_invalid`; no plan or mutation runs                                                                   | RD-02 AC-01                           |
| ST-3  | Export request has no category, duplicate categories, or an invalid category                                                     | Fixed 400 `export_request_invalid` with no exported content                                                               | RD-02 AC-03                           |
| ST-4  | Application-related category has neither/all and slugs nor both choices; unrelated categories carry an application selection     | Invalid combinations are rejected; only the exact application-selection contract is accepted                              | RD-02 AC-03, Manifest Schema Contract |
| ST-5  | Unauthenticated or base-permission-denied import sends a body larger than 100 KiB to any accepted canonical, slash, or case path | Existing 401/403 occurs before the protected 64 MiB parser exposes or parses content                                      | RD-02 AC-17, AC-21                    |
| ST-6  | Authenticated authorized import body exceeds 64 MiB on any accepted canonical, slash, or case path                               | 413 `import_manifest_too_large`; no plan/audit/product mutation occurs                                                    | RD-02 API Shape                       |
| ST-7  | Serialized export exceeds 64 MiB                                                                                                 | 413 `export_manifest_too_large`; no partial attachment is returned                                                        | RD-02 API Shape                       |
| ST-8  | Any export, preview, apply, or portability error response completes                                                              | `Cache-Control: no-store` is present                                                                                      | RD-02 AC-20, API Shape                |
| ST-9  | Authorized manifest export succeeds                                                                                              | Response is JSON with `Content-Disposition: attachment; filename="porta-manifest-<UTC timestamp>.json"`                   | RD-02 AC-20; AR-5                     |
| ST-10 | Permission combinations are tested for each operation/category and environment scope                                             | Exact closed union is required; environment additionally requires exact `porta-super-admin`; denial precedes content/plan | RD-02 Portability Permission Matrix   |

### Export, Plan, and Apply Engine

| #     | Input / Scenario                                                                                     | Expected Output / Behavior                                                                                                                                                            | Source                                         |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| ST-11 | Export one selected organization with `organizations` only                                           | Manifest contains that organization and every other collection is empty                                                                                                               | RD-02 AC-02–AC-04                              |
| ST-12 | Export environment scope from populated source                                                       | Every non-control-plane organization is included once; source control plane and Admin identities are absent                                                                           | RD-02 AC-02, AC-05                             |
| ST-13 | Export all applications or explicit application slugs                                                | Only selected non-`porta-admin` applications and each complete authorization graph are emitted                                                                                        | RD-02 AC-05, AC-06                             |
| ST-14 | Export users/assignments for selected scope and applications                                         | All scoped users appear; only selected-app roles/claims appear; users with no remaining relationship stay included                                                                    | RD-02 Category and Application Filter Contract |
| ST-15 | Export OIDC clients is unselected, then selected                                                     | Unselected produces empty clients; selected includes only matching selected-app clients and never implicitly exports apps                                                             | RD-02 AC-03, AC-09                             |
| ST-16 | Export every portable entity from a populated fixture                                                | Output contains no database UUID, database/record timestamp, audit, config, credential, session, lock, counter, key, secret, or original filename; root `exported_at` remains present | RD-02 AC-04, AC-08, AC-22                      |
| ST-17 | Export branding assets at valid media types and maximum decoded sizes                                | Exact bytes round-trip through base64; invalid media or excess decoded size is rejected                                                                                               | RD-02 Manifest Schema Contract                 |
| ST-18 | Export a locked source user                                                                          | Manifest user status is active and contains no lock/failure state                                                                                                                     | RD-02 AC-07                                    |
| ST-19 | Import has duplicate natural keys differing only by ordinary normalization                           | Entire plan is rejected with `duplicate_natural_key`; no mutation occurs                                                                                                              | RD-02 Matching and Compatibility Contract      |
| ST-20 | Permission slug has leading/trailing spaces and otherwise arbitrary content                          | Outer spaces are trimmed and remaining content is preserved for matching                                                                                                              | RD-02 Matching and Compatibility Contract      |
| ST-21 | Referenced parent is missing, ambiguous, cross-application, or cross-organization                    | Entire plan is rejected with the matching fixed safe code and at most 100 error items                                                                                                 | RD-02 AC-14, Result Contract                   |
| ST-22 | Request selects destination control plane or manifest includes any protected control-plane record    | Export returns 409 `export_scope_rejected` or import returns 409 `import_plan_rejected` before content/mutation                                                                       | RD-02 AC-05                                    |
| ST-23 | Client ID already belongs to a different organization or application                                 | Entire import returns 409 `import_plan_rejected` with `client_id_collision`; no existence details leak                                                                                | RD-02 AC-10                                    |
| ST-24 | Matched record has an incompatible immutable field                                                   | Entire import returns 409 `import_plan_rejected` with bounded safe result; no second record or immutable change occurs                                                                | RD-02 Matching and Compatibility Contract      |
| ST-25 | Dry-run plan contains creates, updates, skips, and a confidential client                             | Zero product/audit rows change, no secret is generated, and result reports ordered actions plus `credential_will_be_generated`                                                        | RD-02 AC-11, AC-16                             |
| ST-26 | Apply unchanged manifest immediately after successful preview                                        | Apply independently rebuilds the same plan without preview token/state and commits the selected mode                                                                                  | RD-02 AC-11                                    |
| ST-27 | Keep-existing imports matched/missing records and a role mapping with some existing permission edges | Matched fields stay unchanged; missing records/edges are created; aggregate mapping action is skipped/all existing, created/none existing, or updated/mixed                           | RD-02 AC-12, Result Contract                   |
| ST-28 | Update-existing imports matched and missing records                                                  | Only approved mutable fields/listed claim values change; missing records/relationships are created                                                                                    | RD-02 AC-13                                    |
| ST-29 | Destination contains records and relationships absent from manifest                                  | Both apply modes leave them unchanged and delete nothing                                                                                                                              | RD-02 AC-12, AC-13, AC-15                      |
| ST-30 | Plan contains all eleven collections in mixed input order                                            | Result and writes follow dependency order; items within groups sort by normalized natural key                                                                                         | RD-02 AC-14, Result Contract                   |
| ST-31 | Export execution or final planned import write/audit is forced to fail                               | Exact operation-specific 503 and request ID match one content-free log; import rolls back completely and returns no credential                                                        | RD-02 AC-15, AC-16, API Shape                  |
| ST-32 | Apply creates one confidential client                                                                | Exactly one new secret is generated, hashed, labeled `Imported`, committed, and returned once                                                                                         | RD-02 AC-16                                    |
| ST-33 | Apply creates public client or matches existing confidential client                                  | No secret is created or returned                                                                                                                                                      | RD-02 AC-16                                    |
| ST-34 | Secret generated on Jan 29–31 or another month-end boundary                                          | Expiry adds six UTC calendar months, preserves UTC time, and clamps to destination month end                                                                                          | RD-02 AC-16                                    |
| ST-35 | Update deactivates a user or removes effective authority                                             | After commit, only affected users lose sessions/tokens/grants/authority and changed caches invalidate; Redis is not awaited in the DB transaction                                     | RD-02 Security and Transaction Boundaries      |
| ST-36 | Apply updates an automatically locked destination user with manifest active/inactive status          | Active preserves destination lock/failure state; inactive deactivates without restoring source lock state                                                                             | RD-02 Security and Transaction Boundaries      |
| ST-37 | Inspect successful audit rows, logs, results, and later client reads                                 | Audit contains only allowed aggregates/digest metadata; prohibited manifest/secret/internal content never appears after the one apply result                                          | RD-02 AC-08, AC-20, AC-21                      |

### SDK Contract

| #     | Input / Scenario                                                              | Expected Output / Behavior                                                                                               | Source                                                   |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| ST-38 | `exports.manifest(request)` receives successful attachment                    | SDK posts the exact request and returns parsed manifest plus safe filename                                               | RD-02 SDK and CLI Contract; 03-03 §SDK Types and Methods |
| ST-39 | Export attachment filename is absent, absolute, or contains path traversal    | SDK returns safe AR-5 fallback and never exposes a path component                                                        | 03-03 §SDK Types and Methods; AR-5                       |
| ST-40 | `imports.preview(manifest)` succeeds or receives exact 409 plan rejection     | SDK posts mode `dry-run`; success or validated rejected-plan envelope returns typed result                               | RD-02 AC-18, Result Contract                             |
| ST-41 | `imports.apply(manifest, mode)` succeeds or receives exact 409 plan rejection | SDK posts the strict request; success or validated rejected-plan envelope returns typed result/credentials as applicable | RD-02 AC-18, Result Contract                             |
| ST-42 | Inspect public SDK client and exported types                                  | New three-method contract exists and legacy `imports.provision`/legacy mode types do not                                 | RD-02 AC-18, AC-22                                       |

### Conventional CLI

| #     | Input / Scenario                                                                                      | Expected Output / Behavior                                                                       | Source                      |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| ST-43 | Export receives neither/both scope flags, invalid/duplicate categories, or invalid application choice | yargs rejects before SDK invocation                                                              | 03-03 §Export Command; AR-4 |
| ST-44 | Valid export selects organization/categories/applications/output                                      | CLI calls SDK once and writes exactly one UTF-8 JSON manifest to the chosen path                 | RD-02 AC-18; AR-4           |
| ST-45 | Export file already exists                                                                            | CLI asks before replacing; refusal preserves file; `--yes` permits replacement                   | 03-03 §Export Command; AR-4 |
| ST-46 | Export uses global `--json`                                                                           | Status is structured path/filename/count metadata; manifest still exists only in the output file | 03-03 §Export Command; AR-7 |
| ST-47 | Import path is missing, unreadable, over 64 MiB, or invalid JSON                                      | Fixed CLI error and no SDK call                                                                  | 03-03 §Import Command       |
| ST-48 | Import preview is rejected                                                                            | Ordered bounded errors print, exit is nonzero, and apply is never called                         | RD-02 AC-11, AC-23          |
| ST-49 | Import preview succeeds without `--yes`, then user cancels/confirms                                   | Cancel performs no apply; confirm performs exactly one apply with original manifest and mode     | RD-02 AC-11, AC-18          |
| ST-50 | Import uses `--yes`                                                                                   | Preview still runs; only confirmation is skipped; apply runs only after successful preview       | RD-02 AC-18                 |
| ST-51 | Apply returns credentials in readable or `--json` mode                                                | Each committed secret is printed once; no retry or secondary persistence occurs                  | RD-02 AC-16, AC-18; AR-7    |

### Terminal Admin UI

| #     | Input / Scenario                                                                           | Expected Output / Behavior                                                                                                | Source                                 |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| ST-52 | Operator with both, export-only, or import-only capability opens Import / Export           | One maximized two-tab window opens on first authorized tab (Export preferred); unauthorized tab has no file or SDK action | 03-04 §Menu and Workspace; AR-3        |
| ST-53 | Selected organization exists; or no organization and exact super-admin role exists         | Selected organization is initial scope in first case; environment is initial scope only in second                         | 03-04 §Export Tab; AR-3                |
| ST-54 | UserInfo lacks exact `porta-super-admin`                                                   | Entire-environment choice is unavailable even if legacy/admin permissions exist                                           | RD-02 AC-17; 03-04 §Menu and Workspace |
| ST-55 | Export tab first renders                                                                   | OIDC clients are unchecked; controls use DSL padding/gaps and no fixed 48×12 sizing                                       | RD-02 AC-19                            |
| ST-56 | No category or invalid application selection exists                                        | Export action stays disabled; valid explicit selection enables it                                                         | RD-02 AC-03, AC-19                     |
| ST-57 | Export completes, then its save dialog is cancelled or the local write fails               | Cancellation writes no file but preserves the server audit; write failure shows fixed feedback and no false success/retry | 03-04 §Export Tab; AR-8                |
| ST-58 | Import file dialog is cancelled, or chosen file is unreadable/oversized/malformed          | Existing selection is preserved on cancel; invalid selection disables Apply and shows safe feedback                       | RD-02 AC-19, AC-23                     |
| ST-59 | File is selected and mode chosen but preview has not succeeded                             | Apply remains disabled                                                                                                    | RD-02 AC-11                            |
| ST-60 | Preview succeeds, then file or mode changes                                                | Preview summary clears immediately and Apply becomes disabled                                                             | RD-02 AC-11                            |
| ST-61 | Preview is rejected with multiple safe errors                                              | Errors group in dependency order and focus begins at the first invalid dependency                                         | RD-02 AC-23                            |
| ST-62 | Apply succeeds with and without generated credentials                                      | Counts remain visible; credentials force the selectable read-only one-time dialog before dismissal                        | RD-02 AC-20                            |
| ST-63 | Workspace closes, session changes, or local ownership is cancelled while a call is pending | Late result is ignored, landing focus restores, no retry occurs, and UI does not claim an in-flight apply was cancelled   | 03-04 §State and Cancellation; AR-3    |

## Test Categories

### Specification Tests

| Test File                                                                     | ST Cases Covered         | Component                      |
| ----------------------------------------------------------------------------- | ------------------------ | ------------------------------ |
| `packages/server/tests/unit/portability/manifest-contract.spec.test.ts`       | ST-1–ST-4                | Strict schema                  |
| `packages/server/tests/unit/routes/portability-routes.spec.test.ts`           | ST-5–ST-10, ST-22–ST-24  | HTTP/security contract         |
| `packages/server/tests/unit/portability/portability-engine.spec.test.ts`      | ST-11–ST-21, ST-25–ST-37 | Export/plan/apply contract     |
| `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts` | ST-11–ST-18, ST-25–ST-37 | Live PostgreSQL/Redis workflow |
| `packages/sdk/tests/domains/portability.spec.test.ts`                         | ST-38–ST-42              | SDK wire contract              |
| `packages/cli/tests/commands/portability.spec.test.ts`                        | ST-43–ST-51              | Conventional CLI               |
| `packages/cli/tests/admin/portability-workspace.spec.test.ts`                 | ST-52–ST-62              | Terminal Admin UI workspace    |
| `packages/cli/tests/admin/portability-application.spec.test.ts`               | ST-63                    | Admin application lifecycle    |

### Implementation Tests

| Test File                                                           | Description                                              | Priority |
| ------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| `packages/server/tests/unit/portability/manifest.impl.test.ts`      | Normalization, decoded asset bounds, ordering, error cap | High     |
| `packages/server/tests/unit/portability/authorization.impl.test.ts` | Permission union and exact-role helpers                  | High     |
| `packages/server/tests/unit/portability/plan.impl.test.ts`          | Internal resolved identifiers and action assembly        | High     |
| `packages/server/tests/unit/portability/apply.impl.test.ts`         | Writer, audit, secret-expiry, and cleanup branches       | High     |
| `packages/sdk/tests/domains/portability.impl.test.ts`               | Header filename normalization and transport errors       | Medium   |
| `packages/cli/tests/commands/portability.impl.test.ts`              | Path, prompt, output, and filesystem errors              | Medium   |
| `packages/cli/tests/admin/portability-controller.impl.test.ts`      | Generation, cancellation, state ownership, and focus     | Medium   |

### Integration Tests

| Test                           | Components                | Description                                                                                 |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------- |
| Full selected-graph round trip | Server, PostgreSQL, Redis | Export populated fixture; import into reset initialized destination; compare portable graph |
| Atomic rollback                | Server, PostgreSQL        | Fail final write/audit and prove zero partial state/credential output                       |
| Targeted authority cleanup     | Server, PostgreSQL, Redis | Deactivate/reduce authority and prove only affected users are revoked after commit          |
| Protected request limit        | Koa middleware/routes     | Prove auth/permission run before 64 MiB parsing and ordinary routes retain 100 KiB          |

### Workflow Evidence

| Scenario                   | Planned evidence                                                                                    | Expected Result                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Conventional CLI transfer  | Live server round trip plus SDK compatibility assurance and mocked CLI filesystem/prompt workflow   | Selected graph matches; destination control plane and credentials remain independent |
| Terminal Admin UI workflow | Live server round trip plus headless Admin workspace/controller/application workflow specifications | State gates work and any generated secret appears once                               |

No new browser E2E case is planned because RD-02 changes no OIDC browser behavior. (AR-6)

## Test Data

### Fixtures Needed

- Source with control plane, two ordinary organizations, multiple global applications, every
  authorization relationship, users, claims, public/confidential clients, and branding assets.
- Reset destination initialized with its own control-plane graph and credentials.
- Collision, incompatible-parent, duplicate-key, locked-user, month-end, hostile-value, and
  final-write-failure variants.

### Mock Requirements

- Use real PostgreSQL/Redis for transaction and cleanup specifications.
- Mock only SDK transport, CLI filesystem/prompt, JSVision host/file dialog, and forced database
  failure seams in their focused unit tests.

## Verification Checklist

- [ ] Every ST case is implemented before its component implementation.
- [ ] Each new specification suite is observed failing for the missing behavior.
- [ ] Immutable expectations remain unchanged while implementation turns them green.
- [ ] Implementation suites cover internal edges and failures.
- [ ] Server, SDK, CLI, terminal Admin UI, structure, documentation, security assurance, compatibility
      assurance, and final `yarn verify` gates pass per AR-6.
- [ ] `yarn test:ui` runs only if execution changes browser-facing OIDC behavior.
