# SDK Admin GUI Migration Guide

This document describes the future migration strategy for replacing the Admin GUI's custom API client (`admin-gui/src/client/api/client.ts`) with `@porta/sdk`. This is a **reference document** — the migration has not yet been implemented.

## Current Architecture

The Admin GUI (`admin-gui/`) uses a custom fetch-based API client:

```
React Component
  → useQuery / useMutation hook
    → api/client.ts fetch wrapper
      → CSRF token injection (from cookie)
      → ETag/If-Match headers
      → fetch('/api/admin/...')
        → BFF proxy → Porta API
```

Key components:
- **`admin-gui/src/client/api/client.ts`** — Custom fetch wrapper with CSRF, ETag, error handling
- **BFF server** (`admin-gui/src/server/`) — Koa server that handles OIDC auth, session, API proxy

## Target Architecture

Replace the custom API client with `@porta/sdk/browser`:

```
React Component
  → useQuery / useMutation hook
    → porta.organizations.list()
      → BrowserTransport
        → CSRF token injection (from cookie)
        → fetch('/api/admin/...')
          → BFF proxy → Porta API
```

## Migration Benefits

| Aspect | Before (custom client) | After (@porta/sdk) |
|---|---|---|
| **Type safety** | Partial — manual response typing | Full — SDK types for all entities |
| **CSRF handling** | Custom implementation | Built into BrowserTransport |
| **ETag support** | Custom header management | Built into `get()` / `update()` |
| **Error handling** | Custom error classes | SDK error hierarchy |
| **Domain coverage** | May miss new endpoints | Auto-complete via SDK domains |
| **Consistency** | GUI-specific patterns | Same SDK used across CLI, GUI, scripts |

## Migration Strategy

### Phase 1: Add SDK Dependency

The `@porta/sdk` file dependency is already configured in `admin-gui/package.json`:

```json
{
  "dependencies": {
    "@porta/sdk": "file:../packages/porta-sdk"
  }
}
```

### Phase 2: Create SDK Client Instance

Replace the custom client initialization:

```typescript
// admin-gui/src/client/api/porta.ts
import { createPortaClient } from '@porta/sdk';
import { createBrowserTransport } from '@porta/sdk/browser';

export const porta = createPortaClient({
  transport: createBrowserTransport({
    baseUrl: '/api/admin',
    csrfCookieName: 'porta.csrf',
    onUnauthorized: () => {
      window.location.href = '/auth/login';
    },
  }),
});
```

### Phase 3: Replace API Calls

Migrate React hooks to use SDK methods instead of raw fetch calls:

#### Before

```typescript
// Custom fetch wrapper
const response = await apiClient.get('/organizations');
const orgs = response.data as Organization[];
```

#### After

```typescript
// SDK method — fully typed
const result = await porta.organizations.list({ page: 1, pageSize: 20 });
// result.data is Organization[] — no casting needed
```

### Phase 4: Remove Custom Client

Once all components use the SDK:

1. Delete `admin-gui/src/client/api/client.ts`
2. Remove custom error classes (use SDK's `PortaValidationError`, etc.)
3. Remove custom type definitions that duplicate SDK types
4. Update tests to mock SDK instead of fetch

## CSRF Migration

The BrowserTransport handles CSRF identically to the current custom client:

| Feature | Current Implementation | SDK BrowserTransport |
|---|---|---|
| Cookie name | `porta.csrf` | Configurable via `csrfCookieName` |
| Header name | `X-CSRF-Token` | `X-CSRF-Token` (default) |
| Applied to | POST, PUT, PATCH, DELETE | POST, PUT, PATCH, DELETE |
| Cookie reading | `document.cookie` parsing | `document.cookie` parsing |

No BFF changes are needed — the CSRF mechanism is identical.

## ETag Migration

The SDK's `get()` method returns `{ data, etag }` automatically:

```typescript
// Before — manual ETag handling
const response = await apiClient.get('/organizations/my-org');
const etag = response.headers.get('etag');
await apiClient.put('/organizations/my-org', body, {
  headers: { 'If-Match': etag },
});

// After — SDK handles it
const { data: org, etag } = await porta.organizations.get('my-org');
await porta.organizations.update('my-org', updates, etag);
```

## Error Handling Migration

```typescript
// Before — custom error checking
try {
  await apiClient.post('/users', userData);
} catch (err) {
  if (err.status === 422) {
    setFieldErrors(err.body.details);
  }
}

// After — typed SDK errors
import { PortaValidationError } from '@porta/sdk';

try {
  await porta.users.create(userData);
} catch (err) {
  if (err instanceof PortaValidationError) {
    setFieldErrors(err.details);
  }
}
```

## BFF Server — No Changes Required

The BFF server (`admin-gui/src/server/`) is **not affected** by this migration:

- OIDC authentication flow → unchanged
- Session management → unchanged
- API proxy routes → unchanged (SDK hits the same `/api/admin/*` proxy endpoints)
- CSRF cookie generation → unchanged

The SDK replaces only the **browser-side** fetch wrapper, not the server-side proxy.

## Timeline

This migration is planned for when the Admin GUI dashboard is actively developed. The placeholder SPA does not make significant API calls, so there is no urgency. When dashboard components are built, they should use `@porta/sdk` directly instead of the custom client.

## See Also

- [SDK Overview](/guide/sdk) — SDK architecture and API reference
- [SDK Browser Usage](/guide/sdk-browser) — BrowserTransport setup and patterns
- [Admin GUI](/guide/admin-gui) — Admin GUI architecture
