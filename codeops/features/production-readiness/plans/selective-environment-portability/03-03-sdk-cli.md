# SDK and CLI: Selective Environment Portability

> **Document**: 03-03-sdk-cli.md
> **Parent**: [Index](00-index.md)

## Overview

The SDK mirrors the exact server wire types and provides three direct operations. The conventional
CLI validates file and selection arguments, calls those SDK operations, and never parses a second
manifest dialect or implements import logic. (AR-1, AR-4)

## Architecture

### Current Architecture

`exports.download()` returns raw report downloads. `imports.provision()` accepts loose legacy
types. The CLI `provision` command contains a separate YAML/JSON transformer and duration parser,
while `exports download` handles report exports.

### Proposed Changes

- Keep `exports.download()` and `porta exports download` for report exports.
- Add `exports.manifest(request)` and replace `imports.provision()` with `imports.preview()` and
  `imports.apply()`.
- Replace the SDK agent's legacy provisioning tool with the new portability operations and update
  the existing `admin-data` compatibility probe rather than retaining a compatibility shim.
- Remove `commands/provision.ts` and its tests; add `commands/export.ts` and `commands/import.ts`.
- Remove the four legacy provisioning examples and replace stale public provisioning references
  with the manifest portability workflow. No compatibility aliases remain. (AR-1, AR-2)

## Implementation Details

### SDK Types and Methods

```ts
export interface ExportsDomain {
  download(params: ExportParams): Promise<TransportResponse>;
  manifest(request: ExportManifestRequest): Promise<ExportManifestResponse>;
}

export interface ImportsDomain {
  preview(manifest: PortabilityManifest): Promise<PortabilityResult>;
  apply(
    manifest: PortabilityManifest,
    mode: 'keep-existing' | 'update-existing',
  ): Promise<PortabilityResult>;
}
```

`ExportManifestResponse` exposes the parsed manifest and safe attachment filename. The SDK reads
`Content-Disposition`, accepts only a safe final filename component, and falls back to the
AR-5 filename shape when the header is absent or invalid. It never writes files itself. SDK
manifest/result types exactly mirror `03-01 §Public Types and Schemas`. (AR-1, AR-5)

The shared transport still rejects non-2xx responses. `imports.preview()` and `imports.apply()`
recognize only the exact 409 `import_plan_rejected` envelope, validate its bounded `result`, and
return that result so callers can render the rejected plan. Every other non-2xx response continues
through the existing SDK error hierarchy. This is a direct adapter for the approved wire contract,
not a second import parser.

### Export Command

```console
porta export manifest \
  (--organization <slug> | --environment) \
  --category <category> [--category <category> ...] \
  [(--application <slug> [--application <slug> ...] | --all-applications)] \
  --output <path>
```

The application selector flags are required only when a selected category is application-related
and are rejected otherwise. When no application-related category is selected, the command encodes
the wire contract's `all_applications: false` plus empty slug array itself. The command resolves the
operator-supplied local output path without passing it to a shell, calls
`exports.manifest()`, and writes UTF-8 JSON once.
It does not overwrite an existing file without the existing CLI confirmation pattern; `--yes`
may approve that overwrite but does not change server validation. (AR-1, AR-4)

Readable output states the written path and counts derived from manifest arrays. With global
`--json`, it emits `{ path, filename, counts }`; it never prints the complete manifest as status
output. (AR-7)

### Import Command

```console
porta import manifest <path> --mode <keep-existing|update-existing> [--yes]
```

The command resolves and reads one operator-supplied UTF-8 JSON file with a 64 MiB local bound, parses JSON as
unknown, and sends it to `imports.preview()`. It prints the ordered preview and errors. A rejected
preview exits nonzero and never calls apply. A successful preview asks for confirmation unless
`--yes`; cancellation exits without apply. Apply sends the original manifest and chosen mode so
the server repeats all validation. (AR-1)

Readable apply output prints ordered counts and any generated client credentials exactly once.
Global `--json` prints the SDK result once, including committed credentials. Neither output path
logs, persists, or repeats secret material. (AR-7)

### Documentation Cleanup

`docs/api/exports.md` keeps report exports and adds manifest export. `docs/api/imports.md` becomes
the strict preview/apply reference. `docs/cli/provisioning.md` is retitled and rewritten in place as
the portability guide so existing navigation links remain valid. CLI overview, quickstart, SDK
guides, both public package READMEs, example references, and structure assertions are updated only
where they name the removed surface. (AR-1)

## Integration Points

- SDK transport already supports raw responses and response headers.
- CLI authentication and error formatting remain unchanged.
- Existing prompt helpers own confirmation.
- Node `fs/promises` owns the direct read/write boundary; no file abstraction is added.

## Error Handling

| Error Case                                     | Handling Strategy                                                                               | AR Ref |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| Invalid CLI flag combination                   | yargs usage failure before an API call                                                          | AR-4   |
| Missing/unreadable/oversized/invalid JSON file | Fixed concise CLI error; no preview/apply call                                                  | AR-1   |
| Preview rejection                              | Print bounded safe result and exit nonzero                                                      | AR-1   |
| User cancels confirmation                      | Exit without apply                                                                              | AR-1   |
| Output exists                                  | Confirm replacement; `--yes` permits it                                                         | AR-4   |
| Invalid attachment filename                    | Use safe AR-5 fallback                                                                          | AR-5   |
| SDK/server failure                             | Exact fixed portability body; show safe request ID for 503; verbose output remains content-free | AR-1   |

## Testing Requirements

- SDK specification and type-contract tests cover ST-38–ST-42.
- The SDK type-contract tsconfig explicitly includes the new portability contract test.
- CLI specification tests cover ST-43–ST-51.
- Tests prove no legacy `provision` registration, transformer, examples, or SDK method remains.
- Compatibility assurance runs from a clean committed revision after SDK/CLI completion.
