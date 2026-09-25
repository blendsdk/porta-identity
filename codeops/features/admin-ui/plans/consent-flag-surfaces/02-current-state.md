# Current State: Consent Flag Surfaces

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Existing Implementation

### What Exists

The server is complete. Migration `packages/server/migrations/032_client_require_consent.sql` added
`require_consent BOOLEAN NOT NULL DEFAULT FALSE`; `packages/server/src/clients/types.ts` exposes
`Client.requireConsent` and the create/update inputs; `packages/server/src/routes/clients.ts`
accepts `requireConsent` on create and update and returns the whole `Client` on read/list. The
interaction route reads the flag through the OIDC client metadata
(`packages/server/src/oidc/configuration.ts`). None of that changes here.

The four consumer surfaces do not carry the flag.

### Relevant Files

| File                                                                                                           | Purpose                                                | Changes Needed                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `packages/sdk/src/types/clients.ts`                                                                            | SDK `Client`, `CreateClientInput`, `UpdateClientInput` | Add `requireConsent` (required on `Client`, optional on inputs) |
| `packages/sdk/src/domains/clients.ts`                                                                          | `isClient` response guard                              | Validate `typeof value.requireConsent === 'boolean'`            |
| `packages/sdk/tests/clients-rd04.spec.test.ts`                                                                 | Enforced exact-type contract for `Client`/inputs       | Add the field to the fixture and the exact-type oracle          |
| `packages/cli/src/commands/client.ts`                                                                          | `client create` / `update` / `get` / `list`            | Add option, mapping, and the `get` line                         |
| `packages/cli/src/admin/client-state.ts`                                                                       | `AdminClient` UI model                                 | Add `requireConsent: boolean`                                   |
| `packages/cli/src/admin/client-service.ts`                                                                     | `clientValue` strict allowlist projection              | Validate and project `requireConsent`                           |
| `packages/cli/src/admin/client-workspace.ts`                                                                   | `protocolSection` editor                               | Add signal, `Switch`, dirty check, and save input field         |
| `packages/server/src/portability/types.ts`                                                                     | Portability client row type (`require_pkce`)           | Add `require_consent`                                           |
| `packages/server/src/portability/repository.ts`                                                                | Export SELECT and import insert columns                | Add `require_consent` to both                                   |
| `packages/server/src/portability/schema.ts`                                                                    | Export/import Zod schema                               | Add `require_consent`, map to `requireConsent`                  |
| `packages/server/src/portability/plan-support.ts`                                                              | Import plan diff comparison                            | Compare `require_consent`                                       |
| `packages/server/src/portability/import-user-client-writers.ts`                                                | Client import writer                                   | Add the column, parameter, insert, and update                   |
| `packages/sdk/src/types/imports.ts`                                                                            | SDK portability import type                            | Add `readonly require_consent: boolean`                         |
| `docs/api/clients.md`, `docs/cli/clients.md`, `docs/database/schema.md`, `techdocs/architecture/data-model.md` | Client-field documentation                             | List the field                                                  |

### Code Analysis

The SDK has no request builders or Zod schemas: `clients.create`/`update`
(`packages/sdk/src/domains/clients.ts:180-196`) pass the typed input object straight to the transport
as the body, and responses are validated by the hand-written `isClient` guard
(`packages/sdk/src/domains/clients.ts:40-75`). Adding a field is therefore a type-and-guard change,
and the enforced oracle is the exact-type test at `packages/sdk/tests/clients-rd04.spec.test.ts`.
Because that test is in the `tests/type-contracts/tsconfig.json` include list, a type mismatch fails
`yarn typecheck` — this is the strongest available contract check.

The CLI uses yargs 18. `login-methods` is the closest field-threading pattern: a `ClientCreateArgs`
member, a `.option(...)`, and a conditional spread into the SDK input
(`packages/cli/src/commands/client.ts:39-47,86-148`). `requirePkce` is displayed in the `client get`
table (`packages/cli/src/commands/client.ts:284`), which is the pattern for the new line.

The Admin UI `protocolSection` already renders `requirePkce` as a JSVision `Switch` with a signal, an
`isDirty()` check, and the value in the `save-protocol` input
(`packages/cli/src/admin/client-workspace.ts:397-459`). `clientValue` is a strict allowlist that
rejects a client where any known field is the wrong type
(`packages/cli/src/admin/client-service.ts:182-259`).

The portability contract reads clients in `repository.ts` and writes them in
`import-user-client-writers.ts`; the exported and imported shape is fixed by `types.ts` and
`schema.ts`, and the import plan compares existing rows in `plan-support.ts:434`.

## Gaps Identified

### Gap 1: SDK omits the flag

**Current Behavior:** `Client`, `CreateClientInput`, and `UpdateClientInput` have no `requireConsent`;
`isClient` does not validate it.
**Required Behavior:** `requireConsent: boolean` on `Client`, `requireConsent?: boolean` on both
inputs, validated by `isClient`.
**Fix Required:** Extend the types and guard; update the enforced exact-type oracle (AR-1, AR-2).

### Gap 2: CLI cannot set or show the flag

**Current Behavior:** `client create`/`update` have no `require-consent` option; `client get` does
not display it.
**Required Behavior:** `--require-consent` / `--no-require-consent` map into the SDK input; absent
leaves the client unchanged; `client get` prints "Require Consent" (AR-3, AR-8).

### Gap 3: Admin UI has no switch

**Current Behavior:** the Protocol tab edits `requirePkce` only.
**Required Behavior:** a "Require consent" `Switch` bound to the client's `requireConsent`, saved
through the existing `save-protocol` intent (AR-4, AR-5).

### Gap 4: Portability drops the flag

**Current Behavior:** export/import never read or write `require_consent`; a restore leaves the
column at the database default `false`.
**Required Behavior:** export includes `require_consent`, import writes it, and the import plan
detects a change (AR-2).

### R-02: Pre-existing migrations documentation gap (out of scope)

`docs/database/migrations.md` documents through migration 028; 029–032 are missing, including
DEF-21's `032_client_require_consent.sql`. This plan adds no migration and does not edit the page
(AR-7). Recorded here so a reviewer does not mistake it for an omission of this plan.

## Dependencies

### Internal Dependencies

- The server client API already accepts and returns `requireConsent` (DEF-21). No server API or
  schema change is required beyond the portability contract.
- The SDK `Client` shape is the contract the CLI and Admin UI state mirror.
- `packages/cli/src/admin/client-service.ts` strict projection means every `AdminClient` fixture in
  the Admin UI tests must gain the field once it becomes required on the type.

### External Dependencies

- Existing only: yargs (CLI), JSVision (Admin UI), Vitest (tests). No new dependency.

## Risks and Concerns

| Risk                                                                   | Likelihood | Impact | Mitigation                                                                                       |
| ---------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| CLI `update` silently trusts a client when the flag is read as `false` | Medium     | High   | Distinct `--no-require-consent`; spread the field only when defined (AR-3, AR-6); spec test ST-5 |
| Missing a required `AdminClient` fixture breaks many Admin tests       | High       | Low    | The compiler lists every fixture; update them in the same task as the type change                |
| Exact-type contract test drifts from the server shape                  | Low        | Medium | Update the oracle in Phase 1 (red) before touching the SDK types (AR-9)                          |
