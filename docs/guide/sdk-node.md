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
  auth: createTokenAuth('your-bearer-token'),
});

const porta = createPortaClient({ transport });
```

## Authentication Providers

The Node.js entrypoint provides three authentication strategies.

### Bearer Token (Simple)

Use a pre-obtained token. Best for scripts and one-off automation:

```typescript
import { createTokenAuth } from '@portaidentity/sdk/node';

const auth = createTokenAuth('eyJhbGciOiJFUzI1NiIs...');
```

- ✅ Simplest setup
- ❌ No automatic refresh — when the token expires, requests fail

### Client Credentials (Machine-to-Machine)

Use OIDC client credentials grant for server-to-server communication. Best for long-running services:

```typescript
import { createClientCredentialsAuth } from '@portaidentity/sdk/node';

const auth = createClientCredentialsAuth({
  tokenEndpoint: 'https://porta.local:3443/super-admin/oidc/token',
  clientId: 'my-service-client-id',
  clientSecret: 'my-service-client-secret',
});
```

Features:
- ✅ Automatic token fetching and caching
- ✅ Automatic refresh when token expires
- ✅ Concurrent request deduplication (avoids thundering herd)
- ✅ No user interaction required

### CLI Auth (Stored Credentials)

Reads credentials from `~/.porta/credentials.json`, written by `porta login`. Best for CLI tools:

```typescript
import { createCliAuth } from '@portaidentity/sdk/node';

const auth = createCliAuth({
  credentialsPath: '~/.porta/credentials.json',
  refreshEndpoint: 'https://porta.local:3443/super-admin/oidc/token',
  clientId: 'porta-admin-cli',
});
```

Features:
- ✅ Reads from `porta login` credential file
- ✅ Automatic token refresh via refresh_token grant
- ✅ No manual credential handling

## 401 Handling & Token Refresh

The `NodeTransport` automatically handles 401 responses:

1. On 401, it calls `auth.refresh()` to get a new token
2. Retries the original request with the new token
3. If refresh also fails, throws `PortaAuthenticationError`

This happens transparently — you don't need to handle 401s in your code.

## Common Patterns

### Automation Script

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';

const porta = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.example.com/api/admin',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.example.com/super-admin/oidc/token',
      clientId: process.env.PORTA_CLIENT_ID!,
      clientSecret: process.env.PORTA_CLIENT_SECRET!,
    }),
  }),
});

// Create an organization with full setup
const org = await porta.organizations.create({
  name: 'Acme Corp',
  slug: 'acme',
});

const app = await porta.applications.create({
  organizationId: org.id,
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
// Suspend multiple users at once
const result = await porta.bulk.userStatus({
  ids: ['user-1', 'user-2', 'user-3'],
  action: 'suspend',
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

### Declarative Provisioning

```typescript
import { readFileSync } from 'fs';
import yaml from 'js-yaml';

const manifest = yaml.load(readFileSync('provision.yaml', 'utf8'));
const result = await porta.imports.provision(manifest);

console.log(`Provisioned: ${result.created.length} created, ${result.updated.length} updated`);
if (result.credentials.length > 0) {
  console.log('New client credentials:', result.credentials);
}
```

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
  - name: Provision test environment
    run: |
      npx tsx scripts/provision-test-env.ts
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
    auth: createClientCredentialsAuth({
      tokenEndpoint: process.env.PORTA_TOKEN_ENDPOINT!,
      clientId: process.env.PORTA_CLIENT_ID!,
      clientSecret: process.env.PORTA_CLIENT_SECRET!,
    }),
  }),
});
```

## See Also

- [SDK Overview](/guide/sdk) — Installation, quick start, full API reference
- [SDK Browser Usage](/guide/sdk-browser) — Browser/SPA integration
- [SDK AI Agent Guide](/guide/sdk-agent) — AI integration
- [Provisioning](/cli/provisioning) — YAML-based declarative setup
