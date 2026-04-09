# Tenant, Clients & Mounting: OIDC Provider Core

> **Document**: 06-tenant-and-mounting.md
> **Parent**: [Index](00-index.md)

## Overview

This document covers the multi-tenant issuer resolution, client/account finder stubs, CORS middleware, the OIDC provider factory, and mounting the provider on the Koa application. These are the integration pieces that tie the provider configuration, adapters, and signing keys together.

## Architecture

### Request Flow

```
Client Request
    ↓
Koa App (existing middleware: errorHandler → requestLogger → bodyParser)
    ↓
Router: /health → healthCheck (unchanged)
    ↓
Router: /:orgSlug/* → tenantResolver middleware
    ↓
Tenant resolver: validate org exists + is active → set ctx.state.organization
    ↓
OIDC Provider middleware (handles /auth, /token, /jwks, etc.)
    ↓
Provider uses adapter (Postgres/Redis), signing keys, findAccount, findClient
    ↓
Response (OIDC-compliant JSON or redirect)
```

### Multi-Tenant Issuer Model

Each organization gets a unique OIDC issuer URL:

```
Base URL:  http://localhost:3000
Org slug:  acme-corp
Issuer:    http://localhost:3000/acme-corp

Discovery: http://localhost:3000/acme-corp/.well-known/openid-configuration
JWKS:      http://localhost:3000/acme-corp/jwks
Token:     http://localhost:3000/acme-corp/token
Auth:      http://localhost:3000/acme-corp/auth
```

`node-oidc-provider` supports dynamic issuers. A single provider instance handles all organizations — the issuer is resolved per-request.

## Implementation Details

### Tenant Resolver Middleware (`src/middleware/tenant-resolver.ts`)

```typescript
import type { Middleware } from 'koa';

/**
 * Multi-tenant resolver middleware.
 *
 * Extracts the organization slug from the URL path, validates that the
 * organization exists and is active, and sets it on ctx.state for
 * downstream middleware and the OIDC provider.
 *
 * This middleware is applied to routes under /:orgSlug/* — it does NOT
 * apply to root-level routes like /health.
 *
 * Sets:
 *   ctx.state.organization — { id, slug, name, status }
 *   ctx.state.issuer — Full issuer URL for this organization
 *
 * Throws:
 *   404 — Organization not found or not active
 */
export function tenantResolver(): Middleware;
```

**Implementation approach:**

```typescript
export function tenantResolver(): Middleware {
  return async (ctx, next) => {
    const orgSlug = ctx.params.orgSlug;
    if (!orgSlug) {
      ctx.throw(404, 'Organization not found');
    }

    // Look up org in database
    const org = await findOrganizationBySlug(orgSlug);
    if (!org || org.status !== 'active') {
      ctx.throw(404, 'Organization not found');
    }

    // Set tenant context for downstream middleware
    ctx.state.organization = org;
    ctx.state.issuer = `${config.issuerBaseUrl}/${org.slug}`;

    await next();
  };
}
```

**Organization lookup:**

For RD-03, the tenant resolver does a direct database query:

```sql
SELECT id, slug, name, status FROM organizations
WHERE slug = $1 AND status = 'active'
LIMIT 1;
```

**Future optimization (RD-04):** Add Redis caching for organization lookups. The org data changes infrequently and is read on every OIDC request.

### Client Finder Stub (`src/oidc/client-finder.ts`)

```typescript
/**
 * Dynamic client lookup for node-oidc-provider.
 *
 * Looks up OIDC clients from the database instead of static configuration.
 * In RD-03 this is a basic implementation — full secret verification with
 * Argon2id is implemented in RD-05.
 *
 * The client finder is registered on the provider via:
 *   provider.Client.find = clientFinder;
 *
 * Or via the configuration's `clientBasedCORS` and `clients` properties.
 */

/**
 * Find a client by its client_id.
 *
 * Queries the clients table for an active client matching the given
 * client_id. Returns OIDC client metadata in the format expected by
 * node-oidc-provider.
 *
 * @param clientId - The OIDC client_id to look up
 * @returns Client metadata object or undefined if not found
 */
export async function findClientByClientId(clientId: string): Promise<ClientMetadata | undefined>;
```

**Database query:**

```sql
SELECT
  client_id, client_name, client_type, application_type,
  redirect_uris, post_logout_redirect_uris,
  grant_types, response_types, scope,
  token_endpoint_auth_method, allowed_origins, require_pkce,
  organization_id
FROM clients
WHERE client_id = $1 AND status = 'active'
LIMIT 1;
```

