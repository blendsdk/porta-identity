# Client Module: Types, Repository, Cache, Service

> **Document**: 04-client-module.md
> **Parent**: [Index](00-index.md)

## Overview

The client module (`src/clients/`) manages OIDC client registrations and their
relationship to organizations and applications. Each client is scoped to an
organization + application pair and represents a deployment target (web app,
mobile app, SPA).

This module handles client CRUD, status lifecycle, redirect URI validation,
default grant type assignment, OIDC metadata mapping, and Redis caching.
Secret management is covered separately in [05-secret-management.md](05-secret-management.md).

## Architecture

### File Structure

```
src/clients/
  types.ts              — Client, ClientSecret, input/output types, row mapping
  errors.ts             — ClientNotFoundError, ClientValidationError
  crypto.ts             — Client ID generation, secret generation, Argon2id
  validators.ts         — Redirect URI validation, grant type defaults
  repository.ts         — PostgreSQL CRUD for clients
  secret-repository.ts  — PostgreSQL CRUD for secrets
  cache.ts              — Redis cache for client metadata
  service.ts            — Client business logic
  secret-service.ts     — Secret lifecycle management
  index.ts              — Barrel export
```

## Implementation Details

### types.ts — Client Types

```typescript
/** Client type — confidential (has secret) or public (no secret) */
export type ClientType = 'confidential' | 'public';

/** Application type — how the client is deployed */
export type ApplicationType = 'web' | 'native' | 'spa';

/** Client status values */
export type ClientStatus = 'active' | 'inactive' | 'revoked';

/** Secret status values */
export type SecretStatus = 'active' | 'revoked';

/** Full client record (camelCase) */
export interface Client {
  id: string;                        // Internal UUID
  organizationId: string;
  applicationId: string;
  clientId: string;                   // OIDC client_id (public)
  clientName: string;
  clientType: ClientType;
  applicationType: ApplicationType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  tokenEndpointAuthMethod: string;
  allowedOrigins: string[];
  requirePkce: boolean;
  status: ClientStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Client secret record (camelCase) — secret_hash is NEVER exposed */
export interface ClientSecret {
  id: string;
  clientId: string;                   // FK to clients.id (internal UUID)
  label: string | null;
  expiresAt: Date | null;
  status: SecretStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Returned only once at secret creation time */
export interface SecretWithPlaintext {
  id: string;
  clientId: string;
  label: string | null;
  plaintext: string;                  // Shown once, then discarded
  expiresAt: Date | null;
  createdAt: Date;
}

/** Returned when creating a confidential client */
export interface ClientWithSecret {
  client: Client;
  secret: SecretWithPlaintext | null; // null for public clients
}

/** Input for creating a new client */
export interface CreateClientInput {
  organizationId: string;
  applicationId: string;
  clientName: string;
  clientType: ClientType;
  applicationType: ApplicationType;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];              // Defaults based on client/app type
  responseTypes?: string[];           // Defaults to ['code']
  scope?: string;                     // Defaults to 'openid profile email'
  tokenEndpointAuthMethod?: string;   // Defaults based on client type
  allowedOrigins?: string[];
  requirePkce?: boolean;              // Defaults to true
  secretLabel?: string;               // Label for initial secret (confidential)
}

/** Input for updating a client (partial) */
export interface UpdateClientInput {
  clientName?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
  allowedOrigins?: string[];
  requirePkce?: boolean;
}

/** Input for creating a secret */
export interface CreateSecretInput {
  label?: string;
  expiresAt?: Date;
}

/** Options for listing clients */
export interface ListClientsOptions {
  page: number;
  pageSize: number;
  organizationId?: string;
  applicationId?: string;
  status?: ClientStatus;
  search?: string;                    // Search by client_name
  sortBy?: 'client_name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}
```

**Row types and mapping functions**:
- `ClientRow` — snake_case DB row for clients table
- `ClientSecretRow` — snake_case DB row for client_secrets table
- `mapRowToClient(row)` — ClientRow → Client
- `mapRowToClientSecret(row)` — ClientSecretRow → ClientSecret

### errors.ts — Domain Errors

```typescript
export class ClientNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Client not found: ${identifier}`);
    this.name = 'ClientNotFoundError';
  }
}

export class ClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientValidationError';
  }
}
```

### validators.ts — Redirect URI & Grant Type Logic

```typescript
/**
 * Validate a redirect URI according to OIDC security rules.
 * - Must be a valid URL
 * - HTTPS required in production (except localhost)
 * - No wildcards in path or query
 * - No fragments (#)
 * - Custom URI schemes allowed for native apps
 */
export function validateRedirectUri(uri: string, isProduction: boolean): {
  isValid: boolean;
  error?: string;
}

/**
 * Validate an array of redirect URIs.
 * Max 10 URIs per client (configurable).
 */
export function validateRedirectUris(
  uris: string[],
  isProduction: boolean,
  max?: number,
): { isValid: boolean; errors?: string[] }

