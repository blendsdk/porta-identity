# SDK Node.js Usage

This guide covers using `@portaidentity/sdk` in Node.js applications — automation scripts, CI/CD pipelines, microservices, and backend integrations.

## Setup

### Install

```bash
yarn add @portaidentity/sdk
```

### Create Client

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const transport = createNodeTransport({
  baseUrl: 'https://porta.local:3443/api/admin',
  auth: createTokenAuth({ token: 'opaque-access-token' }),
});

const porta = createPortaClient({ transport });
```

## Authentication Providers

The Node.js entrypoint provides three authentication strategies.

### Bearer Token (Simple)

Use a pre-obtained Admin API access token. Best for scripts and one-off automation:

```typescript
import { createTokenAuth } from '@portaidentity/sdk/node';

const auth = createTokenAuth({ token: 'opaque-access-token' });
```

- ✅ Simplest setup
- ❌ No automatic refresh — when the token expires, requests fail

The token must be an account-bound access token from an active admin user. See
[Admin API authentication](../api/authentication.md).

### Client Credentials (Machine-to-Machine)

`createClientCredentialsAuth` obtains tokens with the OIDC client credentials grant:

```typescript
import { createClientCredentialsAuth } from '@portaidentity/sdk/node';

const auth = createClientCredentialsAuth({
  tokenEndpoint: 'https://porta.example.com/super-admin/token',
  clientId: 'my-service-client-id',
  clientSecret: 'my-service-client-secret',
});
```

::: warning Not accepted by the Admin API
Client-credentials tokens carry no user account identity. `/api/admin/*` requires an
`accountId` on the access token, so every Admin API request made with this provider
returns `401`. Use it only for OIDC-protected APIs that accept machine tokens.

Service-account support for the Admin API is not available yet. Use the BFF pattern
below instead.
:::

### CLI Auth (Stored Credentials)

Reads credentials from `~/.porta/credentials.json`, written by `porta login`. Best for CLI tools:

```typescript
import { createCliAuth } from '@portaidentity/sdk/node';

const auth = createCliAuth({
  credentialsPath: `${process.env.HOME}/.porta/credentials.json`,
});
```

Features:

- ✅ Reads from the `porta login` credential file
- ✅ Refreshes an expired access token with the stored refresh token
- ✅ No manual credential handling

Without a `credentialPersistence` implementation, a rotated refresh token is kept in
memory only. A long-running service should persist rotation or use the dedicated-user
pattern below.

### Admin API from a BFF

`/api/admin/*` requires an opaque access token bound to an active user in the
super-admin organization with a recognized admin role. Two supported patterns:

1. **Dedicated control-plane user** — complete Authorization Code + PKCE once as a
   dedicated admin user with the narrowest role that fits. Store the refresh token in a
   secret manager, refresh before expiry, and persist the rotated token. Use the
   `AuthProvider` interface to supply the access token.
2. **Short-lived token for a batch job** — obtain an access token through `porta login`
   or the Authorization Code flow, pass it to `createTokenAuth`, and finish the work
   within the token lifetime.

Do not store a long-lived admin session in a public web application. Run the BFF or
batch job in a separate internal service or on an operator workstation.

### Tenant user management from a BFF

A tenant BFF can manage users with a confidential `client_credentials` client
and `apiPrefix: '/api'`. Configure the client with `org:user:read`,
`org:user:write`, and `org:user:delete` (add `org:user:invite` if needed).
Tenant create accepts no password; use the existing login, magic-link, or reset
flow. Role assignment is limited to the client application, and permanent
delete requires the separate delete scope. See
[Users API](../api/users.md#tenant-scoped-m2m-user-management).

## 401 Handling & Token Refresh

The `NodeTransport` automatically handles 401 responses:

1. On 401, it calls `auth.refreshToken()` when the provider implements it
2. Retries the original request with the new token
3. If no refresh is available or it fails, throws `PortaAuthenticationError`

This happens transparently — you don't need to handle 401s in your code.

## Common Patterns

### Automation Script

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const porta = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com/api/admin',
    // Obtain a short-lived token through `porta login` or Authorization Code + PKCE.
    auth: createTokenAuth({ token: process.env.PORTA_ACCESS_TOKEN! }),
  }),
});

// Create an organization with full setup
const org = await porta.organizations.create({
  name: 'Acme Corp',
  slug: 'acme',
});

// Create a deployment-global application (no organization scope)
const app = await porta.applications.create({
  name: 'Main App',
  slug: 'main',
});

const client = await porta.clients.create({
  organizationId: org.id,
  applicationId: app.id,
  clientName: 'Web App',
  clientType: 'public',
  redirectUris: ['https://app.acme.com/callback'],
});

console.log('Setup complete:', { orgId: org.id, appId: app.id, clientId: client.clientId });
```

### Bulk Operations

```typescript
// Deactivate multiple users at once
const result = await porta.bulk.userStatus({
  ids: ['user-1', 'user-2', 'user-3'],
  action: 'deactivate',
  organizationId: 'org-uuid',
});

console.log(`Total: ${result.total}, Succeeded: ${result.succeeded}, Failed: ${result.failed}`);
```

### Data Export

```typescript
// Export all users as CSV
const csvBuffer = await porta.exports.download({
  entityType: 'users',
  format: 'csv',
});

await fs.promises.writeFile('users-export.csv', csvBuffer);
```

### Environment Portability

```typescript
import { writeFile } from 'node:fs/promises';

const exported = await porta.exports.manifest({
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations', 'applications_authorization'],
  application_selection: { all_applications: true, application_slugs: [] },
});
await writeFile('acme-porta.json', JSON.stringify(exported.manifest, null, 2), 'utf8');

const preview = await porta.imports.preview(exported.manifest);

if (preview.errors.length === 0) {
  const result = await porta.imports.apply(exported.manifest, 'keep-existing');
  // Store result.credentials securely now; generated secrets are returned only once.
}
```

The server is the strict manifest-validation authority. Applications should preview before apply
and must not add automatic mutation retries.

### Iterate All Records

```typescript
// Auto-paginate through all organizations
const allOrgs = await porta.organizations.listAll();
console.log(`Total: ${allOrgs.length} organizations`);

// With filter
const activeOrgs = await porta.organizations.listAll({ status: 'active' });
```

## Error Handling

```typescript
import {
  PortaHttpError,
  PortaAuthenticationError,
  PortaValidationError,
  PortaNotFoundError,
  PortaRateLimitError,
} from '@portaidentity/sdk';

try {
  await porta.organizations.create({ name: '' });
} catch (err) {
  if (err instanceof PortaValidationError) {
    console.error('Validation failed:', err.details);
    process.exit(1);
  }
  if (err instanceof PortaAuthenticationError) {
    console.error('Authentication failed — check credentials');
    process.exit(1);
  }
  if (err instanceof PortaRateLimitError) {
    console.error('Rate limited — retry after', err.retryAfter, 'seconds');
  }
  if (err instanceof PortaHttpError) {
    console.error(`API error ${err.status}: ${err.message}`);
  }
  throw err;
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
env:
  PORTA_URL: https://porta.example.com
  PORTA_CLIENT_ID: ${{ secrets.PORTA_CLIENT_ID }}
  PORTA_CLIENT_SECRET: ${{ secrets.PORTA_CLIENT_SECRET }}

steps:
  - name: Configure test environment
    run: |
      npx tsx scripts/configure-test-env.ts
```

### Docker / Container

```dockerfile
# Your app Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY dist/ dist/
CMD ["node", "dist/index.js"]
```

```typescript
// Your app — uses SDK with env-based configuration
const porta = createPortaClient({
  transport: createNodeTransport({
    baseUrl: process.env.PORTA_API_URL!,
    // Obtain a short-lived Admin API token through the Authorization Code flow.
    auth: createTokenAuth({ token: process.env.PORTA_ACCESS_TOKEN! }),
  }),
});
```

## See Also

- [SDK Overview](/guide/sdk) — Installation, quick start, full API reference
- [SDK Browser Usage](/guide/sdk-browser) — Browser/SPA integration
- [SDK AI Agent Guide](/guide/sdk-agent) — AI integration
- [Environment Portability](/cli/provisioning) — Selective JSON manifest export and import
