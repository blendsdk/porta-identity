# @portaidentity/sdk

Universal TypeScript SDK for the Porta Admin API — works in **browsers**, **Node.js**, and **AI agents**.

## Features

- **Transport abstraction** — `BrowserTransport` (CSRF cookies) and `NodeTransport` (Bearer tokens) with pluggable auth
- **19 domain namespaces** — Organizations, Applications, Clients, Users, Roles, Permissions, Custom Claims, Config, Keys, Audit, Stats, Sessions, Bulk, Branding, Exports, Two-Factor, Imports, User Roles, User Claims
- **Full TypeScript types** — SDK-owned type definitions for all entities, inputs, and responses
- **Pagination helpers** — `listAll()` auto-pagination and cursor-based support
- **Error hierarchy** — Typed errors (`PortaNotFoundError`, `PortaConflictError`, etc.) with HTTP status mapping
- **AI agent integration** — Tool definitions and `executeTool()` dispatcher for MCP/LLM integration
- **Zero runtime dependencies** — Uses only `fetch` (built into Node 22+ and browsers)

## Installation

```bash
# From the Porta project root (workspace dependency)
yarn add @portaidentity/sdk

# Or reference as file dependency
"@portaidentity/sdk": "file:../packages/porta-sdk"
```

## Quick Start

### Browser (Admin GUI / BFF)

```typescript
import { createPortaClient, createBrowserTransport } from '@portaidentity/sdk/browser';

const transport = createBrowserTransport({
  baseUrl: '/api/admin',    // BFF proxy path
  csrfCookieName: '_csrf',  // CSRF cookie name
  csrfHeaderName: 'x-csrf-token',
  on401: () => window.location.href = '/login',
});

const client = createPortaClient(transport);

// List organizations
const orgs = await client.organizations.list({ page: 1, pageSize: 20 });

// Create a user
const user = await client.users.create('org-id', {
  email: 'user@example.com',
  givenName: 'Jane',
  familyName: 'Doe',
});
```

### Node.js (Automation / CLI)

```typescript
import { createPortaClient, createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const auth = createTokenAuth('your-bearer-token');

const transport = createNodeTransport({
  baseUrl: 'https://porta.local:3443/api/admin',
  auth,
});

const client = createPortaClient(transport);

// List all organizations (auto-pagination)
const allOrgs = await client.organizations.listAll();

// Suspend a user
await client.users.suspend('org-id', 'user-id');

// Assign a role
await client.userRoles.assign('org-id', 'user-id', { roleId: 'role-id' });
```

### Client Credentials (Server-to-Server)

```typescript
import { createPortaClient, createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';

const auth = createClientCredentialsAuth({
  tokenUrl: 'https://porta.local:3443/super-admin/oidc/token',
  clientId: 'my-service',
  clientSecret: 'my-secret',
  scope: 'openid',
});

const transport = createNodeTransport({
  baseUrl: 'https://porta.local:3443/api/admin',
  auth,
});

const client = createPortaClient(transport);
```

### AI Agent Integration

```typescript
import { createPortaClient, getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

// Get tool definitions for LLM function calling
const tools = getToolDefinitions();
// → [{ name: 'organizations.list', description: '...', parameters: [...] }, ...]

// Execute a tool call from an AI agent
const client = createPortaClient(
  createNodeTransport({ baseUrl: '...', auth: createTokenAuth('...') })
);

const result = await executeTool(client, 'organizations.list', { page: 1 });
```

## Domain Namespaces

| Namespace | Methods | Description |
|-----------|---------|-------------|
| `organizations` | 12 | CRUD, status lifecycle, slug validation, history |
| `applications` | 13 | CRUD, status, modules management, history |
| `clients` | 12 | CRUD, status, secret management, history |
| `users` | 19 | CRUD, 6 status transitions, password, email, export, purge |
| `roles` | 9 | CRUD, archive, permission assignment |
| `permissions` | 6 | CRUD, archive |
| `userRoles` | 3 | List, assign, remove role assignments |
| `userClaims` | 3 | List, set, remove claim values |
| `customClaims` | 6 | Claim definitions CRUD, archive |
| `config` | 3 | System configuration get/set/list |
| `keys` | 3 | Signing key list/generate/rotate |
| `audit` | 1 | Audit log listing with filters |
| `stats` | 1 | Dashboard statistics |
| `sessions` | 3 | Session listing and revocation |
| `bulk` | 1 | Bulk status operations |
| `branding` | 5 | Org branding settings and asset management |
| `exports` | 1 | CSV/JSON data export |
| `twoFactor` | 3 | 2FA status, disable, reset |
| `imports` | 1 | Declarative provisioning |

## Auth Providers

| Provider | Use Case |
|----------|----------|
| `createTokenAuth(token)` | Static Bearer token (scripts, testing) |
| `createClientCredentialsAuth(opts)` | Server-to-server OAuth2 (with caching and concurrent dedup) |
| `createCliAuth(opts)` | CLI credentials file (`~/.porta/credentials.json`) with auto-refresh |

## Error Handling

```typescript
import { PortaNotFoundError, PortaConflictError, PortaHttpError } from '@portaidentity/sdk';

try {
  await client.organizations.get('nonexistent');
} catch (err) {
  if (err instanceof PortaNotFoundError) {
    console.log('Not found:', err.message);
  } else if (err instanceof PortaConflictError) {
    console.log('Conflict — ETag mismatch?');
  } else if (err instanceof PortaHttpError) {
    console.log(`HTTP ${err.status}:`, err.details);
  }
}
```

## Pagination

```typescript
// Manual pagination
const page1 = await client.users.list('org-id', { page: 1, pageSize: 50 });
// → { data: User[], total: number, page: number, pageSize: number }

// Auto-pagination (fetches all pages)
const allUsers = await client.users.listAll('org-id');
// → User[]
```

## Architecture

```
@portaidentity/sdk
├── transport/          # HTTP abstraction layer
│   ├── types.ts        # HttpTransport, TransportRequest, TransportResponse
│   ├── browser-transport.ts  # Fetch + CSRF cookies + 401 redirect
│   └── node-transport.ts     # Fetch + Bearer auth + 401 retry
├── auth/               # Authentication providers
│   ├── token-auth.ts   # Static token
│   ├── client-credentials-auth.ts  # OAuth2 client_credentials
│   └── cli-auth.ts     # File-based CLI credentials
├── types/              # SDK-owned entity type definitions
├── domains/            # 19 domain API namespaces
├── errors/             # Typed error hierarchy
├── pagination/         # Pagination types and helpers
├── agent/              # AI agent tool definitions + executor
├── client.ts           # createPortaClient() factory
├── index.ts            # Main entrypoint
├── browser.ts          # Browser-specific entrypoint
├── node.ts             # Node.js-specific entrypoint
└── agent.ts            # Agent-specific entrypoint
```

## Entrypoints

| Import Path | Includes | Excludes |
|------------|----------|----------|
| `@portaidentity/sdk` | Types, errors, pagination, client factory | Transport, auth (bring your own) |
| `@portaidentity/sdk/browser` | + BrowserTransport | NodeTransport, auth providers |
| `@portaidentity/sdk/node` | + NodeTransport, all auth providers | BrowserTransport |
| `@portaidentity/sdk/agent` | + Tool definitions, executeTool | Transports, auth |

## Testing

```bash
# Run all SDK tests (352 tests)
cd packages/porta-sdk && yarn test

# Type checking
yarn typecheck

# Full verify (lint + typecheck + test + build)
yarn verify
```

## License

MIT — See [LICENSE](../../LICENSE) for details.