/**
 * Get default grant types based on client type and application type.
 *
 * | ClientType   | AppType | Default Grants                                         |
 * |-------------|---------|-------------------------------------------------------|
 * | confidential | web     | authorization_code, refresh_token, client_credentials |
 * | public       | spa     | authorization_code, refresh_token                     |
 * | public       | native  | authorization_code, refresh_token                     |
 */
export function getDefaultGrantTypes(
  clientType: ClientType,
  applicationType: ApplicationType,
): string[]

/**
 * Get default token endpoint auth method based on client type.
 * - confidential → 'client_secret_basic'
 * - public → 'none'
 */
export function getDefaultTokenEndpointAuthMethod(clientType: ClientType): string
```

### repository.ts — Client PostgreSQL CRUD

| Function                          | Description                                | Returns                     |
|-----------------------------------|--------------------------------------------|-----------------------------|
| `insertClient(data)`             | Insert new client row                       | `Client`                    |
| `findClientById(id)`             | Find by internal UUID                       | `Client \| null`            |
| `findClientByClientId(clientId)` | Find by OIDC client_id                      | `Client \| null`            |
| `updateClient(id, data)`         | Dynamic partial update                      | `Client`                    |
| `listClients(options)`           | Paginated list with org/app/status filters  | `PaginatedResult<Client>`   |
| `countClientsByOrg(orgId)`       | Count clients for an organization           | `number`                    |
| `countClientsByApp(appId)`       | Count clients for an application            | `number`                    |

Key details:
- `insertClient` receives a pre-generated `clientId` (OIDC identifier)
- Dynamic UPDATE query builder (same pattern as org repository)
- `listClients` supports filtering by `organizationId`, `applicationId`, and `status`
- All queries use parameterized values, sort columns are whitelisted

### cache.ts — Redis Cache

| Function                              | Key Pattern                  | TTL   |
|---------------------------------------|------------------------------|-------|
| `getCachedClientByClientId(clientId)` | `client:cid:{clientId}`      | 300s  |
| `getCachedClientById(id)`             | `client:id:{id}`             | 300s  |
| `cacheClient(client)`                | Both keys                     | 300s  |
| `invalidateClientCache(clientId, id)` | Deletes both keys            | —     |

**Important**: The cache stores the full `Client` object. Secret data is NEVER cached —
secret lookups always hit the database to ensure revoked/expired secrets are immediately
ineffective.

### service.ts — Client Business Logic

| Function                                 | Description                                    |
|------------------------------------------|------------------------------------------------|
| `createClient(input, actor?)`            | Validate → gen client_id → insert → (gen secret) → cache → audit |
| `getClientById(id)`                      | Cache-first by internal UUID                   |
| `getClientByClientId(clientId)`          | Cache-first by OIDC client_id                  |
| `updateClient(id, input, actor?)`        | Validate → update → invalidate → re-cache → audit |
| `revokeClient(id, actor?)`              | Set status='revoked' → invalidate → audit       |
| `deactivateClient(id, actor?)`          | Set status='inactive' → invalidate → audit       |
| `activateClient(id, actor?)`            | Set status='active' → invalidate → audit         |
| `listClientsByOrganization(orgId, opts)` | Delegate to repository with org filter          |
| `listClientsByApplication(appId, opts)` | Delegate to repository with app filter           |
| `findForOidc(clientId)`                 | Returns OIDC-format metadata (used by client-finder) |

**`createClient` flow**:
1. Validate organization exists and is active (via org service)
2. Validate application exists and is active (via app service)
3. Validate redirect URIs
4. Apply defaults (grant types, response types, scope, auth method, PKCE)
5. Generate cryptographically random `client_id`
6. Insert client row
7. If confidential: generate initial secret via secret service
8. Cache the client
9. Write audit log
10. Return `ClientWithSecret`

**`findForOidc` mapping** — converts internal Client to oidc-provider metadata:
```typescript
{
  client_id: client.clientId,
  client_name: client.clientName,
  application_type: client.applicationType,
  redirect_uris: client.redirectUris,
  post_logout_redirect_uris: client.postLogoutRedirectUris,
  grant_types: client.grantTypes,
  response_types: client.responseTypes,
  scope: client.scope,
  token_endpoint_auth_method: client.clientType === 'public'
    ? 'none'
    : client.tokenEndpointAuthMethod,
  allowed_origins: client.allowedOrigins,
}
```

## Error Handling

| Error Case                              | Handling Strategy                    |
|-----------------------------------------|--------------------------------------|
| Client not found                        | Throw `ClientNotFoundError`          |
| Invalid redirect URI                    | Throw `ClientValidationError`        |
| Organization not found/not active       | Throw `ClientValidationError`        |
| Application not found/not active        | Throw `ClientValidationError`        |
| Invalid status transition               | Throw `ClientValidationError`        |
| Client already revoked                  | Throw `ClientValidationError`        |
| Redis failure                           | Log warning, graceful degradation    |

## Integration Points

- **With application service**: Validates application exists and is active at client creation
- **With organization service**: Validates organization exists and is active at client creation
- **With secret service**: Generates initial secret for confidential clients
- **With client-finder**: `findForOidc()` replaces the current direct DB query
- **With OIDC CORS handler**: `allowed_origins` checked via client cache
