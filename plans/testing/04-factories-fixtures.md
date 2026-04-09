# Factories & Fixtures: Testing Strategy

> **Document**: 04-factories-fixtures.md
> **Parent**: [Index](00-index.md)

## Overview

Test data factories and shared fixtures provide consistent, valid test data across all test suites (integration, E2E, pentest). Factories generate randomized but valid entity data using builder functions. Fixtures provide static reference data for common scenarios.

## Architecture

### Design Principles

1. **Builder pattern** — Each entity has a `build*()` function that returns valid creation input with sensible defaults
2. **Overridable** — All fields can be overridden via `Partial<>` parameter
3. **Randomized** — Each call produces unique data via `randomSuffix()` to prevent collisions
4. **Type-safe** — Builders return the exact input types expected by repository/service functions
5. **Composable** — Higher-level builders can compose lower-level ones (e.g., `buildClient` needs org and app IDs)

### Two Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| Factories (DB) | `tests/integration/helpers/factories.ts` | Insert entities directly into the test database, return full DB objects with IDs |
| Fixtures (Static) | `tests/fixtures/*.ts` | Static reference data for predictable test scenarios (no DB required) |

---

## Implementation Details

### Random Suffix Utility

```typescript
// tests/integration/helpers/factories.ts

import crypto from 'node:crypto';

/**
 * Generate a short random suffix for unique test data.
 * Uses crypto.randomBytes for uniqueness — NOT for security.
 */
function randomSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}
```

### Organization Factory

```typescript
/**
 * Build valid organization creation input.
 * All fields have sensible defaults that can be overridden.
 */
export function buildOrganizationInput(
  overrides?: Partial<InsertOrganizationData>
): InsertOrganizationData {
  const suffix = randomSuffix();
  return {
    name: `Test Org ${suffix}`,
    slug: `test-org-${suffix}`,
    defaultLocale: 'en',
    status: 'active',
    ...overrides,
  };
}

/**
 * Insert an organization into the test database and return the full entity.
 * Convenience wrapper around buildOrganizationInput + insertOrganization.
 */
export async function createTestOrganization(
  overrides?: Partial<InsertOrganizationData>
): Promise<Organization> {
  const input = buildOrganizationInput(overrides);
  return insertOrganization(input);
}
```

### Application Factory

```typescript
/**
 * Build valid application creation input.
 * Requires an organizationId (who owns the app).
 */
export function buildApplicationInput(
  organizationId: string,
  overrides?: Partial<InsertApplicationData>
): InsertApplicationData {
  const suffix = randomSuffix();
  return {
    organizationId,
    name: `Test App ${suffix}`,
    slug: `test-app-${suffix}`,
    status: 'active',
    ...overrides,
  };
}

export async function createTestApplication(
  organizationId: string,
  overrides?: Partial<InsertApplicationData>
): Promise<Application> {
  const input = buildApplicationInput(organizationId, overrides);
  return insertApplication(input);
}
```

### Client Factory

```typescript
/**
 * Build valid client creation input.
 * Requires organizationId and applicationId.
 */
export function buildClientInput(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>
): InsertClientData {
  const suffix = randomSuffix();
  return {
    organizationId,
    applicationId,
    clientName: `Test Client ${suffix}`,
    clientId: `test-client-${suffix}`,
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['http://localhost:3001/callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    tokenEndpointAuthMethod: 'client_secret_basic',
    status: 'active',
    ...overrides,
  };
}

export async function createTestClient(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>
): Promise<Client> {
  const input = buildClientInput(organizationId, applicationId, overrides);
  return insertClient(input);
}

/**
 * Create a client with a hashed secret, returning both the client and plaintext secret.
 * Essential for E2E tests that need to authenticate as the client.
 */
export async function createTestClientWithSecret(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>
): Promise<{ client: Client; clientSecret: string }> {
  const client = await createTestClient(organizationId, applicationId, overrides);
  const { plainSecret, hashedSecret } = await generateClientSecret();
  await insertClientSecret({
    clientId: client.id,
    secretHash: hashedSecret,
    label: 'test-secret',
  });
  return { client, clientSecret: plainSecret };
}
```

