# Portability and Documentation: Consent Flag Surfaces

> **Document**: 03-04-portability-and-docs.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Overview

The portability export/import contract must carry the consent flag so a backup followed by a restore
does not silently trust a third-party client. The client-field documentation must list the field so
operators can discover it. This document owns both.

## Architecture

### Current Architecture

The portability contract for clients is: read in `packages/server/src/portability/repository.ts`
(SELECT list and import insert), typed by `types.ts`, validated by `schema.ts`, compared by
`plan-support.ts`, and written by `import-user-client-writers.ts`. The SDK mirrors the import payload
in `packages/sdk/src/types/imports.ts`. All of these carry `require_pkce` but not
`require_consent`.

### Proposed Changes

Add `require_consent` everywhere `require_pkce` appears in the client export/import path, including
the SDK import type. The exported JSON key is `requireConsent` (the schema maps row → payload), and
the database column is `require_consent`.

## Implementation Details

### New Types/Interfaces

```ts
// packages/server/src/portability/types.ts — client row
readonly require_consent: boolean;

// packages/sdk/src/types/imports.ts — import payload client
readonly require_consent: boolean;

// packages/server/src/portability/schema.ts
require_consent: z.boolean(),
// exported payload field:
requireConsent: client.require_consent,
```

### New Functions/Methods

| File                            | Change                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `repository.ts`                 | Add `c.require_consent` to the export SELECT and to the import insert column list   |
| `import-user-client-writers.ts` | Add the column, the parameter, and `require_consent = $n` in the update statement   |
| `plan-support.ts`               | Compare `source.require_consent === destination.require_consent` in the client diff |

### Integration Points

- The SDK import type (03-01 area) must stay in exact agreement with the server payload; the
  type-contract test enforces it.
- The documentation lists the field in the same phase.

## Code Examples

```jsonc
// exported client fragment
{
  "clientId": "erp-connector",
  "requirePkce": true,
  "requireConsent": true,
}
```

## Error Handling

| Error Case                                           | Handling Strategy                                                              | AR Ref |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| An export from an older Porta lacks `requireConsent` | Schema treats the field as a required boolean; a missing flag fails validation | AR-2   |
| An import changes only the flag                      | The plan diff detects it and the writer updates `require_consent`              | AR-2   |

> **Traceability:** Every design choice references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Documentation Changes

| File                                  | Change                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `docs/api/clients.md`                 | Add the `require_consent` create field and updatable-field list |
| `docs/cli/clients.md`                 | Add the `--require-consent` flag row                            |
| `docs/database/schema.md`             | Add the `require_consent` column row                            |
| `techdocs/architecture/data-model.md` | Add the `require_consent` column row                            |
| `docs/database/migrations.md`         | **Out of scope** — pre-existing 029–032 gap (R-02, AR-7)        |

## Testing Requirements

- Server: extend `packages/server/tests/unit/portability/portability-engine.spec.test.ts` and
  `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts` (ST-10, ST-11,
  ST-12).
- SDK: extend `packages/sdk/tests/type-contracts/portability.spec.test.ts` for the import payload
  field.
- Docs: `yarn docs:build` succeeds.
