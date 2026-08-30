# SDK and CLI Contracts: Applications and OIDC Clients

> **Document**: 03-02-sdk-and-cli-contracts.md
> **Parent**: [Index](00-index.md)

## Overview

This component aligns the public SDK and existing conventional CLI commands with the corrected
server contract. The Admin UI remains a thin SDK consumer rather than adding direct HTTP code
(AR-1, AR-2).

## Architecture

### Current Architecture

The SDK domains wrap `HttpTransport`, share pagination helpers, and return public types. The CLI's
ordinary application/client commands call those domains. Several operations and types are stale.

### Proposed Changes

Correct the existing domains and public types in place. Do not add compatibility aliases for
nonexistent routes, a second transport, or an Admin-UI-only SDK layer (AR-2).

## Implementation Details

### Application Contracts

- Application types contain global fields only; remove nonexistent organization ownership.
- Update accepts name and nullable description but no slug.
- Add activate/deactivate; retain archive; remove restore.
- Module records retain both internal application and module UUIDs plus status.
- Add-module and update-module use the server fields; module update/deactivate always carry both
  internal IDs; remove the nonexistent delete operation.

### Client Contracts

- Client types expose internal UUID, generated Client ID, organization/application IDs, complete
  protocol fields, status, login-method override/effective values, and timestamps.
- Create maps `clientName` exactly and returns `{ client, secret? }`; it does not rename plaintext.
- Update contains only server-editable configuration and uses the internal UUID where required.
- Add activate/deactivate; retain revoke; remove restore.
- Secret generation returns metadata plus `plaintext`; list returns metadata only; revoke uses the
  server's POST nested route and internal client/secret UUIDs.

### Conventional CLI

Update affected commands, arguments, fixtures, and output projections to compile against and
accurately present the corrected SDK. Do not add Admin UI features or new CLI command families.
The bounded command inventory is:

- application create, list, get, update, activate, deactivate, and archive;
- application module add, list, update, and deactivate;
- client create, list, get, update, activate, deactivate, and revoke; and
- client secret generate, list, and revoke.

Remove the unsupported application/client restore and module remove surfaces. Tests name each argv
shape, SDK operation, internal-ID mapping, and sanitized human/JSON output they exercise.

## Integration Points

- `packages/sdk/src/domains/applications.ts`, `domains/clients.ts`, and `types/`
- SDK domain and type tests
- existing application/client commands and tests under `packages/cli/src/commands/`
- Admin services specified by `03-03-admin-state-services.md`

## Error Handling

| Error Case                              | Handling Strategy                                                   | Source                |
| --------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| Malformed response wrapper              | Reject through the SDK's established invalid-response path          | RD-04 SDK corrections |
| Pagination fails on any underlying page | `listAll` rejects and publishes no partial array to callers         | RD-04 AC-02, AC-07    |
| Removed restore/delete API is requested | No public method exists; callers use supported lifecycle operations | RD-04 SDK corrections |
| Secret creation has no secret           | Represent absence only for public-client creation                   | RD-04 AC-11           |

## Testing Requirements

- Immutable SDK specification tests for each method, path, verb, ID, request, and response mapping.
- Implementation tests for pagination rejection, optional one-time secret, and type guards.
- Conventional CLI tests for corrected lifecycle, module, configuration, and secret operations.
- Clean committed `p1-admin` and `protocol` compatibility assurance selectors (AR-6).
