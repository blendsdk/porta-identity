# CLI HTTP Migration: Admin API Authentication

> **Document**: 06-cli-http-migration.md
> **Parent**: [Index](00-index.md)

## Overview

Migrate all CLI commands (except `porta init` and `porta migrate`) from direct database/service calls to authenticated HTTP requests via the admin API. The CLI command interface (arguments, flags, output format) is preserved exactly — only the execution layer changes from service imports to HTTP calls.

## Architecture

### Current Architecture (Direct-DB)

```
porta org create --name "Acme"
  → withBootstrap() → connectDatabase() + connectRedis()
  → await import('../../organizations/index.js')
  → createOrganization({ name: 'Acme' })
  → printOrg(org)
  → shutdown() → disconnectRedis() + disconnectDatabase()
```

### Proposed Architecture (HTTP)

```
porta org create --name "Acme"
  → withHttpClient() → readCredentials() → auto-refresh if expired
  → httpClient.post('/api/admin/organizations', { name: 'Acme' })
  → Authorization: Bearer <access_token>
  → parse response JSON
  → printOrg(org)
```

## Implementation Details

### New File: `src/cli/http-client.ts`

A thin HTTP client that handles authentication, token refresh, and error mapping:

```typescript
/**
 * Authenticated HTTP client for CLI commands.
 *
 * Reads stored credentials, automatically refreshes expired tokens,
 * attaches Bearer authorization, and maps HTTP errors to CLI-friendly
 * error messages.
 *
 * Uses Node.js built-in fetch (available in Node 22+).
 */

export interface HttpClientOptions {
  /** Server URL override (default: from stored credentials) */
  server?: string;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

export class AdminHttpClient {
  /** GET request to admin API */
  async get<T>(path: string, params?: Record<string, string>): Promise<HttpResponse<T>>;

  /** POST request to admin API */
  async post<T>(path: string, body?: unknown): Promise<HttpResponse<T>>;

  /** PUT request to admin API */
  async put<T>(path: string, body?: unknown): Promise<HttpResponse<T>>;

  /** DELETE request to admin API */
  async delete<T>(path: string): Promise<HttpResponse<T>>;
}

/** Create an authenticated HTTP client. Exits with error if not logged in. */
export function createHttpClient(options?: HttpClientOptions): AdminHttpClient;
```

**Key behaviors:**

1. **Auto-refresh:** Before each request, checks token expiry. If expired, attempts refresh. If refresh fails, prints "Session expired. Run `porta login`" and exits.
2. **Error mapping:** Maps HTTP status codes to CLI-friendly messages:
   - 401 → "Authentication required. Run `porta login`"
   - 403 → "Insufficient permissions"
   - 404 → "Resource not found"
   - 400 → Extracts validation error details from response body
   - 500 → "Server error. Try again or check server logs."
3. **Base URL:** Reads `server` from stored credentials or `--server` flag.
4. **Uses native `fetch`:** Node.js 22+ has built-in `fetch` — no external HTTP library needed.

### Bootstrap Module Split: `src/cli/bootstrap.ts`

Split the bootstrap module into two execution modes:

```typescript
/**
 * CLI bootstrap module — provides two execution modes:
 *
 * 1. withBootstrap() — Direct-DB mode for init + migrate commands
 *    Connects to PostgreSQL + Redis, runs the function, disconnects.
 *
 * 2. withHttpClient() — HTTP mode for all other commands
 *    Reads stored credentials, creates authenticated HTTP client,
 *    passes it to the function.
 */

/** Direct-DB bootstrap — only for init + migrate commands */
export async function withBootstrap(argv: GlobalOptions, fn: () => Promise<void>): Promise<void>;

/** HTTP client bootstrap — for all authenticated commands */
export async function withHttpClient(
  argv: GlobalOptions,
  fn: (client: AdminHttpClient) => Promise<void>,
): Promise<void>;
```

### Command Migration Pattern

Each command follows the same transformation pattern:

```typescript
// BEFORE (direct-DB):
handler: async (argv) => {
  await withErrorHandling(async () => {
    await withBootstrap(args, async () => {
      const { createOrganization } = await import('../../organizations/index.js');
      const org = await createOrganization({ name, slug });
      printOrg(org);
    });
  }, args.verbose);
}

// AFTER (HTTP):
handler: async (argv) => {
  await withErrorHandling(async () => {
    await withHttpClient(args, async (client) => {
      const { data } = await client.post<{ data: Organization }>(
        '/api/admin/organizations',
        { name, slug },
      );
      printOrg(data.data);
    });
  }, args.verbose);
}
```