**Mapped output (OIDC client metadata):**

```typescript
{
  client_id: row.client_id,
  client_name: row.client_name,
  application_type: row.application_type,
  redirect_uris: row.redirect_uris,
  post_logout_redirect_uris: row.post_logout_redirect_uris,
  grant_types: row.grant_types,
  response_types: row.response_types,
  scope: row.scope,
  token_endpoint_auth_method: row.token_endpoint_auth_method,
  // client_secret is NOT included — secret verification is handled
  // separately via token_endpoint_auth_methods_supported in RD-05
}
```

**Note:** For RD-03, confidential clients (with `token_endpoint_auth_method` of `client_secret_basic` or `client_secret_post`) will need a placeholder secret or `none` auth method. Full secret verification with Argon2id hashing is implemented in RD-05.

### Account Finder Stub (`src/oidc/account-finder.ts`)

```typescript
/**
 * Account finder for node-oidc-provider.
 *
 * Maps user records from the database to OIDC account objects.
 * In RD-03 this is a minimal stub — full claims mapping is
 * implemented in RD-06.
 *
 * The findAccount function is called by node-oidc-provider when it
 * needs to look up a user (e.g., for userinfo endpoint, ID token claims).
 *
 * @param ctx - Koa context with OIDC extensions
 * @param sub - The subject identifier (user ID)
 * @returns Account object with claims() method, or undefined
 */
export async function findAccount(
  ctx: KoaContextWithOIDC,
  sub: string
): Promise<Account | undefined>;
```

**Stub implementation:**

```typescript
export async function findAccount(ctx: any, sub: string) {
  // Query the users table for basic info
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, email_verified, given_name, family_name FROM users WHERE id = $1 AND status = $2',
    [sub, 'active']
  );

  if (result.rows.length === 0) return undefined;

  const user = result.rows[0];
  return {
    accountId: user.id,
    async claims(_use: string, _scope: string) {
      return {
        sub: user.id,
        email: user.email,
        email_verified: user.email_verified,
        name: [user.given_name, user.family_name].filter(Boolean).join(' ') || undefined,
        given_name: user.given_name || undefined,
        family_name: user.family_name || undefined,
      };
    },
  };
}
```

### CORS Middleware (`src/middleware/oidc-cors.ts`)

```typescript
/**
 * CORS handler for OIDC endpoints.
 *
 * node-oidc-provider accepts a `clientBasedCORS` configuration function
 * that determines whether a given origin is allowed for CORS requests.
 * This checks the requesting origin against the `allowed_origins` column
 * of the matched client's record.
 *
 * In development mode, all origins are allowed for convenience.
 *
 * @param ctx - Koa context with OIDC extensions
 * @param origin - The requesting origin
 * @param client - The matched OIDC client (may be undefined for non-client requests)
 * @returns Whether the origin is allowed
 */
export function oidcCors(
  ctx: KoaContextWithOIDC,
  origin: string,
  client: ClientMetadata
): boolean;
```

**Implementation:**

```typescript
export function oidcCors(ctx: any, origin: string, client: any): boolean {
  // In development, allow all origins
  if (config.nodeEnv === 'development') return true;

  // If no client context, deny CORS
  if (!client) return false;

  // Check if origin is in client's allowed_origins
  // The client metadata includes allowed_origins from the DB
  const allowedOrigins = client.allowed_origins || [];
  return allowedOrigins.includes(origin);
}
```

**Note:** This is passed to node-oidc-provider's `clientBasedCORS` configuration option.

### OIDC Provider Factory (`src/oidc/provider.ts`)

```typescript
import Provider from 'oidc-provider';

/**
 * Create and configure the node-oidc-provider instance.
 *
 * This is the main factory function that creates the OIDC provider
 * with all configuration, adapters, keys, and finders wired together.
 *
 * The provider uses a "placeholder" issuer that gets dynamically
 * resolved per-request based on the organization slug.
 *
 * @param jwks - JWK key set loaded from signing_keys table
 * @param ttl - TTL configuration loaded from system_config table
 * @returns Configured Provider instance
 */
export async function createOidcProvider(params: {
  jwks: { keys: JwkKeyPair[] };
  ttl: OidcTtlConfig;
}): Promise<Provider>;
```

**Implementation:**

