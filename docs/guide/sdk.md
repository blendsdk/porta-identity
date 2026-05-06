# TypeScript SDK

The `@portaidentity/sdk` package provides a universal TypeScript client for the Porta Admin API. It works in Node.js, browsers, and AI agent environments.

## Installation

```bash
yarn add @portaidentity/sdk
# or
npm install @portaidentity/sdk
```

The package is located at `packages/porta-sdk/` in the monorepo.

## Quick Start (Node.js)

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const transport = createNodeTransport({
  baseUrl: 'https://porta.local:3443/api/admin',
  auth: createTokenAuth('your-bearer-token'),
});

const porta = createPortaClient({ transport });

// List organizations
const orgs = await porta.organizations.list();
console.log(orgs.data);

// Create a user
const user = await porta.users.create({
  organizationId: 'org-id',
  email: 'alice@example.com',
  name: 'Alice',
});
```

## Quick Start (Browser)

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createBrowserTransport, createTokenAuth } from '@portaidentity/sdk/browser';

const transport = createBrowserTransport({
  baseUrl: '/api/admin',
  auth: createTokenAuth(sessionToken),
});

const porta = createPortaClient({ transport });
const stats = await porta.stats.get();
```

## Entrypoints

| Import Path | Purpose | Environment |
|---|---|---|
| `@portaidentity/sdk` | Client factory, types, errors, pagination | Universal |
| `@portaidentity/sdk/node` | Node.js transport, all auth providers | Node.js |
| `@portaidentity/sdk/browser` | Fetch-based transport, token auth | Browser |
| `@portaidentity/sdk/agent` | AI agent tool definitions & executor | AI agents |

## Authentication Providers

### Bearer Token

```typescript
import { createTokenAuth } from '@portaidentity/sdk/node';
const auth = createTokenAuth('your-token');
```

### Client Credentials (M2M)

```typescript
import { createClientCredentialsAuth } from '@portaidentity/sdk/node';
const auth = createClientCredentialsAuth({
  tokenEndpoint: 'https://porta.local:3443/super-admin/oidc/token',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret',
});
```

### CLI Auth (stored credentials)

```typescript
import { createCliAuth } from '@portaidentity/sdk/node';
const auth = createCliAuth({
  credentialsPath: '~/.porta/credentials.json',
  refreshEndpoint: 'https://porta.local:3443/super-admin/oidc/token',
  clientId: 'porta-admin-cli',
});
```

## Domain Namespaces

The `PortaClient` provides 19 domain namespaces:

| Namespace | Description | Key Methods |
|---|---|---|
| `organizations` | Org CRUD, status lifecycle, destroy | `list`, `get`, `create`, `update`, `suspend`, `activate`, `archive`, `destroy` |
| `applications` | App CRUD, modules | `list`, `get`, `create`, `update`, `archive`, `listModules`, `addModule` |
| `clients` | Client CRUD, secrets | `list`, `get`, `create`, `update`, `revoke`, `generateSecret` |
| `users` | User CRUD, invite, password, status | `list`, `get`, `create`, `invite`, `setPassword`, `suspend`, `activate` |
| `roles` | Application roles, permission mapping | `list`, `get`, `create`, `update`, `assignPermission`, `removePermission` |
| `permissions` | Application permissions | `list`, `get`, `create`, `archive` |
| `userRoles` | User-role assignments | `list`, `assign`, `remove` |
| `customClaims` | Claim definitions | `list`, `get`, `create`, `update`, `archive` |
| `userClaims` | User claim values | `list`, `set`, `remove` |
| `config` | System configuration | `list`, `get`, `set` |
| `keys` | Signing key management | `list`, `generate`, `rotate` |
| `audit` | Audit log | `list`, `listAll` |
| `stats` | Dashboard statistics | `get` |
| `sessions` | Session management | `list`, `revoke`, `revokeForUser` |
| `bulk` | Bulk status operations | `execute` |
| `branding` | Org branding & assets | `getSettings`, `updateSettings`, `uploadAsset` |
| `exports` | CSV/JSON data export | `download` |
| `twoFactor` | 2FA admin management | `getStatus`, `disable`, `reset` |
| `imports` | Declarative provisioning | `provision` |

## ETag / Optimistic Concurrency

The `get()` method on core entities returns `{ data, etag }`. Pass the etag to `update()` for safe concurrent writes:

```typescript
const { data: org, etag } = await porta.organizations.get('my-org');
const updated = await porta.organizations.update('my-org', { name: 'New Name' }, etag);
```

If the entity was modified since you read it, a `PortaConflictError` (HTTP 409) is thrown.

## Pagination

List methods return `PaginatedResponse<T>` with `data`, `total`, `page`, `pageSize`, and optional `cursor`. Use `listAll()` for automatic cursor-based iteration:

```typescript
// Manual pagination
const page1 = await porta.organizations.list({ page: 1, pageSize: 10 });

// Auto-paginate all results
const allOrgs = await porta.organizations.listAll();
```

## Error Handling

All API errors throw typed error classes:

| Error Class | HTTP Status | Description |
|---|---|---|
| `PortaAuthenticationError` | 401 | Invalid or expired credentials |
| `PortaForbiddenError` | 403 | Insufficient permissions |
| `PortaNotFoundError` | 404 | Resource not found |
| `PortaValidationError` | 422 | Invalid input (with field details) |
| `PortaConflictError` | 409 | ETag mismatch or duplicate |
| `PortaRateLimitError` | 429 | Rate limit exceeded |
| `PortaServerError` | 5xx | Server error |

```typescript
import { PortaNotFoundError, PortaValidationError } from '@portaidentity/sdk';

try {
  await porta.organizations.get('nonexistent');
} catch (err) {
  if (err instanceof PortaNotFoundError) {
    console.log('Not found:', err.message);
  }
  if (err instanceof PortaValidationError) {
    console.log('Validation errors:', err.details);
  }
}
```

## AI Agent Integration

The `@portaidentity/sdk/agent` entrypoint provides tool definitions compatible with LLM function-calling:

```typescript
import { getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';

// Get all available tools for the AI model
const tools = getToolDefinitions(); // 47 tool definitions

// Execute a tool from AI agent output
const result = await executeTool(porta, 'organizations.list', { pageSize: 10 });
```

## Architecture

The SDK uses a layered architecture:

1. **Transport layer** — HTTP abstraction (Node.js `http`/`https` or browser `fetch`)
2. **Auth layer** — Pluggable authentication providers (token, client credentials, CLI)
3. **Domain layer** — 19 domain namespaces mapping to Admin API endpoints
4. **Client factory** — Composes transport + domains into a single `PortaClient`
5. **Agent layer** — Tool definitions + executor for AI integration

All layers are ESM-only, tree-shakeable, and fully typed with TypeScript declarations.
