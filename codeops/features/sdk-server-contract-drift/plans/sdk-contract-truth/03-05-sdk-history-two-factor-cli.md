# SDK History, Two-Factor, CLI, and Docs: SDK–Server Contract Truth

> **Document**: 03-05-sdk-history-two-factor-cli.md
> **Parent**: [Index](00-index.md)
> **Implements**: RD-01 R3, R4 (2FA), R10–R12

## Overview

This component finishes the contract alignment:

- the two-factor policy update accepts an `If-Match` token and returns the response ETag;
- the CLI claim-value and claim-definition commands use the real routes and fields;
- the classic CLI commands and the embedded admin services consume the corrected SDK return types;
- consumer docs, package docs, and the SDK changelog describe the final contracts;
- the SDK agent catalog reflects the corrected surface.

## Architecture

### Current Architecture

- `applications.getHistory` and `clients.getHistory` are out of this plan: their server routes call
  `getEntityHistory` with unsupported entity types and answer `500`; a separate server defect
  tracks them. The SDK's `requireData(..., Array.isArray)` guards return the bare array and drop
  `hasMore`/`nextCursor` (`packages/sdk/src/domains/applications.ts:158-168`, `clients.ts:211-224`);
  that fact must be recorded in the separate defect.
- `twoFactor.setPolicy` returns `TwoFactorPolicyResult` through `unwrapData` and accepts no `etag`
  argument (`packages/sdk/src/domains/two-factor.ts:33,72-76`), while the route honors `If-Match`
  and sets a fresh ETag (`packages/server/src/routes/two-factor-admin.ts:328,360`).
- `porta user claims` calls the phantom `userClaims` namespace
  (`packages/cli/src/commands/user-claim.ts:69,120,152`) with no application scope.
- `docs/guide/sdk.md` describes history as "the server's first-page history envelope" without
  parameters and says only `get()` carries an ETag.

### Proposed Changes

- Two-factor: `setPolicy(orgId, policy, etag?)` returns `ETagResponse<TwoFactorPolicyResult>` via
  `unwrapWithEtag` and sends the optional `If-Match` header.
- CLI claim values: add a required `--app <appId>` option to `list`, `set`, and `remove`; call
  `customClaims.getValuesForUser`, `getValue`, `setValue`, and `deleteValue`; print
  `definition.claimName` and the value.
- CLI claim definitions (`porta app claim`): map `--name` to `claimName` and `--type` to
  `claimType`, drop the phantom `slug`/`applicationId` payload fields and the `claim.slug`/
  `claim.valueType` output, and update the command tests and docs.
- CLI consumers: unwrap the new `ETagResponse` returns in `commands/org.ts` and `commands/user.ts`;
  adapt the `commands/org.ts`, `commands/client.ts`, and `commands/app.ts` history output to
  `HistoryResult`; unwrap `.data` in `admin/user-service.ts` (create/update) and
  `admin/organization-service.ts` (update, 2FA policy).
- Docs: update `docs/guide/sdk.md` (sort names, supported history params/envelope, write ETags,
  claims methods, removed types), `docs/api/organizations.md` (slug-validation section, reserved
  `new`), `docs/cli/users.md` and `docs/concepts/custom-claims.md` (required `--app`),
  `docs/cli/applications.md` (claim-definition fields), `docs/guide/sdk-agent.md` and
  `packages/sdk/README.md` (surface counts), and `packages/sdk/CHANGELOG.md` (`Unreleased`
  migration notes).
- Agent catalog: update return-type strings and add tool entries; there are no `userClaims.*`
  entries to remove.
- Compatibility probe: update `test-harness/consumers/tenant-admin-sdk-probe.mjs` to read
  `.data.id` from `users.update`.

## Implementation Details

### New Functions/Methods

Application/client history is not implemented here (deferred server defect; see
`02-current-state.md`).

`packages/sdk/src/domains/two-factor.ts`:

```typescript
setPolicy(
  orgId: string,
  policy: TwoFactorPolicy,
  etag?: string,
): Promise<ETagResponse<TwoFactorPolicyResult>>;
```

Implementation: send `headers: etagHeaders(etag)` and return `unwrapWithEtag<TwoFactorPolicyResult>(res)`.

`packages/cli/src/commands/user-claim.ts`:

- New required option `--app <appId>` on each subcommand, documented as the application that owns
  the claim definition.
- `list`: `customClaims.getValuesForUser(appId, userId)`, table columns `Claim ID`, `Claim Name`,
  `Value` fed from `definition.id`, `definition.claimName`, and `value.value`.
- `set`: `customClaims.setValue(appId, claimId, userId, value)`.
- `remove`: `customClaims.deleteValue(appId, claimId, userId)`.

`packages/cli/src/commands/app-claim.ts`:

- Send `{ claimName: argv.name, claimType: argv.type as ClaimValueType, description }`; drop the
  `slug` option and the `applicationId` payload field.
- Print `claim.claimName`/`claim.claimType` instead of `claim.name`/`claim.slug`/`claim.valueType`.

`packages/sdk/src/agent.ts`:

- `users.create` returns `ETagResponse<User>`.
- `users.exportData` returns `UserDataExport`.
- `customClaims.*` entries use `CustomClaimDefinition` / `CreateCustomClaimInput`.
- Add `customClaims.getValuesForUser`, `customClaims.setValue`, `customClaims.deleteValue`, and
  `userRoles.getEffectivePermissions` entries.

### Integration Points

- The CLI mock in `packages/cli/tests/commands/user.test.ts` is updated from `userClaims` to
  `customClaims` with the new signatures; `tests/commands/app.test.ts` is updated for the
  claim-definition field names, and the org/client/app command tests are updated for the
  `ETagResponse`/`HistoryResult` shapes they mock.
- The admin service tests (`tests/admin/user-service.spec.test.ts`,
  `organization-service.impl.test.ts`) feed the wrapped `{ data, etag }` shapes so the unwrapping
  is exercised.
- The `userClaims` client member disappears from `PortaClient`; this is part of the clean break
  (AR-10).

## Code Examples

### CLI usage after the change

```bash
porta user claims list --org <org-id> --app <app-id> <user-id>
porta user claims set --org <org-id> --app <app-id> <user-id> --claim <claim-id> --value engineer
porta user claims remove --org <org-id> --app <app-id> <user-id> --claim <claim-id>
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Missing `--app` in the CLI | yargs `demandOption` fails with a usage error before any request | AR-12 |
| Application/client history route | Server answers `500`; deferred to a separate server defect | AR-4 |
| Stale `If-Match` on policy update | Existing `409` → `PortaConflictError` | AR-5 |
| CLI claim not found | Server `404` → `PortaNotFoundError` handled by the existing CLI error handler | AR-12 |

> **Traceability:** every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec tests for ST-22 (2FA policy ETag round-trip) and ST-25–ST-27 (CLI claim values), plus the
  CLI consumer updates across the command and admin test suites.
- Application/client history (ST-16/ST-17) is withdrawn with the deferral.
- Docs are validated by `yarn docs:build`.
- Changelog wording is reviewed against the final type list.
- The registered `yarn assurance:compat` tenant-admin selector runs in Phase 4.
