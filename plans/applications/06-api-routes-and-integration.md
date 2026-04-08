# API Routes & Integration

> **Document**: 06-api-routes-and-integration.md
> **Parent**: [Index](00-index.md)

## Overview

Two new route files provide admin APIs for managing applications, clients, and
secrets. Both follow the established pattern from `src/routes/organizations.ts`:
Koa Router with Zod validation, super-admin middleware, and domain error mapping.

Additionally, the existing OIDC client-finder is updated to delegate to the new
client service for proper secret verification.

## Architecture

### Route Structure

```
/api/admin/applications                         — Application management
/api/admin/applications/:id/modules             — Module management (nested)
/api/admin/clients                              — Client management
/api/admin/clients/:id/secrets                  — Secret management (nested)
```

All routes require super-admin authorization (same as org routes).

### Files

| File                          | Purpose                                    |
|-------------------------------|--------------------------------------------|
| `src/routes/applications.ts`  | Application + module routes                |
| `src/routes/clients.ts`       | Client + secret routes                     |
| `src/oidc/client-finder.ts`  | Updated to use client service              |
| `src/server.ts`              | Mount new routers                           |

## Implementation Details

### routes/applications.ts — Application Admin Routes

**Prefix**: `/api/admin/applications`

| Method | Path                       | Handler                     | Description                  |
|--------|----------------------------|-----------------------------|------------------------------|
| POST   | `/`                        | Create application          | Zod-validated body           |
| GET    | `/`                        | List applications           | Paginated with filters       |
| GET    | `/:id`                     | Get application by ID       | Returns single application   |
| PUT    | `/:id`                     | Update application          | Partial update               |
| POST   | `/:id/archive`             | Archive application         | Status → archived            |
| POST   | `/:id/activate`            | Activate application        | Status → active              |
| POST   | `/:id/deactivate`          | Deactivate application      | Status → inactive            |
| POST   | `/:id/modules`             | Create module               | Nested under application     |
| GET    | `/:id/modules`             | List modules                | All modules for application  |
| PUT    | `/:id/modules/:moduleId`   | Update module               | Partial update               |
| POST   | `/:id/modules/:moduleId/deactivate` | Deactivate module | Status → inactive            |

**Zod schemas**:

```typescript
const createApplicationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  description: z.string().max(2000).optional(),
});

const updateApplicationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

const listApplicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createModuleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  description: z.string().max(2000).optional(),
});

const updateModuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
```

**Error mapping** (same pattern as org routes):
- `ApplicationNotFoundError` → 404
- `ApplicationValidationError` → 400
- `ZodError` → 400 with validation details

### routes/clients.ts — Client & Secret Admin Routes

**Prefix**: `/api/admin/clients`

| Method | Path                           | Handler                     | Description                     |
|--------|--------------------------------|-----------------------------|---------------------------------|
| POST   | `/`                            | Create client               | Returns ClientWithSecret        |
| GET    | `/`                            | List clients                | Paginated, org/app filters      |
| GET    | `/:id`                         | Get client by ID            | Returns single client           |
| PUT    | `/:id`                         | Update client               | Partial update                  |
| POST   | `/:id/revoke`                  | Revoke client               | Status → revoked                |
| POST   | `/:id/activate`                | Activate client             | Status → active                 |
| POST   | `/:id/deactivate`              | Deactivate client           | Status → inactive               |
| POST   | `/:id/secrets`                 | Generate secret             | Returns SecretWithPlaintext     |
| GET    | `/:id/secrets`                 | List secrets                | Without hashes                  |
| POST   | `/:id/secrets/:secretId/revoke`| Revoke secret               | Permanent revocation            |

**Zod schemas**:

```typescript
const createClientSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  clientName: z.string().min(1).max(255),
  clientType: z.enum(['confidential', 'public']),
  applicationType: z.enum(['web', 'native', 'spa']),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  postLogoutRedirectUris: z.array(z.string().url()).max(10).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scope: z.string().optional(),
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic', 'client_secret_post', 'none'
  ]).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  requirePkce: z.boolean().optional(),
  secretLabel: z.string().max(255).optional(),
});

const updateClientSchema = z.object({
  clientName: z.string().min(1).max(255).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10).optional(),
  postLogoutRedirectUris: z.array(z.string().url()).max(10).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scope: z.string().optional(),
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic', 'client_secret_post', 'none'
  ]).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  requirePkce: z.boolean().optional(),
});

const listClientsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  organizationId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'revoked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['client_name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createSecretSchema = z.object({
  label: z.string().max(255).optional(),
  expiresAt: z.coerce.date().optional(),
});
```

**Error mapping**:
- `ClientNotFoundError` → 404
- `ClientValidationError` → 400
- `ZodError` → 400 with validation details

**Important response notes**:
- `POST /` (create client) returns `201` with `{ data: { client, secret } }`
- `POST /:id/secrets` returns `201` with `{ data: secret }` — includes plaintext
- Secret list (`GET /:id/secrets`) never includes `secret_hash`
- Secret creation response should include a warning: `"warning": "Store the secret securely. It will not be shown again."`

### OIDC Client Finder Update

The existing `src/oidc/client-finder.ts` is updated to delegate to the new client
service instead of querying the database directly:

```typescript
// BEFORE (RD-03 placeholder):
export async function findClientByClientId(clientId: string): Promise<OidcClientMetadata | undefined> {
  // Direct SQL query to clients table
  // No secret verification
}

// AFTER (RD-05):
export async function findClientByClientId(clientId: string): Promise<OidcClientMetadata | undefined> {
  // Delegate to client service which handles cache, status, etc.
  return findForOidc(clientId);
}
```

The `OidcClientMetadata` interface stays in `client-finder.ts` since it's used
by the OIDC configuration. The `findForOidc` function in the client service
returns the same type.

### Server Integration

Update `src/server.ts` to mount the new routers:

```typescript
// Existing:
import { createOrganizationRouter } from './routes/organizations.js';

// New:
import { createApplicationRouter } from './routes/applications.js';
import { createClientRouter } from './routes/clients.js';

// Mount (after org router):
const appRouter = createApplicationRouter();
app.use(appRouter.routes());
app.use(appRouter.allowedMethods());

const clientRouter = createClientRouter();
app.use(clientRouter.routes());
app.use(clientRouter.allowedMethods());
```

## Error Handling

Both routers use the same `handleError` helper pattern as the org routes:

```typescript
function handleError(ctx, err: unknown): never {
  if (err instanceof ApplicationNotFoundError) ctx.throw(404, err.message);
  if (err instanceof ApplicationValidationError) ctx.throw(400, err.message);
  if (err instanceof ClientNotFoundError) ctx.throw(404, err.message);
  if (err instanceof ClientValidationError) ctx.throw(400, err.message);
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
    return undefined as never;
  }
  throw err;
}
```

**Note**: Each route file defines its own `handleError` that handles only its
own error types. This keeps error handling scoped and explicit.

## Testing Requirements

- Application routes: ~15 tests (CRUD + modules + status + validation errors)
- Client routes: ~18 tests (CRUD + secrets + status + validation errors)
- Client-finder update: ~4 tests (updated to verify delegation)
