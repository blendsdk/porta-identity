# Admin Auth Middleware: Admin API Authentication

> **Document**: 04-admin-auth-middleware.md
> **Parent**: [Index](00-index.md)

## Overview

Replace the broken `requireSuperAdmin()` middleware with a proper JWT-based authentication and RBAC authorization middleware. The new middleware validates Bearer tokens issued by Porta's own OIDC provider, extracts user identity, and verifies admin role membership.

## Architecture

### Current Architecture (Broken)

```
Request → requireSuperAdmin() → ctx.state.organization (always undefined) → 403
```

### Proposed Architecture

```
Request → requireAdminAuth() → Extract Bearer token
                              → Validate JWT (signature, expiry, issuer)
                              → Extract user identity (sub claim)
                              → Verify user is active + in super-admin org
                              → Verify user has porta-admin role
                              → Set ctx.state.adminUser
                              → next()
```

## Implementation Details

### New File: `src/middleware/admin-auth.ts`

The middleware is a single Koa middleware function that replaces `requireSuperAdmin()`:

```typescript
/**
 * Admin API authentication and authorization middleware.
 *
 * Validates Bearer JWT tokens against Porta's own ES256 signing keys,
 * verifies the user belongs to the super-admin organization and has
 * the porta-admin role. Sets ctx.state.adminUser for downstream
 * handlers and audit logging.
 *
 * Response codes:
 *   401 — Missing or invalid Bearer token
 *   403 — Valid token but insufficient admin privileges
 */

import type { Middleware } from 'koa';
import * as jose from 'jose';

export interface AdminUser {
  /** User UUID from JWT sub claim */
  id: string;
  /** User email */
  email: string;
  /** Super-admin organization ID */
  organizationId: string;
  /** Assigned role slugs */
  roles: string[];
}

export function requireAdminAuth(): Middleware {
  return async (ctx, next) => {
    // 1. Extract Bearer token
    // 2. Validate JWT
    // 3. Look up user + verify active + super-admin org
    // 4. Verify admin role
    // 5. Set ctx.state.adminUser
    // 6. await next()
  };
}
```

### Step 1: Extract Bearer Token

```typescript
const authHeader = ctx.get('Authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  ctx.status = 401;
  ctx.body = { error: 'Authentication required', message: 'Missing or invalid Authorization header' };
  return;
}
const token = authHeader.slice(7); // Remove 'Bearer ' prefix
```

### Step 2: Validate JWT

Use the `jose` library for JWT verification with Porta's own ES256 public keys:

```typescript
// Load active signing keys (already available in-memory via signing-keys module)
const { getActiveJwks } = await import('../lib/signing-keys.js');
const jwks = await getActiveJwks();

// Create a local JWKS key set for jose verification
const keySet = jose.createLocalJWKSet({ keys: jwks });

// Verify the JWT
let payload: jose.JWTPayload;
try {
  const result = await jose.jwtVerify(token, keySet, {
    // Issuer must match one of Porta's known issuer URLs
    // The super-admin org's issuer is: {ISSUER_BASE_URL}/porta-admin
    issuer: `${config.issuerBaseUrl}/porta-admin`,
    // Clock tolerance for slight time drift
    clockTolerance: 30,
  });
  payload = result.payload;
} catch (err) {
  ctx.status = 401;
  ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
  return;
}
```

**Key design decision:** We use `jose.createLocalJWKSet()` with Porta's own JWKs rather than fetching from a remote JWKS endpoint. This is faster (no HTTP call) and guaranteed to be in sync since Porta issues and validates its own tokens.

### Step 3: Look Up User and Verify Membership

```typescript
const userId = payload.sub;
if (!userId) {
  ctx.status = 401;
  ctx.body = { error: 'Invalid token', message: 'Token missing subject claim' };
  return;
}

// Look up user — must be active
const user = await findUserForOidc(userId);
if (!user) {
  ctx.status = 401;
  ctx.body = { error: 'Invalid token', message: 'User not found or not active' };
  return;
}

// Verify user belongs to the super-admin organization
const superAdminOrg = await findSuperAdminOrganization();
if (!superAdminOrg || user.organizationId !== superAdminOrg.id) {
  ctx.status = 403;
  ctx.body = { error: 'Forbidden', message: 'Admin access requires membership in the admin organization' };
  return;
}
```

**Helper function needed:** `findSuperAdminOrganization()` — queries the organizations table for `is_super_admin = true`. This should be cached (the super-admin org never changes):

```typescript
// In src/organizations/repository.ts or a new admin-specific module
let cachedSuperAdminOrg: Organization | null = null;

export async function findSuperAdminOrganization(): Promise<Organization | null> {
  if (cachedSuperAdminOrg) return cachedSuperAdminOrg;
  const result = await getPool().query(
    'SELECT * FROM organizations WHERE is_super_admin = TRUE LIMIT 1'
  );
  cachedSuperAdminOrg = result.rows[0] ? mapRowToOrganization(result.rows[0]) : null;
  return cachedSuperAdminOrg;
}
```

