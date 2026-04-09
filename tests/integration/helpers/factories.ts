/**
 * Test data factories for integration, E2E, and pentest tests.
 *
 * Each entity has two functions:
 * - `build*Input()` — Returns valid creation input with random defaults (no DB)
 * - `createTest*()` — Inserts into the test database and returns the full entity
 *
 * Factories import directly from repository modules (not barrel exports)
 * to bypass service-layer side effects (audit logging, cache invalidation).
 * This keeps factory operations fast and predictable.
 *
 * All generated data uses randomSuffix() for uniqueness — safe for
 * concurrent test runs within the same database.
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Repository imports — direct access to DB insert functions
// ---------------------------------------------------------------------------
import {
  insertOrganization,
  type InsertOrganizationData,
} from '../../../src/organizations/repository.js';
import type { Organization } from '../../../src/organizations/types.js';

import {
  insertApplication,
  type InsertApplicationData,
} from '../../../src/applications/repository.js';
import type { Application } from '../../../src/applications/types.js';

import {
  insertClient,
  type InsertClientData,
} from '../../../src/clients/repository.js';
import type { Client } from '../../../src/clients/types.js';

import { insertSecret } from '../../../src/clients/secret-repository.js';
import { generateClientId, generateSecret, hashSecret } from '../../../src/clients/crypto.js';

import { insertUser, type InsertUserData } from '../../../src/users/repository.js';
import type { User } from '../../../src/users/types.js';
import { hashPassword } from '../../../src/users/password.js';

import { insertRole } from '../../../src/rbac/role-repository.js';
import { insertPermission } from '../../../src/rbac/permission-repository.js';
import type { Role, Permission, CreateRoleInput, CreatePermissionInput } from '../../../src/rbac/types.js';

import { insertDefinition } from '../../../src/custom-claims/repository.js';
import type { CustomClaimDefinition, CreateClaimDefinitionInput } from '../../../src/custom-claims/types.js';

import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Generate a short random suffix for unique test data.
 * Uses crypto.randomBytes for uniqueness — NOT for security.
 */
function randomSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

// ===========================================================================
// Organization Factory
// ===========================================================================

/**
 * Build valid organization insert data with sensible defaults.
 * All fields can be overridden via the `overrides` parameter.
 *
 * @param overrides - Partial data to override defaults
 * @returns Complete InsertOrganizationData ready for DB insertion
 */
export function buildOrganizationInput(
  overrides?: Partial<InsertOrganizationData>,
): InsertOrganizationData {
  const suffix = randomSuffix();
  return {
    name: `Test Org ${suffix}`,
    slug: `test-org-${suffix}`,
    defaultLocale: 'en',
    ...overrides,
  };
}

/**
 * Insert a test organization into the database.
 * Convenience wrapper: buildOrganizationInput() → insertOrganization().
 *
 * @param overrides - Partial data to override defaults
 * @returns The newly created organization with DB-generated id and timestamps
 */
export async function createTestOrganization(
  overrides?: Partial<InsertOrganizationData>,
): Promise<Organization> {
  const input = buildOrganizationInput(overrides);
  return insertOrganization(input);
}

// ===========================================================================
// Application Factory
// ===========================================================================

/**
 * Build valid application insert data.
 * Applications are standalone entities — no organizationId FK in the table.
 *
 * @param overrides - Partial data to override defaults
 * @returns Complete InsertApplicationData ready for DB insertion
 */
export function buildApplicationInput(
  overrides?: Partial<InsertApplicationData>,
): InsertApplicationData {
  const suffix = randomSuffix();
  return {
    name: `Test App ${suffix}`,
    slug: `test-app-${suffix}`,
    ...overrides,
  };
}

/**
 * Insert a test application into the database.
 *
 * @param overrides - Partial data to override defaults
 * @returns The newly created application
 */
export async function createTestApplication(
  overrides?: Partial<InsertApplicationData>,
): Promise<Application> {
  const input = buildApplicationInput(overrides);
  return insertApplication(input);
}

