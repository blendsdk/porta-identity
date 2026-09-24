# CLI Command: Consent Flag Surfaces

> **Document**: 03-02-cli-command.md
> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

## Overview

The conventional CLI must let an operator set the consent flag on create and update, and read it
back. This document owns the option name, the create/update semantics, and the `client get` display.

## Architecture

### Current Architecture

`packages/cli/src/commands/client.ts` defines `ClientCreateArgs` and `ClientUpdateArgs`, declares
yargs options, and maps them into SDK input objects. `client get` prints a two-column table;
`requirePkce` is already a row (`packages/cli/src/commands/client.ts:284`).

### Proposed Changes

Add a `require-consent` boolean option with **no default** to `create` and `update`. Because yargs
returns `undefined` for an unspecified boolean option with no default (verified on yargs 18.1.0),
the mapping spreads `requireConsent` only when the value is defined. `--no-require-consent` is
handled by yargs and yields `false`. Add one `client get` row.

## Implementation Details

### New Types/Interfaces

```ts
interface ClientCreateArgs {
  // ...
  'require-consent'?: boolean;
}
interface ClientUpdateArgs {
  // ...
  'require-consent'?: boolean;
}
```

### New Functions/Methods

```ts
// option (create and update)
.option('require-consent', {
  type: 'boolean',
  description: 'Show the consent page for this client (--no-require-consent disables it)',
})

// mapping into the SDK input (create and update)
...(argv['require-consent'] !== undefined && { requireConsent: argv['require-consent'] }),

// client get table row, next to 'Require PKCE'
['Require Consent', String(c.requireConsent)],
```

No `default: false` is set. A default would make an unrelated `client update` send
`requireConsent: false` and silently trust an existing third-party client (AR-3, AR-6).

### Integration Points

- Consumes the SDK `CreateClientInput` / `UpdateClientInput` from 03-01.
- `client list` is intentionally unchanged (AR-8).

## Code Examples

```bash
porta client create --org acme --app crm --name "ERP Connector" --require-consent
porta client get --org acme <client-id>            # -> Require Consent  true
porta client update --org acme <client-id> --no-require-consent
porta client update --org acme <client-id> --name "Renamed"   # flag untouched
```

## Error Handling

| Error Case                           | Handling Strategy                                                        | AR Ref |
| ------------------------------------ | ------------------------------------------------------------------------ | ------ |
| `update` without the option          | `requireConsent` is absent from the input; the stored value is unchanged | AR-3   |
| `update` with `--no-require-consent` | Sends `requireConsent: false` explicitly                                 | AR-3   |
| Unknown/typo flag                    | Existing yargs unknown-option handling                                   | —      |

> **Traceability:** Every design choice references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Testing Requirements

- Extend `packages/cli/tests/commands/application-client-contracts.spec.test.ts` for the contract
  (ST-4, ST-5, ST-6) and update `packages/cli/tests/commands/client.test.ts` fixtures and
  assertions.
