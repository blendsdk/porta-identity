# SDK and CLI: PostgreSQL-Backed Global Configuration

> **Document**: 03-03-sdk-cli.md
> **Parent**: [Index](00-index.md)

## Overview

The SDK owns small public TypeScript types matching the API without depending on server internals.
The conventional CLI retains `config list|get|set`, obtains live metadata, converts one positional
string to the required native scalar, and shows bounds and restart behavior. (AR-4, AR-13)

## SDK Contract

`types/config.ts` defines the exact 18-key literal union, metadata discriminators, native value
union, and single/batch result types. It does not duplicate labels, descriptions, defaults, ranges,
or application modes as runtime constants. (AR-4)

```ts
export type ConfigKey = /* exact 18 literal keys */;
export type ConfigValue = number | string;
export interface ConfigEntry { /* 03-02 §Public Representation */ }
export interface ConfigUpdateResult {
  readonly data: ConfigEntry;
  readonly restartRequired: boolean;
}
export interface ConfigBatchUpdateResult {
  readonly data: readonly ConfigEntry[];
  readonly restartRequired: boolean;
}

export interface ConfigDomain {
  list(): Promise<readonly ConfigEntry[]>;
  get(key: string): Promise<ConfigEntry>;
  set(key: ConfigKey, value: ConfigValue): Promise<ConfigUpdateResult>;
  setMany(values: Readonly<Partial<Record<ConfigKey, ConfigValue>>>): Promise<ConfigBatchUpdateResult>;
}
```

The SDK sends native JSON values unchanged. Server validation stays authoritative. Exact server
catalog and SDK key specifications prevent drift without a shared package or generator. (AR-2,
AR-4, AR-14)

Read-only get accepts untrusted string names, encodes the URL path segment, and delegates unknown
names to the uniform server 404. Writes remain closed to ConfigKey. CLI set uses the returned typed
entry.key rather than casting argv.key or copying a key registry. (PF-001)

Update existing SDK agent config.set metadata/tests for native number-or-string input and the new
ConfigUpdateResult. Use the current parameter representation; do not build a new tool schema
framework. Supersede only legacy tests of deliberately retired contracts. (PF-005)

## CLI Contract

### List

`porta config list` prints columns for key, current value, type/unit, allowed range or values,
application mode, and updated time. JSON output prints the SDK response unchanged. (AR-13, AR-17)

### Get

`porta config get <key>` fetches one catalog entry and prints all metadata needed to edit safely.
The server's uniform 404 handles an arbitrary key; no local copied key registry is introduced.
(AR-4, AR-13)

### Set

`porta config set <key> <value>` first fetches the entry metadata. For `integer`, it accepts only a
base-10 integer lexical form, converts it to a JavaScript number, checks finite/safe integer and the
advertised inclusive range, then sends the number. For `string`, it requires an exact
`allowedValues` match and sends the string. It never sends numeric text as JSON text. (AR-2, AR-13)

Success prints the saved key/value. When `restartRequired` is true it also prints that every Porta
server instance must be restarted. Runtime updates do not print that notice. Validation errors show
the metadata-derived expected type/range without echoing secrets or infrastructure because no such
entry can be returned. (AR-2, AR-3, AR-13)

The CLI does not add a batch command; batch exists for SDK/Admin UI use and the requested
conventional CLI surface remains list/get/set. This avoids an unrequested command family. (AR-1,
AR-14)

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|---|---|---|
| Unknown key | Preserve SDK/API 404 through existing CLI error handling | AR-2, AR-12 |
| Integer lexical/type/range failure | Reject locally with metadata-derived expectation; no PUT | AR-13 |
| Unsupported locale | Reject locally with allowed values; no PUT | AR-7, AR-13 |
| Server rejects forged/stale input | Preserve safe API code/message; server remains authoritative | AR-2, AR-12 |
| Restart-required success | Print all-instance restart notice after confirmed save | AR-3, AR-13 |

## Testing Requirements

- SDK immutable type-contract and transport specifications for all four operations.
- CLI immutable specifications for metadata output, native conversion, rejected input, and restart
  notice.
- Implementation tests for table formatting and error propagation.
- Clean-revision `p1-admin` compatibility assurance after SDK/CLI changes. (AR-15)