### Commands to Migrate

| Command File | Endpoints Used | Complexity |
|-------------|----------------|------------|
| `commands/org.ts` | POST/GET/PUT `/api/admin/organizations` + status actions | Medium |
| `commands/app.ts` | POST/GET/PUT `/api/admin/applications` | Medium |
| `commands/app-module.ts` | POST/GET/PUT/DELETE on app modules | Low |
| `commands/app-role.ts` | POST/GET/PUT/DELETE on app roles | Low |
| `commands/app-permission.ts` | POST/GET/PUT/DELETE on app permissions | Low |
| `commands/app-claim.ts` | POST/GET/PUT/DELETE on app claims | Low |
| `commands/client.ts` | POST/GET/PUT `/api/admin/clients` | Medium |
| `commands/client-secret.ts` | POST/GET/DELETE on client secrets | Low |
| `commands/user.ts` | POST/GET/PUT `/api/admin/organizations/:orgId/users` + status | High |
| `commands/user-role.ts` | POST/GET/DELETE on user-role assignments | Low |
| `commands/user-claim.ts` | POST/GET/DELETE on user claim values | Low |
| `commands/user-2fa.ts` | GET/POST on user 2FA status | Low |
| `commands/health.ts` | GET `/health` (no auth needed) | Trivial |
| `commands/config.ts` | Direct SQL queries for system_config | Special (see below) |
| `commands/keys.ts` | Direct SQL queries for signing_keys | Special (see below) |
| `commands/audit.ts` | Direct SQL queries for audit_log | Special (see below) |
| `commands/seed.ts` | Direct SQL execution | **Keep as direct-DB** |

### Special Commands (Config, Keys, Audit)

These three commands currently use direct SQL (`getPool().query(...)`) rather than service-layer functions. They need new admin API endpoints:

```
GET  /api/admin/config           → list all system config
GET  /api/admin/config/:key      → get single config value
PUT  /api/admin/config/:key      → update config value
GET  /api/admin/keys             → list signing keys
POST /api/admin/keys/generate    → generate new key pair
POST /api/admin/keys/rotate      → retire old + activate new
GET  /api/admin/audit            → list audit log entries (paginated)
```

These are new route files that need to be created as part of this phase.

### Commands That Stay Direct-DB

| Command | Reason |
|---------|--------|
| `porta init` | Must work without a running server |
| `porta migrate` | Must work before server can start |
| `porta seed run` | Development-only tool, executes raw SQL |

### Error Handler Updates: `src/cli/error-handler.ts`

The error handler needs to recognize HTTP errors from the client:

```typescript
// Add HTTP error handling alongside existing domain error handling
if (err instanceof HttpClientError) {
  if (err.status === 401) {
    error('Authentication required. Run "porta login" to authenticate.');
    process.exit(1);
  }
  if (err.status === 403) {
    error('Insufficient permissions for this operation.');
    process.exit(1);
  }
  if (err.status === 404) {
    error(`Not found: ${err.message}`);
    process.exit(1);
  }
  // 400 with validation details
  if (err.status === 400 && err.details) {
    error(`Validation error: ${err.message}`);
    for (const detail of err.details) {
      warn(`  - ${detail.path}: ${detail.message}`);
    }
    process.exit(1);
  }
}
```

## Response Format Compatibility

The admin API already returns JSON in a consistent format:

```json
// Single entity
{ "data": { "id": "uuid", "name": "Acme", ... } }

// List with pagination
{ "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 42 } }
```

The HTTP client needs to extract the `data` property and pass it to the existing `printOrg()`, `printUser()`, etc. output functions. These output functions work with the same entity shapes, so no output format changes are needed.

## Testing Requirements

- Unit tests: HTTP client (mock fetch — request formation, auth header, error mapping)
- Unit tests: withHttpClient bootstrap (reads credentials, handles missing creds)
- Unit tests: each migrated command (mock HTTP client responses)
- Integration tests: end-to-end command execution against real server
- Verify: CLI output format is identical before and after migration
- Verify: all error scenarios produce correct exit codes
