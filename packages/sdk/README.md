# @portaidentity/sdk

Universal TypeScript SDK for the Porta Admin API — works in **browsers**, **Node.js**, and **AI agents**.

## Features

- **Transport abstraction** — `BrowserTransport` (CSRF cookies) and `NodeTransport` (Bearer tokens) with pluggable auth
- **19 domain namespaces** — Organizations, Applications, Clients, Users, UsersById, Roles, Permissions, Custom Claims, Config, Keys, Audit, Stats, Sessions, Bulk, Branding, Exports, Two-Factor, Imports, User Roles
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
"@portaidentity/sdk": "file:../packages/sdk"
```

## Quick Start

### Browser

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createBrowserTransport } from '@portaidentity/sdk/browser';

let csrfToken: string | null = null;

const transport = createBrowserTransport({
  baseUrl: '', // same-origin BFF; the SDK adds the API prefix
  getCsrfToken: () => csrfToken,
  setCsrfToken: (token) => {
    csrfToken = token;
  },
  onUnauthorized: () => {
    window.location.href = '/login';
  },
});

const client = createPortaClient({ transport });

// List organizations
const orgs = await client.organizations.list({ page: 1, pageSize: 20 });

// Create a user
const user = await client.users.create({
  organizationId: 'org-id',
  email: 'user@example.com',
  givenName: 'Jane',
  familyName: 'Doe',
});
```

### Node.js (Automation / CLI)

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const transport = createNodeTransport({
  baseUrl: 'https://porta.local:3443',
  auth: createTokenAuth({ token: 'opaque-access-token' }),
});

const client = createPortaClient({ transport });

// List all organizations (auto-pagination)
const allOrgs = await client.organizations.listAll();

// Deactivate a user
await client.users.deactivate('org-id', 'user-id');

// Assign a role
await client.userRoles.assign('org-id', 'user-id', ['role-id']);
```

### Admin API from a BFF (Server-to-Server)

The Admin API requires an opaque access token bound to an active user in the
super-admin organization with a recognized admin role. Use one of these patterns:

1. **Dedicated control-plane user** — Authorization Code + PKCE once, then store the
   refresh token in a secret manager and persist each rotation.
2. **Short-lived token** — obtain an access token through `porta login` or the
   Authorization Code flow and pass it to `createTokenAuth`.

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    auth: createTokenAuth({ token: process.env.PORTA_ACCESS_TOKEN! }),
  }),
});
```

Client-credentials tokens carry no account identity and are rejected by `/api/admin/*`.
Do not use `createClientCredentialsAuth` for Admin API automation until service
accounts are supported.

### Tenant-scoped invitations from a BFF

Tenant applications can invite users without a control-plane service account.
The tenant route accepts either a confidential client using `client_credentials`
with the `org:user:invite` scope, or a tenant user's access token with the
`org:user:invite` permission in the token client's application.

Use `apiPrefix: '/api'` for the tenant route:

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import {
  createClientCredentialsAuth,
  createNodeTransport,
  createTokenAuth,
} from '@portaidentity/sdk/node';

// Background jobs: one tenant client, no refresh token or local credentials file.
const serviceClient = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    apiPrefix: '/api',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.example.com/acme/token',
      clientId: process.env.PORTA_TENANT_CLIENT_ID!,
      clientSecret: process.env.PORTA_TENANT_CLIENT_SECRET!,
      scope: 'org:user:invite',
    }),
  }),
});

// Interactive requests: forward the caller's Porta access token.
const userClient = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    apiPrefix: '/api',
    auth: createTokenAuth({ token: userPortaAccessToken }),
  }),
});

await (interactive ? userClient : serviceClient).users.invite({
  organizationId: process.env.PORTA_TENANT_ORG_ID!,
  email: 'new.user@example.com',
  roles: [{ applicationId: process.env.PORTA_APP_ID!, roleId: roleId }],
});
```

The tenant route only allows roles owned by the token client's application.
Custom claim pre-assignment remains a control-plane capability in this
iteration. A tenant user cannot grant a role that exceeds their own live
permissions.

The service client must be configured with:

| Field                     | Value                    |
| ------------------------- | ------------------------ |
| `clientType`              | `confidential`           |
| `applicationType`         | `web`                    |
| `grantTypes`              | `['client_credentials']` |
| `scope`                   | `org:user:invite`        |
| `tokenEndpointAuthMethod` | `client_secret_post`     |

`createClientCredentialsAuth` sends the client secret in the form body, so the
client must allow `client_secret_post`.

### Cancel a pending tenant invitation

`users.invite()` returns the `invitationId` that `users.revokeInvitation()` later
cancels. The same tenant transport and `org:user:invite` authority apply:

```typescript
const invitation = await tenant.users.invite({ organizationId, email });

