# CLI and Documentation: Resource-Server Admin Management

> **Document**: 03-03-cli-docs.md
> **Parent**: [Index](00-index.md)

## Overview

This component adds the conventional CLI command family and the public/technical documentation for
the Admin surface. The command family lives under the existing `porta app` command, and the docs
are dedicated pages cross-linked from the application pages (AR-3). Behavior is owned by
[RD-01](../../requirements/RD-01-resource-server-admin.md).

## Architecture

### Current Architecture

- `packages/cli/src/commands/app.ts` registers `app module`, `app role`, `app permission`, and
  `app claim` (`packages/cli/src/commands/app.ts:366`).
- Each nested family is a separate `CommandModule` file that uses `createClient`, `handleError`,
  `printTable`, `printJson`, `success`, `warn`, and `confirm`.
- Public API docs are one page per domain under `docs/api/`; CLI docs are under `docs/cli/`.
- `docs/api/applications.md` and `docs/cli/applications.md` own the application pages.

### Proposed Changes

```text
packages/cli/src/commands/app-resource-server.ts   # New command module
packages/cli/src/commands/app.ts                   # Import and register
packages/cli/tests/commands/app-resource-server.spec.test.ts
packages/cli/tests/commands/app-resource-server.impl.test.ts
docs/api/resource-servers.md                       # New public API page
docs/cli/resource-servers.md                       # New public CLI page
docs/api/applications.md                           # Cross-link
docs/cli/applications.md                           # Cross-link
techdocs/architecture/api-design.md                # Replace "no Admin API" with the new surface
techdocs/architecture/data-model.md                # Update if the management lifecycle needs a note
```

No new CLI framework, output helper, transport, or docs theme is added.

## Implementation Details

### Command Tree

```text
porta app resource-server
├── list <app>
├── get <app> <resource-server>
├── create <app> --name <name> --identifier <uri> [--slug <slug>] [--audience <uri>] [--scope <scope>]...
├── update <app> <resource-server> --name <name> --slug <slug> --identifier <uri> [--audience <uri>] [--scope <scope>]...
└── delete <app> <resource-server> [--yes]
```

`<app>` and `<resource-server>` accept UUID or slug. The command module uses the SDK methods from
03-02; it does not call HTTP directly.

### Flags

| Flag | Commands | Rule |
| --- | --- | --- |
| `--name` | create, update | Required, non-empty |
| `--slug` | create, update | Optional on create (server derives); required on update |
| `--identifier` | create, update | Required absolute URI |
| `--audience` | create, update | Optional; omitted resets to identifier |
| `--scope` | create, update | Repeatable; omitted on update clears custom scopes |
| `--yes` | delete | Skip the interactive confirmation |

### Output

- Human mode:
  - list prints a table with ID, name, slug, identifier, audience, scopes.
  - get/create/update print a key/value table.
  - delete prints a success line.
  - empty list prints `No resource servers found`.
- `--json` prints the raw SDK result (array or object) with no table decoration.
- Errors use the existing `handleError` path and exit non-zero.

### Confirmation

`delete` calls `confirm()` unless `--yes` is set. A declined confirmation exits without calling the
SDK and without a mutation.

### Documentation

`docs/api/resource-servers.md` must include:

- Base path and the five methods;
- permission and authentication requirements;
- request fields and exact fixed error bodies;
- audience default and standard-scope rejection;
- hard-delete cascade and already-issued-token impact;
- curl examples for list, create, update, and delete.

`docs/cli/resource-servers.md` must include the command tree, flags, human/JSON examples, delete
confirmation, and the replace-all scope rule.

Both pages are linked from the application pages. `techdocs/architecture/api-design.md` replaces
the sentence that says no Admin API exists with the new endpoint summary and a link to RD-01's
behavior. `techdocs/architecture/data-model.md` gains a short note only if the management lifecycle
changes the existing data-model description.

## Code Examples

```bash
porta app resource-server list acme
porta app resource-server get acme billing-api
porta app resource-server create acme \
  --name "Billing API" \
  --identifier https://billing.example.test \
  --scope billing:read \
  --scope billing:write
porta app resource-server update acme billing-api \
  --name "Billing API" \
  --slug billing-api \
  --identifier https://billing.example.test \
  --scope billing:read
porta app resource-server delete acme billing-api --yes
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| SDK/API error | Existing `handleError`; JSON mode emits structured error | RD-01 |
| Empty list | `No resource servers found` in human mode | RD-01 |
| Delete declined | No SDK call, exit zero | RD-01 |
| Invalid flags | Yargs validation before the SDK call | RD-01 |
| Docs link break | Structure/docs build fails | AR-3 |

## Testing Requirements

- CLI spec tests with the SDK test double: exact method calls, flags, human/JSON output, empty list,
  delete confirmation, and non-zero errors (ST-16–ST-18).
- CLI impl tests for flag edge cases and confirmation bypass.
- Docs build and structure contracts.
- No real network or database calls in CLI tests.
