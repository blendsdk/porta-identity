# SDK CLI Migration Guide

This document describes the future migration strategy for replacing the CLI's `AdminHttpClient` with `@porta/sdk`. This is a **reference document** — the migration has not yet been implemented.

## Current Architecture

The CLI (`src/cli/`) uses a custom `AdminHttpClient` class for HTTP communication:

```
porta user list
  → src/cli/commands/user.ts
    → AdminHttpClient.get('/organizations/:orgId/users')
      → Bearer token injection
      → HTTP request to /api/admin/*
```

Key components:
- **`src/cli/http-client.ts`** — `AdminHttpClient` class with `get()`, `post()`, `put()`, `patch()`, `delete()` methods
- **`src/cli/token-store.ts`** — Reads `~/.porta/credentials.json` for Bearer tokens
- **`src/cli/bootstrap.ts`** — `withHttpClient()` creates an `AdminHttpClient` instance for each command

## Target Architecture

Replace `AdminHttpClient` with `@porta/sdk`:

```
porta user list
  → src/cli/commands/user.ts
    → porta.users.list(orgId, params)
      → NodeTransport + CliAuth
        → Bearer token injection + auto-refresh
```

## Migration Benefits

| Aspect | Before (AdminHttpClient) | After (@porta/sdk) |
|---|---|---|
| **Type safety** | Manual URL building, untyped responses | Fully typed methods and return values |
| **Auth refresh** | Manual token refresh logic | Automatic via CliAuth provider |
| **Error handling** | Manual HTTP status → error mapping | Typed error hierarchy (PortaValidationError, etc.) |
| **Pagination** | Manual URL parameter building | Built-in `listAll()` auto-pagination |
| **ETag support** | Manual header management | Built-in ETag/If-Match support |
| **Maintenance** | CLI and GUI have separate HTTP clients | Single SDK used by CLI, GUI, and scripts |

## Migration Strategy

### Phase 1: Parallel Setup

Add `@porta/sdk` as a dependency and create a shared `createCliPortaClient()` helper:

```typescript
// src/cli/sdk-client.ts
import { createPortaClient } from '@porta/sdk';
import { createNodeTransport, createCliAuth } from '@porta/sdk/node';
import { getCredentialsPath, getApiBaseUrl } from './bootstrap.js';

export function createCliPortaClient() {
  return createPortaClient({
    transport: createNodeTransport({
      baseUrl: getApiBaseUrl(),
      auth: createCliAuth({
        credentialsPath: getCredentialsPath(),
        refreshEndpoint: getRefreshEndpoint(),
        clientId: 'porta-admin-cli',
      }),
    }),
  });
}
```

### Phase 2: Command-by-Command Migration

Migrate one command module at a time, from simplest to most complex:

1. **Read-only commands first**: `health`, `whoami`, `config list`, `keys list`
2. **Simple CRUD**: `org list/show`, `app list/show`, `client list/show`
3. **Complex CRUD**: `user create/invite`, `org create/update`
4. **Status transitions**: `org suspend/activate`, `user lock/unlock`
5. **Nested resources**: `app role create`, `user claims set`
6. **Special commands**: `provision`, `export`

### Phase 3: Remove AdminHttpClient

Once all commands are migrated:

1. Remove `src/cli/http-client.ts`
2. Update `src/cli/bootstrap.ts` — `withHttpClient()` returns SDK client instead
3. Remove manual error mapping code from command handlers
4. Update CLI tests to mock SDK instead of HTTP client

## Example: Before and After

### Before (AdminHttpClient)

```typescript
// src/cli/commands/org.ts — list subcommand
async function listOrgs(client: AdminHttpClient, args: ListArgs) {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.search) params.set('search', args.search);
  params.set('page', String(args.page ?? 1));
  params.set('pageSize', String(args.pageSize ?? 20));

  const response = await client.get(`/organizations?${params}`);
  const body = response.body as { data: any[]; total: number };

  printTable(body.data, ['name', 'slug', 'status']);
}
```

### After (@porta/sdk)

```typescript
// src/cli/commands/org.ts — list subcommand
async function listOrgs(porta: PortaClient, args: ListArgs) {
  const result = await porta.organizations.list({
    status: args.status,
    search: args.search,
    page: args.page ?? 1,
    pageSize: args.pageSize ?? 20,
  });

  printTable(result.data, ['name', 'slug', 'status']);
}
```

## Backward Compatibility

- **No CLI behavior changes** — Users see identical output and error messages
- **Same credential file** — `~/.porta/credentials.json` format unchanged
- **Same exit codes** — Error mapping preserves existing exit code conventions
- **`porta init` and `porta migrate`** — These use `withBootstrap()` (direct-DB), not HTTP — they are unaffected

## Timeline

This migration is planned for a future release. It does not block any current work — the SDK and CLI currently operate independently.

## See Also

- [SDK Overview](/guide/sdk) — SDK architecture and API reference
- [SDK Node.js Usage](/guide/sdk-node) — Auth providers and Node.js setup
- [CLI Overview](/cli/overview) — Current CLI documentation
