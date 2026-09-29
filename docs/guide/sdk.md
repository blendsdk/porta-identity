# TypeScript SDK

The `@portaidentity/sdk` package provides a universal TypeScript client for the Porta Admin API. It works in Node.js, browsers, and AI agent environments.

## Installation

```bash
yarn add @portaidentity/sdk
# or
npm install @portaidentity/sdk
```

The package is located at `packages/sdk/` in the monorepo.

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

// Create a user (OIDC given/family name fields)
const user = await porta.users.create({
  organizationId: 'org-id',
  email: 'alice@example.com',
  givenName: 'Alice',
  familyName: 'Smith',
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

| Import Path                  | Purpose                                   | Environment |
| ---------------------------- | ----------------------------------------- | ----------- |
| `@portaidentity/sdk`         | Client factory, types, errors, pagination | Universal   |
| `@portaidentity/sdk/node`    | Node.js transport, all auth providers     | Node.js     |
| `@portaidentity/sdk/browser` | Fetch-based transport, token auth         | Browser     |
| `@portaidentity/sdk/agent`   | AI agent tool definitions & executor      | AI agents   |

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
  tokenEndpoint: 'https://porta.local:3443/super-admin/token',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret',
});
```

### CLI Auth (stored credentials)

```typescript
import { createCliAuth } from '@portaidentity/sdk/node';
const auth = createCliAuth({
  credentialsPath: '~/.porta/credentials.json',
  refreshEndpoint: 'https://porta.local:3443/super-admin/token',
  clientId: 'porta-admin-cli',
});
```

## Domain Namespaces

The `PortaClient` provides 19 domain namespaces:

| Namespace       | Description                                        | Key Methods                                                                                                                                                                    |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations` | Org CRUD and status lifecycle                      | `list`, `listAll`, `get`, `create`, `update`, `suspend`, `activate`, `delete`, `validateSlug`, `getHistory`                                                                    |
| `applications`  | App CRUD and modules                               | `list`, `listAll`, `get`, `create`, `update`, `activate`, `deactivate`, `delete`, `getHistory`, `listModules`, `addModule`, `updateModule`, `deactivateModule`, `deleteModule` |
| `clients`       | Client CRUD and secrets                            | `list`, `listAll`, `get`, `create`, `update`, `activate`, `deactivate`, `delete`, `getHistory`, `listSecrets`, `generateSecret`, `revokeSecret`                                |
| `users`         | Org-scoped user CRUD, invite, password, and status | `list`, `listAll`, `get`, `create`, `invite`, `invitePreview`, `setPassword`, `clearPassword`, `verifyEmail`, `exportData`, `delete`, `activate`, `deactivate`, `getHistory`   |
| `usersById`     | Organization-independent user operations           | `get`, `update`, `activate`, `deactivate`, `verifyEmail`, `getHistory`                                                                                                         |
| `roles`         | Application roles, permission mapping              | `list`, `get`, `create`, `update`, `assignPermission`, `removePermission`                                                                                                      |
| `permissions`   | Application permissions                            | `list`, `listAll`, `get`, `create`, `delete`                                                                                                                                   |
| `userRoles`     | User-role assignments                              | `list`, `assign`, `remove`                                                                                                                                                     |
| `customClaims`  | Claim definitions and user claim values            | `list`, `listAll`, `get`, `create`, `update`, `delete`, `getValuesForUser`, `getValue`, `setValue`, `deleteValue`                                                              |
| `config`        | System configuration                               | `list`, `get`, `set`                                                                                                                                                           |
| `keys`          | Signing key management                             | `list`, `generate`, `rotate`                                                                                                                                                   |
| `audit`         | Audit log                                          | `list`, `listAll`                                                                                                                                                              |
| `stats`         | Dashboard statistics                               | `get`, `getOrganizationStats`                                                                                                                                                  |
| `sessions`      | Session management                                 | `list`, `revoke`, `revokeForUser`                                                                                                                                              |
| `bulk`          | Bulk status operations                             | `execute`                                                                                                                                                                      |
| `branding`      | Org branding & assets                              | `getSettings`, `updateSettings`, `uploadAsset`                                                                                                                                 |
| `exports`       | Reports and selective portability export           | `download`, `manifest`                                                                                                                                                         |
| `twoFactor`     | 2FA admin management (user + org)                  | `getStatus`, `disable`, `reset`, `regenerateRecoveryCodes`, `getPolicy`, `setPolicy`, `getSummary`                                                                             |
| `imports`       | Portability preview and atomic import              | `preview`, `apply`                                                                                                                                                             |