### User Factory

```typescript
/**
 * Build valid user creation input.
 * Requires organizationId (users belong to orgs).
 */
export function buildUserInput(
  organizationId: string,
  overrides?: Partial<InsertUserData>
): InsertUserData {
  const suffix = randomSuffix();
  return {
    organizationId,
    email: `user-${suffix}@test.example.com`,
    givenName: 'Test',
    familyName: `User ${suffix}`,
    status: 'active',
    ...overrides,
  };
}

export async function createTestUser(
  organizationId: string,
  overrides?: Partial<InsertUserData>
): Promise<User> {
  const input = buildUserInput(organizationId, overrides);
  return insertUser(input);
}

/**
 * Create a user with a hashed password, returning both the user and plaintext password.
 * Essential for E2E login tests.
 */
export async function createTestUserWithPassword(
  organizationId: string,
  password: string = 'TestPassword123!',
  overrides?: Partial<InsertUserData>
): Promise<{ user: User; password: string }> {
  const hashedPassword = await hashPassword(password);
  const user = await createTestUser(organizationId, {
    passwordHash: hashedPassword,
    emailVerified: true,
    ...overrides,
  });
  return { user, password };
}
```

### Role & Permission Factory

```typescript
/**
 * Build valid role creation input.
 * Requires applicationId (roles belong to apps).
 */
export function buildRoleInput(
  applicationId: string,
  overrides?: Partial<InsertRoleData>
): InsertRoleData {
  const suffix = randomSuffix();
  return {
    applicationId,
    name: `Test Role ${suffix}`,
    slug: `test-role-${suffix}`,
    description: 'Test role for automated testing',
    ...overrides,
  };
}

export async function createTestRole(
  applicationId: string,
  overrides?: Partial<InsertRoleData>
): Promise<Role> {
  const input = buildRoleInput(applicationId, overrides);
  return insertRole(input);
}

/**
 * Build valid permission creation input.
 */
export function buildPermissionInput(
  applicationId: string,
  overrides?: Partial<InsertPermissionData>
): InsertPermissionData {
  const suffix = randomSuffix();
  return {
    applicationId,
    name: `Test Permission ${suffix}`,
    slug: `test-perm-${suffix}`,
    description: 'Test permission for automated testing',
    ...overrides,
  };
}

export async function createTestPermission(
  applicationId: string,
  overrides?: Partial<InsertPermissionData>
): Promise<Permission> {
  const input = buildPermissionInput(applicationId, overrides);
  return insertPermission(input);
}
```

### Custom Claim Factory

```typescript
/**
 * Build valid claim definition input.
 */
export function buildClaimDefinitionInput(
  applicationId: string,
  overrides?: Partial<InsertClaimDefinitionData>
): InsertClaimDefinitionData {
  const suffix = randomSuffix();
  return {
    applicationId,
    name: `test_claim_${suffix}`,
    displayName: `Test Claim ${suffix}`,
    claimType: 'string',
    includeInIdToken: true,
    includeInAccessToken: false,
    includeInUserinfo: true,
    ...overrides,
  };
}

export async function createTestClaimDefinition(
  applicationId: string,
  overrides?: Partial<InsertClaimDefinitionData>
): Promise<ClaimDefinition> {
  const input = buildClaimDefinitionInput(applicationId, overrides);
  return insertClaimDefinition(input);
}
```

### Composite Factory: Full Test Tenant

```typescript
/**
 * Create a complete test tenant with org, app, client (with secret), and user (with password).
 * This is the most common setup needed for E2E and pentest tests.
 * Returns all entities and their plaintext credentials.
 */
export async function createFullTestTenant(options?: {
  orgOverrides?: Partial<InsertOrganizationData>;
  appOverrides?: Partial<InsertApplicationData>;
  clientOverrides?: Partial<InsertClientData>;
  userOverrides?: Partial<InsertUserData>;
  password?: string;
}): Promise<TestTenant> {
  const org = await createTestOrganization(options?.orgOverrides);
  const app = await createTestApplication(org.id, options?.appOverrides);
  const { client, clientSecret } = await createTestClientWithSecret(
    org.id, app.id, options?.clientOverrides
  );
  const { user, password } = await createTestUserWithPassword(
    org.id, options?.password ?? 'TestPassword123!', options?.userOverrides
  );

  return { org, app, client, clientSecret, user, password };
}

/** Type for the full test tenant returned by createFullTestTenant */
export interface TestTenant {
  org: Organization;
  app: Application;
  client: Client;
  clientSecret: string;
  user: User;
  password: string;
}
```