```typescript
export async function createOidcProvider({ jwks, ttl }: {
  jwks: { keys: JwkKeyPair[] };
  ttl: OidcTtlConfig;
}): Promise<Provider> {
  const configuration = buildProviderConfiguration({
    ttl,
    jwks,
    cookieKeys: config.cookieKeys,
    findAccount,
    adapterFactory: createAdapterFactory(),
    interactionUrl: (_ctx, interaction) => {
      // Placeholder URL — login/consent UI implemented in RD-07
      return `/interaction/${interaction.uid}`;
    },
  });

  // Create provider with base issuer URL
  // The actual per-org issuer is resolved dynamically via proxy
  const provider = new Provider(config.issuerBaseUrl, configuration);

  // Allow dynamic issuer (required for multi-tenant)
  // node-oidc-provider needs this to work with path-based multi-tenancy
  provider.proxy = true;

  return provider;
}
```

### Koa App Mounting (`src/server.ts`)

The existing `createApp()` function is updated to accept a `Provider` instance and mount it:

```typescript
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import type Provider from 'oidc-provider';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthCheck } from './middleware/health.js';
import { tenantResolver } from './middleware/tenant-resolver.js';

/**
 * Create the Koa application with all middleware and routes.
 *
 * @param oidcProvider - Optional OIDC provider instance. If provided,
 *   OIDC endpoints are mounted under /:orgSlug/*.
 */
export function createApp(oidcProvider?: Provider): Koa {
  const app = new Koa();

  // Global middleware stack (order matters)
  app.use(errorHandler());
  app.use(requestLogger());
  app.use(bodyParser());

  // Health check route (root level — no tenant context)
  const router = new Router();
  router.get('/health', healthCheck());
  app.use(router.routes());
  app.use(router.allowedMethods());

  // OIDC provider routes (under /:orgSlug prefix)
  if (oidcProvider) {
    // Mount tenant resolver + provider under /:orgSlug
    const oidcRouter = new Router({ prefix: '/:orgSlug' });
    oidcRouter.use(tenantResolver());
    oidcRouter.all('(.*)', async (ctx) => {
      // Delegate to node-oidc-provider's Koa app
      ctx.req.url = ctx.req.url!.replace(`/${ctx.params.orgSlug}`, '');
      await oidcProvider.callback()(ctx.req, ctx.res);
    });
    app.use(oidcRouter.routes());
    app.use(oidcRouter.allowedMethods());
  }

  return app;
}
```

**Key mounting considerations:**

1. **URL rewriting**: The provider expects endpoints at `/auth`, `/token`, etc. (no org prefix). The middleware strips the `/:orgSlug` prefix before passing to the provider.
2. **Issuer resolution**: The provider needs to know the full issuer URL for the current request. This is set via the tenant resolver middleware putting it on `ctx.state.issuer`.
3. **Health endpoint unaffected**: `/health` is mounted on a separate router at the root level.
4. **Optional provider**: `createApp()` accepts an optional provider for backward compatibility with tests that don't need OIDC.

### Entry Point Updates (`src/index.ts`)

```typescript
import { createApp } from './server.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { ensureSigningKeys } from './lib/signing-keys.js';
import { loadOidcTtlConfig } from './lib/system-config.js';
import { createOidcProvider } from './oidc/provider.js';

async function main() {
  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Load OIDC configuration from database
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // Create OIDC provider
  const oidcProvider = await createOidcProvider({ jwks, ttl });

  // Create and start server with OIDC provider mounted
  const app = createApp(oidcProvider);
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'Server started');
  });

  // Graceful shutdown (unchanged)
  // ...
}
```

## Integration Points

- **tenantResolver** uses `getPool()` to query organizations table
- **clientFinder** uses `getPool()` to query clients table
- **accountFinder** uses `getPool()` to query users table
- **oidcCors** uses `config.nodeEnv` for development mode
- **provider factory** combines configuration, adapters, keys, finders
- **server.ts** mounts provider with tenant prefix routing
- **index.ts** orchestrates startup: DB → Redis → keys → TTLs → provider → server

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Unknown org slug | Tenant resolver returns 404 |
| Inactive/suspended org | Tenant resolver returns 404 |
| Client not found | Provider returns standard OIDC error (invalid_client) |
| Account not found | Provider returns appropriate OIDC error |
| CORS origin not allowed | Request blocked by browser (no CORS headers) |
| Provider initialization failure | Fatal error — process exits |

## Testing Requirements

- Unit tests for `tenantResolver()` — valid org, invalid org, inactive org, missing slug
- Unit tests for `findClientByClientId()` — found, not found, inactive client
- Unit tests for `findAccount()` — found, not found, inactive user
- Unit tests for `oidcCors()` — allowed origin, blocked origin, development mode
- Unit tests for `createOidcProvider()` — verify provider instance is created with correct config
- Unit tests for updated `createApp()` — verify routes are mounted correctly
