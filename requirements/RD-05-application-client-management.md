# RD-05: Application, Client & Secret Management

> **Document**: RD-05-application-client-management.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-02 (Database Schema), RD-04 (Organization Management)

---

## Feature Overview

Implement the application, client, and secret management system. An **application** represents the SaaS product with its modules. A **client** represents a specific OIDC registration for an organization (e.g., "Acme Corp's web client", "Acme Corp's mobile client"). **Secrets** are credentials for confidential clients, stored hashed with support for rotation.

### Conceptual Model

```
Application ("BusinessSuite")
├── Module ("CRM")
├── Module ("Invoicing")
└── Module ("HR")

Organization ("Acme Corp")
├── Client ("Acme Web App")          → confidential, web
│   ├── Secret (active, label: "production")
│   └── Secret (active, label: "rotation")
├── Client ("Acme Mobile App")       → public, native
└── Client ("Acme Desktop App")      → public, native
```

---

## Functional Requirements

### Must Have — Applications

- [ ] Application CRUD operations (create, read, update, archive)
- [ ] Application slug generation and validation
- [ ] Application status lifecycle: `active` → `inactive` → `archived`
- [ ] Application module CRUD (create, read, update, deactivate)
- [ ] Module slug is namespaced per application (unique within app)

### Must Have — Clients

- [ ] Client CRUD operations (create, read, update, revoke)
- [ ] Auto-generated `client_id` (cryptographically random, URL-safe string)
- [ ] Client types: `confidential` (server-side) and `public` (SPA, mobile, desktop)
- [ ] Application types: `web`, `native`, `spa`
- [ ] Configurable redirect URIs (validated, no wildcards)
- [ ] Configurable post-logout redirect URIs
- [ ] Configurable grant types per client
- [ ] Configurable scopes per client
- [ ] CORS allowed origins per client
- [ ] PKCE required by default (configurable per client)
- [ ] Client status lifecycle: `active` → `inactive` → `revoked`
- [ ] Client scoped to organization + application
- [ ] Token endpoint auth method per client (`client_secret_basic`, `client_secret_post`, `none`)

### Must Have — Secrets

- [ ] Secret generation (cryptographically random, 48+ bytes, base64url-encoded)
- [ ] Secret stored as Argon2id hash (plaintext never stored, shown only once at creation)
- [ ] Multiple active secrets per client (for zero-downtime rotation)
- [ ] Secret revocation (immediate, cannot be un-revoked)
- [ ] Secret expiration (optional expiry date)
- [ ] Secret labels (human-readable identifier)
- [ ] Secret verification against all active secrets for a client
- [ ] Track `last_used_at` for each secret

### Should Have

- [ ] Redirect URI validation (must be HTTPS in production, allow HTTP for localhost in dev)
- [ ] Client metadata export (for sharing with application developers)
- [ ] Secret usage statistics (last used, total uses)
- [ ] Automatic expiry warning (secrets expiring within N days)
- [ ] Bulk client creation (create web + mobile + desktop in one operation)

### Won't Have (Out of Scope)

- Dynamic client registration (RFC 7591) — admin-only
- Client certificates (mTLS) — may add later
- Sector identifier URI validation
- Client logo/branding (the org has branding, not individual clients)

---

## Technical Requirements

### Application Service

```typescript
interface ApplicationService {
  // Application CRUD
  create(data: CreateApplicationInput): Promise<Application>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  update(id: string, data: UpdateApplicationInput): Promise<Application>;
  archive(id: string): Promise<void>;
  list(options: ListOptions): Promise<PaginatedResult<Application>>;

  // Module CRUD
  createModule(appId: string, data: CreateModuleInput): Promise<ApplicationModule>;
  updateModule(moduleId: string, data: UpdateModuleInput): Promise<ApplicationModule>;
  deactivateModule(moduleId: string): Promise<void>;
  listModules(appId: string): Promise<ApplicationModule[]>;
}
```

### Client Service