The `users` domain mirrors the org-scoped user routes; `usersById` mirrors the
organization-independent user routes used by administrative clients. `stats.get()` returns
the system-wide `StatsOverview` (`GET /stats/overview`), and
`stats.getOrganizationStats(orgId)` returns per-org `OrgStats`.

## ETag / Optimistic Concurrency

`get()` on core entities and the write methods that change them return `{ data, etag }`. Pass the
etag to the next write for safe concurrent updates:

```typescript
const { data: org, etag } = await porta.organizations.get('my-org');
const { data: updated, etag: next } = await porta.organizations.update(
  'my-org',
  { name: 'New Name' },
  etag ?? undefined,
);
```

The writes that expose the response ETag are `organizations.update`, `users.create`,
`users.update`, `usersById.update`, and `twoFactor.setPolicy`. The 2FA policy update accepts the
token as its third argument:

```typescript
const { etag } = await porta.twoFactor.setPolicy(orgId, 'required_totp');
await porta.twoFactor.setPolicy(orgId, 'required_email', etag ?? undefined);
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

For organization-scoped users, offset pagination uses `page` and `pageSize`. Cursor pagination uses
`cursor`; the SDK sends `pageSize` as the server's `limit` for that mode.

## User Administration Contracts

Create and invite calls carry `organizationId` in the input object. `users.invite()` returns the
invitation outcome (`invitationId`, `email`, `invitationSent`, and `expiresAt`), not a full user:
the account is created only when the recipient accepts the invitation.
Administrators can activate and deactivate users. Account lockout and cooldown recovery are
automatic. `organizations.getHistory()` and `users.getHistory()` accept
`{ limit, after, eventType }` and return the full `HistoryResult` envelope (`data`, `hasMore`,
`nextCursor`). The `after` cursor is opaque; an invalid value surfaces as a `PortaServerError`.
`usersById.getHistory()` returns the same envelope without parameters.

## Custom Claims

Claim definitions are managed per application through `customClaims`. Claim values for a user use
the same application path:

```typescript
// Definitions
const definition = await porta.customClaims.create(appId, {
  claimName: 'department',
  claimType: 'string',
});

// Values for one user
const values = await porta.customClaims.getValuesForUser(appId, userId);
await porta.customClaims.setValue(appId, definition.id, userId, 'engineering');
await porta.customClaims.deleteValue(appId, definition.id, userId);
```

The server does not filter claim values by the `appId` path segment: `getValuesForUser` returns
the user's values across applications, and the single-value routes resolve by claim ID plus user
ID. The SDK documents this instead of implying application scoping.

The previous `userClaims` namespace and the legacy `ClaimDefinition` / `UserClaimEntry` type
names are removed; the package changelog lists the replacements.

## Error Handling

All API errors throw typed error classes:

| Error Class                | HTTP Status | Description                        |
| -------------------------- | ----------- | ---------------------------------- |
| `PortaAuthenticationError` | 401         | Invalid or expired credentials     |
| `PortaForbiddenError`      | 403         | Insufficient permissions           |
| `PortaNotFoundError`       | 404         | Resource not found                 |
| `PortaValidationError`     | 422         | Invalid input (with field details) |
| `PortaConflictError`       | 409         | ETag mismatch or duplicate         |
| `PortaRateLimitError`      | 429         | Rate limit exceeded                |
| `PortaServerError`         | 5xx         | Server error                       |

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
const tools = getToolDefinitions();

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