// ===========================================================================
// Client Factory
// ===========================================================================

/**
 * Build valid client insert data.
 * Requires organizationId and applicationId — clients belong to both.
 * Generates a random clientId for OIDC compliance.
 *
 * @param organizationId - Owning organization ID
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns Complete InsertClientData ready for DB insertion
 */
export function buildClientInput(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>,
): InsertClientData {
  return {
    organizationId,
    applicationId,
    clientId: generateClientId(),
    clientName: `Test Client ${randomSuffix()}`,
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['http://localhost:3001/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: [],
    requirePkce: true,
    ...overrides,
  };
}

/**
 * Insert a test client into the database.
 *
 * @param organizationId - Owning organization ID
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns The newly created client
 */
export async function createTestClient(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>,
): Promise<Client> {
  const input = buildClientInput(organizationId, applicationId, overrides);
  return insertClient(input);
}

/**
 * Create a test client WITH a hashed secret attached.
 * Returns both the client entity and the plaintext secret — essential
 * for E2E tests that need to authenticate as the client.
 *
 * @param organizationId - Owning organization ID
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns Object with client entity and plaintext clientSecret
 */
export async function createTestClientWithSecret(
  organizationId: string,
  applicationId: string,
  overrides?: Partial<InsertClientData>,
): Promise<{ client: Client; clientSecret: string }> {
  const client = await createTestClient(organizationId, applicationId, overrides);

  // Generate and hash a secret, then insert into client_secrets table
  const plainSecret = generateSecret();
  const secretHash = await hashSecret(plainSecret);
  await insertSecret({
    clientId: client.id,
    secretHash,
    label: 'test-secret',
    expiresAt: null,
  });

  return { client, clientSecret: plainSecret };
}

// ===========================================================================
// User Factory
// ===========================================================================

/**
 * Build valid user insert data.
 * Requires organizationId — users belong to an organization.
 *
 * @param organizationId - Owning organization ID
 * @param overrides - Partial data to override defaults
 * @returns Complete InsertUserData ready for DB insertion
 */
export function buildUserInput(
  organizationId: string,
  overrides?: Partial<InsertUserData>,
): InsertUserData {
  const suffix = randomSuffix();
  return {
    organizationId,
    email: `user-${suffix}@test.example.com`,
    givenName: 'Test',
    familyName: `User ${suffix}`,
    ...overrides,
  };
}

/**
 * Insert a test user into the database (no password).
 *
 * @param organizationId - Owning organization ID
 * @param overrides - Partial data to override defaults
 * @returns The newly created user
 */
export async function createTestUser(
  organizationId: string,
  overrides?: Partial<InsertUserData>,
): Promise<User> {
  const input = buildUserInput(organizationId, overrides);
  return insertUser(input);
}

/**
 * Create a test user WITH a hashed password.
 * Returns both the user entity and the plaintext password — essential
 * for E2E login tests that need to authenticate as the user.
 *
 * @param organizationId - Owning organization ID
 * @param password - Plaintext password (default: DEFAULT_TEST_PASSWORD)
 * @param overrides - Partial data to override defaults
 * @returns Object with user entity and plaintext password
 */
export async function createTestUserWithPassword(
  organizationId: string,
  password: string = DEFAULT_TEST_PASSWORD,
  overrides?: Partial<InsertUserData>,
): Promise<{ user: User; password: string }> {
  const passwordHash = await hashPassword(password);
  const user = await createTestUser(organizationId, {
    passwordHash,
    emailVerified: true,
    ...overrides,
  });
  return { user, password };
}

// ===========================================================================
// Role Factory
// ===========================================================================

/**
 * Build valid role creation input.
 * Requires applicationId — roles are scoped to an application.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns Complete CreateRoleInput ready for DB insertion
 */
export function buildRoleInput(
  applicationId: string,
  overrides?: Partial<CreateRoleInput>,
): CreateRoleInput {
  const suffix = randomSuffix();
  return {
    applicationId,
    name: `Test Role ${suffix}`,
    slug: `test-role-${suffix}`,
    description: 'Test role for automated testing',
    ...overrides,
  };
}

/**
 * Insert a test role into the database.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns The newly created role
 */
export async function createTestRole(
  applicationId: string,
  overrides?: Partial<CreateRoleInput>,
): Promise<Role> {
  const input = buildRoleInput(applicationId, overrides);
  return insertRole(input);
}

// ===========================================================================
// Permission Factory
// ===========================================================================

/**
 * Build valid permission creation input.
 * Requires applicationId — permissions are scoped to an application.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns Complete CreatePermissionInput ready for DB insertion
 */
export function buildPermissionInput(
  applicationId: string,
  overrides?: Partial<CreatePermissionInput>,
): CreatePermissionInput {
  const suffix = randomSuffix();
  return {
    applicationId,
    name: `Test Permission ${suffix}`,
    slug: `test-perm-${suffix}`,
    description: 'Test permission for automated testing',
    ...overrides,
  };
}

/**
 * Insert a test permission into the database.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns The newly created permission
 */
export async function createTestPermission(
  applicationId: string,
  overrides?: Partial<CreatePermissionInput>,
): Promise<Permission> {
  const input = buildPermissionInput(applicationId, overrides);
  return insertPermission(input);
}

// ===========================================================================
// Custom Claim Definition Factory
// ===========================================================================

/**
 * Build valid claim definition input.
 * Requires applicationId — claim definitions are scoped to an application.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns Complete CreateClaimDefinitionInput ready for DB insertion
 */
export function buildClaimDefinitionInput(
  applicationId: string,
  overrides?: Partial<CreateClaimDefinitionInput>,
): CreateClaimDefinitionInput {
  const suffix = randomSuffix();
  return {
    applicationId,
    claimName: `test_claim_${suffix}`,
    claimType: 'string',
    description: `Test claim ${suffix}`,
    includeInIdToken: true,
    includeInAccessToken: false,
    includeInUserinfo: true,
    ...overrides,
  };
}

/**
 * Insert a test claim definition into the database.
 *
 * @param applicationId - Parent application ID
 * @param overrides - Partial data to override defaults
 * @returns The newly created claim definition
 */
export async function createTestClaimDefinition(
  applicationId: string,
  overrides?: Partial<CreateClaimDefinitionInput>,
): Promise<CustomClaimDefinition> {
  const input = buildClaimDefinitionInput(applicationId, overrides);
  return insertDefinition(input);
}

// ===========================================================================
// Composite Factory: Full Test Tenant
// ===========================================================================

/**
 * A complete test tenant with all entities and their plaintext credentials.
 * This is the most common setup needed for E2E and pentest tests.
 */
export interface TestTenant {
  org: Organization;
  app: Application;
  client: Client;
  clientSecret: string;
  user: User;
  password: string;
}

/**
 * Create a complete test tenant: org → app → client (with secret) → user (with password).
 *
 * Entities are created in dependency order to satisfy foreign key constraints.
 * Returns all entities and their plaintext credentials for use in tests.
 *
 * @param options - Optional overrides for each entity
 * @returns Complete TestTenant with all entities and credentials
 */
export async function createFullTestTenant(options?: {
  orgOverrides?: Partial<InsertOrganizationData>;
  appOverrides?: Partial<InsertApplicationData>;
  clientOverrides?: Partial<InsertClientData>;
  userOverrides?: Partial<InsertUserData>;
  password?: string;
}): Promise<TestTenant> {
  // Create entities in dependency order
  const org = await createTestOrganization(options?.orgOverrides);
  const app = await createTestApplication(options?.appOverrides);
  const { client, clientSecret } = await createTestClientWithSecret(
    org.id,
    app.id,
    options?.clientOverrides,
  );
  const { user, password } = await createTestUserWithPassword(
    org.id,
    options?.password ?? DEFAULT_TEST_PASSWORD,
    options?.userOverrides,
  );

  return { org, app, client, clientSecret, user, password };
}