---

### Static Fixtures

```typescript
// tests/fixtures/organizations.ts
// Static reference data for predictable test scenarios.
// These do NOT insert into the database — they provide input shapes.

export const SUPER_ADMIN_ORG = {
  name: 'Porta Admin',
  slug: 'porta-admin',
  isSuperAdmin: true,
  defaultLocale: 'en',
  status: 'active' as const,
};

export const ACTIVE_ORG = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  defaultLocale: 'en',
  status: 'active' as const,
};

export const SUSPENDED_ORG = {
  name: 'Suspended Corp',
  slug: 'suspended-corp',
  defaultLocale: 'en',
  status: 'suspended' as const,
};
```

```typescript
// tests/fixtures/users.ts

export const ACTIVE_USER = {
  email: 'active@test.example.com',
  givenName: 'Active',
  familyName: 'User',
  status: 'active' as const,
  emailVerified: true,
};

export const SUSPENDED_USER = {
  email: 'suspended@test.example.com',
  givenName: 'Suspended',
  familyName: 'User',
  status: 'suspended' as const,
  emailVerified: true,
};

export const LOCKED_USER = {
  email: 'locked@test.example.com',
  givenName: 'Locked',
  familyName: 'User',
  status: 'locked' as const,
  emailVerified: true,
};
```

```typescript
// tests/fixtures/clients.ts

export const WEB_CLIENT = {
  clientName: 'Test Web Client',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: ['http://localhost:3001/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
};

export const SPA_CLIENT = {
  clientName: 'Test SPA Client',
  clientType: 'public' as const,
  applicationType: 'native' as const,
  redirectUris: ['http://localhost:3001/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  tokenEndpointAuthMethod: 'none' as const,
};

export const M2M_CLIENT = {
  clientName: 'Test M2M Client',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: [],
  grantTypes: ['client_credentials'],
  responseTypes: [],
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
};
```

```typescript
// tests/fixtures/roles-permissions.ts

export const ADMIN_ROLE = {
  name: 'Admin',
  slug: 'admin',
  description: 'Full administrative access',
};

export const VIEWER_ROLE = {
  name: 'Viewer',
  slug: 'viewer',
  description: 'Read-only access',
};

export const READ_PERMISSION = {
  name: 'Read',
  slug: 'read',
  description: 'Read access to resources',
};

export const WRITE_PERMISSION = {
  name: 'Write',
  slug: 'write',
  description: 'Write access to resources',
};
```

---

## Integration Points

### Usage in Integration Tests

```typescript
// Example: tests/integration/repositories/organization.repo.test.ts
import { createTestOrganization, buildOrganizationInput } from '../helpers/factories.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';

describe('Organization Repository', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
  });

  it('should insert and retrieve an organization', async () => {
    const org = await createTestOrganization();
    const found = await findOrganizationById(org.id);
    expect(found).toEqual(org);
  });
});
```

### Usage in E2E Tests

```typescript
// Example: tests/e2e/flows/authorization-code.test.ts
import { createFullTestTenant } from '../../integration/helpers/factories.js';

describe('Authorization Code + PKCE Flow', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createFullTestTenant();
  });

  it('should complete the full auth code flow', async () => {
    const oidc = new OidcTestClient(
      process.env.TEST_SERVER_URL!,
      tenant.org.slug,
      tenant.client.clientId,
      tenant.clientSecret
    );
    // ... test flow
  });
});
```

---

## Testing Requirements

- Factories produce valid data that passes all schema validations
- Factories generate unique data (no collisions across concurrent calls)
- Composite factories create internally consistent data (matching IDs, valid references)
- Static fixtures provide commonly-needed test scenarios
- All factory functions have JSDoc documentation