```typescript
interface ClientService {
  // CRUD
  create(data: CreateClientInput): Promise<ClientWithSecret>;
  findById(id: string): Promise<Client | null>;
  findByClientId(clientId: string): Promise<Client | null>;
  update(id: string, data: UpdateClientInput): Promise<Client>;
  revoke(id: string): Promise<void>;

  // Listing
  listByOrganization(orgId: string, options?: ListOptions): Promise<PaginatedResult<Client>>;
  listByApplication(appId: string, options?: ListOptions): Promise<PaginatedResult<Client>>;

  // OIDC integration
  findForOidc(clientId: string): Promise<OidcClientMetadata | null>;
  verifySecret(clientId: string, secret: string): Promise<boolean>;

  // CORS
  isOriginAllowed(origin: string): Promise<boolean>;
}
```

### Secret Service

```typescript
interface SecretService {
  // Generation
  generate(clientDbId: string, data: CreateSecretInput): Promise<SecretWithPlaintext>;

  // Management
  revoke(secretId: string): Promise<void>;
  listByClient(clientDbId: string): Promise<ClientSecret[]>;
  listActiveByClient(clientDbId: string): Promise<ClientSecret[]>;

  // Verification (used by OIDC provider)
  verify(clientDbId: string, plaintext: string): Promise<boolean>;

  // Maintenance
  cleanupExpired(): Promise<number>; // Returns count of expired secrets cleaned up
}
```

### Data Types

```typescript
interface Application {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

interface ApplicationModule {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

interface Client {
  id: string;                        // Internal UUID
  organizationId: string;
  applicationId: string;
  clientId: string;                   // OIDC client_id (public)
  clientName: string;
  clientType: 'confidential' | 'public';
  applicationType: 'web' | 'native' | 'spa';
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  tokenEndpointAuthMethod: string;
  allowedOrigins: string[];
  requirePkce: boolean;
  status: 'active' | 'inactive' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
}

interface ClientSecret {
  id: string;
  clientId: string;                   // FK to clients.id (internal)
  label: string | null;
  expiresAt: Date | null;
  status: 'active' | 'revoked';
  lastUsedAt: Date | null;
  createdAt: Date;
  // Note: secretHash is never returned to the API layer
}

// Returned only once at creation time
interface SecretWithPlaintext {
  id: string;
  clientId: string;
  label: string | null;
  plaintext: string;                  // Shown once, never stored
  expiresAt: Date | null;
  createdAt: Date;
}

interface ClientWithSecret {
  client: Client;
  secret: SecretWithPlaintext | null; // null for public clients
}

interface CreateClientInput {
  organizationId: string;
  applicationId: string;
  clientName: string;
  clientType: 'confidential' | 'public';
  applicationType: 'web' | 'native' | 'spa';
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];              // Defaults based on client/app type
  responseTypes?: string[];           // Defaults to ['code']
  scope?: string;                     // Defaults to 'openid profile email'
  tokenEndpointAuthMethod?: string;   // Defaults based on client type
  allowedOrigins?: string[];
  requirePkce?: boolean;              // Defaults to true
  secretLabel?: string;               // Label for the initial secret (confidential only)
}

interface CreateSecretInput {
  label?: string;
  expiresAt?: Date;
}
```

### Client ID Generation

```
Format: Cryptographically random, 32 bytes, base64url-encoded
Length: ~43 characters
Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

Generation: crypto.randomBytes(32).toString('base64url')
```

### Secret Generation

```
Format: Cryptographically random, 48 bytes, base64url-encoded
Length: ~64 characters
Example: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5QUJDREVG"

Generation: crypto.randomBytes(48).toString('base64url')
Hashing: argon2id(secret) → stored in client_secrets.secret_hash
```

### Secret Verification Flow

When `node-oidc-provider` needs to verify a client secret (during token request):

```
1. Client sends: client_id + client_secret (via Basic auth or POST body)
2. Look up client by client_id
3. Load all active, non-expired secrets for this client
4. For each active secret:
   a. argon2.verify(secret.secret_hash, provided_secret)
   b. If match → update last_used_at, return true
5. If no match → return false (authentication failed)
```

### Redirect URI Validation Rules