await tenant.users.revokeInvitation({
  organizationId,
  invitationId: invitation.invitationId,
});
```

The method returns `Promise<void>`. An unknown, expired, used, foreign-application
or unowned identifier resolves as an empty `204` no-op, like a real cancellation.
Those outcomes are not distinguished through the normal status or response body,
though the endpoint makes no constant-time guarantee. Already accepted accounts
are not changed. Admin API invitations are unowned and cannot be cancelled here.
Identifiers that would resolve to a `.` or `..` path segment are rejected locally
before any request is sent. A malformed invitation identifier that reaches the
route returns HTTP `400`; a mismatched organization or missing authority is
rejected with `403`. The tenant route shares the strict 60/hour deletion budget. See
[Users API — Invitation Revocation](../../docs/api/users.md#tenant-scoped-invitation-revocation).

### Tenant-scoped user management from a BFF

The same `users` and `userRoles` domains manage tenant users when the transport
uses `apiPrefix: '/api'`. The tenant client holds only a client ID and secret;
it never needs a control-plane account or refresh token.

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createClientCredentialsAuth, createNodeTransport } from '@portaidentity/sdk/node';

const tenant = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    apiPrefix: '/api',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.example.com/acme/token',
      clientId: process.env.PORTA_TENANT_CLIENT_ID!,
      clientSecret: process.env.PORTA_TENANT_CLIENT_SECRET!,
      scope: 'org:user:read org:user:write org:user:delete',
    }),
  }),
});

const orgId = process.env.PORTA_TENANT_ORG_ID!;
const created = await tenant.users.create({
  organizationId: orgId,
  email: 'new.user@example.com',
  givenName: 'New',
  familyName: 'User',
  emailVerified: true,
});

await tenant.users.update(orgId, created.data.id, {
  nickname: 'newbie',
  phoneNumber: '+15555550123',
  phoneNumberVerified: true,
});

await tenant.users.deactivate(orgId, created.data.id);
```

Tenant create accepts no password. The BFF sends its own welcome message and
directs the user to the existing login, magic-link, or forgot-password flow.
Tenant update rejects email, status, password, and 2FA changes. Role assignment
is limited to roles owned by the client application. Delete requires the
separate `org:user:delete` scope and is permanent.

`emailVerified` and `phoneNumberVerified` are BFF assertions. Set them only
after the BFF has verified the value itself. A relying party must not treat a
tenant-asserted `email_verified`/`phone_number_verified` claim as platform
verification by Porta.

### AI Agent Integration

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

// Get tool definitions for LLM function calling
const tools = getToolDefinitions();
// → [{ name: 'organizations.list', description: '...', parameters: [...] }, ...]

// Execute a tool call from an AI agent
const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com',
    auth: createTokenAuth({ token: process.env.PORTA_ACCESS_TOKEN! }),
  }),
});

const result = await executeTool(client, 'organizations.list', { page: 1 });
```

## Domain Namespaces

| Namespace       | Methods | Description                                             |
| --------------- | ------- | ------------------------------------------------------- |
| `organizations` | 10      | CRUD, status lifecycle, slug validation, history        |
| `applications`  | 13      | CRUD, status, module management, history                |
| `clients`       | 12      | CRUD, status, secret management, history                |
| `users`         | 19      | CRUD, status transitions, password, email, and export   |
| `usersById`     | 8       | Org-less get/update, password, email, and history       |
| `roles`         | 9       | CRUD and permission assignment                          |
| `permissions`   | 6       | CRUD                                                    |
| `userRoles`     | 4       | List, assign, remove, and resolve effective permissions |
| `customClaims`  | 10      | Claim definition CRUD and user claim values             |
| `config`        | 3       | System configuration get/set/list                       |
| `keys`          | 3       | Signing key list/generate/rotate                        |
| `audit`         | 1       | Audit log listing with filters                          |
| `stats`         | 1       | Dashboard statistics                                    |
| `sessions`      | 3       | Session listing and revocation                          |
| `bulk`          | 1       | Bulk status operations                                  |
| `branding`      | 5       | Org branding settings and asset management              |
| `exports`       | 2       | CSV/JSON reports and selective manifest export          |
| `twoFactor`     | 3       | 2FA status, disable, reset                              |
| `imports`       | 2       | Manifest preview and atomic import                      |

## Environment Portability

```typescript
const exported = await client.exports.manifest({
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations', 'applications_authorization'],
  application_selection: { all_applications: true, application_slugs: [] },
});

const preview = await client.imports.preview(exported.manifest);
if (preview.errors.length === 0) {
  const applied = await client.imports.apply(exported.manifest, 'keep-existing');
  // Store any applied.credentials secrets now; Porta returns them only once.
}
```

The SDK returns parsed data and never writes files. Manifest export excludes existing credentials
and other authentication material. Import callers should always preview first; apply repeats all
server validation and commits atomically.

## Auth Providers

| Provider                            | Use Case                                                             |
| ----------------------------------- | -------------------------------------------------------------------- |
| `createTokenAuth(token)`            | Static Bearer token (scripts, testing)                               |
| `createClientCredentialsAuth(opts)` | Server-to-server OAuth2 (with caching and concurrent dedup)          |
| `createCliAuth(opts)`               | CLI credentials file (`~/.porta/credentials.json`) with auto-refresh |

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

`users.invite()` returns an `InviteUserResult`. Administrators can activate and deactivate users.
User lockout is automatic and is not an administrator mutation. `users.getHistory()` returns the
first-page `{ data, hasMore, nextCursor }` history envelope.

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

| Import Path                  | Includes                                  | Excludes                         |
| ---------------------------- | ----------------------------------------- | -------------------------------- |
| `@portaidentity/sdk`         | Types, errors, pagination, client factory | Transport, auth (bring your own) |
| `@portaidentity/sdk/browser` | + BrowserTransport                        | NodeTransport, auth providers    |
| `@portaidentity/sdk/node`    | + NodeTransport, all auth providers       | BrowserTransport                 |
| `@portaidentity/sdk/agent`   | + Tool definitions, executeTool           | Transports, auth                 |

## Testing

```bash
# Run all SDK tests (586 tests)
cd packages/sdk && pnpm test

# Type checking
pnpm typecheck

# Full verify (lint + typecheck + test + build)
pnpm verify
```

## License

MIT — See [LICENSE](../../LICENSE) for details.