### Step 4: Verify Admin Role

```typescript
// Get user's roles (uses existing RBAC cache-first lookup)
const userRoles = await getUserRoles(userId);
const hasAdminRole = userRoles.some(role => role.slug === 'porta-admin');

if (!hasAdminRole) {
  ctx.status = 403;
  ctx.body = { error: 'Forbidden', message: 'Admin role required' };
  return;
}
```

### Step 5: Set Admin User Context

```typescript
ctx.state.adminUser = {
  id: userId,
  email: user.email,
  organizationId: user.organizationId,
  roles: userRoles.map(r => r.slug),
} satisfies AdminUser;

await next();
```

### Route Handler Updates

Each admin route file imports `requireAdminAuth` instead of `requireSuperAdmin`:

```typescript
// BEFORE (in each route file):
import { requireSuperAdmin } from '../middleware/super-admin.js';
router.use(requireSuperAdmin());

// AFTER:
import { requireAdminAuth } from '../middleware/admin-auth.js';
router.use(requireAdminAuth());
```

Affected route files (8 total):
- `src/routes/organizations.ts`
- `src/routes/applications.ts`
- `src/routes/clients.ts`
- `src/routes/users.ts`
- `src/routes/roles.ts`
- `src/routes/permissions.ts`
- `src/routes/user-roles.ts`
- `src/routes/custom-claims.ts`

### Audit Log Integration

The admin middleware sets `ctx.state.adminUser`, which route handlers use for audit logging:

```typescript
// In route handlers — access the authenticated admin identity
const adminUser = ctx.state.adminUser as AdminUser;

await writeAuditLog({
  action: 'organization.created',
  entityType: 'organization',
  entityId: org.id,
  actorType: 'admin',                    // Was 'system' before
  actorId: adminUser.id,                 // User UUID from JWT
  orgId: adminUser.organizationId,
  metadata: { email: adminUser.email },
});
```

### Koa State Type Augmentation

Extend Koa's state type to include `adminUser`:

```typescript
// In a type declaration file (e.g., src/types/koa.d.ts or alongside admin-auth.ts)
declare module 'koa' {
  interface DefaultState {
    adminUser?: AdminUser;
    organization?: Organization;
    issuer?: string;
  }
}
```

## Performance Considerations

- **JWT validation is fast** — ECDSA P-256 signature verification is ~0.1ms
- **JWKs are in memory** — no HTTP call to fetch JWKS
- **Super-admin org is cached** — single DB query, then in-memory
- **User roles are cached** — RBAC module already uses Redis cache
- **User lookup is the main cost** — one DB query per request (could add Redis cache if needed)

## Error Handling

| Error Case | HTTP Status | Response |
|-----------|------------|----------|
| No Authorization header | 401 | `{ error: 'Authentication required' }` |
| Malformed Bearer token | 401 | `{ error: 'Invalid token' }` |
| JWT signature invalid | 401 | `{ error: 'Invalid token' }` |
| JWT expired | 401 | `{ error: 'Invalid token', message: 'Token expired' }` |
| Wrong issuer | 401 | `{ error: 'Invalid token' }` |
| User not found / inactive | 401 | `{ error: 'Invalid token' }` |
| User not in super-admin org | 403 | `{ error: 'Forbidden' }` |
| User lacks admin role | 403 | `{ error: 'Forbidden' }` |

**Security note:** 401 responses intentionally don't reveal whether the token was expired, malformed, or for a non-existent user. This prevents information leakage. Detailed errors are logged server-side for debugging.

## Dependencies

### New Dependency

```bash
yarn add jose
```

The `jose` library is the standard JWT/JWK implementation for Node.js. It's used by many OIDC libraries and is well-maintained. It supports ES256 (ECDSA P-256) which is what Porta uses for token signing.

### Existing Dependencies Used

- `src/lib/signing-keys.ts` — `getActiveJwks()` for JWT verification keys
- `src/users/service.ts` — `findUserForOidc()` for user lookup
- `src/organizations/repository.ts` — Super-admin org lookup
- `src/rbac/user-role-service.ts` — `getUserRoles()` for role checking
- `src/config/index.ts` — `config.issuerBaseUrl` for issuer validation

## Testing Requirements

- Unit tests: token extraction (valid header, missing header, malformed header)
- Unit tests: JWT validation (valid signature, invalid signature, expired, wrong issuer)
- Unit tests: user verification (active user, inactive user, non-existent user, wrong org)
- Unit tests: role verification (admin role, non-admin role, no roles)
- Integration tests: full request flow with real JWT (use test signing keys)
- Integration tests: 401 vs 403 distinction
- Integration tests: admin identity available in `ctx.state.adminUser`