```
Rules:
1. Must be a valid URL
2. In production: Must use HTTPS (except for localhost)
3. In development: HTTP allowed for localhost (127.0.0.1, [::1], localhost)
4. No wildcards in path or query
5. No fragments (#) allowed
6. Custom URI schemes allowed for native apps (e.g., "myapp://callback")
7. Maximum 10 redirect URIs per client (configurable)

Native app special cases:
- iOS: Custom scheme (e.g., "com.example.app://callback")
- Android: Custom scheme or App Link (HTTPS with /.well-known/assetlinks.json)
- Desktop: Loopback redirect (http://127.0.0.1:{port}/callback or http://localhost:{port}/callback)
```

### Default Grant Types by Client Type

| Client Type | Application Type | Default Grant Types |
|------------|-----------------|-------------------|
| confidential | web | `authorization_code`, `refresh_token`, `client_credentials` |
| public | spa | `authorization_code`, `refresh_token` |
| public | native | `authorization_code`, `refresh_token` |

### OIDC Client Metadata Mapping

Maps from internal `Client` model to `node-oidc-provider` client metadata format:

```typescript
function toOidcMetadata(client: Client, secrets: ClientSecret[]): OidcClientMetadata {
  return {
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
    // PKCE
    ...(client.requirePkce && {
      token_endpoint_auth_signing_alg: undefined,
    }),
  };
}
```

### Audit Events

| Event | Event Type | Category |
|-------|-----------|----------|
| Application created | `app.created` | `admin` |
| Application updated | `app.updated` | `admin` |
| Application archived | `app.archived` | `admin` |
| Module created | `app.module.created` | `admin` |
| Module updated | `app.module.updated` | `admin` |
| Client created | `client.created` | `admin` |
| Client updated | `client.updated` | `admin` |
| Client revoked | `client.revoked` | `admin` |
| Secret generated | `client.secret.generated` | `admin` |
| Secret revoked | `client.secret.revoked` | `admin` |
| Secret verified (success) | `client.secret.verified` | `authentication` |
| Secret verified (failure) | `client.secret.failed` | `security` |

---

## Integration Points

### With RD-03 (OIDC Core)
- `findClient` uses ClientService to look up client metadata
- Secret verification integrated with provider's token endpoint authentication
- CORS origins checked against client `allowed_origins`

### With RD-04 (Organizations)
- Clients are scoped to organizations
- When org is archived/suspended, clients become inaccessible

### With RD-08 (RBAC & Custom Claims)
- Roles and permissions are defined per application
- Custom claims are defined per application

### With RD-09 (CLI)
- CLI commands for application, client, and secret management

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Client ID format | UUID, random string, prefixed | Random base64url (32 bytes) | Standard OIDC practice, not guessable |
| Secret storage | Plaintext, bcrypt, argon2 | Argon2id | Most secure password hashing, resistant to GPU attacks |
| Multiple secrets | Single secret, multiple | Multiple active secrets | Enables zero-downtime rotation |
| Redirect URI wildcards | Allow wildcards, strict match | Strict match only | Security best practice, prevents open redirect |
| Default auth method | client_secret_basic, client_secret_post | client_secret_basic | Most widely supported, HTTP Basic auth |

---

## Acceptance Criteria

1. [ ] Application CRUD operations work correctly
2. [ ] Application module CRUD works with proper namespacing
3. [ ] Client creation generates cryptographically random `client_id`
4. [ ] Confidential client creation returns secret plaintext exactly once
5. [ ] Secret plaintext is never stored in the database
6. [ ] Secret verification works via Argon2id comparison
7. [ ] Multiple active secrets work for the same client
8. [ ] Secret revocation is immediate and permanent
9. [ ] Expired secrets are not valid for authentication
10. [ ] Redirect URI validation enforces HTTPS in production
11. [ ] Custom URI schemes work for native app clients
12. [ ] Default grant types are correctly set based on client/app type
13. [ ] CORS origin checking works per-client
14. [ ] Client metadata maps correctly to node-oidc-provider format
15. [ ] `last_used_at` is updated on successful secret verification
16. [ ] All operations are audit-logged
17. [ ] Public clients have `token_endpoint_auth_method: none`
